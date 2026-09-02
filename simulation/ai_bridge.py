"""
Bridge script to connect Node telemetry snapshots with the Python AI swarm modules
(from the trupti branch).

Usage:
- Read JSON snapshot from stdin
- Write AI insight JSON to stdout
"""

from __future__ import annotations

import json
import math
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Tuple


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
AI_DIR = os.path.join(ROOT_DIR, "drone_swarm")
if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

try:
    from zone_fitness import ZoneDivider, compute_zone_fitness, rank_zones
    from task_allocator import SwarmAllocator
    from failure_recovery import FailureRecoveryManager, DroneStatus
    from mission_blackboard import MissionBlackboard
except Exception as exc:  # pragma: no cover - hard failure path
    print(json.dumps({"ok": False, "error": f"AI imports failed: {exc}"}))
    raise SystemExit(1)


try:
    with open(os.path.join(ROOT_DIR, "shared", "simConfig.json")) as f:
        _config = json.load(f)
        WORLD_BOUNDARY = _config.get("WORLD_BOUNDARY", 350)
        GRID_SIZE = _config.get("GRID_SIZE", 40)
except Exception:
    WORLD_BOUNDARY = 350
    GRID_SIZE = 40


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def world_to_grid(x: float, y: float) -> Tuple[int, int]:
    nx = (x + WORLD_BOUNDARY) / (WORLD_BOUNDARY * 2)
    ny = (y + WORLD_BOUNDARY) / (WORLD_BOUNDARY * 2)
    gx = int(clamp(math.floor(nx * GRID_SIZE), 0, GRID_SIZE - 1))
    gy = int(clamp(math.floor(ny * GRID_SIZE), 0, GRID_SIZE - 1))
    return gx, gy


def grid_to_world(gx: int, gy: int) -> Tuple[float, float]:
    x = (gx / max(1, GRID_SIZE - 1)) * (WORLD_BOUNDARY * 2) - WORLD_BOUNDARY
    y = (gy / max(1, GRID_SIZE - 1)) * (WORLD_BOUNDARY * 2) - WORLD_BOUNDARY
    return round(x, 2), round(y, 2)


def build_threat_map(zone_divider: ZoneDivider, obstacles: List[Dict[str, Any]]) -> Dict[int, float]:
    severity_map = {"low": 0.25, "medium": 0.55, "high": 0.85}
    out: Dict[int, float] = {}

    for obs in obstacles:
        ox = float(obs.get("x", 0))
        oy = float(obs.get("y", 0))
        gx, gy = world_to_grid(ox, oy)
        zone_id = zone_divider.get_zone((gx, gy))
        score = severity_map.get(str(obs.get("severity", "low")), 0.25)
        out[zone_id] = max(score, out.get(zone_id, 0.0))

    return out


def build_coverage_cells(drones: List[Dict[str, Any]]) -> set[Tuple[int, int]]:
    coverage_cells: set[Tuple[int, int]] = set()

    for d in drones:
        trail = d.get("trail") or []
        for p in trail:
            px = float(p.get("x", d.get("x", 0.0)))
            py = float(p.get("y", d.get("y", 0.0)))
            coverage_cells.add(world_to_grid(px, py))

        gx, gy = world_to_grid(float(d.get("x", 0)), float(d.get("y", 0)))
        coverage_cells.add((gx, gy))

    return coverage_cells


def parse_snapshot(payload: Dict[str, Any]) -> Dict[str, Any]:
    drones = payload.get("drones") or []
    found_survivors = payload.get("foundSurvivors") or []
    obstacles = payload.get("obstacles") or []

    zone_divider = ZoneDivider(grid_size=GRID_SIZE, zone_size=10)

    drone_positions: List[Tuple[int, Tuple[int, int]]] = []
    alive_drones: List[Dict[str, Any]] = []
    for idx, drone in enumerate(drones, start=1):
        gx, gy = world_to_grid(float(drone.get("x", 0.0)), float(drone.get("y", 0.0)))
        drone_positions.append((idx, (gx, gy)))
        if drone.get("status") == "active":
            alive_drones.append(drone)

    unique_survivors: Dict[str, Dict[str, Tuple[int, int]]] = {}
    for surv in found_survivors:
        sid = str(surv.get("sourceId") or surv.get("id") or f"surv-{len(unique_survivors)+1}")
        sx, sy = world_to_grid(float(surv.get("x", 0.0)), float(surv.get("y", 0.0)))
        unique_survivors[sid] = {"location": (sx, sy)}

    mission_data = {
        "coverage_cells": build_coverage_cells(drones),
        "unique_survivors": unique_survivors,
    }

    threat_map = build_threat_map(zone_divider, obstacles)

    zone_scores = []
    for zone_id in range(zone_divider.total_zones):
        zone_scores.append(
            compute_zone_fitness(
                zone_id=zone_id,
                zone_divider=zone_divider,
                mission_data=mission_data,
                drone_positions=drone_positions,
                threat_map=threat_map,
            )
        )

    ranked = rank_zones(zone_scores)

    allocator = SwarmAllocator(num_drones=max(1, len(drones)), scout_ratio=0.2, onlooker_ratio=0.2)
    allocator.initialize_roles()
    allocations = allocator.allocate_zones(ranked, drone_positions)
    if not allocations and alive_drones and ranked:
        for idx, drone in enumerate(alive_drones[: min(len(alive_drones), len(ranked))], start=1):
            zone = ranked[idx - 1]
            fallback_task = type("FallbackTask", (), {
                "task_id": f"TASK_FB_{idx}",
                "zone_id": zone["zone_id"],
                "zone_center": zone["zone_center"],
                "fitness_score": zone["final_score"],
            })
            allocations[idx] = fallback_task

    # Dynamic reassignment: redistribute zones of failed drones to active neighbours
    drone_statuses = {
        idx: d.get("status", "active")
        for idx, d in enumerate(drones, start=1)
    }
    reassigned = allocator.reassign_failed_drones(drone_statuses, drone_positions)
    allocations.update(reassigned)

    failure = FailureRecoveryManager()
    for idx, d in enumerate(drones, start=1):
        failure.register_drone(idx)
        if d.get("status") == "failed":
            failure.drone_health[idx] = DroneStatus.FAILED

    blackboard = MissionBlackboard(max_entries=800)
    for idx, d in enumerate(drones, start=1):
        gx, gy = world_to_grid(float(d.get("x", 0.0)), float(d.get("y", 0.0)))
        blackboard.post_status(
            idx,
            {
                "position": (gx, gy),
                "battery": float(d.get("battery", 0)),
                "task_id": str(d.get("task", "idle")),
                "zone_id": zone_divider.get_zone((gx, gy)),
                "altitude": float(d.get("z", 0)),
            },
        )

    for surv in found_survivors:
        sx, sy = world_to_grid(float(surv.get("x", 0.0)), float(surv.get("y", 0.0)))
        blackboard.post_detection(
            int(str(surv.get("droneId", "1")).split("-")[-1]) if surv.get("droneId") else 1,
            {
                "survivor_id": str(surv.get("sourceId") or surv.get("id")),
                "location": (sx, sy),
                "confidence": float(surv.get("confidence", 0.0)),
                "zone_id": zone_divider.get_zone((sx, sy)),
            },
        )

    for obs in obstacles:
        ox, oy = world_to_grid(float(obs.get("x", 0.0)), float(obs.get("y", 0.0)))
        blackboard.post_warning(
            0,
            {
                "type": "obstacle",
                "location": (ox, oy),
                "severity": obs.get("severity", "low"),
                "zone_id": zone_divider.get_zone((ox, oy)),
            },
        )

    health = failure.get_swarm_health()
    mission_stats = blackboard.get_mission_stats()

    ai_assignments = []
    for drone_id, task in allocations.items():
        cx, cy = task.zone_center
        wx, wy = grid_to_world(int(cx), int(cy))
        ai_assignments.append(
            {
                "drone": f"DRN-{drone_id:03d}",
                "taskId": task.task_id,
                "zone": int(task.zone_id),
                "assignedZoneId": f"Z{int(task.zone_id)}",
                "fitness": round(float(task.fitness_score), 4),
                "targetGrid": {"x": int(cx), "y": int(cy)},
                "targetWorld": {"x": wx, "y": wy},
            }
        )

    avg_battery = (
        sum(float(d.get("battery", 0)) for d in drones) / max(1, len(drones))
        if drones
        else 0.0
    )

    command_suggestions = []
    if health.get("failed", 0) > 0:
        command_suggestions.append("RETURN_FAILED_UNITS")
    if avg_battery < 28:
        command_suggestions.append("ROTATE_LOW_BATTERY_DRONES")
    if len(found_survivors) > 0:
        command_suggestions.append("PRIORITIZE_MEDICAL_EXTRACTION_ZONE")
    if not command_suggestions:
        command_suggestions.append("CONTINUE_AUTONOMOUS_SWEEP")

    top_zones = []
    for zone in ranked[:5]:
        top_zones.append(
            {
                "zone": int(zone["zone_id"]),
                "rank": int(zone["rank"]),
                "label": str(zone["label"]),
                "score": float(zone["final_score"]),
                "centerGrid": {"x": int(zone["zone_center"][0]), "y": int(zone["zone_center"][1])},
            }
        )

    return {
        "ok": True,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "health": health,
        "missionStats": mission_stats,
        "topZones": top_zones,
        "assignments": ai_assignments,
        "commandSuggestions": command_suggestions,
    }


def main() -> int:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        result = parse_snapshot(payload)
        print(json.dumps(result))
        return 0
    except Exception as exc:  # pragma: no cover - runtime safeguard
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

"""
Bridge script to connect Node telemetry snapshots with the Python AI swarm modules.

Usage:
- Read JSON snapshot from stdin
- Write AI insight JSON to stdout

AI modules wired in this bridge:
- ZoneDivider + compute_zone_fitness  : rank zones by exploration priority
- SwarmAllocator (ABC)                : assign drones to zones (employer + onlooker + scout)
- AICoordinator (Q-learning)          : reinforcement-learn which zones yield detections
- AIDetector (logistic regression)    : score detection confidence from sensor features
- FailureRecoveryManager             : track failed drones and redistribute tasks
- MissionBlackboard                  : shared decentralized mission log
- ai_state                           : persist Q-values and detector weights between runs
"""

from __future__ import annotations

import atexit
import json
import math
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Tuple


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
AI_DIR = os.path.join(ROOT_DIR, "drone_swarm")
SIM_DIR = os.path.dirname(__file__)
for _d in (AI_DIR, SIM_DIR):
    if _d not in sys.path:
        sys.path.insert(0, _d)

try:
    from zone_fitness import ZoneDivider, compute_zone_fitness, rank_zones
    from task_allocator import SwarmAllocator
    from failure_recovery import FailureRecoveryManager, DroneStatus
    from mission_blackboard import MissionBlackboard
    from ai_coordinator import AICoordinator
    from ai_detector import AIDetector
    from ai_state import load_all, save_all
    
    # Layer 1-4 Security Integration
    from crypto_identity import DroneIdentity
    from crypto_double_wrap import DoubleWrapCipher
    from crypto_hybrid_kem import HybridKEMNode
    from crypto_telemetry import TelemetrySigner
    from crypto_ai_anomaly import PhysicsAnomalyDetector
    from crypto_isolation_forest import IsolationForestDetector
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


_coordinator_instance = None
_detector_instance = None

def _get_ai_singletons():
    global _coordinator_instance, _detector_instance
    if _coordinator_instance is None:
        _coordinator_instance = AICoordinator()
        _detector_instance = AIDetector()
        # In a real run, this loads persisted state
    return _coordinator_instance, _detector_instance


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
    raw_drones = payload.get("drones") or []
    found_survivors = payload.get("foundSurvivors") or []
    obstacles = payload.get("obstacles") or []
    
    # ----------------------------------------------------------------
    # LAYER 1-4: SECURITY INTEGRATION (The Gantlet)
    # ----------------------------------------------------------------
    anomaly_detector = PhysicsAnomalyDetector()
    drones = []
    
    for idx, drone in enumerate(raw_drones, start=1):
        if drone.get("status") != "active":
            drones.append(drone)
            continue
            
        try:
            # 1. Simulate Drone Side Cryptography
            drone_identity = DroneIdentity(drone_id=idx)
            drone_signer = TelemetrySigner(node_id=idx)
            drone_kem = HybridKEMNode(node_id=idx)
            kem_cipher = DoubleWrapCipher.from_identity(drone_identity)
            
            signed_packet = drone_signer.sign_payload(drone)
            raw_bytes = json.dumps(signed_packet, sort_keys=True).encode('utf-8')
            encrypted_payload = kem_cipher.encrypt(raw_bytes)
            
            # --- TRANSMISSION HAPPENS HERE ---
            
            # 2. Simulate Ground Station / Bridge Validation
            gs_cipher = DoubleWrapCipher.from_identity(drone_identity)
            decrypted_bytes = gs_cipher.decrypt(encrypted_payload)
            received_packet = json.loads(decrypted_bytes.decode('utf-8'))
            
            if not TelemetrySigner.verify_payload(received_packet, drone_signer.public_key_b64):
                raise ValueError("Signature Verification Failed")
                
            # 3. AI Anomaly Quarantine (Physics Check)
            anomaly_detector.evaluate_telemetry(idx, drone)
            
            drones.append(drone)
            
        except Exception as e:
            print(f"[SECURITY ALERT] Drone {idx} Quarantine: {e}", file=sys.stderr)
            drone["status"] = "failed"
            drone["security_quarantine"] = str(e)
            drones.append(drone)
    # ----------------------------------------------------------------

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

    if ranked:
        # Onlookers refine allocations for high-fitness zones already found
        onlooker_list = allocator.onlooker_dance(
            completed_task=None,
            ranked_zones=ranked,
        ) if hasattr(allocator, 'onlooker_dance') else []
        for task in (onlooker_list or []):
            if hasattr(task, 'drone_id') and task.drone_id not in allocations:
                allocations[task.drone_id] = task

        # Scouts randomly explore unvisited zones to avoid local optima
        scout_list = allocator.scout_random_zones(
            all_zones=zone_scores,
        ) if hasattr(allocator, 'scout_random_zones') else []
        for task in (scout_list or []):
            if hasattr(task, 'drone_id') and task.drone_id not in allocations:
                allocations[task.drone_id] = task

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

    # --- Q-learning coordinator: bias zone selection toward high-reward zones ---
    coordinator, detector = _get_ai_singletons()

    # Update coordinator with rewards from detections in each zone
    if found_survivors:
        for surv in found_survivors:
            sx, sy = world_to_grid(float(surv.get("x", 0.0)), float(surv.get("y", 0.0)))
            zone_id = zone_divider.get_zone((sx, sy))
            conf    = float(surv.get("confidence", 0.7))
            coordinator.update_reward(str(zone_id), reward=conf)

    # Use coordinator to re-rank: top zones get a Q-value bonus
    for zone in ranked:
        zone_id_str = str(zone["zone_id"])
        q_bonus = coordinator.get_zone_score(zone_id_str) if hasattr(coordinator, 'get_zone_score') else 0.0
        zone["final_score"] = round(float(zone.get("final_score", 0.0)) + q_bonus * 0.15, 4)
    # Re-sort after Q-bonus adjustment
    ranked.sort(key=lambda z: z["final_score"], reverse=True)
    for i, zone in enumerate(ranked):
        zone["rank"] = i + 1

    # Update AIDetector with detection confidence features
    for surv in found_survivors:
        battery_pct = float(surv.get("battery", 50.0)) / 100.0
        confidence  = float(surv.get("confidence", 0.7))
        zone_id     = float(zone_divider.get_zone(
            world_to_grid(float(surv.get("x", 0.0)), float(surv.get("y", 0.0)))
        ))
        # Train detector: features = [thermal_proxy, motion_proxy, zone_exploration_ratio]
        thermal = min(1.0, confidence + 0.1)
        motion  = min(1.0, confidence * 0.9)
        zone_ratio = zone_id / max(1, zone_divider.total_zones)
        detector.train(features=[thermal, motion, zone_ratio], label=1 if confidence > 0.5 else 0)

    # Save state if new survivors were trained on
    if found_survivors:
        save_all(coordinator, detector)

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
        "aiEngines": {
            "coordinator": "active" if coordinator else "unavailable",
            "detector": "active" if detector else "unavailable",
            "abcAllocator": "active",
        },
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

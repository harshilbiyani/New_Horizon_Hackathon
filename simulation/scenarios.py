# =============================================================================
# simulation/scenarios.py - Pre-Built Demo Scenarios for DroneShield
#
# 4 disaster scenarios that showcase different system capabilities:
#   1. Earthquake (Urban Canyon) — Dynamic obstacles, re-pathing demo
#   2. Flood Rescue (Coastal Storm) — Rising water, adaptive coverage
#   3. Night Rescue (Forest Canopy) — Low visibility, thermal detection
#   4. Hostile Zone (Mountain Pass) — GPS-denied, encrypted comms, jamming
# =============================================================================

from typing import Dict, Any

# ---------------------------------------------------------------------------
# Helper: generate grid cells for a rectangular flood zone
# ---------------------------------------------------------------------------
def _flood_cells(x_start: int, y_start: int, width: int, height: int):
    return [(x, y) for y in range(y_start, y_start + height) for x in range(x_start, x_start + width)]


# ---------------------------------------------------------------------------
# Helper: generate cells that look like a collapsed building (L-shape)
# ---------------------------------------------------------------------------
def _building_collapse(cx: int, cy: int, size: int = 3):
    cells = []
    for dx in range(size):
        cells.append((cx + dx, cy))
    for dy in range(1, size):
        cells.append((cx, cy + dy))
    return cells


# =============================================================================
# SCENARIO DEFINITIONS
# =============================================================================

SCENARIOS: Dict[str, Dict[str, Any]] = {

    # ─────────────────────────────────────────────────────────────────────────
    "earthquake": {
        "name": "Earthquake Aftermath",
        "id": "earthquake",
        "environment": "urban_canyon",
        "description": (
            "Magnitude 7.2 earthquake hit downtown. Dense urban canyon with collapsed "
            "buildings. Aftershocks are ongoing — NEW obstacles appear mid-mission as "
            "buildings collapse. GPS is functional but signal is degraded. "
            "Swarm must re-route in real-time when aftershock events inject new obstacles."
        ),
        "icon": "🏚️",
        "gps_denied": False,
        "seed": 42,
        "tick_ms": 300,            # Faster for dramatic visual effect
        "highlight_features": [
            "Dynamic obstacle injection (aftershock collapses)",
            "Real-time A* re-pathing",
            "LiDAR discovers newly collapsed buildings",
            "ABC task reallocation after obstacle injection",
        ],
        # Timed events: aftershocks collapse buildings at specific steps
        "events": [
            {
                "type": "new_obstacle",
                "at_step": 30,
                "cells": _building_collapse(cx=15, cy=20, size=4),
                "label": "⚡ Aftershock — Building at sector B4 collapses!",
            },
            {
                "type": "new_obstacle",
                "at_step": 60,
                "cells": _building_collapse(cx=32, cy=10, size=3),
                "label": "⚡ Aftershock — Structural failure at sector D2!",
            },
            {
                "type": "new_obstacle",
                "at_step": 90,
                "cells": _building_collapse(cx=8, cy=35, size=5),
                "label": "⚡ Major aftershock — Entire block at A7 compromised!",
            },
        ],
        "ui_theme": {
            "color": "#ef4444",
            "bg": "#1a0505",
            "accent": "#f97316",
        },
    },

    # ─────────────────────────────────────────────────────────────────────────
    "flood_rescue": {
        "name": "Coastal Flood Rescue",
        "id": "flood_rescue",
        "environment": "coastal_storm",
        "description": (
            "Tropical cyclone has caused catastrophic flooding. Water levels are rising — "
            "cells become impassable as flood spreads inward from the coast. "
            "Strong wind gusts affect drone stability. High survivor density in low-lying areas. "
            "Swarm must adapt coverage as terrain becomes increasingly hostile."
        ),
        "icon": "🌊",
        "gps_denied": False,
        "seed": 77,
        "tick_ms": 350,
        "highlight_features": [
            "Progressive terrain change (rising water)",
            "High wind impact on battery consumption",
            "Adaptive coverage — drones shift away from flooded zones",
            "Priority survivor detection in flood-risk areas",
        ],
        "events": [
            {
                "type": "flood_rise",
                "at_step": 25,
                "cells": _flood_cells(x_start=0, y_start=40, width=50, height=5),
                "label": "🌊 Water level rising — southern sectors flooding!",
            },
            {
                "type": "flood_rise",
                "at_step": 55,
                "cells": _flood_cells(x_start=0, y_start=35, width=50, height=5),
                "label": "🌊 Flood advancing — sectors 7-9 now underwater!",
            },
            {
                "type": "flood_rise",
                "at_step": 85,
                "cells": _flood_cells(x_start=0, y_start=30, width=50, height=5),
                "label": "🚨 Critical flooding — 60% of map now inaccessible!",
            },
        ],
        "ui_theme": {
            "color": "#3b82f6",
            "bg": "#00050f",
            "accent": "#06b6d4",
        },
    },

    # ─────────────────────────────────────────────────────────────────────────
    "night_rescue": {
        "name": "Night Forest Rescue",
        "id": "night_rescue",
        "environment": "forest_canopy",
        "description": (
            "Hikers are missing in dense forest at night. GPS is denied — thick canopy blocks "
            "signal. Extreme low visibility conditions require thermal imaging mode. "
            "Dead reckoning + collaborative correction keeps the swarm coherent. "
            "Drones start with ZERO map knowledge — LiDAR must map the entire forest first."
        ),
        "icon": "🌙",
        "gps_denied": True,        # GPS denied from the start
        "seed": 113,
        "tick_ms": 400,
        "highlight_features": [
            "GPS-denied mode (dead reckoning visible on dashboard)",
            "Position uncertainty circles growing over time",
            "Collaborative correction when drones meet",
            "Thermal detection mode (low visibility)",
            "Fog of war critical — must map forest with LiDAR",
        ],
        "events": [
            {
                "type": "visibility_drop",
                "at_step": 1,
                "label": "🌙 Night ops engaged — thermal mode activated",
            },
            {
                "type": "gps_denied",
                "at_step": 1,
                "label": "📡 GPS SIGNAL LOST — switching to dead reckoning",
            },
        ],
        "ui_theme": {
            "color": "#8b5cf6",
            "bg": "#05000f",
            "accent": "#a78bfa",
        },
    },

    # ─────────────────────────────────────────────────────────────────────────
    "hostile_zone": {
        "name": "Hostile Zone Recon",
        "id": "hostile_zone",
        "environment": "mountain_pass",
        "description": (
            "Active conflict zone in mountainous terrain. GPS is denied. "
            "Enemy comm jamming is active — mesh network range is halved mid-mission. "
            "All drone-to-drone communication is AES-256 encrypted. "
            "High threat obstacles (IEDs, hostile vehicles) detected by LiDAR. "
            "Mission: locate downed personnel without exposing positions."
        ),
        "icon": "⚔️",
        "gps_denied": True,
        "seed": 256,
        "tick_ms": 250,            # Fastest — urgency
        "highlight_features": [
            "GPS-denied + comm jamming",
            "AES-256 encrypted mesh communications",
            "Reduced mesh range during jamming",
            "Threat-aware path planning (high-severity obstacle avoidance)",
            "Encrypted survivor location reports",
        ],
        "events": [
            {
                "type": "gps_denied",
                "at_step": 1,
                "label": "📡 GPS JAMMED — dead reckoning engaged",
            },
            {
                "type": "comm_jamming",
                "at_step": 40,
                "label": "📻 COMM JAMMING DETECTED — mesh range halved",
            },
            {
                "type": "new_obstacle",
                "at_step": 50,
                "cells": [(18, 22), (19, 22), (20, 22), (21, 22)],
                "label": "⚠️ Hostile vehicle detected at grid ref F5",
            },
            {
                "type": "comm_jamming",
                "at_step": 80,
                "label": "📻 HEAVY JAMMING — individual drone mode",
            },
        ],
        "ui_theme": {
            "color": "#f59e0b",
            "bg": "#0a0800",
            "accent": "#dc2626",
        },
    },
}


# =============================================================================
# Scenario Loader
# =============================================================================

def get_scenario(scenario_id: str) -> Dict[str, Any]:
    """
    Return a scenario configuration by ID.
    Raises ValueError if ID is not found.
    """
    if scenario_id not in SCENARIOS:
        raise ValueError(
            f"Unknown scenario '{scenario_id}'. "
            f"Available: {list(SCENARIOS.keys())}"
        )
    return SCENARIOS[scenario_id]


def list_scenarios() -> list:
    """Return all scenario metadata (without full event lists) for UI display."""
    result = []
    for sid, s in SCENARIOS.items():
        result.append({
            "id": sid,
            "name": s["name"],
            "icon": s["icon"],
            "description": s["description"],
            "environment": s["environment"],
            "gps_denied": s["gps_denied"],
            "highlight_features": s["highlight_features"],
            "ui_theme": s["ui_theme"],
            "tick_ms": s.get("tick_ms", 300),
        })
    return result


# =============================================================================
# Standalone Test
# =============================================================================
if __name__ == "__main__":
    import os
    import sys
    sys.path.insert(0, os.path.dirname(__file__))

    print("Testing scenarios.py...")
    scenarios = list_scenarios()
    print(f"[+] {len(scenarios)} scenarios loaded")
    for s in scenarios:
        print(f"  * {s['name']} - env={s['environment']}, gps_denied={s['gps_denied']}")

    # Quick simulation test with earthquake scenario
    from main import DroneSwarmSimulation
    scenario = get_scenario("earthquake")
    sim = DroneSwarmSimulation(seed=scenario["seed"], scenario=scenario)
    print(f"\n[+] Earthquake scenario initialized")
    print(f"  Events pending: {len(sim._dynamic_events_pending)}")

    for step in range(40):
        sim.step_simulation()

    print(f"[+] 40 steps complete")
    print(f"  Triggered events: {len(sim._triggered_events)}")
    stats = sim.fog.get_coverage_stats()
    print(f"  Fog revealed: {stats['explored_pct']:.1f}%")
    print("\n[SUCCESS] All scenario tests passed!")

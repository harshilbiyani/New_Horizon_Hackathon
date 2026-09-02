"""
simulation/sim_server.py — Python WebSocket simulation server
Replaces the Node.js built-in simulation loop.
The Python engine is now the single source of truth.
Node.js server.js acts as a thin WebSocket proxy to the React frontend.

Run: python simulation/sim_server.py
"""
import json
import sys
import os
import asyncio
import threading
import time
from typing import Optional
import numpy as np


class NumpyEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles numpy types."""
    def default(self, obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, (np.bool_,)):
            return bool(obj)
        if isinstance(obj, set):
            return list(obj)
        return super().default(obj)

sys.path.insert(0, os.path.dirname(__file__))

from main import DroneSwarmSimulation
from scenarios import get_scenario, list_scenarios, SCENARIOS
import config as cfg


# Simple HTTP + WebSocket server using built-in asyncio
# We'll use a simple TCP socket approach for minimal dependencies

class SimulationEngine:
    """
    Manages the simulation lifecycle and state serialization.
    Thread-safe for use with asyncio event loop.
    """

    def __init__(self):
        self.sim: Optional[DroneSwarmSimulation] = None
        self.running = False
        self.tick_ms = 300
        self._lock = threading.Lock()
        self._step_thread: Optional[threading.Thread] = None
        self._snapshot_callbacks = []  # callbacks called on each tick
        self.current_scenario_id = None

    def initialize(self, scenario_id: Optional[str] = None, seed: Optional[int] = None):
        """Initialize or reset the simulation."""
        with self._lock:
            if scenario_id and scenario_id in SCENARIOS:
                scenario = get_scenario(scenario_id)
                self.sim = DroneSwarmSimulation(
                    seed=seed or scenario.get("seed", 42),
                    scenario=scenario,
                )
                self.tick_ms = scenario.get("tick_ms", 300)
                self.current_scenario_id = scenario_id
            else:
                self.sim = DroneSwarmSimulation(seed=seed or 42)
                self.tick_ms = 300
                self.current_scenario_id = None

    def start(self):
        """Start the simulation tick loop in a background thread."""
        if self.running:
            return
        if self.sim is None:
            self.initialize()
        self.running = True
        self._step_thread = threading.Thread(target=self._tick_loop, daemon=True)
        self._step_thread.start()

    def stop(self):
        """Stop the simulation tick loop."""
        self.running = False

    def reset(self, scenario_id: Optional[str] = None, seed: Optional[int] = None):
        """Stop, re-initialize, and restart."""
        was_running = self.running
        self.stop()
        time.sleep(0.05)
        self.initialize(scenario_id=scenario_id, seed=seed)
        if was_running:
            self.start()

    def set_gps_denied(self, enabled: bool):
        with self._lock:
            if self.sim:
                self.sim.set_gps_denied(enabled)

    def get_snapshot(self) -> dict:
        """Thread-safe snapshot of current simulation state."""
        with self._lock:
            if self.sim is None:
                return {"error": "Simulation not initialized"}
            state = self.sim.get_full_state()
            state["simulationRunning"] = self.running
            state["scenario_id"] = self.current_scenario_id
            return state

    def get_scenarios_list(self) -> list:
        return list_scenarios()

    def register_callback(self, cb):
        """Register a callback to be called after each tick with the snapshot."""
        self._snapshot_callbacks.append(cb)

    def _tick_loop(self):
        """Background thread: step simulation at tick_ms intervals."""
        while self.running:
            start = time.time()
            with self._lock:
                if self.sim and self.sim.running:
                    self.sim.step_simulation()
                elif self.sim and not self.sim.running:
                    self.running = False
                    break

            snapshot = self.get_snapshot()
            for cb in self._snapshot_callbacks:
                try:
                    cb(snapshot)
                except Exception:
                    pass

            elapsed = time.time() - start
            sleep_s = max(0.0, (self.tick_ms / 1000.0) - elapsed)
            time.sleep(sleep_s)


# Global engine instance
engine = SimulationEngine()
engine.initialize()


def handle_command(cmd: dict) -> dict:
    """Process a single JSON command and return the response dictionary."""
    action = cmd.get("action", "snapshot")

    if action == "step":
        if engine.sim and engine.sim.running:
            engine.sim.step_simulation()
        result = engine.get_snapshot()
        result["ok"] = True
        return result

    elif action == "snapshot":
        result = engine.get_snapshot()
        result["ok"] = True
        return result

    elif action == "start":
        scenario_id = cmd.get("scenario_id")
        seed = cmd.get("seed")
        engine.initialize(scenario_id=scenario_id, seed=seed)
        engine.running = True
        result = engine.get_snapshot()
        result["ok"] = True
        result["message"] = "Simulation started"
        return result

    elif action == "stop":
        engine.stop()
        return {"ok": True, "message": "Simulation stopped"}

    elif action == "reset":
        scenario_id = cmd.get("scenario_id")
        seed = cmd.get("seed")
        engine.reset(scenario_id=scenario_id, seed=seed)
        result = engine.get_snapshot()
        result["ok"] = True
        result["message"] = "Simulation reset"
        return result

    elif action == "set_gps_denied":
        enabled = bool(cmd.get("enabled", False))
        engine.set_gps_denied(enabled)
        return {"ok": True, "gps_denied": enabled}

    elif action == "scenarios":
        return {"ok": True, "scenarios": engine.get_scenarios_list()}

    else:
        return {"ok": False, "error": f"Unknown action: {action}"}


def run_stdio_bridge():
    """
    Read commands line-by-line from stdin, execute them, write single-line JSON to stdout.
    Keeps Python in memory across multiple requests so drones advance their positions continuously.
    """
    # Flush unbuffered stdout
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as e:
            sys.stdout.write(json.dumps({"ok": False, "error": f"json parse: {e}"}) + "\n")
            sys.stdout.flush()
            continue

        resp = handle_command(cmd)
        sys.stdout.write(json.dumps(resp, cls=NumpyEncoder) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    run_stdio_bridge()

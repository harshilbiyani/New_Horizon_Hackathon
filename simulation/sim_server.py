"""
simulation/sim_server.py - Python simulation server & bridge
Replaces the Node.js built-in simulation loop.
The Python engine is now the single source of truth.
Node.js server.js acts as a WebSocket proxy to the React frontend.
"""
import json
import sys
import os
import threading
import time
from typing import Optional, Any
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

from main import DroneSwarmSimulation
from scenarios import get_scenario, list_scenarios, SCENARIOS
import config as cfg


def to_serializable(val: Any) -> Any:
    """Recursively convert numpy arrays, integers, floats, sets, etc. into JSON-serializable types."""
    if isinstance(val, np.ndarray):
        return val.tolist()
    if isinstance(val, (np.integer, np.int64, np.int32, np.int16, np.int8, np.uint8, np.uint16, np.uint32, np.uint64)):
        return int(val)
    if isinstance(val, (np.floating, np.float64, np.float32, np.float16)):
        return float(val)
    if isinstance(val, (np.bool_, bool)):
        return bool(val)
    if isinstance(val, set):
        return [to_serializable(x) for x in val]
    if isinstance(val, dict):
        return {k: to_serializable(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [to_serializable(x) for x in val]
    return val


class SimulationEngine:
    """
    Manages the simulation lifecycle and state serialization.
    Thread-safe for use with background ticks.
    """

    def __init__(self):
        self.sim: Optional[DroneSwarmSimulation] = None
        self.running = False
        self.tick_ms = 300
        self._lock = threading.Lock()
        self._step_thread: Optional[threading.Thread] = None
        self._snapshot_callbacks = []
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
            return to_serializable(state)

    def get_scenarios_list(self) -> list:
        return to_serializable(list_scenarios())

    def register_callback(self, cb):
        self._snapshot_callbacks.append(cb)

    def _tick_loop(self):
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


def run_stdin_bridge():
    """Read command JSON from stdin, execute, write serialized result to stdout."""
    raw = sys.stdin.read().strip()
    if not raw:
        print(json.dumps({"ok": False, "error": "empty input"}))
        return

    try:
        cmd = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "error": f"json parse: {e}"}))
        return

    action = cmd.get("action", "snapshot")

    if action == "snapshot":
        result = engine.get_snapshot()
        result["ok"] = True
        print(json.dumps(to_serializable(result)))

    elif action == "start":
        scenario_id = cmd.get("scenario_id")
        seed = cmd.get("seed")
        engine.initialize(scenario_id=scenario_id, seed=seed)
        engine.start()
        print(json.dumps({"ok": True, "message": "Simulation started"}))

    elif action == "stop":
        engine.stop()
        print(json.dumps({"ok": True, "message": "Simulation stopped"}))

    elif action == "reset":
        scenario_id = cmd.get("scenario_id")
        seed = cmd.get("seed")
        engine.reset(scenario_id=scenario_id, seed=seed)
        print(json.dumps({"ok": True, "message": "Simulation reset"}))

    elif action == "set_gps_denied":
        enabled = bool(cmd.get("enabled", False))
        engine.set_gps_denied(enabled)
        print(json.dumps({"ok": True, "gps_denied": enabled}))

    elif action == "scenarios":
        print(json.dumps({"ok": True, "scenarios": engine.get_scenarios_list()}))

    else:
        print(json.dumps({"ok": False, "error": f"Unknown action: {action}"}))


if __name__ == "__main__":
    run_stdin_bridge()

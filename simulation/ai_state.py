"""
simulation/ai_state.py — AI State Persistence
==============================================
Saves and loads Q-learning zone values and AIDetector weights between
server restarts. Without this, the swarm forgets everything it learned
about which zones have survivors every time the server restarts.

Usage is automatic — called by ai_bridge.py on startup and clean shutdown.
"""

from __future__ import annotations
import json
import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from drone_swarm.ai_coordinator import AICoordinator
    from drone_swarm.ai_detector import AIDetector

logger = logging.getLogger(__name__)

# Default paths (relative to project root)
DEFAULT_COORDINATOR_PATH = "simulation/state/ai_coordinator_state.json"
DEFAULT_DETECTOR_PATH    = "simulation/state/ai_detector_weights.json"


def _ensure_dir(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)


# ---------------------------------------------------------------------------
# AI Coordinator (Q-learning zone values)
# ---------------------------------------------------------------------------

def save_coordinator_state(coordinator: "AICoordinator", path: str = DEFAULT_COORDINATOR_PATH) -> bool:
    """
    Save Q-table and visit counts to JSON.

    Args:
        coordinator: AICoordinator instance to export.
        path: File path to write to.

    Returns:
        True if saved successfully.
    """
    try:
        _ensure_dir(path)
        state = coordinator.export_model()
        with open(path, "w") as f:
            json.dump(state, f, indent=2)
        logger.info(f"[AI State] Coordinator state saved → {path}")
        logger.info(f"           Zones: {state['stats'].get('zones_explored', 0)}, "
                    f"epsilon: {state['epsilon']:.3f}")
        return True
    except Exception as e:
        logger.warning(f"[AI State] Failed to save coordinator state: {e}")
        return False


def load_coordinator_state(coordinator: "AICoordinator", path: str = DEFAULT_COORDINATOR_PATH) -> bool:
    """
    Load previously saved Q-table into coordinator.

    Args:
        coordinator: AICoordinator instance to populate.
        path: File path to read from.

    Returns:
        True if loaded successfully, False if file doesn't exist or is invalid.
    """
    if not os.path.exists(path):
        logger.info(f"[AI State] No coordinator state file at {path} — starting fresh.")
        return False

    try:
        with open(path, "r") as f:
            state = json.load(f)
        coordinator.import_model(state)
        zones = len(state.get("zone_scores", {}))
        logger.info(f"[AI State] Coordinator state loaded from {path} ({zones} zones)")
        return True
    except Exception as e:
        logger.warning(f"[AI State] Failed to load coordinator state: {e} — starting fresh.")
        return False


# ---------------------------------------------------------------------------
# AI Detector (logistic regression weights)
# ---------------------------------------------------------------------------

def save_detector_weights(detector: "AIDetector", path: str = DEFAULT_DETECTOR_PATH) -> bool:
    """
    Save AIDetector weights and bias to JSON.

    Args:
        detector: AIDetector instance to export.
        path: File path to write to.

    Returns:
        True if saved successfully.
    """
    try:
        _ensure_dir(path)
        model = detector.export_model()
        with open(path, "w") as f:
            json.dump(model, f, indent=2)
        logger.info(f"[AI State] Detector weights saved → {path}")
        logger.info(f"           Weights: {model['weights']}, bias: {model['bias']:.4f}, "
                    f"training samples: {model['training_samples_count']}")
        return True
    except Exception as e:
        logger.warning(f"[AI State] Failed to save detector weights: {e}")
        return False


def load_detector_weights(detector: "AIDetector", path: str = DEFAULT_DETECTOR_PATH) -> bool:
    """
    Load saved weights into AIDetector.

    Args:
        detector: AIDetector instance to populate.
        path: File path to read from.

    Returns:
        True if loaded successfully.
    """
    if not os.path.exists(path):
        logger.info(f"[AI State] No detector weights file at {path} — using defaults.")
        return False

    try:
        with open(path, "r") as f:
            model = json.load(f)

        import numpy as np
        detector.weights = np.array(model["weights"])
        detector.bias = float(model["bias"])
        detector.learning_rate = float(model.get("learning_rate", detector.learning_rate))
        logger.info(f"[AI State] Detector weights loaded from {path}")
        return True
    except Exception as e:
        logger.warning(f"[AI State] Failed to load detector weights: {e} — using defaults.")
        return False


# ---------------------------------------------------------------------------
# Convenience: save all AI state at once
# ---------------------------------------------------------------------------

def save_all(coordinator: "AICoordinator", detector: "AIDetector") -> dict:
    """Save all AI state. Returns dict with success flags."""
    return {
        "coordinator": save_coordinator_state(coordinator),
        "detector": save_detector_weights(detector),
    }


def load_all(coordinator: "AICoordinator", detector: "AIDetector") -> dict:
    """Load all AI state. Returns dict with success flags."""
    return {
        "coordinator": load_coordinator_state(coordinator),
        "detector": load_detector_weights(detector),
    }

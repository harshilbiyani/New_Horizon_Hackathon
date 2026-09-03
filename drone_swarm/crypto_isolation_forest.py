"""
Layer 4 (12-36h Upgrade): Isolation Forest ML Anomaly Detection

Upgrades the simple Haversine physics rule to a trained Machine Learning model.
Uses scikit-learn's IsolationForest — an unsupervised anomaly detection algorithm
that isolates outliers by randomly partitioning the feature space.

Pipeline:
  1. Generate synthetic 'normal' flight data at boot time (training set).
  2. Train the IsolationForest model (contamination=0.05 = expect 5% anomalies).
  3. On each telemetry packet, extract features and run model.predict().
  4. If prediction == -1 (anomaly), decrement the drone's Trust Score.
  5. If Trust Score < 0.5, that drone's data requires BFT Quorum (>2/3 of swarm agrees).

Academic foundation referenced: Dempster-Shafer Theory of Evidence fusion.
"""

import numpy as np
from sklearn.ensemble import IsolationForest


# Trust score threshold below which a BFT quorum is required
QUORUM_THRESHOLD = 0.5
# Amount to decrement trust on each anomaly detection
TRUST_DECREMENT = 0.15


class IsolationForestDetector:
    """
    ML-based behavioral anomaly detector with per-drone trust scoring.
    """

    def __init__(self, n_training_samples: int = 500):
        self._trust_scores: dict[int, float] = {}
        self._model = self._train_model(n_training_samples)

    def _train_model(self, n_samples: int) -> IsolationForest:
        """
        Generates synthetic normal flight data and trains the Isolation Forest.
        Features: [speed_mps, lat_delta, lon_delta, alt_delta]
        Normal ranges simulate realistic drone operations in a search grid.
        """
        rng = np.random.default_rng(seed=42)

        # Normal flight: speed 0-25 m/s, small coordinate deltas, stable altitude
        speed = rng.uniform(0, 25, n_samples)
        lat_delta = rng.uniform(-0.0003, 0.0003, n_samples)    # ~33m max per step
        lon_delta = rng.uniform(-0.0003, 0.0003, n_samples)
        alt_delta = rng.uniform(-2.0, 2.0, n_samples)

        X_train = np.column_stack([speed, lat_delta, lon_delta, alt_delta])

        model = IsolationForest(
            n_estimators=100,
            contamination=0.05,   # Expect up to 5% anomalies in normal operation
            random_state=42
        )
        model.fit(X_train)
        return model

    def analyze(self, node_id: int, speed_mps: float,
                lat_delta: float, lon_delta: float, alt_delta: float = 0.0) -> str:
        """
        Runs the ML model on the current telemetry feature vector.
        Returns "NORMAL" or "ANOMALY".
        Updates the drone's trust score on anomaly.
        """
        if node_id not in self._trust_scores:
            self._trust_scores[node_id] = 1.0  # Full trust on first contact

        features = np.array([[speed_mps, lat_delta, lon_delta, alt_delta]])
        prediction = self._model.predict(features)[0]   # 1 = normal, -1 = anomaly

        if prediction == -1:
            self._trust_scores[node_id] = max(
                0.0, self._trust_scores[node_id] - TRUST_DECREMENT
            )
            return "ANOMALY"

        return "NORMAL"

    def get_trust_score(self, node_id: int) -> float:
        """Returns the current trust score for a drone (0.0 to 1.0)."""
        return self._trust_scores.get(node_id, 1.0)

    def requires_quorum(self, node_id: int) -> bool:
        """
        Returns True if the drone's trust score is below the quorum threshold.
        Low-trust drones require >2/3 of the swarm to corroborate their data
        before the AI Coordinator accepts any mission-critical decisions from them.
        """
        return self.get_trust_score(node_id) < QUORUM_THRESHOLD

    def get_status(self) -> dict:
        """Returns the trust engine status for the dashboard."""
        return {
            "ml_engine": "IsolationForest (sklearn, n_estimators=100)",
            "contamination_rate": "5%",
            "tracked_drones": len(self._trust_scores),
            "low_trust_drones": [
                {"node_id": nid, "trust_score": round(score, 2)}
                for nid, score in self._trust_scores.items()
                if score < QUORUM_THRESHOLD
            ],
        }

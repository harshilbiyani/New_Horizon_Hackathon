import unittest
from crypto_isolation_forest import IsolationForestDetector, QUORUM_THRESHOLD


class TestLayer4IsolationForest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        """Train the model once for all tests to save time."""
        cls.detector = IsolationForestDetector()

    def test_normal_flight_passes(self):
        """Normal flight telemetry must be classified as NORMAL."""
        result = self.detector.analyze(
            node_id=1, speed_mps=15.0,
            lat_delta=0.0001, lon_delta=0.0001, alt_delta=0.5
        )
        self.assertEqual(result, "NORMAL")

    def test_impossible_jump_flagged(self):
        """Extreme speed anomaly must be classified as ANOMALY."""
        result = self.detector.analyze(
            node_id=99, speed_mps=5000.0,        # Mach 14
            lat_delta=5.0, lon_delta=5.0,         # ~555km jump
            alt_delta=3000.0
        )
        self.assertEqual(result, "ANOMALY")

    def test_trust_score_decrements(self):
        """Repeated anomalies must lower trust score."""
        detector = IsolationForestDetector()
        initial_score = detector.get_trust_score(node_id=5)
        self.assertEqual(initial_score, 1.0)

        # Force 5 anomaly detections by using extreme values
        for _ in range(5):
            detector.analyze(
                node_id=5, speed_mps=9999.0,
                lat_delta=90.0, lon_delta=180.0
            )

        final_score = detector.get_trust_score(node_id=5)
        self.assertLess(final_score, initial_score, "Trust score did not decrease after anomalies.")

    def test_quorum_required_when_trust_low(self):
        """Drone must require BFT quorum when trust score is below threshold."""
        detector = IsolationForestDetector()
        # Manually force the trust score below threshold
        detector._trust_scores[7] = QUORUM_THRESHOLD - 0.1
        self.assertTrue(detector.requires_quorum(7))

    def test_no_quorum_when_trust_high(self):
        """A trusted drone must NOT require quorum."""
        self.assertFalse(self.detector.requires_quorum(1))


if __name__ == '__main__':
    unittest.main()

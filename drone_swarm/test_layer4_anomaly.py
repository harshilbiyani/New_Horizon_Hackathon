import unittest
import time
from crypto_ai_anomaly import PhysicsAnomalyDetector

class TestLayer4Anomaly(unittest.TestCase):
    
    def setUp(self):
        self.ai_detector = PhysicsAnomalyDetector()
        
    def test_normal_flight(self):
        """Test that a drone flying at a normal speed is approved."""
        # Initial position (Los Angeles)
        self.ai_detector.analyze_telemetry(node_id=1, lat=34.0522, lon=-118.2437, timestamp=100.0)
        
        # 10 seconds later, moved roughly 100 meters north (10 m/s)
        # 1 degree of latitude is ~111,139 meters. 100m is ~0.0009 degrees.
        is_valid = self.ai_detector.analyze_telemetry(node_id=1, lat=34.0531, lon=-118.2437, timestamp=110.0)
        
        self.assertTrue(is_valid, "Normal flight was falsely flagged as an anomaly.")
        self.assertEqual(len(self.ai_detector.quarantined_nodes), 0)

    def test_impossible_jump_spoofing(self):
        """CRITICAL SECURITY TEST: Test that an impossible physics jump triggers quarantine."""
        # Initial position (Los Angeles)
        self.ai_detector.analyze_telemetry(node_id=2, lat=34.0522, lon=-118.2437, timestamp=100.0)
        
        # HACKER INTERVENTION: 1 second later, the drone reports it is in New York.
        # This requires flying at Mach 10,000, which is physically impossible.
        is_valid = self.ai_detector.analyze_telemetry(node_id=2, lat=40.7128, lon=-74.0060, timestamp=101.0)
        
        self.assertFalse(is_valid, "SECURITY FAILURE: Impossible jump was accepted!")
        self.assertIn(2, self.ai_detector.quarantined_nodes, "Drone was not quarantined after anomaly.")

    def test_quarantine_enforcement(self):
        """Test that once quarantined, all future packets are rejected."""
        # Manually quarantine drone 3
        self.ai_detector.quarantined_nodes.add(3)
        
        # Even if drone 3 sends perfectly valid physical data, it must be rejected
        is_valid = self.ai_detector.analyze_telemetry(node_id=3, lat=34.0522, lon=-118.2437, timestamp=100.0)
        self.assertFalse(is_valid, "SECURITY FAILURE: Quarantined drone was allowed to transmit!")

if __name__ == '__main__':
    unittest.main()

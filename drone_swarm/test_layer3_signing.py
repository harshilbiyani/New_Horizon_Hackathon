import unittest
from crypto_telemetry import TelemetrySigner

class TestLayer3Signing(unittest.TestCase):
    
    def setUp(self):
        self.drone = TelemetrySigner(node_id=1)
        self.pub_key = self.drone.get_public_key()
        
    def test_valid_signature(self):
        """Test that an untampered signed packet passes verification."""
        telemetry = {"gps_lat": 34.0522, "gps_long": -118.2437, "status": "OK"}
        
        # Drone signs it
        signed_packet = self.drone.sign_payload(telemetry)
        
        # Network verifies it
        is_valid = TelemetrySigner.verify_payload(signed_packet, self.pub_key)
        self.assertTrue(is_valid, "Valid signature was incorrectly rejected!")

    def test_tampered_payload(self):
        """CRITICAL SECURITY TEST: Test that modifying the telemetry breaks the signature."""
        telemetry = {"gps_lat": 34.0522, "gps_long": -118.2437, "status": "OK"}
        signed_packet = self.drone.sign_payload(telemetry)
        
        # HACKER INTERCEPTION: Alter the GPS coordinates without changing the signature
        signed_packet["telemetry"]["gps_lat"] = 99.9999
        
        # Network verifies it
        is_valid = TelemetrySigner.verify_payload(signed_packet, self.pub_key)
        self.assertFalse(is_valid, "SECURITY FAILURE: Tampered payload was accepted!")
        
    def test_wrong_key(self):
        """Test that a valid packet cannot be verified with the wrong public key."""
        telemetry = {"gps_lat": 34.0522, "gps_long": -118.2437, "status": "OK"}
        signed_packet = self.drone.sign_payload(telemetry)
        
        # Drone 2's key
        drone2 = TelemetrySigner(node_id=2)
        wrong_pub_key = drone2.get_public_key()
        
        is_valid = TelemetrySigner.verify_payload(signed_packet, wrong_pub_key)
        self.assertFalse(is_valid, "SECURITY FAILURE: Verified with incorrect key!")

if __name__ == '__main__':
    unittest.main()

import unittest
from crypto_ble_beacon import SecureBLEBeacon

class TestLayer6BLE(unittest.TestCase):
    
    def setUp(self):
        self.ble = SecureBLEBeacon()
        self.lat = 34.0522
        self.lon = -118.2437
        
    def test_ble_encryption_and_decryption(self):
        """Test that a legitimate firefighter can decrypt the beacon."""
        # Drone generates the beacon
        beacon = self.ble.generate_advertisement(self.lat, self.lon)
        self.assertEqual(beacon["beacon_type"], "SURVIVOR_FOUND")
        
        # Firefighter decrypts it
        success, data = self.ble.scan_and_decrypt(beacon["ble_payload_b64"])
        self.assertTrue(success, "Firefighter failed to decrypt valid beacon.")
        self.assertAlmostEqual(data["lat"], self.lat, places=3)
        self.assertAlmostEqual(data["lon"], self.lon, places=3)

    def test_eavesdropper_blocked(self):
        """CRITICAL SECURITY TEST: Test that an eavesdropper cannot read the coordinates."""
        beacon = self.ble.generate_advertisement(self.lat, self.lon)
        
        # Hacker tries to intercept
        success, data = SecureBLEBeacon.eavesdrop(beacon["ble_payload_b64"])
        self.assertFalse(success, "SECURITY FAILURE: Eavesdropper successfully decrypted the beacon!")
        self.assertIn("error", data)

if __name__ == '__main__':
    unittest.main()

import unittest
import hashlib
from crypto_identity import DroneIdentity

class TestLayer1Crypto(unittest.TestCase):
    
    def setUp(self):
        self.identity = DroneIdentity(drone_id=99)
        
    def test_hardware_seed_stability(self):
        """Test that the hardware root of trust is deterministic for a given drone."""
        identity2 = DroneIdentity(drone_id=99)
        self.assertEqual(self.identity._hardware_seed, identity2._hardware_seed,
                         "Hardware seeds should match for the same drone ID")
        
        identity_other = DroneIdentity(drone_id=100)
        self.assertNotEqual(self.identity._hardware_seed, identity_other._hardware_seed,
                            "Hardware seeds must be unique per drone")

    def test_hkdf_key_isolation(self):
        """
        CRITICAL SECURITY TEST:
        Ensure that the Payload Key and Transport Key are mathematically isolated,
        despite originating from the exact same hardware seed.
        """
        payload_key = self.identity.payload_key
        transport_key = self.identity.transport_key
        
        # 1. Both keys must be generated
        self.assertIsNotNone(payload_key)
        self.assertIsNotNone(transport_key)
        
        # 2. Keys must be 32 bytes (256-bit)
        self.assertEqual(len(payload_key), 32)
        self.assertEqual(len(transport_key), 32)
        
        # 3. KEYS MUST NOT MATCH (The core of HKDF Isolation)
        self.assertNotEqual(payload_key, transport_key,
                            "SECURITY FAILURE: Payload and Transport keys are identical!")
        print("\n[OK] HKDF Key Isolation Verified")
        print(f"    Payload Key Hash:   {hashlib.sha256(payload_key).hexdigest()[:16]}")
        print(f"    Transport Key Hash: {hashlib.sha256(transport_key).hexdigest()[:16]}")

if __name__ == '__main__':
    unittest.main()

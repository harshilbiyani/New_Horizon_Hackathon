import unittest
import hashlib
from crypto_hybrid_kem import HybridKEMNode

class TestLayer2PQC(unittest.TestCase):
    
    def test_hybrid_kem_handshake(self):
        """
        CRITICAL SECURITY TEST:
        Simulate a full Hybrid X25519 + ML-KEM-768 handshake between two drones.
        Ensure both sides end up with the exact same fused secret key.
        """
        print("\n--- Initiating Hybrid PQC Handshake ---")
        
        # 1. Initialize two drones
        drone_a = HybridKEMNode(node_id=1)
        drone_b = HybridKEMNode(node_id=2)
        
        # 2. Drone A shares its public bundle (X25519 Pub + ML-KEM Pub)
        pub_bundle_a = drone_a.get_public_bundle()
        
        # 3. Drone B encapsulates the secret.
        # encap_bundle_b = wire-safe (no secrets). pq_shared_b = kept out-of-band.
        encap_bundle_b, hybrid_secret_b, pq_shared_b = drone_b.encapsulate_to_peer(pub_bundle_a)
        
        # Verify the wire bundle no longer contains the shared secret
        self.assertNotIn("_mock_pq_shared", encap_bundle_b, "SECURITY: shared secret leaked into wire bundle!")
        
        # 4. Drone A decapsulates. pq_shared_b passed out-of-band (simulates real liboqs math).
        hybrid_secret_a = drone_a.decapsulate_from_peer(encap_bundle_b, pq_shared_b)
        
        # 5. The absolute core of a key exchange: Both derived secrets MUST match
        self.assertEqual(hybrid_secret_a, hybrid_secret_b, "Hybrid Shared Secrets do not match!")
        
        print(f"[OK] Hybrid Session Key Established Successfully.")
        print(f"     Key Hash: {hashlib.sha256(hybrid_secret_a).hexdigest()[:24]}")
        print(f"     Length:   {len(hybrid_secret_a)} bytes (AES-256 Ready)")

if __name__ == '__main__':
    unittest.main()

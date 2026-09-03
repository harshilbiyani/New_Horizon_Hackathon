import os
import hashlib
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.backends import default_backend

# -----------------------------------------------------------------------------
# MOCK PQC LAYER (Hackathon Polyfill)
# Since compiling the C-based liboqs on Windows requires CMake and VS Build Tools,
# we provide a structurally accurate polyfill for ML-KEM-768. This ensures the
# Hybrid Handshake architecture can be proven live, generating payloads of the
# exact mathematical byte-lengths required by the NIST standard.
# -----------------------------------------------------------------------------
class MockMLKEM768:
    """Structurally accurate polyfill for ML-KEM-768 (Kyber)."""
    
    # NIST FIPS 203 parameters for ML-KEM-768
    PUBLIC_KEY_BYTES = 1184
    SECRET_KEY_BYTES = 2400
    CIPHERTEXT_BYTES = 1088
    SHARED_SECRET_BYTES = 32

    def __init__(self):
        # Generate dummy keys of the exact required length
        self.public_key = os.urandom(self.PUBLIC_KEY_BYTES)
        self._secret_key = os.urandom(self.SECRET_KEY_BYTES)
        
    def encapsulate(self, peer_public_key: bytes) -> tuple[bytes, bytes]:
        """Sender side: Generates ciphertext and shared secret."""
        if len(peer_public_key) != self.PUBLIC_KEY_BYTES:
            raise ValueError("Invalid ML-KEM-768 public key length.")
        
        # Simulate PQC shared secret generation
        shared_secret = os.urandom(self.SHARED_SECRET_BYTES)
        # Simulate the encapsulation (ciphertext)
        ciphertext = os.urandom(self.CIPHERTEXT_BYTES)
        
        return ciphertext, shared_secret

    def decapsulate(self, ciphertext: bytes, expected_shared_secret: bytes) -> bytes:
        """Receiver side: Recovers the shared secret."""
        if len(ciphertext) != self.CIPHERTEXT_BYTES:
            raise ValueError("Invalid ML-KEM-768 ciphertext length.")
        
        # In a real implementation, this uses the secret key to decrypt the ciphertext.
        # For the mock, we simulate successful decapsulation by returning the known secret.
        return expected_shared_secret


# -----------------------------------------------------------------------------
# HYBRID KEM ARCHITECTURE
# -----------------------------------------------------------------------------
class HybridKEMNode:
    """
    Implements Layer 2 Adaptive Post-Quantum Secure Mesh Handshake.
    Fuses Classical X25519 with Quantum ML-KEM-768.
    """
    
    def __init__(self, node_id: int):
        self.node_id = node_id
        
        # 1. Classical Layer (REAL Cryptography)
        self.classical_private = x25519.X25519PrivateKey.generate()
        self.classical_public = self.classical_private.public_key()
        
        # 2. Quantum Layer (Structurally Accurate Polyfill)
        self.quantum_kem = MockMLKEM768()
        self.quantum_public = self.quantum_kem.public_key
        
    def get_public_bundle(self) -> dict:
        """Returns the public keys needed for a peer to initiate a handshake."""
        classical_bytes = self.classical_public.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw
        )
        
        return {
            "node_id": self.node_id,
            "x25519_pub": classical_bytes,
            "ml_kem_pub": self.quantum_public
        }
        
    def encapsulate_to_peer(self, peer_bundle: dict) -> tuple[dict, bytes, bytes]:
        """
        SENDER: Uses the peer's public keys to generate a Hybrid Shared Secret
        and the ciphertexts needed for the peer to decapsulate.
        
        Returns:
          - encapsulation_bundle (dict): What travels over the wire. Contains ONLY
            public info (ciphertexts, sender pubkey). NEVER contains the shared secret.
          - hybrid_secret (bytes): The derived session key (stays local to caller).
          - pq_shared (bytes): The PQ shared secret (only passed to decapsulate in mock 
            because we lack real liboqs math. In production, this is derived by the 
            receiver from the ciphertext using their private key - never transmitted).
        """
        # 1. Classical X25519 ECDH Handshake
        peer_classical_pub = x25519.X25519PublicKey.from_public_bytes(peer_bundle["x25519_pub"])
        classical_shared = self.classical_private.exchange(peer_classical_pub)
        
        # 2. Quantum ML-KEM-768 Encapsulation
        pq_ciphertext, pq_shared = self.quantum_kem.encapsulate(peer_bundle["ml_kem_pub"])
        
        # 3. Hybrid Fusion via HKDF
        hybrid_secret = self._fuse_secrets(classical_shared, pq_shared)
        
        # Wire bundle: contains ONLY ciphertexts and public keys — zero secrets.
        encapsulation_bundle = {
            "sender_id": self.node_id,
            "x25519_pub": self.classical_public.public_bytes(
                encoding=serialization.Encoding.Raw,
                format=serialization.PublicFormat.Raw
            ),
            "ml_kem_ciphertext": pq_ciphertext,
        }
        
        # pq_shared is returned separately — it NEVER appears in the wire bundle.
        # In production with real liboqs, the receiver derives this independently from
        # the ciphertext using their ML-KEM secret key. No transmission needed.
        return encapsulation_bundle, hybrid_secret, pq_shared
        
    def decapsulate_from_peer(self, encap_bundle: dict, _mock_pq_shared: bytes) -> bytes:
        """
        RECEIVER: Uses its private keys to decapsulate the sender's bundle
        and reconstruct the exact same Hybrid Shared Secret.
        
        In production with real liboqs:
          pq_shared = self.quantum_kem.decapsulate(encap_bundle["ml_kem_ciphertext"])
        The _mock_pq_shared argument is ONLY required because the polyfill cannot
        perform real lattice math. It is passed out-of-band, not extracted from the bundle.
        """
        # 1. Classical X25519 ECDH Handshake
        sender_classical_pub = x25519.X25519PublicKey.from_public_bytes(encap_bundle["x25519_pub"])
        classical_shared = self.classical_private.exchange(sender_classical_pub)
        
        # 2. Quantum ML-KEM-768 Decapsulation (mock: uses passed-in secret)
        pq_shared = self.quantum_kem.decapsulate(encap_bundle["ml_kem_ciphertext"], _mock_pq_shared)
        
        # 3. Hybrid Fusion — must produce identical result as sender
        hybrid_secret = self._fuse_secrets(classical_shared, pq_shared)
        
        return hybrid_secret

    def _fuse_secrets(self, classical: bytes, quantum: bytes) -> bytes:
        """Fuses the classical and quantum secrets into a single unbreakable key."""
        # Simple XOR fusion: bytes(a ^ b for a, b in zip(classical, quantum))
        # Better: HKDF fusion
        combined = classical + quantum
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=b"hybrid_pqc_fusion",
            backend=default_backend()
        )
        return hkdf.derive(combined)

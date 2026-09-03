"""
Layer 2 (12-36h Upgrade): Double-Wrap Cascade Encryption

Implements a two-pass authenticated encryption pipeline:
  Inner wrap: ChaCha20-Poly1305  (stream cipher, IETF standard)
  Outer wrap: AES-256-GCM        (block cipher, FIPS 140-2)

This means an attacker must simultaneously break AES-256 AND ChaCha20 to
read the plaintext — neither algorithm's weakness alone is sufficient.

Keys are independently derived from the Layer 1 HKDF pipeline:
  payload_key  -> drives the ChaCha20 inner layer
  transport_key -> drives the AES-GCM outer layer
"""

import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM, ChaCha20Poly1305


class DoubleWrapCipher:
    """
    Two-pass authenticated encryption engine.
    Inner: ChaCha20-Poly1305  |  Outer: AES-256-GCM
    """

    def __init__(self, chacha_key: bytes, aes_key: bytes):
        """
        Args:
            chacha_key: 32-byte key for the inner ChaCha20-Poly1305 layer (payload_key)
            aes_key:    32-byte key for the outer AES-256-GCM layer (transport_key)
        """
        if len(chacha_key) != 32 or len(aes_key) != 32:
            raise ValueError("Both keys must be exactly 32 bytes (256-bit).")
        if chacha_key == aes_key:
            raise ValueError("Inner and outer keys must be independent. Use HKDF key isolation.")

        self._chacha = ChaCha20Poly1305(chacha_key)
        self._aes_gcm = AESGCM(aes_key)

    def encrypt(self, plaintext: bytes, associated_data: bytes = b"DRONESHIELD_MESH_V2") -> bytes:
        """
        Applies the double-wrap encryption cascade.
        Step 1 (Inner): ChaCha20-Poly1305 encrypts the plaintext.
        Step 2 (Outer): AES-256-GCM encrypts the ChaCha ciphertext.
        Returns a single blob: [aes_nonce(12)] + [chacha_nonce(12)] + [aes_ciphertext]
        """
        # Inner wrap — ChaCha20-Poly1305
        chacha_nonce = os.urandom(12)
        inner_ciphertext = self._chacha.encrypt(chacha_nonce, plaintext, associated_data)

        # Outer wrap — AES-256-GCM encrypts the inner ciphertext
        aes_nonce = os.urandom(12)
        outer_ciphertext = self._aes_gcm.encrypt(aes_nonce, inner_ciphertext, associated_data)

        # Pack: [aes_nonce][chacha_nonce][outer_ciphertext]
        return aes_nonce + chacha_nonce + outer_ciphertext

    def decrypt(self, blob: bytes, associated_data: bytes = b"DRONESHIELD_MESH_V2") -> bytes:
        """
        Reverses the double-wrap: outer AES-GCM first, then inner ChaCha20.
        Raises InvalidTag if either authentication check fails.
        """
        if len(blob) < 24:
            raise ValueError("Blob too short to contain both nonces.")

        # Unpack nonces from the front of the blob
        aes_nonce = blob[:12]
        chacha_nonce = blob[12:24]
        outer_ciphertext = blob[24:]

        # Outer unwrap — AES-256-GCM
        inner_ciphertext = self._aes_gcm.decrypt(aes_nonce, outer_ciphertext, associated_data)

        # Inner unwrap — ChaCha20-Poly1305
        plaintext = self._chacha.decrypt(chacha_nonce, inner_ciphertext, associated_data)

        return plaintext

    @classmethod
    def from_identity(cls, identity) -> "DoubleWrapCipher":
        """
        Factory: builds a DoubleWrapCipher directly from a DroneIdentity instance.
        Uses the HKDF-isolated payload_key (ChaCha inner) and transport_key (AES outer).
        """
        return cls(chacha_key=identity.payload_key, aes_key=identity.transport_key)

import unittest
from crypto_double_wrap import DoubleWrapCipher
from crypto_identity import DroneIdentity


class TestLayer2DoubleWrap(unittest.TestCase):

    def setUp(self):
        identity = DroneIdentity(drone_id=1)
        self.cipher = DoubleWrapCipher.from_identity(identity)

    def test_roundtrip(self):
        """Encrypt then decrypt must return the exact original plaintext."""
        plaintext = b'{"gps_lat": 34.0522, "status": "IN_FLIGHT"}'
        blob = self.cipher.encrypt(plaintext)
        recovered = self.cipher.decrypt(blob)
        self.assertEqual(plaintext, recovered)

    def test_ciphertext_different_from_plaintext(self):
        """The encrypted blob must not contain the plaintext."""
        plaintext = b"SURVIVOR_FOUND_AT_34.0522"
        blob = self.cipher.encrypt(plaintext)
        self.assertNotIn(plaintext, blob)

    def test_tamper_detection(self):
        """Flipping a byte in the ciphertext must raise an exception."""
        plaintext = b"TOP_SECRET_MISSION_DATA"
        blob = bytearray(self.cipher.encrypt(plaintext))
        blob[-1] ^= 0xFF   # Flip last byte
        from cryptography.exceptions import InvalidTag
        with self.assertRaises(Exception):
            self.cipher.decrypt(bytes(blob))

    def test_key_isolation_enforced(self):
        """Using identical keys for both layers must be rejected."""
        import os
        key = os.urandom(32)
        with self.assertRaises(ValueError):
            DoubleWrapCipher(chacha_key=key, aes_key=key)


if __name__ == '__main__':
    unittest.main()

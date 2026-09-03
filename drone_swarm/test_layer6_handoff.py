import unittest
import threading
import time
from crypto_ground_handoff import GroundHandoffServer, GroundHandoffClient


class TestLayer6GroundHandoff(unittest.TestCase):

    def test_encrypted_socket_handoff(self):
        """Server encrypts and transmits payload; client decrypts and recovers it."""
        test_payload = {
            "type": "TACTICAL_HANDOFF",
            "survivors": [{"lat": 34.0522, "lon": -118.2437, "confidence": 0.92}],
            "battery_remaining": 18
        }

        server = GroundHandoffServer(payload=test_payload)
        server.start()
        time.sleep(0.1)  # Give server time to bind

        client = GroundHandoffClient()
        received = client.receive()

        self.assertEqual(received["type"], "TACTICAL_HANDOFF")
        self.assertEqual(len(received["survivors"]), 1)
        self.assertAlmostEqual(received["survivors"][0]["lat"], 34.0522)

    def test_invalid_token_rejected(self):
        """A client that sends a wrong handshake token must be rejected."""
        import socket
        from crypto_ground_handoff import HOST, PORT, HANDSHAKE_TOKEN

        bad_token = b"WRONG_TOKEN_xxxxxxxxxxxxx"  # Must be same length as real token
        assert len(bad_token) == len(HANDSHAKE_TOKEN), \
            f"bad_token length {len(bad_token)} != HANDSHAKE_TOKEN length {len(HANDSHAKE_TOKEN)}"

        # Minimal server that will reject the bad token
        payload = {"type": "SECRET"}
        server = GroundHandoffServer(payload=payload)
        server.start()
        time.sleep(0.1)

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((HOST, PORT))
            s.sendall(bad_token)
            response = s.recv(8)
            self.assertEqual(response, b"REJECTED")


if __name__ == '__main__':
    unittest.main()

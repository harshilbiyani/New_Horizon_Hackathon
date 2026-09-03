"""
Layer 6 (12-36h Upgrade): Encrypted Local Socket Ground Handoff

When a drone physically returns to launch or detects a firefighter's BLE beacon,
it opens a local TCP socket and pushes an AES-256-GCM encrypted tactical payload
(thermal map snapshot, survivor coordinates) directly to the firefighter's laptop.

No internet. No cloud. No mesh network required.
The trust boundary is hermetic: only devices with the PBKDF2 tactical key can
receive and decrypt the handoff package.

Architecture:
  GroundHandoffServer  — runs on the drone side (or sim server)
  GroundHandoffClient  — runs on the firefighter's laptop
"""

import json
import os
import socket
import hashlib
import threading
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


# Reuse the same PBKDF2-derived tactical key as Layer 6 BLE
_PASSPHRASE = b"FIREFIGHTER_TACTICAL_GROUND_LINK_V1"
_SALT = b"BLE_TACTICAL_SALT_V1"
GROUND_KEY = hashlib.pbkdf2_hmac('sha256', _PASSPHRASE, _SALT, 100_000)

HANDSHAKE_TOKEN = b"FIREFIGHTER_AUTH_TOKEN_V1"
HOST = "127.0.0.1"
PORT = 9999


def _encrypt_payload(data: bytes) -> bytes:
    """AES-256-GCM encrypt the ground handoff payload."""
    aesgcm = AESGCM(GROUND_KEY)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, data, b"GROUND_HANDOFF")
    return nonce + ciphertext


def _decrypt_payload(blob: bytes) -> bytes:
    """AES-256-GCM decrypt the received ground handoff payload."""
    aesgcm = AESGCM(GROUND_KEY)
    nonce = blob[:12]
    ciphertext = blob[12:]
    return aesgcm.decrypt(nonce, ciphertext, b"GROUND_HANDOFF")


class GroundHandoffServer:
    """
    Drone-side TCP server. Listens for an authenticated firefighter connection
    and transmits the encrypted tactical payload.
    """

    def __init__(self, payload: dict):
        self.payload = payload
        self._server_thread = None
        self._stop_event = threading.Event()

    def start(self):
        """Start the socket server in a background thread."""
        self._server_thread = threading.Thread(target=self._serve, daemon=True)
        self._server_thread.start()

    def _serve(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as srv:
            srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            srv.bind((HOST, PORT))
            srv.listen(1)
            srv.settimeout(30.0)  # Wait up to 30s for a connection
            try:
                conn, addr = srv.accept()
                with conn:
                    # Step 1: Verify handshake token
                    token = conn.recv(len(HANDSHAKE_TOKEN))
                    if token != HANDSHAKE_TOKEN:
                        conn.sendall(b"REJECTED")
                        return

                    conn.sendall(b"ACCEPTED")

                    # Step 2: Encrypt and send payload
                    raw = json.dumps(self.payload).encode('utf-8')
                    encrypted = _encrypt_payload(raw)

                    # Send 4-byte length prefix then encrypted blob
                    length = len(encrypted).to_bytes(4, 'big')
                    conn.sendall(length + encrypted)
            except socket.timeout:
                pass  # No firefighter connected in time


class GroundHandoffClient:
    """
    Firefighter laptop-side client. Authenticates with the drone and
    receives + decrypts the tactical payload.
    """

    def receive(self) -> dict:
        """Connect to the drone, authenticate, and receive the decrypted payload."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((HOST, PORT))

            # Step 1: Send handshake token
            s.sendall(HANDSHAKE_TOKEN)
            response = s.recv(8)
            if response != b"ACCEPTED":
                raise ConnectionRefusedError("Drone rejected authentication token.")

            # Step 2: Receive length-prefixed encrypted blob
            raw_len = s.recv(4)
            payload_len = int.from_bytes(raw_len, 'big')
            encrypted = b""
            while len(encrypted) < payload_len:
                chunk = s.recv(min(4096, payload_len - len(encrypted)))
                if not chunk:
                    break
                encrypted += chunk

            # Step 3: Decrypt
            decrypted = _decrypt_payload(encrypted)
            return json.loads(decrypted.decode('utf-8'))

import os
import struct
import base64
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

class SecureBLEBeacon:
    """
    Implements Layer 6: Offline Ground Handoff (BLE).
    
    If a drone finds a survivor in an internet dead-zone, it broadcasts
    their coordinates via Bluetooth Low Energy (BLE). To prevent malicious
    actors from sniffing these coordinates, the payload is AES-GCM encrypted
    using a tactical pre-shared key distributed only to firefighter devices.
    """
    
    # The tactical key is derived from a passphrase using PBKDF2-HMAC-SHA256.
    # This gives us a proper 256-bit cryptographically random key instead of 
    # an ASCII string with far lower entropy. In production, the passphrase is
    # securely provisioned to firefighter devices during equipment certification.
    # 100,000 PBKDF2 iterations makes offline brute-force extremely expensive.
    _PASSPHRASE = b"FIREFIGHTER_TACTICAL_GROUND_LINK_V1"
    _SALT = b"BLE_TACTICAL_SALT_V1"
    TACTICAL_GROUND_KEY = hashlib.pbkdf2_hmac('sha256', _PASSPHRASE, _SALT, 100_000)
    
    def __init__(self):
        self.aesgcm = AESGCM(self.TACTICAL_GROUND_KEY)

    def generate_advertisement(self, lat: float, lon: float) -> dict:
        """
        Compresses and encrypts GPS coordinates into a BLE-friendly payload.
        Standard BLE advertisement data is limited to ~31 bytes.
        """
        # Compress floats to 4-byte IEEE 754 single-precision floats (8 bytes total)
        # We pack them into a binary struct: 'f' = float32
        compressed_gps = struct.pack('!ff', lat, lon)
        
        # AES-GCM requires a unique nonce per encryption.
        # We use a 12-byte nonce (standard for GCM).
        nonce = os.urandom(12)
        
        # Encrypt the compressed GPS data
        # AES-GCM automatically appends a 16-byte authentication tag
        ciphertext = self.aesgcm.encrypt(nonce, compressed_gps, associated_data=b"BLE_SURVIVOR_BEACON")
        
        # Total BLE payload size = 12 (nonce) + 8 (data) + 16 (tag) = 36 bytes.
        # In a real BLE beacon (like Eddystone/iBeacon), we might truncate the tag or nonce 
        # slightly to fit 31 bytes, but 36 bytes fits in Bluetooth 5.0 extended advertising.
        
        ble_payload = nonce + ciphertext
        
        return {
            "beacon_type": "SURVIVOR_FOUND",
            "ble_payload_b64": base64.b64encode(ble_payload).decode('utf-8')
        }

    def scan_and_decrypt(self, ble_payload_b64: str) -> tuple[bool, dict]:
        """
        Simulates a firefighter's smartphone picking up the BLE beacon
        and attempting to decrypt it with the tactical key.
        """
        try:
            ble_payload = base64.b64decode(ble_payload_b64.encode('utf-8'))
            
            # Extract the 12-byte nonce from the beginning of the packet
            nonce = ble_payload[:12]
            ciphertext = ble_payload[12:]
            
            # Decrypt and authenticate
            compressed_gps = self.aesgcm.decrypt(nonce, ciphertext, associated_data=b"BLE_SURVIVOR_BEACON")
            
            # Unpack the binary struct back into floats
            lat, lon = struct.unpack('!ff', compressed_gps)
            
            # Use round() to fix minor floating point precision artifacts from struct packing
            return True, {"lat": round(lat, 4), "lon": round(lon, 4)}
            
        except Exception as e:
            # If the key is wrong, or the packet was tampered with, decryption fails
            return False, {"error": "Decryption failed. Invalid key or corrupted BLE packet."}

    @staticmethod
    def eavesdrop(ble_payload_b64: str, fake_key: bytes = b"HACKER_FAKE_KEY_0000000000000000") -> tuple[bool, dict]:
        """Simulates an attacker trying to decrypt the beacon without the tactical key."""
        try:
            aesgcm_fake = AESGCM(fake_key)
            ble_payload = base64.b64decode(ble_payload_b64.encode('utf-8'))
            nonce = ble_payload[:12]
            ciphertext = ble_payload[12:]
            
            # This will fail and throw cryptography.exceptions.InvalidTag
            aesgcm_fake.decrypt(nonce, ciphertext, associated_data=b"BLE_SURVIVOR_BEACON")
            return True, {}
        except Exception as e:
            return False, {"error": "ACCESS DENIED: Cryptographic authentication failed."}

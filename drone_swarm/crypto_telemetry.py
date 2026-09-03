import json
import base64
import binascii
import nacl.signing
import nacl.exceptions
from nacl.encoding import Base64Encoder

class TelemetrySigner:
    """
    Implements Layer 3: Zero-Trust Telemetry.
    Uses PyNaCl (Ed25519) to mathematically sign and verify every piece 
    of telemetry data, ensuring non-repudiation and preventing spoofing.
    """
    
    def __init__(self, node_id: int):
        self.node_id = node_id
        
        # Generate the Ed25519 keypair for this specific drone
        self.signing_key = nacl.signing.SigningKey.generate()
        self.verify_key = self.signing_key.verify_key
        
        # Cache the base64 encoded public key for distribution
        self.public_key_b64 = self.verify_key.encode(encoder=Base64Encoder).decode('utf-8')
        
    def get_public_key(self) -> str:
        """Returns the Base64 encoded Ed25519 public key."""
        return self.public_key_b64
        
    def sign_payload(self, payload: dict) -> dict:
        """
        Takes a raw telemetry dictionary, signs its contents, 
        and returns a structurally secure packet.
        The node_id is embedded inside the signed payload body to prevent
        an attacker from re-stamping a legitimate packet with a different drone ID.
        """
        # node_id is bound INSIDE the message body so it is covered by the signature.
        # An attacker cannot change node_id without invalidating the signature.
        payload_to_sign = {"node_id": self.node_id, "telemetry": payload}
        
        # Deterministic serialization: sort_keys ensures identical output regardless
        # of dict key insertion order across different Python versions/runtimes.
        raw_message = json.dumps(payload_to_sign, sort_keys=True, separators=(',', ':')).encode('utf-8')
        
        # Sign the deterministic bytes
        signed = self.signing_key.sign(raw_message)
        signature = signed.signature
        
        # Return the transmission-ready packet
        return {
            "node_id": self.node_id,
            "telemetry": payload,
            "signature_b64": base64.b64encode(signature).decode('utf-8')
        }

    @staticmethod
    def verify_payload(signed_packet: dict, public_key_b64: str) -> bool:
        """
        Takes a signed packet and the sender's public key.
        Returns True if the payload is perfectly intact and the node_id is authentic.
        Returns False if the payload was forged, tampered with, or malformed.
        """
        try:
            node_id = signed_packet["node_id"]
            telemetry = signed_packet["telemetry"]
            signature_b64 = signed_packet["signature_b64"]
            
            # Reconstruct the EXACT same signed body (must match sign_payload logic)
            payload_to_verify = {"node_id": node_id, "telemetry": telemetry}
            raw_message = json.dumps(payload_to_verify, sort_keys=True, separators=(',', ':')).encode('utf-8')
            signature = base64.b64decode(signature_b64.encode('utf-8'))
            
            # Instantiate the verification key
            verify_key = nacl.signing.VerifyKey(public_key_b64.encode('utf-8'), encoder=Base64Encoder)
            
            # This throws nacl.exceptions.BadSignatureError if tampered
            verify_key.verify(raw_message, signature)
            return True
            
        except (nacl.exceptions.BadSignatureError, KeyError, ValueError, TypeError, binascii.Error):
            # Catches: bad signature, missing fields, type errors, malformed base64
            return False

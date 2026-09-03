import time
from crypto_telemetry import TelemetrySigner
import json

def print_separator():
    print("-" * 75)

def run_demo():
    print("\n" + "=" * 75)
    print(" LAYER 3: ZERO-TRUST TELEMETRY (ED25519) DEMO")
    print("=" * 75)
    
    print("\n[SCENARIO] Drone Alpha sends GPS coordinates to the Swarm Coordinator.")
    print("Goal: Prove non-repudiation and prevent Man-in-the-Middle GPS spoofing.\n")
    time.sleep(1.5)
    
    # 1. Initialize
    print("[1] Initializing Drone Alpha's Hardware Identity...")
    drone_alpha = TelemetrySigner(node_id=1)
    alpha_pub_key = drone_alpha.get_public_key()
    print(f"  |-- Generated Ed25519 Public Key: {alpha_pub_key[:24]}...")
    time.sleep(1)
    
    # 2. Legitimate Transmission
    print_separator()
    print("[2] SCENARIO A: Legitimate Transmission")
    telemetry_data = {"gps_lat": 34.0522, "gps_long": -118.2437, "status": "IN_FLIGHT"}
    print(f"  |-- Raw Data: {telemetry_data}")
    
    signed_packet = drone_alpha.sign_payload(telemetry_data)
    print(f"  |-- Packet Signed! Signature: {signed_packet['signature_b64'][:24]}...")
    print(f"  |-- Transmitting over mesh network...")
    time.sleep(1.5)
    
    # Verify Legitimate
    print(f"  |-- Coordinator Receiving Packet...")
    if TelemetrySigner.verify_payload(signed_packet, alpha_pub_key):
        print(f"  => [SUCCESS] Signature Verified. Data is authentic.")
    else:
        print(f"  => [FAILED] Signature Rejected.")
    time.sleep(1.5)
    
    # 3. Forgery Attempt
    print_separator()
    print("[3] SCENARIO B: Man-in-the-Middle Attack (GPS Spoofing)")
    print("  |-- Hacker intercepts the packet inside the network.")
    print("  |-- Hacker alters 'gps_lat' to steer the drone into a trap.")
    
    # Hacker modifies the packet but leaves the signature intact
    hacked_packet = json.loads(json.dumps(signed_packet)) # deep copy
    hacked_packet["telemetry"]["gps_lat"] = 99.9999
    
    print(f"  |-- Tampered Data: {hacked_packet['telemetry']}")
    print(f"  |-- Signature remains unchanged: {hacked_packet['signature_b64'][:24]}...")
    print(f"  |-- Transmitting tampered packet to Coordinator...")
    time.sleep(1.5)
    
    # Verify Forgery
    print(f"  |-- Coordinator Receiving Packet...")
    if TelemetrySigner.verify_payload(hacked_packet, alpha_pub_key):
        print(f"  => [CRITICAL FAILURE] Tampered data accepted!")
    else:
        print(f"  => [BLOCKED] Signature Verification Failed!")
        print(f"  => [ACTION]  Packet Dropped. Drone Alpha isolated for inspection.")
        
    print("=" * 75 + "\n")

if __name__ == "__main__":
    run_demo()

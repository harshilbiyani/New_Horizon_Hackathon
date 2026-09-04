import time
from crypto_ble_beacon import SecureBLEBeacon

def print_separator():
    print("-" * 75)

def run_demo():
    print("\n" + "=" * 75)
    print(" LAYER 6: OFFLINE GROUND HANDOFF (ENCRYPTED BLE) DEMO")
    print("=" * 75)
    
    print("\n[SCENARIO] Drone finds a survivor in an internet dead-zone.")
    print("Goal: Transmit coordinates offline to Firefighters via BLE, while blocking reporters/hackers.\n")
    time.sleep(1.5)
    
    # 1. Initialize
    print("[1] Initializing Swarm BLE Subsystem...")
    ble_engine = SecureBLEBeacon()
    print(f"  |-- AES-GCM Tactical Encryption Engine Active.")
    time.sleep(1)
    
    # 2. Drone Broadcasts Beacon
    print_separator()
    print("[2] Drone Operation (In the air)")
    lat, lon = 34.0522, -118.2437
    print(f"  |-- SURVIVOR DETECTED at {lat}, {lon}")
    print("  |-- Network connectivity: OFFLINE. Mesh Link: FAILED.")
    print("  |-- Activating Layer 6...")
    time.sleep(1)
    
    beacon = ble_engine.generate_advertisement(lat, lon)
    print(f"  |-- Broadcasting BLE Payload (36 bytes): {beacon['ble_payload_b64'][:30]}...")
    time.sleep(1.5)
    
    # 3. Firefighter Decrypts
    print_separator()
    print("[3] SCENARIO A: Firefighter Rescue Team (On the ground)")
    print("  |-- Firefighter smartphone detects BLE Beacon.")
    print("  |-- Attempting to decrypt with pre-shared Tactical Key...")
    time.sleep(1)
    
    success, data = ble_engine.scan_and_decrypt(beacon["ble_payload_b64"])
    if success:
        print(f"  => [SUCCESS] Coordinates Decrypted: {data}")
        print(f"  => [ACTION] Dispatching rescue team immediately.")
    time.sleep(1.5)
    
    # 4. Eavesdropper Blocked
    print_separator()
    print("[4] SCENARIO B: Eavesdropper / Reporter (On the ground)")
    print("  |-- Reporter smartphone detects identical BLE Beacon.")
    print("  |-- Attempting to intercept coordinates...")
    time.sleep(1)
    
    success, data = SecureBLEBeacon.eavesdrop(beacon["ble_payload_b64"])
    if not success:
        print(f"  => [BLOCKED] {data['error']}")
        print(f"  => [SUCCESS] Eavesdropper receives only mathematical garbage.")
        
    print("=" * 75 + "\n")

if __name__ == "__main__":
    run_demo()

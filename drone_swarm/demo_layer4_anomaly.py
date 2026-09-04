import time
from crypto_ai_anomaly import PhysicsAnomalyDetector

def print_separator():
    print("-" * 75)

def run_demo():
    print("\n" + "=" * 75)
    print(" LAYER 4: SWARM AI ANOMALY DETECTION (PHYSICS QUARANTINE) DEMO")
    print("=" * 75)
    
    print("\n[SCENARIO] A drone's physical keys were stolen by an adversary.")
    print("Goal: Defeat perfectly encrypted/signed GPS spoofing using Physics AI.\n")
    time.sleep(1.5)
    
    # 1. Initialize
    print("[1] Initializing AI Physics Monitor...")
    ai_engine = PhysicsAnomalyDetector()
    print(f"  |-- AI Engine Active. Max allowed physical speed: {ai_engine.MAX_PHYSICAL_SPEED_MPS} m/s")
    time.sleep(1)
    
    # 2. Legitimate Flight
    print_separator()
    print("[2] SCENARIO A: Normal Drone Flight (Drone 1)")
    print("  |-- Drone 1 transmits GPS: Los Angeles (T=0s)")
    ai_engine.analyze_telemetry(1, 34.0522, -118.2437, timestamp=0.0)
    time.sleep(1)
    
    print("  |-- Drone 1 transmits GPS: Moving 100 meters North (T=10s)")
    if ai_engine.analyze_telemetry(1, 34.0531, -118.2437, timestamp=10.0):
        print(f"  => [APPROVED] Velocity is approx 10 m/s. Physics are valid.")
    time.sleep(1.5)
    
    # 3. GPS Spoofing Attack
    print_separator()
    print("[3] SCENARIO B: Stolen Keys & GPS Spoofing (Drone 2)")
    print("  |-- Hacker steals Drone 2 and extracts its Ed25519 Keys.")
    print("  |-- Hacker transmits validly signed GPS: Los Angeles (T=0s)")
    ai_engine.analyze_telemetry(2, 34.0522, -118.2437, timestamp=0.0)
    time.sleep(1.5)
    
    print("  |-- Hacker transmits validly signed GPS: New York (T=1s)")
    print("  |-- AI Engine intercepting packet before routing...")
    time.sleep(1)
    
    if not ai_engine.analyze_telemetry(2, 40.7128, -74.0060, timestamp=1.0):
        print(f"  => [CRITICAL ALERT] Impossible Jump Detected!")
        print(f"  => [ACTION] Velocity > 3,000,000 m/s. Physics violation.")
        print(f"  => [ACTION] Drone 2 Cryptographic Keys Revoked. Drone Quarantined.")
    
    print_separator()
    print("[4] Checking Quarantine List...")
    print(f"  |-- Active Drones: {[k for k in ai_engine.state_history.keys() if k not in ai_engine.quarantined_nodes]}")
    print(f"  |-- Quarantined Drones: {list(ai_engine.quarantined_nodes)}")
        
    print("=" * 75 + "\n")

if __name__ == "__main__":
    run_demo()

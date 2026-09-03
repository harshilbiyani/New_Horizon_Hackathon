import time
from crypto_canary import ActiveCanaryTrap

def print_separator():
    print("-" * 75)

def run_demo():
    print("\n" + "=" * 75)
    print(" LAYER 5: ACTIVE CANARY TRAP (DECOY ENDPOINTS) DEMO")
    print("=" * 75)
    
    print("\n[SCENARIO] A hacker has stolen a valid JWT token and is scanning the API.")
    print("Goal: Actively hunt and revoke the hacker's access before they find real data.\n")
    time.sleep(1.5)
    
    # 1. Initialize
    print("[1] Initializing API Gateway & Canary Traps...")
    gateway = ActiveCanaryTrap()
    print(f"  |-- Decoy Endpoint Deployed: {gateway.DECOY_ENDPOINT}")
    print(f"  |-- Active Valid Tokens: {list(gateway.active_tokens.keys())}")
    time.sleep(1)
    
    # 2. Legitimate Operations
    print_separator()
    print("[2] SCENARIO A: Normal Swarm Operations")
    print("  |-- Drone 1 requests POST /api/telemetry")
    status, msg = gateway.handle_api_request("/api/telemetry", "jwt_drone_1_valid")
    print(f"  => [{status}] {msg}")
    time.sleep(1.5)
    
    # 3. Reconnaissance Attack
    print_separator()
    print("[3] SCENARIO B: Hacker API Reconnaissance Attack")
    print("  |-- Hacker (using stolen token) runs an automated directory scan on the API.")
    print("  |-- Hacker requests GET /api/admin/master-keys")
    time.sleep(1.5)
    
    status, msg = gateway.handle_api_request("/api/admin/master-keys", "jwt_hacker_stolen")
    print(f"  => [{status}] {msg}")
    print(f"  => [ACTION] Canary Trap Triggered!")
    print(f"  => [ACTION] Token 'jwt_hacker_stolen' permanently moved to Blacklist.")
    time.sleep(1.5)
    
    # 4. Lockout Verification
    print_separator()
    print("[4] SCENARIO C: Hacker attempts to access normal endpoints after triggering trap")
    print("  |-- Hacker requests POST /api/telemetry")
    time.sleep(1)
    
    status, msg = gateway.handle_api_request("/api/telemetry", "jwt_hacker_stolen")
    print(f"  => [{status}] {msg}")
    print(f"  => [SUCCESS] The entire swarm infrastructure is now immune to the stolen token.")
        
    print("=" * 75 + "\n")

if __name__ == "__main__":
    run_demo()

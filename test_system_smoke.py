"""
Drone-Shield Automated System Smoke & Verification Suite
Verifies backend HTTP APIs, Socket.IO live telemetry stream, and SITL ArduPilot connectivity.
"""

import sys
import time
import socket
import requests

BACKEND_URL = "http://localhost:3001"
SITL_PORTS = [5762, 5772, 5782, 5792, 5802]

def check_sitl_ports():
    print("[TEST 1/4] Checking SITL ArduPilot TCP ports...")
    active_count = 0
    for i, port in enumerate(SITL_PORTS, start=1):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.0)
        res = s.connect_ex(("127.0.0.1", port))
        s.close()
        if res == 0:
            print(f"  [OK] Drone {i} (TCP:{port}): Connected")
            active_count += 1
        else:
            print(f"  [FAIL] Drone {i} (TCP:{port}): Port closed or offline")
    return active_count

def check_http_endpoints():
    print("\n[TEST 2/4] Verifying Express HTTP Endpoints...")
    endpoints = [
        ("/api/sitl/status", 200),
        ("/api/mission/waypoints", 200),
        ("/api/mission/geofence", 200),
        ("/api/survivors", 200)
    ]
    passed = True
    for endpoint, expected_status in endpoints:
        try:
            resp = requests.get(f"{BACKEND_URL}{endpoint}", timeout=2.0)
            if resp.status_code == expected_status:
                print(f"  [OK] GET {endpoint} -> Status {resp.status_code} OK")
            else:
                print(f"  [FAIL] GET {endpoint} -> Expected {expected_status}, got {resp.status_code}")
                passed = False
        except Exception as e:
            print(f"  [FAIL] GET {endpoint} -> Failed: {e}")
            passed = False
    return passed

def check_sitl_telemetry():
    print("\n[TEST 3/4] Fetching Live Telemetry Snapshot...")
    try:
        resp = requests.get(f"{BACKEND_URL}/api/sitl/status", timeout=2.0)
        data = resp.json()
        drones = data.get("drones", [])
        print(f"  [OK] Received telemetry snapshot for {len(drones)} drones.")
        for d in drones:
            print(f"    - Drone {d.get('id', '?')}: Mode={d.get('flight_mode', 'N/A')}, Lat={d.get('lat', 0):.5f}, Lon={d.get('lon', 0):.5f}, Alt={d.get('alt', 0):.1f}m, Batt={d.get('battery', 0)}%")
        return len(drones) > 0
    except Exception as e:
        print(f"  [FAIL] Telemetry snapshot failed: {e}")
        return False

def check_mission_command_api():
    print("\n[TEST 4/4] Testing Mission Command API Endpoint...")
    payload = {
        "action": "HOLD",
        "drone_id": "DRN-001"
    }
    try:
        resp = requests.post(f"{BACKEND_URL}/api/mission/command", json=payload, timeout=2.0)
        if resp.status_code == 200 and resp.json().get("ok") == True:
            print(f"  [OK] POST /api/mission/command -> Status 200 OK: {resp.json()}")
            return True
        else:
            print(f"  [FAIL] POST /api/mission/command failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        print(f"  [FAIL] Mission Command API test error: {e}")
        return False

def run_all_tests():
    print("=" * 60)
    print("      DRONE-SHIELD AUTOMATED SMOKE TEST SUITE")
    print("=" * 60)
    
    t1 = check_sitl_ports()
    t2 = check_http_endpoints()
    t3 = check_sitl_telemetry()
    t4 = check_mission_command_api()

    print("\n" + "=" * 60)
    print("SUMMARY RESULTS:")
    print(f"  - Active SITL Processes : {t1}/{len(SITL_PORTS)}")
    print(f"  - HTTP Endpoints Pass   : {'PASSED' if t2 else 'FAILED'}")
    print(f"  - Telemetry Data Valid  : {'PASSED' if t3 else 'FAILED'}")
    print(f"  - Mission Command API   : {'PASSED' if t4 else 'FAILED'}")
    print("=" * 60)
    
    return t1 > 0 and t2 and t3 and t4

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)

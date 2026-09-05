import subprocess
import time
import sys
import socket
import psutil

NUM_INSTANCES = 5

def kill_existing_sitl():
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            name = proc.info['name'].lower()
            cmdline = " ".join(proc.info['cmdline'] or []).lower()
            if 'dronekit-sitl' in name or 'arducopter' in name or 'mavproxy' in name or 'mavproxy' in cmdline:
                print(f"Killing old process {proc.info['pid']}")
                proc.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass

def wait_for_port(port, host='127.0.0.1', timeout=30):
    """Wait until a TCP port is accepting connections."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except (ConnectionRefusedError, OSError):
            time.sleep(0.5)
    print(f"WARNING: Port {port} did not open within {timeout}s")
    return False

kill_existing_sitl()
time.sleep(2)

processes = []
print(f"Starting {NUM_INSTANCES} ArduPilot SITL instances...")

for i in range(NUM_INSTANCES):
    sitl_port = 5760 + i * 10
    out_port1 = 5762 + i * 10
    out_port2 = 5763 + i * 10

    cmd = ["dronekit-sitl", "copter", "-I", str(i)]
    print(f"Starting Instance {i} (SITL: {sitl_port}, Out: {out_port1}, {out_port2})")
    p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    processes.append(p)

    # Wait until SITL TCP port is actually open before starting MAVProxy
    print(f"  Waiting for SITL port {sitl_port}...")
    if wait_for_port(sitl_port, timeout=30):
        print(f"  Port {sitl_port} ready — starting MAVProxy")
    else:
        print(f"  Port {sitl_port} timed out — launching MAVProxy anyway")

    mav_cmd = [
        sys.executable, "-m", "MAVProxy.mavproxy",
        "--master", f"tcp:127.0.0.1:{sitl_port}",
        "--out", f"tcpin:0.0.0.0:{out_port1}",
        "--out", f"tcpin:0.0.0.0:{out_port2}",
        "--daemon"
    ]
    p_mav = subprocess.Popen(mav_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    processes.append(p_mav)

    # Brief pause before next instance
    time.sleep(1)

print("All instances started. Waiting 10s for MAVProxy to settle...")
time.sleep(10)
print("Ready. main.py can now connect. Press Ctrl+C to terminate.")

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\nTerminating all SITL instances...")
    for p in processes:
        p.terminate()
    print("Done.")
    sys.exit(0)

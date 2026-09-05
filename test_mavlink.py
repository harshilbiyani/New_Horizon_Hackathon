from pymavlink import mavutil
import time

print("Connecting to ArduPilot SITL...")

connection = mavutil.mavlink_connection(
    "tcp:127.0.0.1:5762"
)

print("Waiting for heartbeat...")
connection.wait_heartbeat()

print("CONNECTED!")
print("System ID:", connection.target_system)
print("Component ID:", connection.target_component)

# Request telemetry messages from ArduPilot
messages = {
    "SYS_STATUS": 1,
    "ATTITUDE": 30,
    "GLOBAL_POSITION_INT": 33,
    "GPS_RAW_INT": 24,
    "VFR_HUD": 74,
}

print("\nRequesting telemetry streams...")

for name, message_id in messages.items():
    connection.mav.command_long_send(
        connection.target_system,
        connection.target_component,
        mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL,
        0,
        message_id,
        1_000_000,  # send every 1 second
        0, 0, 0, 0, 0
    )
    print(f"Requested {name}")

print("\nWaiting for telemetry...\n")

start_time = time.time()

while time.time() - start_time < 15:

    msg = connection.recv_match(
        blocking=True,
        timeout=2
    )

    if msg is None:
        continue

    msg_type = msg.get_type()

    if msg_type == "GLOBAL_POSITION_INT":
        print(
            f"POSITION | "
            f"Lat: {msg.lat / 1e7:.7f} | "
            f"Lon: {msg.lon / 1e7:.7f} | "
            f"Alt: {msg.relative_alt / 1000:.2f} m"
        )

    elif msg_type == "ATTITUDE":
        print(
            f"ATTITUDE | "
            f"Roll: {msg.roll:.2f} | "
            f"Pitch: {msg.pitch:.2f} | "
            f"Yaw: {msg.yaw:.2f}"
        )

    elif msg_type == "SYS_STATUS":
        print(
            f"SYSTEM | "
            f"Battery: {msg.battery_remaining}%"
        )

    elif msg_type == "GPS_RAW_INT":
        print(
            f"GPS | "
            f"Satellites: {msg.satellites_visible} | "
            f"Fix: {msg.fix_type}"
        )

    elif msg_type == "VFR_HUD":
        print(
            f"FLIGHT | "
            f"Alt: {msg.alt:.2f} m | "
            f"Speed: {msg.groundspeed:.2f} m/s"
        )

print("\nTelemetry test complete.")
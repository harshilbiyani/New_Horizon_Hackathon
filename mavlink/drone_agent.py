import time
from pymavlink import mavutil
from commands import AutonomyCommand, CommandType
from drone import DroneState

class DroneAgent:
    def __init__(self, connection_string="tcp:127.0.0.1:5762", drone_id=1):
        self.drone_id = drone_id
        print(f"Connecting to ArduPilot via {connection_string}...")
        for _ in range(60):
            try:
                self.connection = mavutil.mavlink_connection(connection_string)
                break
            except Exception as e:
                time.sleep(1)
        else:
            raise Exception("Failed to connect after 60 retries")
        print("Waiting for heartbeat...")
        self.connection.wait_heartbeat()
        print(f"Connected to system {self.connection.target_system}")
        self._request_data_streams()

    def _request_data_streams(self):
        # Request necessary telemetry streams at 10Hz
        reqs = {
            "GLOBAL_POSITION_INT": 33,
            "ATTITUDE": 30,
            "SYS_STATUS": 1,
            "GPS_RAW_INT": 24,
            "VFR_HUD": 74
        }
        for name, msg_id in reqs.items():
            self.connection.mav.command_long_send(
                self.connection.target_system,
                self.connection.target_component,
                mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL,
                0, msg_id, 100000, 0, 0, 0, 0, 0
            )

    def update_state(self, current_state: DroneState) -> DroneState:
        # Non-blocking reads to update state
        while True:
            msg = self.connection.recv_match(blocking=False)
            if not msg:
                break
            
            mtype = msg.get_type()
            if mtype == "GLOBAL_POSITION_INT":
                current_state.lat = msg.lat / 1e7
                current_state.lon = msg.lon / 1e7
                current_state.alt = msg.relative_alt / 1000.0
                current_state.velocity_x = msg.vx / 100.0
                current_state.velocity_y = msg.vy / 100.0
                current_state.velocity_z = msg.vz / 100.0
            elif mtype == "ATTITUDE":
                current_state.roll = msg.roll
                current_state.pitch = msg.pitch
                current_state.yaw = msg.yaw
            elif mtype == "SYS_STATUS":
                current_state.battery = msg.battery_remaining
            elif mtype == "HEARTBEAT":
                current_state.armed = (msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED) != 0
                current_state.flight_mode = mavutil.mode_string_v10(msg)
            elif mtype == "GPS_RAW_INT":
                current_state.gps_status = msg.fix_type
                
        current_state.timestamp = time.time()
        return current_state

    def get_position(self):
        msg = self.connection.recv_match(type="GLOBAL_POSITION_INT", blocking=True, timeout=2)
        if msg is None: return None
        return {"lat": msg.lat / 1e7, "lon": msg.lon / 1e7, "alt": msg.relative_alt / 1000.0}

    def fetch_mission_waypoints(self):
        try:
            self.connection.waypoint_request_list_send()
            msg = self.connection.recv_match(type=['MISSION_COUNT', 'WAYPOINT_COUNT'], blocking=True, timeout=0.5)
            if not msg:
                return []
            count = msg.count
            wps = []
            for i in range(count):
                self.connection.waypoint_request_send(i)
                item = self.connection.recv_match(type=['MISSION_ITEM', 'MISSION_ITEM_INT', 'WAYPOINT'], blocking=True, timeout=0.5)
                if item:
                    lat = getattr(item, 'x', 0)
                    lon = getattr(item, 'y', 0)
                    alt = getattr(item, 'z', 0)
                    if abs(lat) > 180:
                        lat /= 1e7
                        lon /= 1e7
                    if lat != 0 or lon != 0:
                        wps.append({'seq': item.seq, 'lat': lat, 'lon': lon, 'alt': alt})
            return wps
        except Exception:
            return []

    def fetch_geofence(self):
        try:
            fence_points = []
            self.connection.mav.fence_point_send(self.connection.target_system, self.connection.target_component, 0)
            msg = self.connection.recv_match(type='FENCE_POINT', blocking=True, timeout=0.3)
            if msg:
                count = msg.count
                if msg.lat != 0 or msg.lon != 0:
                    fence_points.append({'lat': msg.lat, 'lon': msg.lon})
                for i in range(1, count):
                    self.connection.mav.fence_point_send(self.connection.target_system, self.connection.target_component, i)
                    p = self.connection.recv_match(type='FENCE_POINT', blocking=True, timeout=0.3)
                    if p and (p.lat != 0 or p.lon != 0):
                        fence_points.append({'lat': p.lat, 'lon': p.lon})
            return fence_points
        except Exception:
            return []
            
    def set_mode(self, mode_name: str):
        mode_id = self.connection.mode_mapping().get(mode_name)
        if mode_id is None:
            print(f"Unknown mode: {mode_name}")
            return
        self.connection.mav.set_mode_send(
            self.connection.target_system,
            mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED,
            mode_id
        )

    def arm(self):
        self.connection.mav.command_long_send(
            self.connection.target_system, self.connection.target_component,
            mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 1, 0, 0, 0, 0, 0, 0
        )

    def disarm(self):
        self.connection.mav.command_long_send(
            self.connection.target_system, self.connection.target_component,
            mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 0, 0, 0, 0, 0, 0, 0
        )

    def takeoff(self, alt: float):
        self.connection.mav.command_long_send(
            self.connection.target_system, self.connection.target_component,
            mavutil.mavlink.MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, 0, alt
        )

    def goto_position(self, lat: float, lon: float, alt: float):
        self.connection.mav.set_position_target_global_int_send(
            0, self.connection.target_system, self.connection.target_component,
            mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
            int(0b110111111000), # position only
            int(lat * 1e7), int(lon * 1e7), alt,
            0, 0, 0, 0, 0, 0, 0, 0
        )

    def execute(self, cmd: AutonomyCommand):
        print(f"[MAVLink] Executing {cmd.type.name} (Priority {cmd.priority}): {cmd.reason}")
        if cmd.type == CommandType.TAKEOFF:
            self.set_mode("GUIDED")
            self.arm()
            alt = cmd.target_position[2] if cmd.target_position else 10.0
            self.takeoff(alt)
        elif cmd.type == CommandType.GOTO:
            self.set_mode("GUIDED")
            if cmd.target_position:
                self.goto_position(*cmd.target_position)
        elif cmd.type == CommandType.HOLD:
            pass
        elif cmd.type == CommandType.RETURN_HOME:
            self.set_mode("RTL")
        elif cmd.type == CommandType.LAND:
            self.set_mode("LAND")
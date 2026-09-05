import time
import requests
from drone import DroneState, Drone
from commands import AutonomyCommand, CommandType
from mavlink.drone_agent import DroneAgent
from task_allocation import CBBAAgent, Task, run_cbba
from ring_sector_allocation import RingSectorAllocator
from slam import OccupancyGridMapper

class DroneShieldAutonomy:
    def __init__(self, connection_string="tcp:127.0.0.1:5762", is_simulation=False, auto_arm=False, drone_id=1):
        self.is_simulation = is_simulation
        self.auto_arm = auto_arm
        self.drone_id = drone_id
        self.agent = DroneAgent(connection_string=connection_string, drone_id=drone_id)
        
        # Initial state setup
        self.state = DroneState(
            drone_id=self.drone_id, lat=0.0, lon=0.0, alt=0.0, roll=0.0, pitch=0.0, yaw=0.0,
            battery=100.0, armed=False, flight_mode="UNKNOWN"
        )
        self.initial_pos = None
        self.sector_dispatched = False
        
        # Algorithm initialization
        self.ring_allocator = RingSectorAllocator(ring_width_m=1000.0)
        self.slam_mapper = OccupancyGridMapper(width_m=200, height_m=200, resolution_m=1.0)
        
        # Mocking an initial fleet for task allocation
        self.drone_model = Drone(drone_id=self.drone_id)
        self.cbba_agent = CBBAAgent(drone_id=self.drone_id, position=(0.0, 0.0))
        self.zones = {
            101: Task(101, (500, 500)),
            102: Task(102, (-500, 500))
        }
        self.manual_until = 0
        
    def step_algorithms(self):
        # 1. Update SLAM with a mock scan (since SITL doesn't provide LiDAR natively without Gazebo)
        # We use a safe default empty scan or mock scan
        mock_lidar = [(0.0, 30.0), (0.1, 35.0)]
        self.slam_mapper.update(
            pose=(self.state.lat, self.state.lon, self.state.yaw), 
            lidar_hits=mock_lidar
        )
        
        # 2. Run Ring Sector Allocation periodically
        # In a real swarm, this takes all drones. Here we use our single mock drone.
        # Create 5 mock drones to get the 5-drone allocation
        mock_swarm = [Drone(drone_id=i) for i in range(1, 6)]
        allocations = self.ring_allocator.assign(mock_swarm, max_radius_m=4000.0)
        self._my_assigned_cell = allocations.get(self.drone_id)
        
        # 3. Run CBBA Task Allocation
        self.cbba_agent.position = (self.state.lat, self.state.lon)
        assignment = run_cbba([self.cbba_agent], self.zones, rounds=2)
        
        return assignment
        
    def decide(self, assignment) -> AutonomyCommand:
        # Safety rules (Phase 7)
        if self.state.battery < 20.0 and self.state.battery > 0.0:
            return AutonomyCommand(
                type=CommandType.RETURN_HOME, 
                priority=100, 
                reason="Low battery!"
            )
            
        if not self.state.armed:
            if self.auto_arm:
                return AutonomyCommand(
                    type=CommandType.TAKEOFF,
                    target_position=(0, 0, 30.0),
                    priority=90,
                    reason="Auto-arming requested!"
                )
            else:
                return AutonomyCommand(
                    type=CommandType.HOLD,
                    priority=10,
                    reason="Disarmed. Holding state."
                )
            
        # Active Sector Allocation based on assignment
        if self.state.armed and self.state.flight_mode == "GUIDED" and getattr(self, "_my_assigned_cell", None) and not self.sector_dispatched:
            if self.initial_pos is None and self.state.lat != 0.0:
                self.initial_pos = (self.state.lat, self.state.lon)
            
            if self.initial_pos:
                my_cell = self._my_assigned_cell
                import math
                r_mid = (my_cell["r_inner"] + my_cell["r_outer"]) / 2.0
                if r_mid == 0.0:
                    r_mid = 50.0 # Don't just sit at center
                theta_mid = (my_cell["theta_start"] + my_cell["theta_end"]) / 2.0
                
                # 1 degree lat is ~111,111 meters
                # 1 degree lon is ~111,111 * cos(lat) meters
                lat_offset = (r_mid * math.cos(theta_mid)) / 111111.0
                lon_offset = (r_mid * math.sin(theta_mid)) / (111111.0 * math.cos(math.radians(self.initial_pos[0])))
                
                target_lat = self.initial_pos[0] + lat_offset
                target_lon = self.initial_pos[1] + lon_offset
                
                print(f"[MAVLink] Executing GOTO (Priority 50): Deploying swarm to quadrant {self.drone_id}")
                self.agent.goto_position(target_lat, target_lon, 30.0)
                self.sector_dispatched = True
                
                return AutonomyCommand(type=CommandType.HOLD, priority=50, reason=f"Deploying to sector {self.drone_id}")
            
        # Passive telemetry & command relay mode - do not override Mission Planner!
        return AutonomyCommand(type=CommandType.HOLD, priority=0, reason="Passive SITL telemetry sync mode.")

    def poll_and_execute_commands(self):
        try:
            drone_str = f"DRN-{self.drone_id:03d}"
            res = requests.get(f"http://localhost:3001/api/mission/pending_commands?drone_id={drone_str}", timeout=0.2)
            if res.status_code == 200:
                data = res.json()
                cmds = data if isinstance(data, list) else data.get("commands", [])
                for cmd in cmds:
                    action = cmd.get("action")
                    print(f"[{drone_str}] Executing 2D Map command: {action} with params {cmd}")
                    if action == "GOTO":
                        lat = cmd.get("lat")
                        lon = cmd.get("lon")
                        alt = cmd.get("alt", 30.0)
                        if lat is not None and lon is not None:
                            self.agent.set_mode("GUIDED")
                            self.agent.goto_position(lat, lon, alt)
                            self.manual_until = time.time() + 30.0
                    elif action == "ARM":
                        self.agent.set_mode("GUIDED")
                        self.agent.arm()
                    elif action == "DISARM":
                        self.agent.disarm()
                    elif action == "RTL":
                        self.agent.set_mode("RTL")
                        self.manual_until = time.time() + 60.0
                    elif action == "TAKEOFF":
                        self.agent.set_mode("GUIDED")
                        self.agent.arm()
                        self.agent.takeoff(cmd.get("alt", 30.0))
                    elif action == "UPLOAD_MISSION":
                        wps = cmd.get("waypoints", [])
                        if wps:
                            # Push to server waypoints endpoint
                            try:
                                requests.post("http://localhost:3001/api/mission/waypoints", json={
                                    "drone_id": drone_str,
                                    "waypoints": wps
                                }, timeout=0.2)
                            except Exception:
                                pass
        except Exception as e:
            pass

    def run(self):
        print(f"\nStarting DroneShield Autonomy Loop for Drone {self.drone_id}...")
        try:
            while True:
                # 1. Gather Telemetry
                self.state = self.agent.update_state(self.state)
                
                # 2. Check & execute commands from 2D Map / Mission Planner
                self.poll_and_execute_commands()
                
                # Print State
                # print(f"[STATE {self.drone_id}] Mode: {self.state.flight_mode} | Armed: {self.state.armed} | "
                #       f"Bat: {self.state.battery}% | Alt: {self.state.alt:.1f}m")
                
                # 3. Run Algorithms & decide autonomy command if not manual override
                if time.time() > self.manual_until:
                    assignment = self.step_algorithms()
                    command = self.decide(assignment)
                    self.agent.execute(command)
                
                # --- PUSH TELEMETRY TO DASHBOARD ---
                try:
                    speed = (self.state.velocity_x**2 + self.state.velocity_y**2)**0.5
                    bat_pct = max(0.0, min(100.0, float(self.state.battery if self.state.battery >= 0 else 100)))
                    requests.post("http://localhost:3001/api/mission/sitl_telemetry", json=[{
                        "id": f"DRN-{self.drone_id:03d}",
                        "lat": self.state.lat,
                        "lon": self.state.lon,
                        "alt": self.state.alt,
                        "heading": self.state.yaw,
                        "battery": bat_pct,
                        "mode": self.state.flight_mode,
                        "armed": self.state.armed,
                        "speed": speed
                    }], timeout=0.1)
                except Exception:
                    pass # Ignore connection errors to dashboard

                # Periodically fetch and push ArduPilot MAVLink mission waypoints & geofence to server
                if getattr(self, '_step_count', 0) % 10 == 0:
                    try:
                        wps = self.agent.fetch_mission_waypoints()
                        if wps:
                            requests.post("http://localhost:3001/api/mission/waypoints", json={
                                "drone_id": f"DRN-{self.drone_id:03d}",
                                "waypoints": wps
                            }, timeout=0.2)
                    except Exception:
                        pass

                    try:
                        fence = self.agent.fetch_geofence()
                        if fence:
                            requests.post("http://localhost:3001/api/mission/geofence", json={
                                "fence": fence
                            }, timeout=0.2)
                    except Exception:
                        pass

                self._step_count = getattr(self, '_step_count', 0) + 1

                time.sleep(0.5)  # Loop at 0.5Hz for demo purposes
        except KeyboardInterrupt:
            print(f"\nShutting down Autonomy Loop for Drone {self.drone_id}...")

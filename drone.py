from dataclasses import dataclass
from typing import Optional, Tuple

@dataclass
class DroneState:
    drone_id: int
    lat: float
    lon: float
    alt: float
    roll: float
    pitch: float
    yaw: float
    battery: float
    armed: bool
    flight_mode: str
    velocity_x: float = 0.0
    velocity_y: float = 0.0
    velocity_z: float = 0.0
    gps_status: int = 0
    timestamp: float = 0.0

class Drone:
    def __init__(self, drone_id: int, position: Tuple[float, float] = (0.0, 0.0), 
                 battery_capacity_min: float = 20.0, avg_speed_mps: float = 12.0, 
                 comm_range_m: float = 1500.0):
        self.drone_id = drone_id
        self.position = position
        self.battery_capacity_min = battery_capacity_min
        self.avg_speed_mps = avg_speed_mps
        self.comm_range_m = comm_range_m
        
        self.role = "searcher"
        self.assigned_zone: Optional[int] = None
        self.battery_pct = 100.0
        self.is_alive = True

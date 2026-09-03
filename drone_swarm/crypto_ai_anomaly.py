import math
import time

class PhysicsAnomalyDetector:
    """
    Implements Layer 4: Behavioral Zero-Trust (Physics Quarantine).
    
    This acts as a failsafe against stolen cryptographic keys. If a hacker 
    extracts a drone's hardware PUF and signs fake GPS data, this AI detector
    evaluates the physical viability of the telemetry. 
    
    If the drone reports an impossible physical movement (e.g. traveling 
    5 kilometers in 1 second), the AI flags it as GPS Spoofing and quarantines it.
    """
    
    # Maximum realistic speed of a high-performance drone in meters per second (approx 108 km/h)
    MAX_PHYSICAL_SPEED_MPS = 30.0 
    
    def __init__(self):
        # Maps node_id -> {"lat": float, "long": float, "timestamp": float}
        self.state_history = {}
        # List of quarantined node_ids
        self.quarantined_nodes = set()

    def analyze_telemetry(self, node_id: int, lat: float, lon: float, timestamp: float = None) -> bool:
        """
        Analyzes a new telemetry packet for physical impossibilities.
        Returns True if the packet is physically valid.
        Returns False if the packet violates physics (Anomaly Detected).
        """
        if node_id in self.quarantined_nodes:
            return False # Drop packets from quarantined drones immediately
            
        if timestamp is None:
            timestamp = time.time()
            
        # First time seeing this drone, just record state and trust it
        if node_id not in self.state_history:
            self.state_history[node_id] = {"lat": lat, "long": lon, "timestamp": timestamp}
            return True
            
        last_state = self.state_history[node_id]
        
        # Calculate time delta (seconds)
        time_delta = timestamp - last_state["timestamp"]
        
        # Negative time delta = clock rollback manipulation (replay attack vector).
        # An attacker can resend an old GPS packet with a past timestamp to bypass the
        # velocity check. We quarantine immediately on any backwards time movement.
        if time_delta < 0:
            self._trigger_quarantine(node_id, 0.0)
            return False
            
        # Same-millisecond packets: safe to skip the velocity check (avoid div by zero).
        if time_delta == 0:
            return True
            
        # Calculate distance delta (meters) using Haversine formula
        distance_meters = self._haversine(last_state["lat"], last_state["long"], lat, lon)
        
        # Calculate velocity (meters per second)
        velocity = distance_meters / time_delta
        
        # AI RULE CHECK: Did it break physics?
        if velocity > self.MAX_PHYSICAL_SPEED_MPS:
            self._trigger_quarantine(node_id, velocity)
            return False
            
        # Update state history if valid
        self.state_history[node_id] = {"lat": lat, "long": lon, "timestamp": timestamp}
        return True

    def _haversine(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calculates the great-circle distance between two points on the Earth's surface.
        Returns distance in meters.
        """
        R = 6371000  # Radius of Earth in meters
        
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = math.sin(delta_phi / 2.0) ** 2 + \
            math.cos(phi1) * math.cos(phi2) * \
            math.sin(delta_lambda / 2.0) ** 2
            
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        distance = R * c
        
        return distance
        
    def _trigger_quarantine(self, node_id: int, velocity: float):
        """Isolates the compromised drone from the swarm."""
        self.quarantined_nodes.add(node_id)
        # In a real system, this would fire an event to revoke the drone's JWT tokens via Layer 5
        
    def get_security_status(self) -> dict:
        """Returns the anomaly detection status for the dashboard UI."""
        return {
            "ai_engine": "Rule-Based Physics Monitor (Haversine)",
            "tracked_drones": len(self.state_history),
            "quarantined_drones": len(self.quarantined_nodes),
            "max_allowed_speed": f"{self.MAX_PHYSICAL_SPEED_MPS} m/s"
        }

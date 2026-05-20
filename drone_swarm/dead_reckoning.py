# dead_reckoning.py

import math
import random


class LocalizationEstimate:
    """Position estimate with uncertainty."""
    
    def __init__(self, x, y, heading, uncertainty_radius=1.0):
        """
        Create position estimate.
        
        Args:
            x                   : float — estimated x position
            y                   : float — estimated y position
            heading             : float — compass bearing (0-360 degrees)
            uncertainty_radius  : float — position uncertainty (meters)
        """
        self.x = x
        self.y = y
        self.heading = heading % 360.0
        self.uncertainty = uncertainty_radius
    
    def distance_to(self, other):
        """Euclidean distance to another position."""
        return math.sqrt((self.x - other.x)**2 + (self.y - other.y)**2)
    
    def to_tuple(self):
        return (self.x, self.y)
    
    def to_dict(self):
        return {
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "heading": round(self.heading, 1),
            "uncertainty": round(self.uncertainty, 2)
        }


class DeadReckoningEngine:
    """
    GPS-denied localization using dead reckoning + collaborative correction.
    
    Combines:
    - IMU-based motion integration (accelerometer → velocity → position)
    - Compass heading maintenance
    - Visual odometry simulation
    - Collaborative localization from nearby drones
    - Landmark observations for correction
    """
    
    def __init__(self, initial_position, initial_heading=0.0):
        """
        Initialize dead reckoning engine.
        
        Args:
            initial_position  : (x, y) — starting location
            initial_heading   : float  — compass bearing
        """
        self.estimate = LocalizationEstimate(
            initial_position[0],
            initial_position[1],
            initial_heading
        )
        
        self.velocity = (0.0, 0.0)  # (vx, vy)
        self.last_velocity = (0.0, 0.0)
        self.drift_rate = 0.02  # uncertainty grows 2% per update
        self.imu_noise = 0.1    # sensor noise
        
        # Collaborative localization
        self.known_allies = {}           # drone_id → LocalizationEstimate
        self.landmark_observations = []  # observed features
    
    def integrate_imu(self, acceleration, dt=0.1):
        """
        Update position using IMU acceleration readings.
        
        Args:
            acceleration : (ax, ay) — accelerometer readings (m/s²)
            dt           : float    — time step
        """
        ax, ay = acceleration
        
        # Add sensor noise
        ax += random.gauss(0, self.imu_noise)
        ay += random.gauss(0, self.imu_noise)
        
        # Integrate: acceleration → velocity
        vx = self.velocity[0] + ax * dt
        vy = self.velocity[1] + ay * dt
        
        # Integrate: velocity → position
        dx = self.velocity[0] * dt + 0.5 * ax * dt**2
        dy = self.velocity[1] * dt + 0.5 * ay * dt**2
        
        self.estimate.x += dx
        self.estimate.y += dy
        self.velocity = (vx, vy)
        
        # Uncertainty grows (drift)
        distance_traveled = math.sqrt(dx**2 + dy**2)
        self.estimate.uncertainty += distance_traveled * self.drift_rate
    
    def update_heading(self, compass_reading, angular_velocity=0.0):
        """
        Update heading from compass and gyroscope.
        
        Args:
            compass_reading  : float — magnetic compass bearing (0-360)
            angular_velocity : float — rotation rate (deg/s)
        """
        # Compass is more reliable than raw gyro integration
        # Blend: 70% compass, 30% gyro integration
        new_heading = self.estimate.heading + angular_velocity * 0.1
        
        # Blend with compass (corrects gyro drift)
        self.estimate.heading = (0.7 * compass_reading + 0.3 * new_heading) % 360.0
    
    def apply_velocity_constraint(self, speed, max_turn_rate=30.0):
        """
        Constrain motion to realistic drone physics.
        
        Args:
            speed          : float — commanded speed (m/s)
            max_turn_rate  : float — max turn rate (deg/s)
        """
        # Velocity magnitude bounded by speed
        vx, vy = self.velocity
        current_speed = math.sqrt(vx**2 + vy**2)
        
        if current_speed > speed:
            scale = speed / max(current_speed, 0.01)
            self.velocity = (vx * scale, vy * scale)
    
    def observe_landmark(self, landmark_pos, observation_noise=0.5):
        """
        Observe a known landmark (building, tree, rescue beacon, etc).
        
        Returns correction to position estimate.
        
        Args:
            landmark_pos      : (x, y) — true position of landmark
            observation_noise : float  — measurement uncertainty
        """
        # Simulate noisy range measurement
        true_dist = math.sqrt(
            (self.estimate.x - landmark_pos[0])**2 +
            (self.estimate.y - landmark_pos[1])**2
        )
        measured_dist = true_dist + random.gauss(0, observation_noise)
        
        # Update estimate: move closer to landmark by correction amount
        correction_factor = 0.3  # how much to trust this observation
        
        dx = landmark_pos[0] - self.estimate.x
        dy = landmark_pos[1] - self.estimate.y
        
        self.estimate.x += dx * correction_factor
        self.estimate.y += dy * correction_factor
        self.estimate.uncertainty *= 0.7  # uncertainty shrinks with observation
        
        return {
            "true_distance": round(true_dist, 2),
            "measured_distance": round(measured_dist, 2),
            "correction": round(correction_factor, 2)
        }
    
    def fuse_ally_position(self, ally_id, ally_estimate, relative_observation):
        """
        Collaborative localization: use ally's position to improve our estimate.
        
        Works when drones can see each other (relative position known).
        
        Args:
            ally_id                 : int                      — which ally
            ally_estimate           : LocalizationEstimate     — ally's position
            relative_observation    : (dx, dy, confidence)     — relative position
        """
        dx, dy, confidence = relative_observation
        
        # Ally's position + our relative observation
        inferred_my_position = (ally_estimate.x - dx, ally_estimate.y - dy)
        
        # Confidence-weighted correction
        correction = confidence * 0.4  # trust 40% of collaborative info
        
        self.estimate.x = (1 - correction) * self.estimate.x + correction * inferred_my_position[0]
        self.estimate.y = (1 - correction) * self.estimate.y + correction * inferred_my_position[1]
        
        # Average uncertainty
        new_uncertainty = (self.estimate.uncertainty + ally_estimate.uncertainty) / 2
        self.estimate.uncertainty = min(self.estimate.uncertainty, new_uncertainty * 0.9)
    
    def register_ally(self, ally_id, position_estimate):
        """Register a known ally's position."""
        self.known_allies[ally_id] = position_estimate
    
    def get_covariance_ellipse(self):
        """
        Get uncertainty ellipse for visualization.
        
        Returns: (center, semi_major, semi_minor)
        """
        # Simple circle for now; could expand to ellipse with heading uncertainty
        return {
            "center": (self.estimate.x, self.estimate.y),
            "radius": self.estimate.uncertainty,
            "confidence_95": self.estimate.uncertainty * 2.0
        }


class IndoorPositioningAid:
    """Helper for GPS-denied positioning using WiFi beacons, IMU, landmarks."""
    
    def __init__(self):
        self.wifi_beacons = {}  # beacon_id → (x, y)
        self.imu_calibration = {"ax": 0, "ay": 0, "heading": 0}
    
    def register_beacon(self, beacon_id, position):
        """Register a WiFi beacon at known position."""
        self.wifi_beacons[beacon_id] = position
    
    def triangulate_from_rssi(self, rssi_readings):
        """
        Trilaterate position from WiFi signal strength.
        
        Args:
            rssi_readings : dict — beacon_id → rssi (dBm)
        
        Returns:
            Estimated position
        """
        # RSSI to distance: P = rssi + 20*log10(distance) + constant
        # Simplified: stronger signal = closer
        
        weighted_x = 0
        weighted_y = 0
        total_weight = 0
        
        for beacon_id, rssi in rssi_readings.items():
            if beacon_id not in self.wifi_beacons:
                continue
            
            bx, by = self.wifi_beacons[beacon_id]
            
            # RSSI conversion: -30 dBm (very close) to -90 dBm (far)
            # Distance ≈ 10^((rssi + 70) / -20)
            distance_estimate = 10 ** ((rssi + 70) / -20)
            
            # Weight by signal strength (inverse of distance)
            weight = max(0.1, 1.0 / max(distance_estimate, 0.5))
            
            weighted_x += bx * weight
            weighted_y += by * weight
            total_weight += weight
        
        if total_weight > 0:
            return (weighted_x / total_weight, weighted_y / total_weight)
        
        return None

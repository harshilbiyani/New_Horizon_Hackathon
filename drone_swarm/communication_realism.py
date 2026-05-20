"""
Communication Realism Layer
Simulates GPS-denied mesh networking with realistic constraints:
- Network delay (variable latency)
- Packet loss (unreliable channels)
- Limited range (signal attenuation)
- Message priority queues
- Mesh network topology
"""

import random
import math
from typing import Dict, List, Tuple, Optional
from collections import defaultdict, deque
from dataclasses import dataclass
from enum import Enum


class MessagePriority(Enum):
    """Message priority levels."""
    CRITICAL = 3  # Emergency, must-deliver
    HIGH = 2      # Survivor detection, critical info
    NORMAL = 1    # Zone updates, general comms
    LOW = 0       # Telemetry, non-critical


@dataclass
class Message:
    """Network message with metadata."""
    sender_id: int
    receiver_id: int
    message_type: str
    content: dict
    priority: MessagePriority = MessagePriority.NORMAL
    timestamp: float = 0.0
    delivery_time: Optional[float] = None
    delivered: bool = False
    lost: bool = False


class CommunicationChannel:
    """Simulates a single communication link between two entities."""
    
    def __init__(self, drone_a: int, drone_b: int, 
                 base_delay_ms: float = 50.0,
                 loss_rate: float = 0.05,
                 max_range: float = 100.0):
        """
        Initialize communication channel.
        
        Args:
            drone_a, drone_b: IDs of communicating drones
            base_delay_ms: Base latency in milliseconds
            loss_rate: Probability of packet loss (0-1)
            max_range: Maximum communication range in simulation units
        """
        self.drone_a = drone_a
        self.drone_b = drone_b
        self.base_delay = base_delay_ms
        self.loss_rate = loss_rate
        self.max_range = max_range
        
        # Statistics
        self.messages_sent = 0
        self.messages_delivered = 0
        self.messages_lost = 0
        self.total_latency = 0.0
    
    def can_communicate(self, distance: float) -> bool:
        """Check if drones are in range."""
        return distance <= self.max_range
    
    def calculate_delay(self, distance: float, priority: MessagePriority) -> float:
        """
        Calculate network delay based on distance and priority.
        
        Args:
            distance: Distance between drones
            priority: Message priority level
            
        Returns:
            Delay in milliseconds
        """
        # Distance attenuation: farther = more delay
        distance_factor = 1.0 + (distance / self.max_range) * 2.0
        
        # Priority boost: high priority gets faster handling
        priority_factor = 1.0 / (1.0 + priority.value * 0.2)
        
        # Random jitter
        jitter = random.gauss(0, self.base_delay * 0.1)
        
        delay = self.base_delay * distance_factor * priority_factor + jitter
        return max(5.0, delay)  # Minimum 5ms
    
    def check_packet_loss(self, distance: float) -> bool:
        """
        Determine if packet is lost based on distance and loss rate.
        
        Args:
            distance: Distance between drones
            
        Returns:
            True if packet lost, False if delivered
        """
        # Farther distances have higher loss rate
        distance_penalty = (distance / self.max_range) if distance > 0 else 0
        effective_loss = self.loss_rate * (1.0 + distance_penalty)
        
        return random.random() < effective_loss


class MeshNetwork:
    """
    Simulates a mesh network of drones.
    
    Features:
    - Direct communication when in range
    - Relay through intermediate drones
    - Message priority queuing
    - Realistic latency and packet loss
    """
    
    def __init__(self, num_drones: int, 
                 base_delay_ms: float = 50.0,
                 loss_rate: float = 0.05,
                 comm_range: float = 100.0):
        """
        Initialize mesh network.
        
        Args:
            num_drones: Number of drones in swarm
            base_delay_ms: Base network latency
            loss_rate: Base packet loss rate
            comm_range: Radio communication range
        """
        self.num_drones = num_drones
        self.current_time = 0.0
        
        # Position tracking (for range calculation)
        self.drone_positions: Dict[int, Tuple[float, float]] = {
            i: (0.0, 0.0) for i in range(num_drones)
        }
        
        # Message queues per drone (sorted by priority)
        self.outgoing_queues: Dict[int, deque] = {
            i: deque() for i in range(num_drones)
        }
        self.incoming_queues: Dict[int, deque] = {
            i: deque() for i in range(num_drones)
        }
        
        # In-flight messages with delivery times
        self.in_flight: List[Tuple[Message, float]] = []
        
        # Network statistics
        self.stats = {
            'sent': 0,
            'delivered': 0,
            'lost': 0,
            'relayed': 0,
            'avg_latency': 0.0,
            'total_latency': 0.0,
            'latency_samples': 0
        }
        
        # Channel parameters
        self.base_delay = base_delay_ms
        self.loss_rate = loss_rate
        self.comm_range = comm_range
    
    def update_drone_position(self, drone_id: int, x: float, y: float):
        """Update drone position for range calculations."""
        self.drone_positions[drone_id] = (x, y)
    
    def get_distance(self, drone_a: int, drone_b: int) -> float:
        """Calculate distance between two drones."""
        x1, y1 = self.drone_positions[drone_a]
        x2, y2 = self.drone_positions[drone_b]
        return math.sqrt((x2 - x1)**2 + (y2 - y1)**2)
    
    def send_message(self, sender: int, receiver: int, 
                    message_type: str, content: dict,
                    priority: MessagePriority = MessagePriority.NORMAL) -> bool:
        """
        Queue a message for transmission.
        
        Args:
            sender: Sending drone ID
            receiver: Receiving drone ID
            message_type: Type of message
            content: Message content dictionary
            priority: Message priority level
            
        Returns:
            True if queued, False if invalid
        """
        if sender >= self.num_drones or receiver >= self.num_drones:
            return False
        
        message = Message(
            sender_id=sender,
            receiver_id=receiver,
            message_type=message_type,
            content=content,
            priority=priority,
            timestamp=self.current_time
        )
        
        self.outgoing_queues[sender].append(message)
        self.stats['sent'] += 1
        return True
    
    def process_messages(self, time_step: float = 10.0):
        """
        Process network messages for a time step.
        
        Handles:
        - Transmitting queued messages
        - Simulating delays and packet loss
        - Delivering ready messages
        
        Args:
            time_step: Milliseconds to simulate
        """
        self.current_time += time_step
        
        # Send queued messages from each drone
        for drone_id in range(self.num_drones):
            while self.outgoing_queues[drone_id]:
                message = self.outgoing_queues[drone_id].popleft()
                self._transmit_message(message)
        
        # Process in-flight messages
        delivered = []
        for message, delivery_time in self.in_flight:
            if self.current_time >= delivery_time:
                # Message ready for delivery
                self.incoming_queues[message.receiver_id].append(message)
                message.delivered = True
                message.delivery_time = delivery_time
                self.stats['delivered'] += 1
                delivered.append((message, delivery_time))
                
                # Update latency stats
                actual_latency = delivery_time - message.timestamp
                self.stats['total_latency'] += actual_latency
                self.stats['latency_samples'] += 1
        
        # Remove delivered messages
        for item in delivered:
            self.in_flight.remove(item)
        
        # Update average latency
        if self.stats['latency_samples'] > 0:
            self.stats['avg_latency'] = (
                self.stats['total_latency'] / self.stats['latency_samples']
            )
    
    def _transmit_message(self, message: Message):
        """
        Simulate transmission of a message.
        
        Handles direct transmission, relay, or drop.
        """
        receiver = message.receiver_id
        distance = self.get_distance(message.sender_id, receiver)
        
        # Check if in range
        if distance > self.comm_range:
            # Out of range - try relay
            relayed = self._try_relay(message, message.sender_id, receiver)
            if not relayed:
                message.lost = True
                self.stats['lost'] += 1
            return
        
        # Check for packet loss
        if random.random() < self.loss_rate * (1.0 + distance / self.comm_range):
            message.lost = True
            self.stats['lost'] += 1
            return
        
        # Calculate delay
        delay = self.base_delay * (1.0 + distance / self.comm_range) * (1.0 / (1.0 + message.priority.value * 0.2))
        delay += random.gauss(0, self.base_delay * 0.1)
        delay = max(5.0, delay)
        
        # Schedule for delivery
        delivery_time = self.current_time + delay
        self.in_flight.append((message, delivery_time))
    
    def _try_relay(self, message: Message, source: int, dest: int) -> bool:
        """
        Try to relay message through intermediate drone.
        
        Returns:
            True if relay successful, False otherwise
        """
        # Find nearest drone to destination that's in range of source
        source_pos = self.drone_positions[source]
        dest_pos = self.drone_positions[dest]
        
        best_relay = None
        best_distance_to_dest = float('inf')
        
        for relay_id in range(self.num_drones):
            if relay_id == source or relay_id == dest:
                continue
            
            relay_pos = self.drone_positions[relay_id]
            
            # Check if relay is in range of source
            dist_to_relay = math.sqrt(
                (relay_pos[0] - source_pos[0])**2 +
                (relay_pos[1] - source_pos[1])**2
            )
            if dist_to_relay > self.comm_range:
                continue
            
            # Check distance to destination
            dist_to_dest = math.sqrt(
                (dest_pos[0] - relay_pos[0])**2 +
                (dest_pos[1] - relay_pos[1])**2
            )
            
            if dist_to_dest < best_distance_to_dest:
                best_relay = relay_id
                best_distance_to_dest = dist_to_dest
        
        if best_relay is not None and best_distance_to_dest <= self.comm_range:
            # Relay found - recursively send through it
            message.sender_id = best_relay
            self._transmit_message(message)
            self.stats['relayed'] += 1
            return True
        
        return False
    
    def receive_messages(self, drone_id: int) -> List[Message]:
        """
        Get all messages received by a drone.
        
        Args:
            drone_id: Drone ID
            
        Returns:
            List of received messages
        """
        messages = []
        while self.incoming_queues[drone_id]:
            messages.append(self.incoming_queues[drone_id].popleft())
        return messages
    
    def get_network_stats(self) -> Dict:
        """Get network performance statistics."""
        delivery_rate = (
            self.stats['delivered'] / max(self.stats['sent'], 1) * 100
        )
        return {
            'messages_sent': self.stats['sent'],
            'messages_delivered': self.stats['delivered'],
            'messages_lost': self.stats['lost'],
            'messages_relayed': self.stats['relayed'],
            'delivery_rate': delivery_rate,
            'avg_latency_ms': self.stats['avg_latency'],
            'current_time': self.current_time
        }


class GPSDeniedLocalization:
    """
    Simulates position tracking in GPS-denied environment.
    
    Uses dead reckoning with drift and sensor fusion concepts.
    """
    
    def __init__(self, initial_x: float = 0.0, initial_y: float = 0.0):
        """Initialize localization system."""
        self.true_x = initial_x
        self.true_y = initial_y
        
        # Estimated position (with drift)
        self.est_x = initial_x
        self.est_y = initial_y
        
        # Drift parameters
        self.drift_rate = 0.01  # 1% position drift per step
        self.drift_x = 0.0
        self.drift_y = 0.0
        
        # IMU-like sensor readings
        self.velocity_x = 0.0
        self.velocity_y = 0.0
        self.imu_noise = 0.1
        
        # Position history
        self.history = [(self.true_x, self.true_y)]
        self.estimated_history = [(self.est_x, self.est_y)]
    
    def move(self, dx: float, dy: float, true_move: bool = True):
        """
        Process movement and update position estimates.
        
        Args:
            dx, dy: Commanded movement
            true_move: If True, also move true position
        """
        # Update true position
        if true_move:
            self.true_x += dx
            self.true_y += dy
        
        # Dead reckoning with drift
        imu_x = dx + random.gauss(0, self.imu_noise)
        imu_y = dy + random.gauss(0, self.imu_noise)
        
        self.est_x += imu_x
        self.est_y += imu_y
        
        # Accumulate drift
        self.drift_x += dx * self.drift_rate + random.gauss(0, 0.1)
        self.drift_y += dy * self.drift_rate + random.gauss(0, 0.1)
        
        self.est_x += self.drift_x
        self.est_y += self.drift_y
        
        # Log history
        self.history.append((self.true_x, self.true_y))
        self.estimated_history.append((self.est_x, self.est_y))
    
    def get_position_estimate(self) -> Tuple[float, float]:
        """Get current position estimate."""
        return (self.est_x, self.est_y)
    
    def get_true_position(self) -> Tuple[float, float]:
        """Get true position."""
        return (self.true_x, self.true_y)
    
    def get_position_error(self) -> float:
        """Get distance between estimated and true position."""
        dx = self.true_x - self.est_x
        dy = self.true_y - self.est_y
        return math.sqrt(dx*dx + dy*dy)
    
    def correction_from_landmark(self, landmark_x: float, landmark_y: float):
        """
        Correct position estimate using a known landmark.
        
        Simulates occasional position fixing from landmarks.
        """
        # Correct estimated position toward landmark
        correction_factor = 0.5
        self.est_x += (landmark_x - self.est_x) * correction_factor
        self.est_y += (landmark_y - self.est_y) * correction_factor
        
        # Reset drift accumulation
        self.drift_x *= 0.3
        self.drift_y *= 0.3


if __name__ == "__main__":
    # Quick test
    print("Testing Communication Realism...")
    print("-" * 60)
    
    network = MeshNetwork(num_drones=4, base_delay_ms=50, loss_rate=0.05)
    
    # Position drones
    network.update_drone_position(0, 0, 0)
    network.update_drone_position(1, 50, 0)
    network.update_drone_position(2, 100, 0)
    network.update_drone_position(3, 200, 0)  # Out of range
    
    # Send messages
    network.send_message(0, 1, "detection", {"survivors": 2}, MessagePriority.HIGH)
    network.send_message(0, 3, "status", {"battery": 85}, MessagePriority.NORMAL)
    
    # Simulate network
    for _ in range(10):
        network.process_messages(10)
    
    # Check results
    msgs_0 = network.receive_messages(1)
    msgs_3 = network.receive_messages(3)
    
    print(f"Drone 1 received: {len(msgs_0)} messages")
    print(f"Drone 3 received: {len(msgs_3)} messages (out of range)")
    print(f"Network stats: {network.get_network_stats()}")
    
    print("\nGPS-Denied Localization Test...")
    print("-" * 60)
    loc = GPSDeniedLocalization()
    for i in range(20):
        loc.move(1.0, 0.5)
    
    true_pos = loc.get_true_position()
    est_pos = loc.get_position_estimate()
    error = loc.get_position_error()
    
    print(f"True position:      {true_pos}")
    print(f"Estimated position: {est_pos}")
    print(f"Position error:     {error:.2f} units")

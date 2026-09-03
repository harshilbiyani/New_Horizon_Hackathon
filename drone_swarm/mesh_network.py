# TODO: unused � not imported by ai_bridge.py. Wire in or remove before demo (Phase 4 decision).
# mesh_network.py

import math
from collections import defaultdict


class Message:
    """Single message in the mesh network."""
    
    def __init__(self, sender_id, receiver_id, message_type, payload, priority, hop_limit=5):
        """
        Create a message for drone-to-drone communication.
        
        Args:
            sender_id    : int    — originating drone
            receiver_id  : int    — target drone (or -1 for broadcast)
            message_type : str    — DETECTION, WARNING, DISCOVERY, STATUS, RELAY
            payload      : dict   — message content
            priority     : str    — NORMAL, URGENT, CRITICAL
            hop_limit    : int    — max hops before message dies (prevents loops)
        """
        self.sender_id = sender_id
        self.receiver_id = receiver_id
        self.message_type = message_type
        self.payload = payload
        self.priority = priority
        self.hop_limit = hop_limit
        self.hops_remaining = hop_limit
        self.route = [sender_id]  # trace message path
        self.message_id = f"MSG_{sender_id}_{message_type}_{id(self)}"
    
    def relay(self, relay_drone_id):
        """Record that this message was relayed by another drone."""
        self.hops_remaining -= 1
        self.route.append(relay_drone_id)
        return self.hops_remaining > 0
    
    def to_dict(self):
        return {
            "id": self.message_id,
            "sender": self.sender_id,
            "type": self.message_type,
            "priority": self.priority,
            "hops_remaining": self.hops_remaining,
            "route": self.route,
            "payload": self.payload
        }


class MeshNetwork:
    """
    Drone-to-drone mesh network for decentralized communication.
    
    Models:
    - Network topology (who can reach whom)
    - Message propagation with routing
    - Signal attenuation over distance
    - Relay flooding for critical messages
    """
    
    def __init__(self, communication_range=20.0):
        """
        Initialize mesh network.
        
        Args:
            communication_range : float — max distance for direct communication
        """
        self.communication_range = communication_range
        self.drone_positions = {}         # drone_id → (x, y)
        self.message_queue = []           # pending messages
        self.delivered_messages = []      # received messages
        self.broadcast_cache = set()      # processed broadcast IDs (prevent loops)
    
    def register_drone(self, drone_id, position):
        """Register a drone in the mesh network."""
        self.drone_positions[drone_id] = position
    
    def update_position(self, drone_id, position):
        """Update drone position (changes network topology)."""
        self.drone_positions[drone_id] = position
    
    def get_neighbors(self, drone_id):
        """
        Get all drones within communication range.
        
        Returns:
            List of neighbor drone IDs with signal strength
        """
        if drone_id not in self.drone_positions:
            return []
        
        my_pos = self.drone_positions[drone_id]
        neighbors = []
        
        for other_id, other_pos in self.drone_positions.items():
            if other_id == drone_id:
                continue
            
            dist = math.sqrt((my_pos[0] - other_pos[0])**2 + (my_pos[1] - other_pos[1])**2)
            
            if dist <= self.communication_range:
                # Signal strength: 1.0 (very close) to 0.1 (at edge)
                signal_strength = 1.0 - (dist / self.communication_range * 0.9)
                neighbors.append((other_id, round(signal_strength, 2), round(dist, 1)))
        
        return neighbors
    
    def send_message(self, sender_id, receiver_id, message_type, payload, priority="NORMAL"):
        """
        Send a message to a specific drone or broadcast.
        
        Args:
            sender_id    : int    — sending drone
            receiver_id  : int    — target (or -1 for broadcast)
            message_type : str    — type of message
            payload      : dict   — content
            priority     : str    — message priority
        
        Returns:
            Message object
        """
        message = Message(sender_id, receiver_id, message_type, payload, priority)
        self.message_queue.append(message)
        return message
    
    def process_messages(self):
        """
        Process message queue: deliver, relay, or drop messages.
        
        Simulates one round of network propagation.
        """
        remaining_messages = []
        
        for message in self.message_queue:
            delivered = False
            
            if message.receiver_id == -1:
                # BROADCAST: flood to all neighbors
                delivered = self._flood_broadcast(message)
            else:
                # UNICAST: try to deliver to specific drone
                delivered = self._deliver_unicast(message)
            
            # Keep if not delivered and has hops
            if not delivered and message.hops_remaining > 0:
                remaining_messages.append(message)
        
        self.message_queue = remaining_messages
    
    def _deliver_unicast(self, message):
        """Try to deliver a unicast message."""
        sender_id = message.sender_id
        receiver_id = message.receiver_id
        
        # Check if direct neighbor
        neighbors = self.get_neighbors(sender_id)
        neighbor_ids = [n[0] for n in neighbors]
        
        if receiver_id in neighbor_ids:
            # Direct delivery
            message.relay(receiver_id)
            self.delivered_messages.append(message)
            return True
        
        elif message.hops_remaining > 1:
            # Try to relay through a neighbor
            if neighbors:
                best_neighbor = max(neighbors, key=lambda n: n[1])[0]  # highest signal
                if message.relay(best_neighbor):
                    return False  # continue relaying
        
        return False
    
    def _flood_broadcast(self, message):
        """Broadcast message to all neighbors with relay."""
        sender_id = message.sender_id
        msg_id = message.message_id
        
        # Check if we've already processed this broadcast
        if msg_id in self.broadcast_cache:
            return True  # Already handled
        
        self.broadcast_cache.add(msg_id)
        neighbors = self.get_neighbors(sender_id)
        
        if not neighbors:
            return False
        
        # Deliver to all neighbors
        for neighbor_id, signal, dist in neighbors:
            delivered_copy = Message(
                sender_id=message.sender_id,
                receiver_id=neighbor_id,
                message_type=message.message_type,
                payload=message.payload,
                priority=message.priority,
                hop_limit=message.hops_remaining
            )
            delivered_copy.route = message.route + [neighbor_id]
            self.delivered_messages.append(delivered_copy)
        
        return True
    
    def get_message_stats(self):
        """Get network statistics."""
        return {
            "total_drones": len(self.drone_positions),
            "pending_messages": len(self.message_queue),
            "delivered_messages": len(self.delivered_messages),
            "broadcast_cache_size": len(self.broadcast_cache),
            "network_connections": sum(len(self.get_neighbors(d)) 
                                       for d in self.drone_positions)
        }
    
    def get_network_topology(self):
        """Get network graph representation."""
        topology = {}
        
        for drone_id in self.drone_positions:
            neighbors = self.get_neighbors(drone_id)
            topology[drone_id] = {
                "position": self.drone_positions[drone_id],
                "neighbors": [(n[0], n[1]) for n in neighbors]  # (id, signal)
            }
        
        return topology
    
    def get_received_messages(self, drone_id, message_type=None):
        """
        Get all messages received by a drone.
        
        Args:
            drone_id       : int — which drone
            message_type   : str — filter by type (None = all)
        
        Returns:
            List of messages
        """
        received = []
        
        for msg in self.delivered_messages:
            # Message delivered to this drone (in route)
            if drone_id in msg.route:
                if message_type is None or msg.message_type == message_type:
                    received.append(msg)
        
        return received


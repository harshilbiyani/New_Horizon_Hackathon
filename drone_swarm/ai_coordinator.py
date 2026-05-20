"""
AI-Based Swarm Coordination
Reinforcement learning-inspired zone selection and task allocation
"""

import random
import numpy as np
from typing import List, Dict, Tuple, Optional
from collections import defaultdict


class AICoordinator:
    """
    Reinforcement learning coordinator for smart zone selection.
    
    Uses epsilon-greedy exploration strategy and Q-learning-inspired updates
    to learn which zones are most productive for survivor detection.
    """
    
    def __init__(self, epsilon: float = 0.2, learning_rate: float = 0.1,
                discount_factor: float = 0.9):
        """
        Initialize AI coordinator.
        
        Args:
            epsilon: Exploration rate (0-1). Higher = more random exploration.
            learning_rate: How fast to learn from rewards (0-1)
            discount_factor: How much to weight future rewards (0-1)
        """
        self.epsilon = epsilon
        self.learning_rate = learning_rate
        self.discount_factor = discount_factor
        
        # Q-values for each zone (state-action value)
        self.zone_scores = defaultdict(lambda: 0.0)
        
        # Visit counts (for UCB style selection)
        self.visit_counts = defaultdict(int)
        
        # Reward history
        self.reward_history = []
        
        # Zone selection history
        self.selection_history = []
        
        # Per-drone last action (for multi-agent tracking)
        self.drone_last_zone = {}
    
    def choose_zone(self, zones: List[str], drone_id: int = 0) -> str:
        """
        Choose a zone using epsilon-greedy strategy.
        
        Args:
            zones: List of available zone IDs
            drone_id: ID of requesting drone
            
        Returns:
            Selected zone ID
        """
        if not zones:
            return None
        
        # Epsilon-greedy: explore random vs exploit best
        if random.random() < self.epsilon:
            # Explore: random zone
            chosen = random.choice(zones)
        else:
            # Exploit: choose highest Q-value zone
            # Add small bonus for less-visited zones (encourage exploration)
            zone_values = []
            for zone in zones:
                base_value = self.zone_scores[zone]
                visit_bonus = 0.1 / (self.visit_counts[zone] + 1)
                zone_values.append(base_value + visit_bonus)
            
            best_idx = np.argmax(zone_values)
            chosen = zones[best_idx]
        
        # Track selection
        self.visit_counts[chosen] += 1
        self.drone_last_zone[drone_id] = chosen
        self.selection_history.append({
            'drone_id': drone_id,
            'zone': chosen,
            'timestamp': len(self.selection_history)
        })
        
        return chosen
    
    def update_reward(self, zone: str, reward: float, drone_id: int = 0):
        """
        Update zone score based on received reward (Q-learning update).
        
        Args:
            zone: Zone that was explored
            reward: Reward received (0.0-1.0, where 1.0 is best)
            drone_id: ID of drone that explored
        """
        if zone not in self.zone_scores:
            self.zone_scores[zone] = 0.0
        
        # Temporal difference update (simplified Q-learning)
        # Q(s,a) = Q(s,a) + α * (reward - Q(s,a))
        current_q = self.zone_scores[zone]
        new_q = current_q + self.learning_rate * (reward - current_q)
        self.zone_scores[zone] = new_q
        
        # Track reward
        self.reward_history.append({
            'zone': zone,
            'reward': reward,
            'drone_id': drone_id,
            'timestamp': len(self.reward_history)
        })
    
    def update_rewards_batch(self, zone_rewards: Dict[str, float]):
        """
        Update multiple zones at once.
        
        Args:
            zone_rewards: Dictionary mapping zone to reward
        """
        for zone, reward in zone_rewards.items():
            self.update_reward(zone, reward)
    
    def get_top_zones(self, n: int = 5) -> List[Tuple[str, float]]:
        """
        Get top N zones by Q-value.
        
        Args:
            n: Number of zones to return
            
        Returns:
            List of (zone, score) tuples sorted by score
        """
        if not self.zone_scores:
            return []
        
        sorted_zones = sorted(self.zone_scores.items(),
                            key=lambda x: x[1], reverse=True)
        return sorted_zones[:n]
    
    def get_zone_statistics(self) -> Dict:
        """
        Get statistics about zone exploration.
        
        Returns:
            Dictionary with stats
        """
        if not self.zone_scores:
            return {'zones_explored': 0, 'avg_score': 0, 'best_zone': None}
        
        zones = list(self.zone_scores.keys())
        scores = list(self.zone_scores.values())
        
        return {
            'zones_explored': len(zones),
            'avg_score': np.mean(scores),
            'max_score': np.max(scores),
            'min_score': np.min(scores),
            'best_zone': max(zones, key=lambda z: self.zone_scores[z]),
            'worst_zone': min(zones, key=lambda z: self.zone_scores[z]),
            'total_selections': len(self.selection_history),
            'total_rewards': len(self.reward_history)
        }
    
    def get_exploration_efficiency(self) -> float:
        """
        Get ratio of average reward to total visits (efficiency metric).
        
        Returns:
            Efficiency score (0-1)
        """
        if not self.reward_history:
            return 0.0
        
        total_reward = sum(r['reward'] for r in self.reward_history)
        total_visits = len(self.selection_history)
        
        if total_visits == 0:
            return 0.0
        
        return total_reward / total_visits
    
    def decay_exploration(self, factor: float = 0.99):
        """
        Reduce exploration rate over time (exploitation vs exploration trade-off).
        
        Args:
            factor: Multiplicative decay factor
        """
        self.epsilon *= factor
        self.epsilon = max(self.epsilon, 0.01)  # Minimum exploration
    
    def export_model(self) -> Dict:
        """
        Export learned zone values for persistence/analysis.
        
        Returns:
            Dictionary with model state
        """
        return {
            'zone_scores': dict(self.zone_scores),
            'visit_counts': dict(self.visit_counts),
            'epsilon': self.epsilon,
            'learning_rate': self.learning_rate,
            'stats': self.get_zone_statistics()
        }
    
    def import_model(self, model_dict: Dict):
        """
        Import previously learned zone values.
        
        Args:
            model_dict: Dictionary from export_model
        """
        self.zone_scores = defaultdict(float, model_dict.get('zone_scores', {}))
        self.visit_counts = defaultdict(int, model_dict.get('visit_counts', {}))
        self.epsilon = model_dict.get('epsilon', self.epsilon)


class MultiAgentCoordinator:
    """
    Coordinates multiple drones with separate coordinators per drone
    plus shared zone knowledge.
    """
    
    def __init__(self, num_drones: int = 3, shared_learning: bool = True):
        """
        Initialize multi-agent coordinator.
        
        Args:
            num_drones: Number of drones to coordinate
            shared_learning: If True, all drones learn from all experiences
        """
        self.num_drones = num_drones
        self.shared_learning = shared_learning
        
        # Individual coordinators per drone
        self.drone_coordinators = {
            i: AICoordinator() for i in range(num_drones)
        }
        
        # Shared zone knowledge (if shared_learning=True)
        self.shared_zones = defaultdict(lambda: 0.0)
        self.shared_visits = defaultdict(int)
    
    def choose_zone_for_drone(self, drone_id: int, zones: List[str]) -> str:
        """
        Choose zone for specific drone.
        
        Args:
            drone_id: Drone ID (0 to num_drones-1)
            zones: Available zones
            
        Returns:
            Chosen zone
        """
        if drone_id not in self.drone_coordinators:
            return random.choice(zones) if zones else None
        
        coordinator = self.drone_coordinators[drone_id]
        return coordinator.choose_zone(zones, drone_id)
    
    def report_reward(self, drone_id: int, zone: str, reward: float):
        """
        Report reward for drone's zone exploration.
        
        Args:
            drone_id: Drone ID
            zone: Zone explored
            reward: Reward obtained
        """
        # Update individual coordinator
        if drone_id in self.drone_coordinators:
            self.drone_coordinators[drone_id].update_reward(zone, reward, drone_id)
        
        # Update shared knowledge
        if self.shared_learning:
            alpha = 0.05  # Less aggressive for shared updates
            current = self.shared_zones[zone]
            self.shared_zones[zone] = current + alpha * (reward - current)
            self.shared_visits[zone] += 1
    
    def get_swarm_statistics(self) -> Dict:
        """
        Get aggregate statistics across all drones.
        
        Returns:
            Dictionary with swarm-level stats
        """
        individual_stats = {
            i: coord.get_zone_statistics()
            for i, coord in self.drone_coordinators.items()
        }
        
        efficiency_scores = {
            i: coord.get_exploration_efficiency()
            for i, coord in self.drone_coordinators.items()
        }
        
        return {
            'individual_stats': individual_stats,
            'efficiency_scores': efficiency_scores,
            'avg_efficiency': np.mean(list(efficiency_scores.values())),
            'shared_zones': dict(self.shared_zones) if self.shared_learning else None
        }
    
    def decay_exploration_all(self, factor: float = 0.99):
        """Decay exploration for all drones."""
        for coordinator in self.drone_coordinators.values():
            coordinator.decay_exploration(factor)


if __name__ == "__main__":
    # Quick test
    print("Testing AI Coordinator...")
    
    coordinator = AICoordinator(epsilon=0.3)
    
    zones = ["A", "B", "C", "D", "E"]
    
    print("\nSimulating 30 zone selections...")
    print("-" * 60)
    
    for step in range(30):
        # Choose zone
        chosen = coordinator.choose_zone(zones)
        
        # Simulate reward (zone A is best, others okay)
        if chosen == "A":
            reward = 0.9
        elif chosen in ["B", "C"]:
            reward = 0.5
        else:
            reward = 0.2
        
        # Update
        coordinator.update_reward(chosen, reward)
        
        if (step + 1) % 10 == 0:
            print(f"After {step+1} steps:")
            top_zones = coordinator.get_top_zones(3)
            for zone, score in top_zones:
                print(f"  {zone}: {score:.3f}")
    
    # Final statistics
    print("\nFinal Statistics:")
    print("-" * 60)
    stats = coordinator.get_zone_statistics()
    print(f"Zones Explored: {stats['zones_explored']}")
    print(f"Avg Score: {stats['avg_score']:.3f}")
    print(f"Best Zone: {stats['best_zone']} ({coordinator.zone_scores[stats['best_zone']]:.3f})")
    print(f"Exploration Efficiency: {coordinator.get_exploration_efficiency():.3f}")
    
    print("\n✓ AI Coordinator test complete!")

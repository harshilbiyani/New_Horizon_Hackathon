# task_allocator.py

import random
from enum import Enum


class DroneRole(Enum):
    """ABC algorithm bee roles."""
    EMPLOYED = "employed"      # Currently exploring assigned zone
    ONLOOKER = "onlooker"      # Evaluating zones before committing
    SCOUT = "scout"            # Exploring random zones for discovery


class DroneTask:
    """Single task assigned to a drone."""
    
    def __init__(self, drone_id, task_id, zone_id, zone_center, fitness_score):
        self.drone_id = drone_id
        self.task_id = task_id
        self.zone_id = zone_id
        self.zone_center = zone_center
        self.fitness_score = fitness_score
        self.status = "PENDING"  # PENDING → IN_PROGRESS → COMPLETED
        self.detection_count = 0
        self.quality_score = 0.0  # updated when task completes
    
    def to_dict(self):
        return {
            "task_id": self.task_id,
            "drone_id": self.drone_id,
            "zone_id": self.zone_id,
            "target": self.zone_center,
            "fitness": self.fitness_score,
            "status": self.status,
            "detections": self.detection_count,
            "quality": self.quality_score
        }


class SwarmAllocator:
    """ABC-inspired task allocator for drone swarm."""
    
    def __init__(self, num_drones=5, scout_ratio=0.2, onlooker_ratio=0.3):
        """
        Initialize swarm allocator.
        
        Args:
            num_drones      : int   — total drones in swarm
            scout_ratio     : float — % of drones assigned as scouts
            onlooker_ratio  : float — % of drones assigned as onlookers
        """
        self.num_drones = num_drones
        self.scout_ratio = scout_ratio
        self.onlooker_ratio = onlooker_ratio
        
        # Calculate role distribution
        num_scouts = max(1, int(num_drones * scout_ratio))
        num_onlookers = max(1, int(num_drones * onlooker_ratio))
        num_employed = num_drones - num_scouts - num_onlookers
        
        self.num_employed = num_employed
        self.num_onlookers = num_onlookers
        self.num_scouts = num_scouts
        
        # Track assignments
        self.drone_tasks = {}          # drone_id → DroneTask
        self.drone_roles = {}          # drone_id → DroneRole
        self.completed_tasks = []
        self.task_counter = 0
    
    def initialize_roles(self):
        """Assign initial roles to all drones."""
        drone_ids = list(range(1, self.num_drones + 1))
        random.shuffle(drone_ids)
        
        idx = 0
        
        # Assign employed bees
        for _ in range(self.num_employed):
            self.drone_roles[drone_ids[idx]] = DroneRole.EMPLOYED
            idx += 1
        
        # Assign onlookers
        for _ in range(self.num_onlookers):
            self.drone_roles[drone_ids[idx]] = DroneRole.ONLOOKER
            idx += 1
        
        # Assign scouts
        for _ in range(self.num_scouts):
            self.drone_roles[drone_ids[idx]] = DroneRole.SCOUT
            idx += 1
    
    def allocate_zones(self, ranked_zones, drone_positions):
        """
        Allocate top-ranked zones to employed bees.
        
        Args:
            ranked_zones     : list — zones sorted by fitness (descending)
            drone_positions  : list — (drone_id, (x, y)) tuples
        
        Returns:
            Dict of drone_id → DroneTask
        """
        if not ranked_zones:
            return {}
        
        allocations = {}
        employed_count = 0
        
        # Assign top zones to employed bees (greedy allocation)
        for zone in ranked_zones:
            if employed_count >= self.num_employed:
                break
            
            # Find an employed bee
            for drone_id, role in self.drone_roles.items():
                if role == DroneRole.EMPLOYED and drone_id not in allocations:
                    self.task_counter += 1
                    task = DroneTask(
                        drone_id=drone_id,
                        task_id=f"TASK_{self.task_counter}",
                        zone_id=zone["zone_id"],
                        zone_center=zone["zone_center"],
                        fitness_score=zone["final_score"]
                    )
                    allocations[drone_id] = task
                    employed_count += 1
                    break
        
        return allocations
    
    def onlooker_dance(self, completed_task, ranked_zones):
        """
        "Dance" communication: employed bee propagates task quality to onlookers.
        Onlookers then decide whether to explore the same zone or try others.
        
        Returns: list of new tasks for onlookers
        """
        new_tasks = []
        
        # High-quality dances attract more onlookers (~60% follow)
        if completed_task.quality_score > 0.6:
            for onlooker_id in range(1, self.num_drones + 1):
                if (self.drone_roles.get(onlooker_id) == DroneRole.ONLOOKER and 
                    onlooker_id not in self.drone_tasks):
                    if random.random() < 0.6:  # 60% attraction probability
                        best_zone = ranked_zones[0] if ranked_zones else None
                        if best_zone:
                            self.task_counter += 1
                            task = DroneTask(
                                drone_id=onlooker_id,
                                task_id=f"TASK_{self.task_counter}",
                                zone_id=best_zone["zone_id"],
                                zone_center=best_zone["zone_center"],
                                fitness_score=best_zone["final_score"]
                            )
                            new_tasks.append(task)
        
        return new_tasks
    
    def scout_random_zones(self, all_zones):
        """
        Scouts explore random zones (not currently assigned).
        This maintains exploration diversity in the swarm.
        
        Returns: list of new scout tasks
        """
        new_tasks = []
        
        for scout_id in range(1, self.num_drones + 1):
            if (self.drone_roles.get(scout_id) == DroneRole.SCOUT and 
                scout_id not in self.drone_tasks):
                
                # Pick random zone
                zone = random.choice(all_zones) if all_zones else None
                if zone:
                    self.task_counter += 1
                    task = DroneTask(
                        drone_id=scout_id,
                        task_id=f"TASK_{self.task_counter}",
                        zone_id=zone["zone_id"],
                        zone_center=zone["zone_center"],
                        fitness_score=zone["final_score"]
                    )
                    new_tasks.append(task)
        
        return new_tasks
    
    def complete_task(self, drone_id, detection_count, confidence_avg):
        """
        Mark a drone's task as complete and update swarm knowledge.
        
        Args:
            drone_id        : int   — which drone finished
            detection_count : int   — how many survivors detected
            confidence_avg  : float — average confidence of detections (0.0-1.0)
        
        Returns: Updated task with quality score
        """
        if drone_id not in self.drone_tasks:
            return None
        
        task = self.drone_tasks.pop(drone_id)
        task.status = "COMPLETED"
        task.detection_count = detection_count
        
        # Quality = combination of detections and confidence
        task.quality_score = (0.6 * min(1.0, detection_count / 3.0) +  # expect ~3 survivors per zone
                             0.4 * confidence_avg)  # how confident were we
        
        self.completed_tasks.append(task)
        return task
    
    def get_swarm_status(self):
        """Get current status of all drone assignments."""
        return {
            "employed_bees": self.num_employed,
            "onlooker_bees": self.num_onlookers,
            "scout_bees": self.num_scouts,
            "current_tasks": {drone_id: task.to_dict() 
                            for drone_id, task in self.drone_tasks.items()},
            "completed_tasks": len(self.completed_tasks),
            "avg_quality": (sum(t.quality_score for t in self.completed_tasks) / 
                          len(self.completed_tasks) if self.completed_tasks else 0),
            "total_detections": sum(t.detection_count for t in self.completed_tasks)
        }

# failure_recovery.py

from enum import Enum
from datetime import datetime, timedelta


class DroneStatus(Enum):
    """Health status of a drone."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"      # Performance declining
    FAILED = "failed"           # Not responding
    RECOVERED = "recovered"     # Came back online


class FailureEvent:
    """Records a failure and recovery."""
    
    def __init__(self, drone_id, failure_type, timestamp=None):
        self.drone_id = drone_id
        self.failure_type = failure_type  # "COMMUNICATION", "BATTERY", "SENSOR", "OTHER"
        self.timestamp = timestamp or datetime.now().isoformat()
        self.active_task_at_failure = None
        self.recovery_time = None
        self.status = "ACTIVE"  # ACTIVE → RESOLVED
    
    def to_dict(self):
        return {
            "drone_id": self.drone_id,
            "type": self.failure_type,
            "timestamp": self.timestamp,
            "status": self.status,
            "recovery_time": self.recovery_time
        }


class FailureRecoveryManager:
    """Detects drone failures and dynamically reallocates tasks."""
    
    def __init__(self, health_check_interval=5.0, failure_threshold=3):
        """
        Initialize failure recovery.
        
        Args:
            health_check_interval : float — seconds between health checks
            failure_threshold     : int   — missed checks before drone declared failed
        """
        self.health_check_interval = health_check_interval
        self.failure_threshold = failure_threshold
        
        # Track drone state
        self.drone_health = {}         # drone_id → DroneStatus
        self.missed_heartbeats = {}    # drone_id → count
        self.failure_log = []          # list of FailureEvent
        self.backup_tasks = []         # orphaned tasks needing reassignment
    
    def register_drone(self, drone_id):
        """Add a drone to health monitoring."""
        self.drone_health[drone_id] = DroneStatus.HEALTHY
        self.missed_heartbeats[drone_id] = 0
    
    def record_heartbeat(self, drone_id, task_stats=None):
        """
        Drone sent a heartbeat (alive signal).
        
        Args:
            drone_id    : int   — which drone
            task_stats  : dict  — optional task progress data
        """
        if drone_id not in self.drone_health:
            self.register_drone(drone_id)
        
        self.missed_heartbeats[drone_id] = 0
        self.drone_health[drone_id] = DroneStatus.HEALTHY
    
    def check_health(self, active_tasks):
        """
        Check for failures (called periodically).
        
        Args:
            active_tasks : dict — drone_id → DroneTask mapping
        
        Returns:
            List of failed drones
        """
        failed_drones = []
        
        for drone_id in list(self.drone_health.keys()):
            # Increment missed heartbeat count
            self.missed_heartbeats[drone_id] += 1
            
            # Check if threshold exceeded
            if self.missed_heartbeats[drone_id] >= self.failure_threshold:
                if self.drone_health[drone_id] != DroneStatus.FAILED:
                    
                    # Drone failed!
                    self.drone_health[drone_id] = DroneStatus.FAILED
                    failed_drones.append(drone_id)
                    
                    # Log failure
                    failure_event = FailureEvent(drone_id, "COMMUNICATION_LOSS")
                    if drone_id in active_tasks:
                        failure_event.active_task_at_failure = active_tasks[drone_id].task_id
                        # Rescue the task
                        self.backup_tasks.append(active_tasks[drone_id])
                    
                    self.failure_log.append(failure_event)
        
        return failed_drones
    
    def reallocate_tasks(self, allocator, ranked_zones):
        """
        Reallocate orphaned tasks to healthy drones.
        
        Uses a priority queue: task quality matters.
        
        Args:
            allocator    : SwarmAllocator — the task allocator
            ranked_zones : list           — zones sorted by fitness
        
        Returns:
            Dict of new allocations
        """
        if not self.backup_tasks:
            return {}
        
        reallocations = {}
        
        # Sort backup tasks by fitness (highest priority first)
        self.backup_tasks.sort(key=lambda t: t.fitness_score, reverse=True)
        
        # Try to reassign each task
        for orphaned_task in self.backup_tasks:
            # Find a healthy, available drone
            for drone_id, role in allocator.drone_roles.items():
                if (drone_id not in allocator.drone_tasks and 
                    self.drone_health.get(drone_id) == DroneStatus.HEALTHY):
                    
                    # Create new task (same zone, new drone)
                    allocator.task_counter += 1
                    from task_allocator import DroneTask
                    new_task = DroneTask(
                        drone_id=drone_id,
                        task_id=f"TASK_{allocator.task_counter}_REASSIGNED",
                        zone_id=orphaned_task.zone_id,
                        zone_center=orphaned_task.zone_center,
                        fitness_score=orphaned_task.fitness_score
                    )
                    new_task.status = "IN_PROGRESS"
                    allocator.drone_tasks[drone_id] = new_task
                    reallocations[drone_id] = new_task
                    break
        
        # Clear backup (handled tasks)
        self.backup_tasks = [t for t in self.backup_tasks if t.task_id not in 
                            [r.task_id for r in reallocations.values()]]
        
        return reallocations
    
    def notify_recovery(self, drone_id):
        """
        Drone came back online. Restore to health.
        
        Args:
            drone_id : int — which drone recovered
        """
        if drone_id in self.drone_health:
            self.drone_health[drone_id] = DroneStatus.RECOVERED
            self.missed_heartbeats[drone_id] = 0
            
            # Log recovery
            for event in self.failure_log:
                if event.drone_id == drone_id and event.status == "ACTIVE":
                    event.status = "RESOLVED"
                    event.recovery_time = datetime.now().isoformat()
                    break
    
    def get_swarm_health(self):
        """Get overall swarm health summary."""
        if not self.drone_health:
            return {"total_drones": 0, "healthy": 0, "failed": 0, "health_pct": 0.0}
        
        total = len(self.drone_health)
        healthy = sum(1 for status in self.drone_health.values() 
                     if status == DroneStatus.HEALTHY)
        failed = sum(1 for status in self.drone_health.values() 
                    if status == DroneStatus.FAILED)
        
        return {
            "total_drones": total,
            "healthy": healthy,
            "failed": failed,
            "recovered": sum(1 for status in self.drone_health.values() 
                           if status == DroneStatus.RECOVERED),
            "health_pct": round(100 * healthy / total, 1),
            "active_failures": len(self.backup_tasks),
            "total_failure_events": len(self.failure_log)
        }
    
    def get_failure_report(self):
        """Get detailed failure log."""
        return {
            "events": [event.to_dict() for event in self.failure_log],
            "unresolved_tasks": len(self.backup_tasks),
            "critical_status": "CRITICAL" if len(self.backup_tasks) > 2 else "OK"
        }

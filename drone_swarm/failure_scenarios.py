"""
Failure Scenarios Simulation
Demonstrates system resilience under realistic failure conditions:
- Drone crashes / loss of communication
- Sensor failures (degraded detection)
- Network breakdowns
- Battery failures
- GPS drift accumulation
"""

from enum import Enum
from typing import Dict, List, Optional
from dataclasses import dataclass
import random


class FailureType(Enum):
    """Types of failures that can occur."""
    DRONE_CRASH = "drone_crash"
    COMMUNICATION_LOSS = "comm_loss"
    SENSOR_DEGRADATION = "sensor_degradation"
    BATTERY_FAILURE = "battery_failure"
    GPS_DRIFT = "gps_drift"
    PARTIAL_OUTAGE = "partial_outage"


@dataclass
class FailureEvent:
    """Represents a failure event during mission."""
    failure_type: FailureType
    drone_id: int
    start_time: float
    duration: Optional[float]  # None = permanent
    severity: float  # 0-1 scale
    description: str


class FailureSimulator:
    """
    Simulates failure scenarios and tracks system responses.
    
    Scenarios:
    1. Drone crash mid-mission - loss of unit and comms
    2. Sensor degradation - reduced detection accuracy
    3. Network partitioning - mesh split into groups
    4. Cascading failures - one failure triggers others
    5. Recovery - system adapts after failure
    """
    
    def __init__(self, num_drones: int):
        """Initialize failure simulator."""
        self.num_drones = num_drones
        self.current_time = 0.0
        
        # Failure events
        self.active_failures: Dict[int, List[FailureEvent]] = {
            i: [] for i in range(num_drones)
        }
        self.failure_history: List[FailureEvent] = []
        
        # Drone health states
        self.drone_operational = {i: True for i in range(num_drones)}
        self.drone_sensor_quality = {i: 1.0 for i in range(num_drones)}  # 0-1
        self.drone_comm_available = {i: True for i in range(num_drones)}
        
        # System metrics during failures
        self.performance_during_failure = []
    
    def inject_failure(self, failure_type: FailureType, drone_id: int,
                      start_time: float, duration: Optional[float] = None,
                      severity: float = 1.0):
        """
        Inject a failure event.
        
        Args:
            failure_type: Type of failure
            drone_id: Target drone
            start_time: When failure occurs
            duration: How long failure lasts (None = permanent)
            severity: Failure severity (0-1)
        """
        descriptions = {
            FailureType.DRONE_CRASH: f"Drone {drone_id} crashed (total loss)",
            FailureType.COMMUNICATION_LOSS: f"Drone {drone_id} lost comms link",
            FailureType.SENSOR_DEGRADATION: f"Drone {drone_id} sensor degraded to {int((1-severity)*100)}%",
            FailureType.BATTERY_FAILURE: f"Drone {drone_id} battery drain rate increased",
            FailureType.GPS_DRIFT: f"Drone {drone_id} position drift accumulating",
            FailureType.PARTIAL_OUTAGE: f"Drone {drone_id} partial system failure",
        }
        
        event = FailureEvent(
            failure_type=failure_type,
            drone_id=drone_id,
            start_time=start_time,
            duration=duration,
            severity=severity,
            description=descriptions[failure_type]
        )
        
        self.active_failures[drone_id].append(event)
        self.failure_history.append(event)
    
    def update(self, current_time: float):
        """Update failure states at current simulation time."""
        self.current_time = current_time
        
        for drone_id in range(self.num_drones):
            # Reset states
            self.drone_operational[drone_id] = True
            self.drone_sensor_quality[drone_id] = 1.0
            self.drone_comm_available[drone_id] = True
            
            # Apply active failures
            for failure in self.active_failures[drone_id]:
                # Check if failure is active at current time
                if current_time < failure.start_time:
                    continue  # Not started yet
                
                if failure.duration is not None:
                    if current_time > failure.start_time + failure.duration:
                        continue  # Failure ended
                
                # Apply failure effects
                if failure.failure_type == FailureType.DRONE_CRASH:
                    self.drone_operational[drone_id] = False
                    self.drone_comm_available[drone_id] = False
                    self.drone_sensor_quality[drone_id] = 0.0
                
                elif failure.failure_type == FailureType.COMMUNICATION_LOSS:
                    self.drone_comm_available[drone_id] = False
                
                elif failure.failure_type == FailureType.SENSOR_DEGRADATION:
                    self.drone_sensor_quality[drone_id] *= (1.0 - failure.severity)
                
                elif failure.failure_type == FailureType.PARTIAL_OUTAGE:
                    self.drone_sensor_quality[drone_id] *= (1.0 - failure.severity * 0.5)
                    if random.random() < failure.severity * 0.3:
                        self.drone_comm_available[drone_id] = False
    
    def get_drone_status(self, drone_id: int) -> Dict:
        """Get status of a drone."""
        return {
            'operational': self.drone_operational[drone_id],
            'comm_available': self.drone_comm_available[drone_id],
            'sensor_quality': self.drone_sensor_quality[drone_id],
            'failures': len(self.active_failures[drone_id])
        }
    
    def count_operational_drones(self) -> int:
        """Count how many drones are still operational."""
        return sum(1 for i in range(self.num_drones) 
                  if self.drone_operational[i])
    
    def get_swarm_resilience_score(self) -> float:
        """
        Calculate swarm resilience score (0-100).
        
        Based on:
        - Percentage of operational drones
        - Average sensor quality
        - Communication availability
        """
        operational_percent = (self.count_operational_drones() / 
                              self.num_drones) * 100
        
        avg_sensor = (sum(self.drone_sensor_quality.values()) / 
                     self.num_drones)
        
        comm_available = sum(1 for d in range(self.num_drones) 
                           if self.drone_comm_available[d])
        comm_percent = (comm_available / self.num_drones) * 100
        
        # Weighted average
        resilience = (
            operational_percent * 0.5 +
            avg_sensor * 100 * 0.3 +
            comm_percent * 0.2
        )
        
        return resilience
    
    def get_failure_impact_summary(self) -> Dict:
        """Get summary of failures and their impacts."""
        by_type = {}
        for failure in self.failure_history:
            ftype = failure.failure_type.value
            if ftype not in by_type:
                by_type[ftype] = []
            by_type[ftype].append(failure)
        
        return {
            'total_failures': len(self.failure_history),
            'by_type': by_type,
            'current_operational_drones': self.count_operational_drones(),
            'resilience_score': self.get_swarm_resilience_score()
        }


class SystemAdaptation:
    """Tracks how system adapts to failures."""
    
    def __init__(self, failure_simulator: FailureSimulator):
        """Initialize adaptation tracker."""
        self.failures = failure_simulator
        self.adaptations: List[str] = []
        self.load_reallocation_events: List[Dict] = []
        self.routing_changes: List[Dict] = []
    
    def detect_failure_and_adapt(self, time: float) -> List[str]:
        """
        Detect failures and trigger adaptations.
        
        Returns:
            List of adaptation actions taken
        """
        actions = []
        
        # Get current status
        operational = self.failures.count_operational_drones()
        total = self.failures.num_drones
        
        # Adaptation rules
        if operational == 0:
            actions.append("ABORT MISSION - All drones lost!")
        
        elif operational < total * 0.5:
            actions.append("ALERT: Swarm below 50% capacity - consolidating zones")
            self.load_reallocation_events.append({
                'time': time,
                'event': 'critical_consolidation',
                'drones_remaining': operational
            })
        
        elif operational < total * 0.75:
            actions.append("Redistributing zones among functional drones")
            self.load_reallocation_events.append({
                'time': time,
                'event': 'zone_redistribution',
                'drones_remaining': operational
            })
        
        # Routing adaptation for failed communication
        comms_available = sum(1 for i in range(total) 
                            if self.failures.drone_comm_available[i])
        if comms_available < total:
            actions.append(f"Enabling mesh relay routing (direct comms: {comms_available}/{total})")
            self.routing_changes.append({
                'time': time,
                'comms_available': comms_available,
                'relaying_enabled': True
            })
        
        # Sensor degradation handling
        for i in range(total):
            quality = self.failures.drone_sensor_quality[i]
            if quality < 0.5 and quality > 0:
                actions.append(f"Drone {i}: Increasing detection threshold due to sensor degradation")
        
        self.adaptations.extend(actions)
        return actions
    
    def get_adaptation_report(self) -> Dict:
        """Get report of all adaptations."""
        return {
            'total_adaptations': len(self.adaptations),
            'adaptations': self.adaptations,
            'reallocations': self.load_reallocation_events,
            'routing_changes': self.routing_changes
        }


# Predefined failure scenarios for demos

def scenario_single_drone_crash(time: float, drone_id: int) -> FailureEvent:
    """Drone loses power and crashes."""
    return FailureEvent(
        failure_type=FailureType.DRONE_CRASH,
        drone_id=drone_id,
        start_time=time,
        duration=None,
        severity=1.0,
        description=f"Drone {drone_id} power loss - CRASHED"
    )


def scenario_sensor_degradation(time: float, drone_id: int, 
                               recovery_time: float = 30.0) -> FailureEvent:
    """Sensor gradually degrading (e.g., lens fog)."""
    return FailureEvent(
        failure_type=FailureType.SENSOR_DEGRADATION,
        drone_id=drone_id,
        start_time=time,
        duration=recovery_time,
        severity=0.6,
        description=f"Drone {drone_id} sensor optics degraded"
    )


def scenario_communication_blackout(time: float, drone_id: int,
                                   duration: float = 15.0) -> FailureEvent:
    """Temporary loss of communication (interference, obstruction)."""
    return FailureEvent(
        failure_type=FailureType.COMMUNICATION_LOSS,
        drone_id=drone_id,
        start_time=time,
        duration=duration,
        severity=1.0,
        description=f"Drone {drone_id} comms blackout (interference?)"
    )


def scenario_cascading_failure(time: float, trigger_drone: int,
                               affected_drones: List[int]) -> List[FailureEvent]:
    """
    Cascade: One drone crash causes communication loss for others.
    
    (e.g., drones lose relay through the crashed drone)
    """
    failures = []
    
    # Primary crash
    failures.append(FailureEvent(
        failure_type=FailureType.DRONE_CRASH,
        drone_id=trigger_drone,
        start_time=time,
        duration=None,
        severity=1.0,
        description=f"Drone {trigger_drone} crashed (PRIMARY)"
    ))
    
    # Secondary communication loss
    for drone_id in affected_drones:
        failures.append(FailureEvent(
            failure_type=FailureType.COMMUNICATION_LOSS,
            drone_id=drone_id,
            start_time=time + 1,  # Cascades immediately after
            duration=15.0,  # Temporary until new route established
            severity=1.0,
            description=f"Drone {drone_id} lost relay through crashed drone"
        ))
    
    return failures


if __name__ == "__main__":
    print("Testing Failure Scenarios...")
    print("=" * 70)
    
    # Create simulator
    sim = FailureSimulator(num_drones=4)
    adapter = SystemAdaptation(sim)
    
    # Inject failures
    print("\n[SCENARIO] Cascading Failure")
    print("-" * 70)
    
    # Timeframe: 0-100 seconds
    print("T=10s: Drone 1 crashes")
    sim.inject_failure(FailureType.DRONE_CRASH, 1, start_time=10.0)
    
    print("T=20s: Drone 0 sensor degradation detected")
    sim.inject_failure(FailureType.SENSOR_DEGRADATION, 0, 
                      start_time=20.0, duration=30.0, severity=0.7)
    
    print("T=30s: Drone 2 communication loss")
    sim.inject_failure(FailureType.COMMUNICATION_LOSS, 2,
                      start_time=30.0, duration=20.0)
    
    # Simulate timeline
    times = [10, 20, 30, 50, 60, 80, 100]
    for t in times:
        sim.update(t)
        adapter.detect_failure_and_adapt(t)
        
        resilience = sim.get_swarm_resilience_score()
        operational = sim.count_operational_drones()
        
        print(f"\nT={t}s:")
        print(f"  Operational drones: {operational}/4")
        print(f"  Resilience score: {resilience:.1f}%")
        print(f"  Actions taken: {adapter.adaptations[-1] if adapter.adaptations else 'None'}")
    
    # Final report
    print("\n" + "=" * 70)
    print("FAILURE IMPACT SUMMARY")
    print("=" * 70)
    summary = sim.get_failure_impact_summary()
    print(f"Total failures: {summary['total_failures']}")
    print(f"Final operational drones: {summary['current_operational_drones']}")
    print(f"Final resilience: {summary['resilience_score']:.1f}%")
    
    print("\nADAPTATION REPORT")
    print("-" * 70)
    adapt_report = adapter.get_adaptation_report()
    for action in adapt_report['adaptations']:
        print(f"  ✓ {action}")

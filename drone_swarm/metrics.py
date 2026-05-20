"""
Performance Metrics Engine for Drone Swarm
Comprehensive evaluation system tracking detection accuracy, coverage, efficiency, and more
"""

import numpy as np
from typing import Dict, List, Tuple, Set, Optional
from dataclasses import dataclass, field
from collections import defaultdict
import statistics


@dataclass
class DetectionMetrics:
    """Metrics related to survivor detection."""
    total_survivors: int = 0
    detected_survivors: Set[Tuple[int, int]] = field(default_factory=set)
    false_positives: int = 0
    true_positives: int = 0
    total_detections: int = 0
    detection_times: Dict[Tuple[int, int], int] = field(default_factory=dict)
    detection_confidences: Dict[Tuple[int, int], float] = field(default_factory=dict)


@dataclass
class CoverageMetrics:
    """Metrics related to area coverage."""
    total_cells: int = 0
    explored_cells: int = 0
    explored_by_drone: Dict[int, int] = field(default_factory=lambda: defaultdict(int))


@dataclass
class PathMetrics:
    """Metrics related to path planning efficiency."""
    path_lengths: List[int] = field(default_factory=list)
    optimal_lengths: List[int] = field(default_factory=list)
    drone_distances: Dict[int, int] = field(default_factory=lambda: defaultdict(int))


@dataclass
class DroneMetrics:
    """Metrics for individual drone performance."""
    drone_id: int = 0
    total_steps: int = 0
    battery_consumed: float = 0.0
    detections: int = 0
    false_detections: int = 0
    area_explored: int = 0


class Metrics:
    """
    Comprehensive performance metrics engine for drone swarm system.
    
    Tracks:
    - Detection accuracy (true positives, false positives, confidence)
    - Area coverage (percentage of grid explored)
    - Path efficiency (actual vs optimal path length)
    - Time to detection (steps until each survivor found)
    - Drone efficiency (battery, movement, detection per drone)
    - Swarm coordination metrics
    """
    
    def __init__(self):
        """Initialize metrics tracker."""
        self.current_step = 0
        self.simulation_complete = False
        
        # Detection metrics
        self.detection = DetectionMetrics()
        
        # Coverage metrics
        self.coverage = CoverageMetrics()
        
        # Path metrics
        self.paths = PathMetrics()
        
        # Drone-specific metrics
        self.drone_metrics: Dict[int, DroneMetrics] = {}
        
        # Time-series data
        self.coverage_history: List[float] = []
        self.detection_count_history: List[int] = []
        self.false_positive_history: List[int] = []
        
        # Events log
        self.events: List[Dict] = []
    
    def load_environment(self, env) -> None:
        """
        Load environment information and initialize metrics.
        
        Args:
            env: Environment object with grid and survivor data
        """
        self.coverage.total_cells = env.size * env.size
        
        # Count survivors
        for i in range(env.size):
            for j in range(env.size):
                if env.grid[i][j] == 'S':
                    self.detection.total_survivors += 1
        
        self._log_event("INIT", f"Environment loaded: {env.size}x{env.size}, "
                       f"{self.detection.total_survivors} survivors")
    
    def register_drone(self, drone_id: int) -> None:
        """
        Register a drone for tracking.
        
        Args:
            drone_id: Unique drone identifier
        """
        self.drone_metrics[drone_id] = DroneMetrics(drone_id=drone_id)
        self._log_event("DRONE_REGISTER", f"Drone {drone_id} registered")
    
    def update_exploration(self, env) -> None:
        """
        Update coverage metrics from environment.
        
        Args:
            env: Environment object with explored cells marked
        """
        explored = np.sum(env.explored)
        self.coverage.explored_cells = int(explored)
        
        # Record history
        coverage_pct = (self.coverage.explored_cells / self.coverage.total_cells * 100) if self.coverage.total_cells > 0 else 0
        self.coverage_history.append(coverage_pct)
    
    def log_drone_movement(self, drone_id: int, distance: float = 1.0) -> None:
        """
        Log drone movement/step.
        
        Args:
            drone_id: Drone identifier
            distance: Distance traveled this step
        """
        if drone_id not in self.drone_metrics:
            self.register_drone(drone_id)
        
        self.drone_metrics[drone_id].total_steps += 1
        self.drone_metrics[drone_id].battery_consumed += distance
        self.paths.drone_distances[drone_id] += int(distance)
    
    def log_detection(self, drone_id: int, position: Tuple[int, int], 
                     is_true: bool, confidence: float = 1.0) -> None:
        """
        Log a detection event.
        
        Args:
            drone_id: Drone that made detection
            position: Detection position (x, y)
            is_true: True if genuine survivor, False if false positive/noise
            confidence: Confidence score (0.0-1.0)
        """
        if drone_id not in self.drone_metrics:
            self.register_drone(drone_id)
        
        self.detection.total_detections += 1
        
        if is_true:
            self.detection.true_positives += 1
            self.drone_metrics[drone_id].detections += 1
            
            # Record first detection time for this survivor
            if position not in self.detection.detection_times:
                self.detection.detection_times[position] = self.current_step
                self.detection.detected_survivors.add(position)
            
            # Store confidence for this detection
            self.detection.detection_confidences[position] = max(
                self.detection.detection_confidences.get(position, 0),
                confidence
            )
            
            self._log_event("DETECTION", f"Drone {drone_id} detected survivor at {position} "
                          f"(confidence: {confidence:.2f})")
        else:
            self.detection.false_positives += 1
            self.drone_metrics[drone_id].false_detections += 1
            
            self._log_event("FALSE_POSITIVE", f"Drone {drone_id} false positive at {position}")
        
        self.detection_count_history.append(len(self.detection.detected_survivors))
        self.false_positive_history.append(self.detection.false_positives)
    
    def log_exploration(self, drone_id: int, cells_explored: int) -> None:
        """
        Log exploration progress.
        
        Args:
            drone_id: Drone identifier
            cells_explored: Number of cells explored this step
        """
        if drone_id not in self.drone_metrics:
            self.register_drone(drone_id)
        
        self.drone_metrics[drone_id].area_explored += cells_explored
        self.coverage.explored_by_drone[drone_id] += cells_explored
    
    def log_path(self, actual_length: int, optimal_length: int, drone_id: int = 0) -> None:
        """
        Log path efficiency.
        
        Args:
            actual_length: Actual path length used
            optimal_length: Optimal path length (from A*)
            drone_id: Drone identifier (optional)
        """
        if actual_length > 0:
            self.paths.path_lengths.append(actual_length)
            self.paths.optimal_lengths.append(optimal_length)
            
            efficiency = (optimal_length / actual_length) * 100 if actual_length > 0 else 0
            self._log_event("PATH", f"Drone {drone_id}: actual={actual_length}, "
                          f"optimal={optimal_length}, efficiency={efficiency:.1f}%")
    
    def next_step(self) -> None:
        """Advance simulation step counter."""
        self.current_step += 1
    
    def finalize(self) -> None:
        """Mark simulation as complete."""
        self.simulation_complete = True
        self._log_event("FINALIZE", "Simulation complete, metrics finalized")
    
    def _log_event(self, event_type: str, message: str) -> None:
        """Internal event logging."""
        self.events.append({
            'step': self.current_step,
            'type': event_type,
            'message': message
        })
    
    def compute_detection_accuracy(self) -> float:
        """
        Compute detection accuracy.
        
        Returns:
            Percentage of detections that were true (0-100)
        """
        if self.detection.total_detections == 0:
            return 0.0
        
        return (self.detection.true_positives / self.detection.total_detections) * 100
    
    def compute_coverage(self) -> float:
        """
        Compute area coverage percentage.
        
        Returns:
            Percentage of grid explored (0-100)
        """
        if self.coverage.total_cells == 0:
            return 0.0
        
        return (self.coverage.explored_cells / self.coverage.total_cells) * 100
    
    def compute_path_efficiency(self) -> float:
        """
        Compute path planning efficiency.
        
        Returns:
            Ratio of optimal to actual path length (0-100)
        """
        if not self.paths.path_lengths:
            return 0.0
        
        efficiency_ratios = []
        for actual, optimal in zip(self.paths.path_lengths, self.paths.optimal_lengths):
            if actual > 0:
                efficiency_ratios.append(min((optimal / actual) * 100, 100))
        
        if not efficiency_ratios:
            return 0.0
        
        return sum(efficiency_ratios) / len(efficiency_ratios)
    
    def compute_detection_rate(self) -> float:
        """
        Compute survivor detection rate.
        
        Returns:
            Percentage of total survivors found (0-100)
        """
        if self.detection.total_survivors == 0:
            return 0.0
        
        return (len(self.detection.detected_survivors) / self.detection.total_survivors) * 100
    
    def compute_avg_detection_time(self) -> float:
        """
        Compute average time to first detection.
        
        Returns:
            Average steps to detect a survivor
        """
        if not self.detection.detection_times:
            return 0.0
        
        return statistics.mean(self.detection.detection_times.values())
    
    def compute_false_positive_rate(self) -> float:
        """
        Compute false positive rate.
        
        Returns:
            Percentage of false positives out of all detections
        """
        if self.detection.total_detections == 0:
            return 0.0
        
        return (self.detection.false_positives / self.detection.total_detections) * 100
    
    def compute_swarm_efficiency(self) -> float:
        """
        Compute overall swarm efficiency.
        
        Returns:
            Combined efficiency metric (0-100)
            = (detection_accuracy * 0.3 + coverage * 0.3 + path_efficiency * 0.4)
        """
        accuracy = self.compute_detection_accuracy()
        coverage = self.compute_coverage()
        path_eff = self.compute_path_efficiency()
        
        # Weighted combination
        return (accuracy * 0.3 + coverage * 0.3 + path_eff * 0.4)
    
    def get_drone_efficiency(self, drone_id: int) -> Dict[str, float]:
        """
        Compute efficiency metrics for a specific drone.
        
        Args:
            drone_id: Drone identifier
            
        Returns:
            Dictionary of drone-specific metrics
        """
        if drone_id not in self.drone_metrics:
            return {}
        
        dm = self.drone_metrics[drone_id]
        
        detection_ratio = (dm.detections / max(dm.total_steps, 1)) if dm.total_steps > 0 else 0
        exploration_ratio = (dm.area_explored / max(dm.total_steps, 1)) if dm.total_steps > 0 else 0
        
        return {
            'total_steps': dm.total_steps,
            'battery_consumed': round(dm.battery_consumed, 2),
            'detections': dm.detections,
            'false_detections': dm.false_detections,
            'area_explored': dm.area_explored,
            'detections_per_step': round(detection_ratio, 3),
            'exploration_per_step': round(exploration_ratio, 3)
        }
    
    def compute(self) -> Dict[str, any]:
        """
        Compute all performance metrics.
        
        Returns:
            Dictionary with comprehensive metrics
        """
        return {
            # Detection Metrics
            'Detection Accuracy (%)': round(self.compute_detection_accuracy(), 2),
            'Detection Rate (%)': round(self.compute_detection_rate(), 2),
            'Survivors Detected': len(self.detection.detected_survivors),
            'Total Survivors': self.detection.total_survivors,
            'False Positives': self.detection.false_positives,
            'False Positive Rate (%)': round(self.compute_false_positive_rate(), 2),
            'Avg Detection Confidence': round(
                statistics.mean(self.detection.detection_confidences.values()) 
                if self.detection.detection_confidences else 0, 2
            ),
            
            # Coverage Metrics
            'Coverage (%)': round(self.compute_coverage(), 2),
            'Cells Explored': self.coverage.explored_cells,
            'Total Cells': self.coverage.total_cells,
            
            # Path Metrics
            'Path Efficiency (%)': round(self.compute_path_efficiency(), 2),
            'Total Paths Planned': len(self.paths.path_lengths),
            'Avg Actual Path Length': round(
                statistics.mean(self.paths.path_lengths) if self.paths.path_lengths else 0, 2
            ),
            'Avg Optimal Path Length': round(
                statistics.mean(self.paths.optimal_lengths) if self.paths.optimal_lengths else 0, 2
            ),
            
            # Time Metrics
            'Avg Detection Time (steps)': round(self.compute_avg_detection_time(), 2),
            'Total Steps': self.current_step,
            'Fastest Detection (steps)': min(self.detection.detection_times.values()) 
                                         if self.detection.detection_times else 0,
            'Slowest Detection (steps)': max(self.detection.detection_times.values()) 
                                        if self.detection.detection_times else 0,
            
            # Overall Swarm Metrics
            'Swarm Efficiency (%)': round(self.compute_swarm_efficiency(), 2),
            'Total Detections': self.detection.total_detections,
            'Num Drones': len(self.drone_metrics),
        }
    
    def get_detailed_report(self) -> str:
        """
        Generate detailed performance report.
        
        Returns:
            Formatted report string
        """
        metrics = self.compute()
        
        report = "\n" + "=" * 70
        report += "\n📊 DRONE SWARM PERFORMANCE METRICS REPORT"
        report += "\n" + "=" * 70
        
        # Detection Section
        report += "\n\n🎯 DETECTION PERFORMANCE"
        report += "\n" + "-" * 70
        report += f"\n  Detection Accuracy:        {metrics['Detection Accuracy (%)']:.2f}%"
        report += f"\n  Detection Rate:            {metrics['Detection Rate (%)']:.2f}%"
        report += f"\n  Survivors Found:           {metrics['Survivors Detected']}/{metrics['Total Survivors']}"
        report += f"\n  False Positive Rate:       {metrics['False Positive Rate (%)']:.2f}%"
        report += f"\n  Avg Detection Confidence:  {metrics['Avg Detection Confidence']:.2f}"
        
        # Coverage Section
        report += "\n\n📍 COVERAGE METRICS"
        report += "\n" + "-" * 70
        report += f"\n  Grid Coverage:             {metrics['Coverage (%)']:.2f}%"
        report += f"\n  Cells Explored:            {metrics['Cells Explored']}/{metrics['Total Cells']}"
        
        # Path Section
        report += "\n\n🛣️  PATH PLANNING EFFICIENCY"
        report += "\n" + "-" * 70
        report += f"\n  Path Efficiency:           {metrics['Path Efficiency (%)']:.2f}%"
        report += f"\n  Paths Planned:             {metrics['Total Paths Planned']}"
        report += f"\n  Avg Actual Path Length:    {metrics['Avg Actual Path Length']:.2f} steps"
        report += f"\n  Avg Optimal Path Length:   {metrics['Avg Optimal Path Length']:.2f} steps"
        
        # Time Section
        report += "\n\n⏱️  TIME METRICS"
        report += "\n" + "-" * 70
        report += f"\n  Avg Detection Time:        {metrics['Avg Detection Time (steps)']:.2f} steps"
        report += f"\n  Fastest Detection:         {metrics['Fastest Detection (steps)']} steps"
        report += f"\n  Slowest Detection:         {metrics['Slowest Detection (steps)']} steps"
        report += f"\n  Total Simulation Steps:    {metrics['Total Steps']}"
        
        # Swarm Section
        report += "\n\n🚁 SWARM PERFORMANCE"
        report += "\n" + "-" * 70
        report += f"\n  Overall Swarm Efficiency:  {metrics['Swarm Efficiency (%)']:.2f}%"
        report += f"\n  Total Detections:          {metrics['Total Detections']}"
        report += f"\n  Number of Drones:          {metrics['Num Drones']}"
        
        # Drone-specific Section
        if self.drone_metrics:
            report += "\n\n🚁 INDIVIDUAL DRONE METRICS"
            report += "\n" + "-" * 70
            for drone_id in sorted(self.drone_metrics.keys()):
                drone_eff = self.get_drone_efficiency(drone_id)
                report += f"\n  Drone {drone_id}:"
                report += f"\n    - Steps Taken:           {drone_eff.get('total_steps', 0)}"
                report += f"\n    - Battery Consumed:      {drone_eff.get('battery_consumed', 0):.2f}"
                report += f"\n    - Detections:            {drone_eff.get('detections', 0)}"
                report += f"\n    - False Detections:      {drone_eff.get('false_detections', 0)}"
                report += f"\n    - Area Explored:         {drone_eff.get('area_explored', 0)}"
                report += f"\n    - Detections/Step:       {drone_eff.get('detections_per_step', 0):.3f}"
        
        report += "\n\n" + "=" * 70 + "\n"
        
        return report
    
    def export_metrics(self) -> Dict:
        """
        Export all metrics in structured format for external analysis.
        
        Returns:
            Dictionary with all metrics data
        """
        return {
            'summary': self.compute(),
            'drone_details': {
                drone_id: self.get_drone_efficiency(drone_id) 
                for drone_id in self.drone_metrics.keys()
            },
            'detection_times': self.detection.detection_times,
            'coverage_history': self.coverage_history,
            'detection_count_history': self.detection_count_history,
            'false_positive_history': self.false_positive_history,
            'events': self.events
        }


if __name__ == "__main__":
    # Quick test
    from environment import Environment
    
    env = Environment(size=15)
    metrics = Metrics()
    metrics.load_environment(env)
    
    # Simulate some activity
    metrics.register_drone(1)
    metrics.register_drone(2)
    
    for step in range(50):
        metrics.next_step()
        metrics.log_drone_movement(1, distance=1.0)
        metrics.log_drone_movement(2, distance=1.0)
        metrics.update_exploration(env)
        
        # Simulate detections
        if step % 5 == 0:
            metrics.log_detection(1, (5, 5), is_true=True, confidence=0.9)
        if step % 8 == 0:
            metrics.log_detection(2, (10, 10), is_true=False, confidence=0.4)
        
        metrics.log_path(15, 12, drone_id=1)
    
    metrics.finalize()
    print(metrics.get_detailed_report())

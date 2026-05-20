"""
Comprehensive Test Suite for Metrics Engine
Tests all metrics tracking capabilities and reporting functionality
"""

from environment import Environment
from metrics import Metrics
import random


def test_metrics_initialization():
    """Test metrics initialization and environment loading."""
    print("\n🧪 TEST 1: Metrics Initialization")
    print("-" * 70)
    
    env = Environment(size=15, obstacle_ratio=0.2, survivor_count=4, noise_ratio=0.1)
    metrics = Metrics()
    
    metrics.load_environment(env)
    metrics.register_drone(1)
    metrics.register_drone(2)
    
    print(f"Total survivors in environment: {metrics.detection.total_survivors}")
    print(f"Total grid cells: {metrics.coverage.total_cells}")
    print(f"Registered drones: {list(metrics.drone_metrics.keys())}")
    
    assert metrics.detection.total_survivors == len(env.survivors), "Survivor count mismatch"
    assert metrics.coverage.total_cells == 15 * 15, "Cell count mismatch"
    assert len(metrics.drone_metrics) == 2, "Drone registration failed"
    
    print("✅ PASS: Metrics initialized correctly\n")


def test_detection_tracking():
    """Test detection accuracy and false positive tracking."""
    print("🧪 TEST 2: Detection Tracking")
    print("-" * 70)
    
    env = Environment(size=10)
    metrics = Metrics()
    metrics.load_environment(env)
    metrics.register_drone(1)
    
    # Simulate detections
    metrics.log_detection(1, (2, 2), is_true=True, confidence=0.95)
    metrics.log_detection(1, (4, 4), is_true=True, confidence=0.87)
    metrics.log_detection(1, (6, 6), is_true=False, confidence=0.3)  # False positive
    metrics.log_detection(1, (8, 8), is_true=True, confidence=0.92)
    
    accuracy = metrics.compute_detection_accuracy()
    false_pos_rate = metrics.compute_false_positive_rate()
    
    print(f"Total detections: {metrics.detection.total_detections}")
    print(f"True positives: {metrics.detection.true_positives}")
    print(f"False positives: {metrics.detection.false_positives}")
    print(f"Detection accuracy: {accuracy:.2f}%")
    print(f"False positive rate: {false_pos_rate:.2f}%")
    
    assert metrics.detection.total_detections == 4, "Detection count mismatch"
    assert metrics.detection.true_positives == 3, "True positive count mismatch"
    assert metrics.detection.false_positives == 1, "False positive count mismatch"
    assert accuracy == 75.0, f"Expected 75% accuracy, got {accuracy}%"
    
    print("✅ PASS: Detection tracking works correctly\n")


def test_coverage_tracking():
    """Test area coverage metrics."""
    print("🧪 TEST 3: Coverage Tracking")
    print("-" * 70)
    
    env = Environment(size=10, obstacle_ratio=0.15)
    metrics = Metrics()
    metrics.load_environment(env)
    
    # Initially no exploration
    coverage_initial = metrics.compute_coverage()
    print(f"Initial coverage: {coverage_initial:.2f}%")
    assert coverage_initial == 0.0, "Initial coverage should be 0%"
    
    # Simulate exploration
    for i in range(25):  # Mark 25 cells
        metrics.coverage.explored_cells += 1
    
    coverage_after = metrics.compute_coverage()
    print(f"Coverage after exploring 25 cells: {coverage_after:.2f}%")
    
    expected_coverage = (25 / 100) * 100
    assert coverage_after == expected_coverage, f"Expected {expected_coverage}%, got {coverage_after}%"
    
    print("✅ PASS: Coverage tracking works correctly\n")


def test_path_efficiency():
    """Test path planning efficiency metrics."""
    print("🧪 TEST 4: Path Efficiency Tracking")
    print("-" * 70)
    
    metrics = Metrics()
    
    # Log paths with known efficiency
    metrics.log_path(actual_length=20, optimal_length=15, drone_id=1)  # 75% efficiency
    metrics.log_path(actual_length=30, optimal_length=25, drone_id=1)  # 83.3% efficiency
    metrics.log_path(actual_length=10, optimal_length=10, drone_id=2)  # 100% efficiency
    
    efficiency = metrics.compute_path_efficiency()
    print(f"Total paths planned: {len(metrics.paths.path_lengths)}")
    print(f"Path length ratios: {[(o/a)*100 for o, a in zip(metrics.paths.optimal_lengths, metrics.paths.path_lengths)]}")
    print(f"Average path efficiency: {efficiency:.2f}%")
    
    assert metrics.paths.path_lengths == [20, 30, 10], "Path lengths not tracked"
    assert efficiency > 75 and efficiency < 90, f"Expected efficiency ~85%, got {efficiency}%"
    
    print("✅ PASS: Path efficiency tracking works correctly\n")


def test_detection_rate_and_time():
    """Test detection rate and time-to-detection metrics."""
    print("🧪 TEST 5: Detection Rate & Time Metrics")
    print("-" * 70)
    
    env = Environment(size=10, survivor_count=5)
    metrics = Metrics()
    metrics.load_environment(env)
    metrics.register_drone(1)
    
    # Simulate finding 3 out of 5 survivors
    metrics.current_step = 10
    metrics.log_detection(1, (1, 1), is_true=True, confidence=0.95)
    
    metrics.current_step = 25
    metrics.log_detection(1, (2, 2), is_true=True, confidence=0.90)
    
    metrics.current_step = 35
    metrics.log_detection(1, (3, 3), is_true=True, confidence=0.88)
    
    detection_rate = metrics.compute_detection_rate()
    avg_detection_time = metrics.compute_avg_detection_time()
    
    print(f"Total survivors: {metrics.detection.total_survivors}")
    print(f"Survivors detected: {len(metrics.detection.detected_survivors)}")
    print(f"Detection rate: {detection_rate:.2f}%")
    print(f"Average detection time: {avg_detection_time:.2f} steps")
    print(f"Fastest detection: {min(metrics.detection.detection_times.values())} steps")
    print(f"Slowest detection: {max(metrics.detection.detection_times.values())} steps")
    
    assert detection_rate == 60.0, f"Expected 60% detection rate, got {detection_rate}%"
    assert abs(avg_detection_time - 23.333) < 0.01, f"Expected ~23.3 steps average, got {avg_detection_time}"
    
    print("✅ PASS: Detection rate and time metrics work correctly\n")


def test_drone_efficiency():
    """Test individual drone efficiency metrics."""
    print("🧪 TEST 6: Drone Efficiency Metrics")
    print("-" * 70)
    
    metrics = Metrics()
    metrics.register_drone(1)
    metrics.register_drone(2)
    
    # Drone 1: More active detections
    for i in range(50):
        metrics.log_drone_movement(1, distance=1.0)
    metrics.log_exploration(1, cells_explored=30)
    metrics.log_detection(1, (1, 1), is_true=True, confidence=0.9)
    metrics.log_detection(1, (2, 2), is_true=True, confidence=0.85)
    
    # Drone 2: Less active
    for i in range(30):
        metrics.log_drone_movement(2, distance=1.0)
    metrics.log_exploration(2, cells_explored=15)
    
    eff_1 = metrics.get_drone_efficiency(1)
    eff_2 = metrics.get_drone_efficiency(2)
    
    print(f"Drone 1 efficiency:")
    print(f"  Steps: {eff_1['total_steps']}, Battery: {eff_1['battery_consumed']}")
    print(f"  Detections: {eff_1['detections']}, Area explored: {eff_1['area_explored']}")
    print(f"  Detections/step: {eff_1['detections_per_step']:.3f}")
    
    print(f"\nDrone 2 efficiency:")
    print(f"  Steps: {eff_2['total_steps']}, Battery: {eff_2['battery_consumed']}")
    print(f"  Detections: {eff_2['detections']}, Area explored: {eff_2['area_explored']}")
    print(f"  Detections/step: {eff_2['detections_per_step']:.3f}")
    
    assert eff_1['total_steps'] == 50, "Drone 1 steps mismatch"
    assert eff_2['total_steps'] == 30, "Drone 2 steps mismatch"
    assert eff_1['detections'] == 2, "Drone 1 detections mismatch"
    assert eff_1['detections_per_step'] > eff_2['detections_per_step'], "Drone 1 should be more efficient"
    
    print("✅ PASS: Drone efficiency metrics work correctly\n")


def test_swarm_efficiency():
    """Test overall swarm efficiency calculation."""
    print("🧪 TEST 7: Swarm Efficiency Calculation")
    print("-" * 70)
    
    env = Environment(size=12, obstacle_ratio=0.2, survivor_count=3)
    metrics = Metrics()
    metrics.load_environment(env)
    metrics.register_drone(1)
    
    # Set up various metrics
    metrics.coverage.explored_cells = 50  # ~35% coverage
    metrics.log_detection(1, (1, 1), is_true=True, confidence=0.95)
    metrics.log_detection(1, (2, 2), is_true=True, confidence=0.90)
    metrics.log_path(20, 18, drone_id=1)  # 90% efficient
    
    accuracy = metrics.compute_detection_accuracy()
    coverage = metrics.compute_coverage()
    path_eff = metrics.compute_path_efficiency()
    swarm_eff = metrics.compute_swarm_efficiency()
    
    print(f"Detection accuracy: {accuracy:.2f}%")
    print(f"Coverage: {coverage:.2f}%")
    print(f"Path efficiency: {path_eff:.2f}%")
    print(f"Swarm efficiency: {swarm_eff:.2f}%")
    print(f"  (Calculated: {accuracy:.2f} * 0.3 + {coverage:.2f} * 0.3 + {path_eff:.2f} * 0.4)")
    
    expected_swarm_eff = (accuracy * 0.3 + coverage * 0.3 + path_eff * 0.4)
    assert abs(swarm_eff - expected_swarm_eff) < 0.01, "Swarm efficiency calculation mismatch"
    
    print("✅ PASS: Swarm efficiency calculation correct\n")


def test_full_metrics_report():
    """Test complete metrics computation and reporting."""
    print("🧪 TEST 8: Full Metrics Report")
    print("-" * 70)
    
    env = Environment(size=15, obstacle_ratio=0.2, survivor_count=4, noise_ratio=0.1)
    metrics = Metrics()
    metrics.load_environment(env)
    metrics.register_drone(1)
    metrics.register_drone(2)
    
    # Simulate mission
    for step in range(100):
        metrics.next_step()
        
        # Random exploration
        metrics.coverage.explored_cells = min(metrics.coverage.explored_cells + random.randint(1, 3), 
                                             metrics.coverage.total_cells)
        
        # Random detections
        if random.random() < 0.05:  # 5% chance
            if random.random() < 0.8:  # 80% true
                metrics.log_detection(random.choice([1, 2]), 
                                    (random.randint(0, 14), random.randint(0, 14)),
                                    is_true=True, confidence=random.uniform(0.7, 1.0))
            else:
                metrics.log_detection(random.choice([1, 2]),
                                    (random.randint(0, 14), random.randint(0, 14)),
                                    is_true=False, confidence=random.uniform(0.2, 0.5))
        
        # Path logging
        if random.random() < 0.1:
            actual = random.randint(15, 40)
            optimal = random.randint(10, 30)
            if optimal <= actual:
                metrics.log_path(actual, optimal, drone_id=random.choice([1, 2]))
        
        # Drone movement
        metrics.log_drone_movement(1, distance=1.0)
        metrics.log_drone_movement(2, distance=1.0)
        
        metrics.update_exploration(env)
    
    metrics.finalize()
    
    # Get report
    report = metrics.get_detailed_report()
    print(report)
    
    # Verify metrics computed
    metrics_dict = metrics.compute()
    assert 'Swarm Efficiency (%)' in metrics_dict, "Missing swarm efficiency"
    assert 'Coverage (%)' in metrics_dict, "Missing coverage"
    assert 'Detection Accuracy (%)' in metrics_dict, "Missing detection accuracy"
    
    print("✅ PASS: Full metrics report generated successfully\n")


def test_metrics_export():
    """Test metrics export functionality."""
    print("🧪 TEST 9: Metrics Export")
    print("-" * 70)
    
    env = Environment(size=10)
    metrics = Metrics()
    metrics.load_environment(env)
    metrics.register_drone(1)
    
    # Log some data
    metrics.next_step()
    metrics.log_detection(1, (2, 2), is_true=True, confidence=0.95)
    metrics.log_path(15, 12, drone_id=1)
    
    # Export
    exported = metrics.export_metrics()
    
    print(f"Export keys: {list(exported.keys())}")
    print(f"Summary metrics: {len(exported['summary'])} items")
    print(f"Drone details: {len(exported['drone_details'])} drones")
    print(f"Detection times: {exported['detection_times']}")
    print(f"Event log entries: {len(exported['events'])}")
    
    assert 'summary' in exported, "Missing summary"
    assert 'drone_details' in exported, "Missing drone details"
    assert len(exported['events']) > 0, "Missing events"
    
    print("✅ PASS: Metrics export works correctly\n")


def main():
    """Run all tests."""
    print("\n" + "=" * 70)
    print("🚁 METRICS ENGINE TEST SUITE")
    print("=" * 70)
    
    try:
        test_metrics_initialization()
        test_detection_tracking()
        test_coverage_tracking()
        test_path_efficiency()
        test_detection_rate_and_time()
        test_drone_efficiency()
        test_swarm_efficiency()
        test_full_metrics_report()
        test_metrics_export()
        
        print("=" * 70)
        print("✅ ALL TESTS PASSED!")
        print("=" * 70)
        print("\n🎯 Metrics Engine is fully operational.")
        print("✓ Initialization tracking")
        print("✓ Detection accuracy computation")
        print("✓ Coverage metrics")
        print("✓ Path efficiency analysis")
        print("✓ Time-to-detection tracking")
        print("✓ Drone efficiency metrics")
        print("✓ Swarm efficiency calculation")
        print("✓ Detailed reporting")
        print("✓ Metrics export")
        print("\n" + "=" * 70 + "\n")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}\n")
        return False
    except Exception as e:
        print(f"\n❌ ERROR: {e}\n")
        import traceback
        traceback.print_exc()
        return False
    
    return True


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)

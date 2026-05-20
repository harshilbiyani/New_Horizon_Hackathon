"""
Test file for realistic environment simulation
Verifies obstacles, survivors, noise, and sensor signals
"""

from environment import Environment
import numpy as np


def test_environment_creation():
    """Test basic environment creation."""
    print("\n🧪 TEST 1: Environment Creation")
    print("-" * 50)
    
    env = Environment(size=15, obstacle_ratio=0.2, survivor_count=3, noise_ratio=0.1)
    env.display()
    env.print_statistics()
    
    assert env.size == 15, "Size mismatch"
    assert len(env.survivors) > 0, "No survivors placed"
    assert len(env.noise_sources) > 0, "No noise placed"
    print("✅ PASS: Environment created successfully\n")


def test_exploration_tracking():
    """Test exploration marking."""
    print("\n🧪 TEST 2: Exploration Tracking")
    print("-" * 50)
    
    env = Environment(size=10, obstacle_ratio=0.15, survivor_count=2, noise_ratio=0.08)
    
    print("Initial exploration: 0%")
    print(f"Explored: {env.get_explored_percentage():.1f}%")
    
    # Mark some cells as explored
    env.mark_explored(5, 5, radius=2)
    explored_pct = env.get_explored_percentage()
    print(f"After marking (5,5) with radius=2: {explored_pct:.1f}%")
    
    assert explored_pct > 0, "Exploration not tracked"
    print("✅ PASS: Exploration tracking works\n")


def test_sensor_signals():
    """Test sensor signal simulation."""
    print("\n🧪 TEST 3: Sensor Signal Simulation")
    print("-" * 50)
    
    env = Environment(size=15, obstacle_ratio=0.15, survivor_count=4, noise_ratio=0.1)
    
    # Test signals at a survivor location
    if len(env.survivors) > 0:
        sx, sy = env.survivors[0]
        print(f"Survivor at ({sx}, {sy})")
        
        # Get signals from nearby drone position
        signals = env.get_signal(sx + 1, sy, detection_radius=3.0)
        print(f"  Signals from ({sx+1}, {sy}):")
        for sensor, strength in signals.items():
            print(f"    {sensor}: {strength:.2f}")
        
        # Verify thermal and visual signals are strong near survivor
        assert signals["thermal"] > 0.5, f"Weak thermal signal {signals['thermal']}"
        assert signals["visual"] > 0.5, f"Weak visual signal {signals['visual']}"
    
    # Test signals at noise location
    if len(env.noise_sources) > 0:
        nx, ny = env.noise_sources[0]
        print(f"\nNoise source at ({nx}, {ny})")
        
        signals = env.get_signal(nx + 1, ny, detection_radius=3.0)
        print(f"  Signals from ({nx+1}, {ny}):")
        for sensor, strength in signals.items():
            print(f"    {sensor}: {strength:.2f}")
        
        # Verify thermal is moderate (false signal)
        assert 0.3 < signals["thermal"] < 0.8, f"Unexpected thermal signal {signals['thermal']}"
    
    print("\n✅ PASS: Sensor signals working correctly\n")


def test_obstacle_detection():
    """Test obstacle detection and path planning."""
    print("\n🧪 TEST 4: Obstacle Detection")
    print("-" * 50)
    
    env = Environment(size=12, obstacle_ratio=0.2, survivor_count=2, noise_ratio=0.08)
    
    # Find an obstacle
    obstacles_found = False
    for x in range(env.size):
        for y in range(env.size):
            if env.is_obstacle(x, y):
                nearby_obs = env.get_nearby_obstacles(x, y, search_radius=1)
                print(f"Found obstacle at ({x}, {y})")
                print(f"Nearby obstacles (radius=1): {len(nearby_obs)}")
                obstacles_found = True
                break
        if obstacles_found:
            break
    
    # Test movement validity
    for x in range(5):
        for y in range(5):
            can_move = env.can_move_to(x, y)
            cell = env.grid[x][y]
            if cell == '#':
                assert not can_move, f"Should not be able to move to obstacle at ({x}, {y})"
            else:
                assert can_move, f"Should be able to move to empty/survivor/noise at ({x}, {y})"
    
    print("✅ PASS: Obstacle detection works\n")


def test_multiple_drones():
    """Test environment with multiple drone positions."""
    print("\n🧪 TEST 5: Multi-Drone Scenario")
    print("-" * 50)
    
    env = Environment(size=20, obstacle_ratio=0.2, survivor_count=5, noise_ratio=0.12)
    
    # Simulate 5 drones scanning
    drone_positions = [
        (2, 2),
        (18, 2),
        (2, 18),
        (18, 18),
        (10, 10)
    ]
    
    print(f"Simulating {len(drone_positions)} drones scanning...")
    for i, (dx, dy) in enumerate(drone_positions):
        if env.can_move_to(dx, dy):
            env.mark_explored(dx, dy, radius=2)
            signals = env.get_signal(dx, dy, detection_radius=3.0)
            print(f"  Drone {i+1} at ({dx:2d}, {dy:2d}): thermal={signals['thermal']:.2f}, visual={signals['visual']:.2f}")
    
    final_exploration = env.get_explored_percentage()
    print(f"\nFinal exploration: {final_exploration:.1f}%")
    
    assert final_exploration > 0, "Drones didn't explore"
    print("✅ PASS: Multi-drone scenario works\n")


def test_full_statistics():
    """Display full environment statistics."""
    print("\n🧪 TEST 6: Full Statistics")
    print("-" * 50)
    
    env = Environment(size=25, obstacle_ratio=0.2, survivor_count=6, noise_ratio=0.15)
    env.display(show_explored=False)
    env.print_statistics()
    
    stats = env.get_statistics()
    assert stats['survivors'] > 0, "No survivors"
    assert stats['obstacles'] > 0, "No obstacles"
    assert stats['noise_sources'] > 0, "No noise"
    
    print("✅ PASS: Statistics generated successfully\n")


def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("🚁 ENVIRONMENT SIMULATION TEST SUITE")
    print("=" * 60)
    
    try:
        test_environment_creation()
        test_exploration_tracking()
        test_sensor_signals()
        test_obstacle_detection()
        test_multiple_drones()
        test_full_statistics()
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("=" * 60)
        print("\n🎯 Environment simulation is working correctly.")
        print("✓ Obstacles placed")
        print("✓ Survivors hidden")
        print("✓ Noise signals added")
        print("✓ Exploration tracked")
        print("✓ Sensor simulation working")
        print("✓ Multi-drone scenarios supported")
        print("\n" + "=" * 60 + "\n")
        
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

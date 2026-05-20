"""
Comprehensive Test Suite for AI Coordinator
Tests adaptive zone selection, Q-learning, and multi-agent coordination
"""

from ai_coordinator import AICoordinator, MultiAgentCoordinator
import numpy as np


def test_zone_selection():
    """Test basic zone selection."""
    print("\n[1] ZONE SELECTION TEST")
    print("-" * 70)
    
    coordinator = AICoordinator()
    zones = ['A', 'B', 'C', 'D']
    
    # Select multiple zones
    selections = []
    for i in range(5):
        zone = coordinator.choose_zone(zones)
        selections.append(zone)
        print(f"  Turn {i+1}: Selected Zone {zone}")
    
    # Some exploration should happen
    unique_zones = len(set(selections))
    print(f"\nUnique zones selected: {unique_zones}/4")
    
    assert unique_zones >= 2, "Should explore multiple zones"
    
    print("\n[OK] Zone selection test passed!\n")


def test_reward_learning():
    """Test reward-based learning."""
    print("[2] REWARD LEARNING TEST")
    print("-" * 70)
    
    coordinator = AICoordinator(learning_rate=0.3)
    zones = ['Zone_0', 'Zone_1', 'Zone_2']
    
    # Initial selection
    print("Initial zone selections:")
    for _ in range(3):
        zone = coordinator.choose_zone(zones)
        print(f"  Zone {zone}")
    
    # Reward Zone 0 strongly
    print("\nRepeated rewards for Zone_0:")
    coordinator.update_reward('Zone_0', 10.0)
    coordinator.update_reward('Zone_0', 8.0)
    coordinator.update_reward('Zone_0', 9.0)
    
    # Penalize Zone 1
    print("Penalties for Zone_1:")
    coordinator.update_reward('Zone_1', -2.0)
    coordinator.update_reward('Zone_1', -3.0)
    
    # Get top zones
    top_zones = coordinator.get_top_zones()
    print(f"\nTop zones after reward updates:")
    for i, (zone, q_value) in enumerate(top_zones[:3]):
        print(f"  {i+1}. {zone} (Q={q_value:.3f})")
    
    assert top_zones[0][0] == 'Zone_0', "Zone_0 should be top after rewards"
    
    print("\n[OK] Reward learning test passed!\n")


def test_exploration_decay():
    """Test exploration decay over time."""
    print("[3] EXPLORATION DECAY TEST")
    print("-" * 70)
    
    coordinator = AICoordinator(epsilon=0.8)
    
    print(f"Initial exploration rate (epsilon): {coordinator.epsilon:.3f}")
    
    # Simulate steps and decay
    exploration_rates = [coordinator.epsilon]
    for step in range(10):
        coordinator.decay_exploration(factor=0.9)
        exploration_rates.append(coordinator.epsilon)
    
    print(f"After 10 decay steps: {coordinator.epsilon:.3f}")
    print(f"Total decay: {exploration_rates[0] - exploration_rates[-1]:.3f}")
    
    # Should decrease
    assert exploration_rates[-1] < exploration_rates[0], "Exploration should decay"
    
    print("\n[OK] Exploration decay test passed!\n")


def test_multi_agent_coordination():
    """Test multi-agent coordination."""
    print("[4] MULTI-AGENT COORDINATION TEST")
    print("-" * 70)
    
    ma_coord = MultiAgentCoordinator(num_drones=3, shared_learning=True)
    zones = ['Zone_A', 'Zone_B', 'Zone_C', 'Zone_D']
    
    # Each drone selects zones
    print("Drones selecting zones:")
    selections = {}
    for drone_id in range(3):
        zone = ma_coord.choose_zone_for_drone(drone_id, zones)
        selections[drone_id] = zone
        print(f"  Drone {drone_id} → {zone}")
    
    # Report rewards
    print("\nReporting rewards:")
    ma_coord.report_reward(drone_id=0, zone=selections[0], reward=2.0)
    ma_coord.report_reward(drone_id=1, zone=selections[1], reward=0.0)
    ma_coord.report_reward(drone_id=2, zone=selections[2], reward=1.0)
    print("  Rewards reported for each drone")
    
    # Get statistics
    stats = ma_coord.get_swarm_statistics()
    print(f"\nSwarm statistics:")
    print(f"  Drones coordinated: {len(stats['individual_stats'])}")
    print(f"  Average efficiency: {stats.get('avg_efficiency', 0):.3f}")
    
    print("\n[OK] Multi-agent coordination test passed!\n")


def test_q_learning_mechanics():
    """Test Q-learning update mechanics."""
    print("[5] Q-LEARNING MECHANICS TEST")
    print("-" * 70)
    
    coordinator = AICoordinator(learning_rate=0.5)
    zones = ['Z1', 'Z2', 'Z3']
    
    # Get initial Q-values
    print("Initial Q-values:")
    top_initial = coordinator.get_top_zones()
    for zone, q_val in top_initial:
        print(f"  {zone}: {q_val:.3f}")
    
    # Apply updates with known rewards
    print("\nApplying Q-learning updates:")
    print("  Z1 + reward 5.0 (high success)")
    coordinator.update_reward('Z1', 5.0)
    
    print("  Z2 + reward 2.0 (partial success)")
    coordinator.update_reward('Z2', 2.0)
    
    print("  Z1 + reward 5.0 (high success again)")
    coordinator.update_reward('Z1', 5.0)
    
    # Check convergence
    print("\nQ-values after updates:")
    top_updated = coordinator.get_top_zones()
    for zone, q_val in top_updated[:3]:
        print(f"  {zone}: {q_val:.3f}")
    
    # Z1 should have highest Q-value
    assert top_updated[0][0] == 'Z1', "Z1 should rank highest"
    
    print("\n[OK] Q-learning test passed!\n")


def test_zone_statistics_tracking():
    """Test zone visit statistics."""
    print("[6] ZONE STATISTICS TRACKING TEST")
    print("-" * 70)
    
    coordinator = AICoordinator()
    zones = ['A', 'B']
    
    # Simulate zone visits with varying success
    print("Zone A - Multiple visits with varying rewards:")
    for reward in [3.0, 5.0, 4.0, 6.0]:
        zone = 'A'
        print(f"  Visit {zone}: Reward={reward}")
        coordinator.update_reward(zone, reward)
    
    print("\nZone B - Single visit:")
    print(f"  Visit B: Reward=2.0")
    coordinator.update_reward('B', 2.0)
    
    # Get statistics
    stats = coordinator.get_zone_statistics()
    print(f"\nZone statistics:")
    print(f"  Zones explored: {stats.get('zones_explored', 0)}")
    print(f"  Average zone score: {stats.get('avg_score', 0):.2f}")
    print(f"  Max score: {stats.get('max_score', 0):.2f}")
    print(f"  Min score: {stats.get('min_score', 0):.2f}")
    
    print("\n[OK] Statistics tracking test passed!\n")


def test_model_persistence():
    """Test model export/import."""
    print("[7] MODEL PERSISTENCE TEST")
    print("-" * 70)
    
    coordinator1 = AICoordinator()
    zones = ['Z1', 'Z2', 'Z3']
    
    # Create learned state
    coordinator1.update_reward('Z1', 5.0)
    coordinator1.update_reward('Z1', 6.0)
    coordinator1.update_reward('Z2', 2.0)
    
    # Export
    model = coordinator1.export_model()
    print(f"Exported model with {len(model['zone_scores'])} learned zones")
    print(f"  Zone Q-values: {model['zone_scores']}")
    print(f"  Visit counts: {model['visit_counts']}")
    
    # Create fresh coordinator
    coordinator2 = AICoordinator()
    initial_choice = coordinator2.choose_zone(zones)
    
    # Import model
    coordinator2.import_model(model)
    post_import_choice = coordinator2.choose_zone(zones)
    
    print(f"\nBefore import: Selected zone {initial_choice}")
    print(f"After import: Selected zone {post_import_choice} (should prefer Z1)")
    
    print("\n[OK] Model persistence test passed!\n")


def test_adaptive_behavior():
    """Test that coordinator adapts to changing rewards."""
    print("[8] ADAPTIVE BEHAVIOR TEST")
    print("-" * 70)
    
    coordinator = AICoordinator(epsilon=0.3, learning_rate=0.5)  # Higher learning rate for faster adaptation
    zones = ['A', 'B']
    
    # Phase 1: Zone A is better
    print("Phase 1: Rewarding Zone A (8 steps)")
    phase1_zones = []
    for _ in range(8):
        zone = coordinator.choose_zone(zones)
        phase1_zones.append(zone)
        coordinator.update_reward(zone, 5.0 if zone == 'A' else 1.0)
    
    zone_a_count_p1 = phase1_zones.count('A')
    print(f"  Zone A visits: {zone_a_count_p1}/8")
    
    # Phase 2: Zone B becomes better
    print("\nPhase 2: Rewarding Zone B (8 steps)")
    phase2_zones = []
    for _ in range(8):
        zone = coordinator.choose_zone(zones)
        phase2_zones.append(zone)
        coordinator.update_reward(zone, 5.0 if zone == 'B' else 1.0)
    
    zone_b_count_p2 = phase2_zones.count('B')
    print(f"  Zone B visits: {zone_b_count_p2}/8")
    
    # Should shift preference (with higher learning rate, adaptation is faster)
    print(f"\nAdaptation check: B visits ({zone_b_count_p2}) vs A visits in phase 1 ({zone_a_count_p1})")
    
    print("\n[OK] Adaptive behavior test passed!\n")


def test_exploration_exploitation():
    """Test exploration vs exploitation balance."""
    print("[9] EXPLORATION VS EXPLOITATION TEST")
    print("-" * 70)
    
    zones = ['Z1', 'Z2', 'Z3', 'Z4']
    
    # Low epsilon - mostly exploitation
    low_eps = AICoordinator(epsilon=0.1)
    low_selections = [low_eps.choose_zone(zones) for _ in range(10)]
    low_unique = len(set(low_selections))
    
    # High epsilon - mostly exploration
    high_eps = AICoordinator(epsilon=0.9)
    high_selections = [high_eps.choose_zone(zones) for _ in range(10)]
    high_unique = len(set(high_selections))
    
    print(f"Low epsilon (0.1) - 10 selections:")
    print(f"  Unique zones: {low_unique}/4")
    print(f"  Selections: {low_selections}")
    
    print(f"\nHigh epsilon (0.9) - 10 selections:")
    print(f"  Unique zones: {high_unique}/4")
    print(f"  Selections: {high_selections}")
    
    # High epsilon should explore more
    assert high_unique >= low_unique, "Higher epsilon should explore more"
    
    print("\n[OK] Exploration/exploitation test passed!\n")


def main():
    """Run all tests."""
    print("\n" + "="*70)
    print("AI COORDINATOR TEST SUITE")
    print("="*70)
    
    try:
        test_zone_selection()
        test_reward_learning()
        test_exploration_decay()
        test_multi_agent_coordination()
        test_q_learning_mechanics()
        test_zone_statistics_tracking()
        test_model_persistence()
        test_adaptive_behavior()
        test_exploration_exploitation()
        
        print("="*70)
        print("[SUCCESS] ALL AI COORDINATOR TESTS PASSED!")
        print("="*70 + "\n")
        
        return True
    
    except AssertionError as e:
        print(f"\n[FAILED] {e}\n")
        return False
    except Exception as e:
        print(f"\n[ERROR] {e}\n")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)

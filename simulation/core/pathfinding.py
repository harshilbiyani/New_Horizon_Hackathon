# =============================================================================
# core/pathfinding.py - A* Pathfinding for Drone Swarm Simulation
# Team A - Person A2
# =============================================================================

import sys
import os
import heapq

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import A_STAR_MAX_ITERATIONS


# ------------------------------------------------------------------
# Heuristic
# ------------------------------------------------------------------

def heuristic(a, b):
    """
    Manhattan distance heuristic for 4-directional grid movement.

    Args:
        a: (x, y) position.
        b: (x, y) target position.

    Returns:
        Integer Manhattan distance.
    """
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


# ------------------------------------------------------------------
# Path reconstruction
# ------------------------------------------------------------------

def reconstruct_path(came_from, current):
    """
    Trace the came_from chain from 'current' back to the start.

    Args:
        came_from: Maps each node to its predecessor on the optimal path.
        current:   Goal node to trace back from.

    Returns:
        Ordered list of (x, y) positions from start → goal.
    """
    path = [current]
    while current in came_from:
        current = came_from[current]
        path.append(current)
    path.reverse()
    return path


# ------------------------------------------------------------------
# A* Core
# ------------------------------------------------------------------

def a_star(start, goal, map_obj):
    """
    A* shortest-path search on the grid.

    Args:
        start:   (x, y) starting cell.
        goal:    (x, y) destination cell.
        map_obj: Map instance providing get_neighbors() and is_obstacle().

    Returns:
        List of (x, y) waypoints from start → goal (inclusive),
        or None if no path exists.
    """
    # Edge cases
    if map_obj.is_obstacle(*start):
        return None
    if map_obj.is_obstacle(*goal):
        return None
    if start == goal:
        return [start]

    # Priority queue: (f_score, (x, y))
    open_heap = []
    heapq.heappush(open_heap, (0, start))

    came_from = {}

    # Cost from start to each node
    g_score = {start: 0}

    # f_score = g + h
    f_score = {start: heuristic(start, goal)}

    # Already-processed nodes
    closed_set = set()

    iterations = 0

    while open_heap:
        iterations += 1
        if iterations > A_STAR_MAX_ITERATIONS:
            # Safety cutoff – map is too complex / no path
            return None

        _, current = heapq.heappop(open_heap)

        if current in closed_set:
            continue

        if current == goal:
            return reconstruct_path(came_from, current)

        closed_set.add(current)

        for neighbor in map_obj.get_neighbors(*current):
            if neighbor in closed_set:
                continue

            tentative_g = g_score[current] + 1  # uniform edge cost

            if tentative_g < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                f = tentative_g + heuristic(neighbor, goal)
                f_score[neighbor] = f
                heapq.heappush(open_heap, (f, neighbor))

    return None  # No path found


# ------------------------------------------------------------------
# Convenience wrapper
# ------------------------------------------------------------------

def get_next_step(current_pos, goal_pos, map_obj):
    """
    Return the immediate next cell a drone should move to when heading
    from current_pos toward goal_pos, or None if unreachable / already there.

    Args:
        current_pos: Drone's current (x, y).
        goal_pos:    Target (x, y).
        map_obj:     Map instance.

    Returns:
        Next (x, y) to move to, or None.
    """
    if current_pos == goal_pos:
        return None

    path = a_star(current_pos, goal_pos, map_obj)
    if path is None or len(path) < 2:
        return None

    return path[1]  # index 0 is current position


# =============================================================================
# Standalone test
# =============================================================================
if __name__ == "__main__":
    print("Testing pathfinding.py...")

    # Build a minimal map stub for isolated testing
    class _StubMap:
        """Obstacle-free 50x50 map for path testing."""
        width, height = 50, 50

        def is_obstacle(self, x, y):
            return not (0 <= x < self.width and 0 <= y < self.height)

        def get_neighbors(self, x, y):
            result = []
            for dx, dy in [(0, -1), (0, 1), (-1, 0), (1, 0)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < self.width and 0 <= ny < self.height:
                    result.append((nx, ny))
            return result

    stub = _StubMap()

    start = (0, 0)
    goal = (49, 49)
    path = a_star(start, goal, stub)

    if path:
        print(f"✓ Path found with {len(path)} steps")
        print(f"  Start: {path[0]}")
        print(f"  Goal:  {path[-1]}")
        assert path[0] == start, "Path should start at start"
        assert path[-1] == goal, "Path should end at goal"
        expected_len = abs(goal[0] - start[0]) + abs(goal[1] - start[1]) + 1
        assert len(path) == expected_len, f"Expected {expected_len} steps, got {len(path)}"
        print("✓ Path length is optimal (Manhattan distance)")
    else:
        print("✗ No path found (unexpected)")

    # Test: already at goal
    same = a_star((5, 5), (5, 5), stub)
    assert same == [(5, 5)], "Start==goal should return single-element path"
    print("✓ Start == goal handled correctly")

    # Test: get_next_step helper
    nxt = get_next_step((0, 0), (5, 0), stub)
    assert nxt is not None
    print(f"✓ get_next_step((0,0) → (5,0)) = {nxt}")

    print("\nAll pathfinding tests passed! ✅")

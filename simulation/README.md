# Drone Swarm Simulation - Team A

This project implements the Core Simulation Module for the Drone Swarm Search & Rescue System.
It provides the foundation layer that creates the grid-based world, sets up obstacles and hidden survivors, and simulates 5 autonomous drones running distributed A* pathfinding.

## Project Structure

```text
simulation/
├── config.py           # Simulation constants (grid size, drone speed, densities)
├── main.py             # Integration controller and Team B/C interfaces
├── core/
│   ├── map.py          # Grid logic, obstacle/survivor generation, scanned tracking
│   ├── pathfinding.py  # A* algorithm implementation with Manhattan distance
│   └── drone.py        # Drone agent logic, region assignment, local target picking
```

## How to Run the Demo
You can run the full integration demo (100 steps) by running `main.py`:
```bash
python main.py
```
This will initialize the simulation and output step-by-step progress and final coverage stats.

## Running Unit Tests
Each module in `core/` contains its own self-test block. Run them individually:
```bash
python core/map.py
python core/pathfinding.py
python core/drone.py
```

## Interfaces for Teams B & C
Team A provides the following stable interfaces to other modules, implemented in `DroneSwarmSimulation` (in `main.py`) or via the objects it creates:

- `sim.step_simulation() -> int`: Advances the simulation one step and returns the step counter.
- `sim.get_map_state() -> dict`: Returns a complete snapshot of the grid, obstacles, scanned cells, and found survivors.
- `sim.get_drone_positions() -> list[dict]`: Returns a list of drone statuses, including location, targets, and region limits.
- `map_obj.get_survivor_at(x, y) -> bool`: Safe query to check if an undiscovered survivor is located at `(x, y)` without revealing them on the main drone grid view.
- `drone.get_position() -> (int, int)`: Returns the tuple position of a drone.

## Performance
- Time complexity of A* is managed using dynamic regions.
- NumPy is used for backing the state grids for rapid copies.
- Set intersections are used over manual loops for sub-millisecond cell lookups.

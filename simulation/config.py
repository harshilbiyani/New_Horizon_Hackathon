# =============================================================================
# config.py - Drone Swarm Simulation Configuration
# Team A - Core Simulation Module
# =============================================================================

# --- Grid Settings ---
GRID_WIDTH = 50
GRID_HEIGHT = 50

# --- Drone Specifications (3D & Hardware) ---
NUM_DRONES = 5
DRONE_SPEED_XY = 1          # cells per step horizontally
DRONE_SPEED_Z = 0.5         # ascend/descend speed
DRONE_DETECTION_RANGE = 2   # base radius in cells for survivor detection

DRONE_WIDTH = 0.5           # meters
DRONE_HEIGHT = 0.2          # meters
DRONE_MAX_ALTITUDE = 120    # max height in meters
DRONE_CRUISE_ALTITUDE = 30  # standard flying altitude

DRONE_MAX_BATTERY = 50000   # arbitrary units
BATTERY_DRAIN_HOVER = 1     # drain per step
BATTERY_DRAIN_MOVE = 2      # drain per step when moving

# --- Environment Settings ---
OBSTACLE_DENSITY = 0.15  # 15% of grid cells are obstacles
NUM_SURVIVORS = 10
MIN_OBSTACLE_SIZE = 1
MAX_OBSTACLE_SIZE = 5

# --- Simulation Settings ---
SIMULATION_SPEED = 0.5   # seconds between auto steps (for demo)
MAX_STEPS = 1000

# --- Cell Type Constants ---
CELL_EMPTY = 0
CELL_OBSTACLE = 1
CELL_SURVIVOR = 2
CELL_SCANNED = 3

# --- Pathfinding Settings ---
A_STAR_MAX_ITERATIONS = 5000  # prevent infinite loops on unsolvable grids

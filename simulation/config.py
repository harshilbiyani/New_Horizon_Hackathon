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

# --- 3D Navigation + Environment Profiles ---
DRONE_CLEARANCE_BUFFER_M = 3.0

# Existing map behavior is now profile-driven. Add 4 new environments
# on top of the original style to make total 5 selectable modes.
DEFAULT_ENVIRONMENT = "classic_field"
ENVIRONMENT_PROFILES = {
	"classic_field": {
		"label": "Classic Field",
		"dynamic": False,
		"obstacle_density": 0.15,
		"min_obstacle_size": 1,
		"max_obstacle_size": 5,
		"obstacle_height_m": (8.0, 22.0),
		"num_survivors": 10,
		"wind_base": 0.08,
		"wind_variation": 0.05,
		"visibility_base": 0.95,
		"visibility_variation": 0.02,
		"dynamic_hazard_cells": 0,
		"hazard_ceiling_m": 0.0,
		"hazard_refresh_steps": 12,
		"battery_multiplier": 1.0,
	},
	"urban_canyon": {
		"label": "Urban Canyon",
		"dynamic": True,
		"obstacle_density": 0.20,
		"min_obstacle_size": 2,
		"max_obstacle_size": 6,
		"obstacle_height_m": (20.0, 95.0),
		"num_survivors": 12,
		"wind_base": 0.25,
		"wind_variation": 0.35,
		"visibility_base": 0.86,
		"visibility_variation": 0.09,
		"dynamic_hazard_cells": 10,
		"hazard_ceiling_m": 45.0,
		"hazard_refresh_steps": 8,
		"battery_multiplier": 1.12,
	},
	"mountain_pass": {
		"label": "Mountain Pass",
		"dynamic": True,
		"obstacle_density": 0.18,
		"min_obstacle_size": 2,
		"max_obstacle_size": 7,
		"obstacle_height_m": (35.0, 120.0),
		"num_survivors": 9,
		"wind_base": 0.32,
		"wind_variation": 0.28,
		"visibility_base": 0.83,
		"visibility_variation": 0.08,
		"dynamic_hazard_cells": 12,
		"hazard_ceiling_m": 65.0,
		"hazard_refresh_steps": 6,
		"battery_multiplier": 1.18,
	},
	"coastal_storm": {
		"label": "Coastal Storm",
		"dynamic": True,
		"obstacle_density": 0.14,
		"min_obstacle_size": 1,
		"max_obstacle_size": 4,
		"obstacle_height_m": (10.0, 45.0),
		"num_survivors": 11,
		"wind_base": 0.45,
		"wind_variation": 0.40,
		"visibility_base": 0.76,
		"visibility_variation": 0.14,
		"dynamic_hazard_cells": 18,
		"hazard_ceiling_m": 55.0,
		"hazard_refresh_steps": 4,
		"battery_multiplier": 1.24,
	},
	"forest_canopy": {
		"label": "Forest Canopy",
		"dynamic": True,
		"obstacle_density": 0.23,
		"min_obstacle_size": 2,
		"max_obstacle_size": 5,
		"obstacle_height_m": (12.0, 55.0),
		"num_survivors": 13,
		"wind_base": 0.18,
		"wind_variation": 0.17,
		"visibility_base": 0.72,
		"visibility_variation": 0.10,
		"dynamic_hazard_cells": 8,
		"hazard_ceiling_m": 38.0,
		"hazard_refresh_steps": 7,
		"battery_multiplier": 1.09,
	},
}

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

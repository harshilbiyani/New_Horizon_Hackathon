/**
 * Helper utilities for querying the 2D worldMap occupancy grid
 */

const DEFAULT_CONFIG = {
  WORLD_BOUNDARY: 350,
  GRID_SIZE: 40,
};

/**
 * Convert continuous world coordinates (x, y) into grid indices (cellX, cellY)
 */
export function worldToCell(x, y, config = DEFAULT_CONFIG) {
  const boundary = config.WORLD_BOUNDARY || 350;
  const gridSize = config.GRID_SIZE || 40;

  const normX = (x + boundary) / (boundary * 2);
  const normY = (y + boundary) / (boundary * 2);

  const cellX = Math.min(gridSize - 1, Math.max(0, Math.floor(normX * gridSize)));
  const cellY = Math.min(gridSize - 1, Math.max(0, Math.floor(normY * gridSize)));

  return { cellX, cellY };
}

/**
 * Convert grid indices (cellX, cellY) back to world center coordinates (x, y)
 */
export function cellToWorld(cellX, cellY, config = DEFAULT_CONFIG) {
  const boundary = config.WORLD_BOUNDARY || 350;
  const gridSize = config.GRID_SIZE || 40;

  const step = (boundary * 2) / gridSize;
  const x = -boundary + (cellX + 0.5) * step;
  const y = -boundary + (cellY + 0.5) * step;

  return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
}

/**
 * Returns true if the specified world location is occupied by a building/obstacle
 */
export function isOccupied(x, y, worldMap, config = DEFAULT_CONFIG) {
  if (!worldMap || !Array.isArray(worldMap) || worldMap.length === 0) {
    return false;
  }

  const { cellX, cellY } = worldToCell(x, y, config);

  if (worldMap[cellX] && worldMap[cellX][cellY]) {
    return Boolean(worldMap[cellX][cellY].occupied);
  }

  return false;
}

/**
 * Returns the height of the terrain/obstacle at world position (x, y)
 */
export function getCellHeight(x, y, worldMap, config = DEFAULT_CONFIG) {
  if (!worldMap || !Array.isArray(worldMap) || worldMap.length === 0) {
    return 0;
  }

  const { cellX, cellY } = worldToCell(x, y, config);

  if (worldMap[cellX] && worldMap[cellX][cellY]) {
    return Number(worldMap[cellX][cellY].height || 0);
  }

  return 0;
}

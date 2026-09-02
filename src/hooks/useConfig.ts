import { useEffect, useState } from 'react';

export interface SimConfig {
  WORLD_BOUNDARY: number;
  GRID_SIZE: number;
  DETECTION_RADIUS: number;
  COMM_RANGE: number;
  TICK_MS: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  WORLD_BOUNDARY: 350,
  GRID_SIZE: 40,
  DETECTION_RADIUS: 35,
  COMM_RANGE: 90,
  TICK_MS: 700,
};

export function useConfig(): SimConfig {
  const [config, setConfig] = useState<SimConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    fetch('http://localhost:3001/api/config')
      .then((res) => {
        if (!res.ok) throw new Error('Config fetch failed');
        return res.json();
      })
      .then((data: SimConfig) => setConfig(data))
      .catch(() => {
        // Fallback to DEFAULT_CONFIG on error/offline
      });
  }, []);

  return config;
}

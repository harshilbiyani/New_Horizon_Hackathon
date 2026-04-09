export type DroneTask = 'exploring' | 'idle' | 'reassigned' | 'returning';
export type DroneStatus = 'active' | 'failed';

export interface TrailPoint {
  x: number;
  y: number;
}

export interface Drone {
  id: string;
  x: number;
  y: number;
  z: number;
  speed: number;
  heading: number;
  task: DroneTask;
  status: DroneStatus;
  battery: number;
  signalStrength: number;
  distanceTraveled: number;
  lastSeen: string;
  trail: TrailPoint[];
}

export interface Survivor {
  id: string;
  sourceId?: string;
  x: number;
  y: number;
  timestamp: string;
  confidence: number;
  droneId?: string;
}

export interface Alert {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'critical';
  timestamp: string;
}

export interface MissionData {
  coverage: number;
  scannedCells: number;
  totalCells: number;
  activeDrones: number;
  failedDrones: number;
  avgBattery: number;
  avgSignal: number;
  foundSurvivors: number;
  missionTimeSec: number;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  radius: number;
  severity: 'low' | 'medium' | 'high';
}

export interface HiddenSurvivor {
  id: string;
  x: number;
  y: number;
  severity: 'stable' | 'critical' | 'unknown';
}

export interface TelemetrySnapshot {
  timestamp: string;
  missionData: MissionData;
  drones: Drone[];
  foundSurvivors: Survivor[];
  alerts: Alert[];
  obstacles: Obstacle[];
  hiddenSurvivors: HiddenSurvivor[];
}

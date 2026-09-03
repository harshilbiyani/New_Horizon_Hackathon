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
  scannedCells: string[] | number;
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

export interface AiZone {
  zone: number;
  rank: number;
  label: string;
  score: number;
  centerGrid?: { x: number; y: number };
}

export interface AiAssignment {
  drone: string;
  taskId: string;
  zone: number;
  fitness: number;
  targetWorld?: { x: number; y: number };
}

export interface AiInsights {
  ok: boolean;
  source?: string;
  timestamp: string;
  health?: {
    total_drones: number;
    healthy: number;
    failed: number;
    health_pct: number;
  };
  missionStats?: {
    detections?: number;
    warnings?: number;
    alerts?: number;
  };
  topZones: AiZone[];
  assignments: AiAssignment[];
  commandSuggestions: string[];
}

export interface TelemetrySnapshot {
  timestamp: string;
  missionData: MissionData;
  drones: Drone[];
  foundSurvivors: Survivor[];
  alerts: Alert[];
  obstacles: Obstacle[];
  hiddenSurvivors: HiddenSurvivor[];
  zoneCoverage?: Record<string, number>;
  aiInsights?: AiInsights;
  meshLinks?: MeshLink[];
}

export type ZoneCoverage = Record<string, number>;

export interface MeshLink {
  from: string;
  to: string;
  distance: number;
  signal: number;
}

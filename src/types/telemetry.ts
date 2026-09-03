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
  gpsMode?: string;
  positionUncertainty?: number;
  relayPath?: string[];
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

// ─── VLM Person-Search Types ──────────────────────────────────────────────────

export interface Detection {
  id: string;
  drone_id: string;
  timestamp: string;
  image_path: string;
  lat: number;
  lon: number;
  altitude_m: number;
  heading_deg: number;
  confidence: number;
  similarity?: number; // only present in search results
  scene_label?: string;
  description?: string;
}

export interface VLMSearchResult {
  query: string;
  results: Detection[];
  total_indexed: number;
  searched_at: string;
}

export interface VLMHealth {
  ok: boolean;
  indexed: number;
  device: string;
  model: string;
}

// ─── Phase 2: Stream Types ────────────────────────────────────────────────────

export interface StreamStatus {
  running: boolean;
  source: string;
  frames_processed: number;
  fps_estimate: number;
  current_lat: number;
  current_lon: number;
  sample_interval_sec: number;
  drone_id: string;
  error: string | null;
}

export interface StreamEvent {
  type: 'frame_indexed' | 'error' | 'stopped';
  detection?: Detection;
  total: number;
  timestamp: string;
  message?: string;
}

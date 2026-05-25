/**
 * XAI (Explainable AI) Decision Panel Types
 * Defines structures for zone scoring, decision derivation, and reasoning
 */

export type ZoneId = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5' | 'Z6';
export type ZoneLabel = 'Alpha' | 'Bravo' | 'Charlie' | 'Delta' | 'Echo' | 'Foxtrot';
export type ExplorationMode = 'EXPLORE' | 'BALANCED' | 'EXPLOIT';

export interface Zone {
  id: ZoneId;
  label: ZoneLabel;
  col: number;
  row: number;
}

export interface FactorBreakdown {
  coverage: number;
  survivor: number;
  clearance: number;
  proximity: number;
}

export interface ZoneScore extends Zone {
  score: number;
  breakdown: FactorBreakdown;
  cx: number;
  cy: number;
}

export interface XAIDecision {
  assignedZone: ZoneScore;
  zoneScores: ZoneScore[];
  allScores: ZoneScore[];
  confidence: number;
  reasons: string[];
  detailedReasoning: string;
  epsilon: number;
  mode: ExplorationMode;
  topFactors: FactorBreakdown;
}

export interface XAIWorldState {
  mapWidth?: number;
  mapHeight?: number;
  tick?: number;
  survivors?: Array<{ x: number; y: number; discovered: boolean }>;
  obstacles?: Array<{ x: number; y: number; severity?: number }>;
  zoneCoverage?: Record<ZoneId, number>;
}

export interface XAIDroneState {
  id: string | number;
  x: number;
  y: number;
  battery: number;
  signal: number;
  speed?: number;
  heading?: number;
  status?: string;
  task?: string;
}

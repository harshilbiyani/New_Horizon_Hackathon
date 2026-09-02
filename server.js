import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ─── Config ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || 'python';
const SIM_SERVER_SCRIPT = path.join(process.cwd(), 'simulation', 'sim_server.py');
const AI_BRIDGE_SCRIPT = path.join(process.cwd(), 'simulation', 'ai_bridge.py');
const TICK_MS = 300;          // default tick rate (overridden per scenario)
const AI_INSIGHTS_TTL_MS = 2500;

// ─── Python bridge helper ───────────────────────────────────────────────────
function callPython(script, payload, timeoutMs = 3000) {
  try {
    const result = spawnSync(PYTHON_EXECUTABLE, [script], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      return { ok: false, error: result.stderr || result.error?.message || 'python error' };
    }
    return JSON.parse(result.stdout || '{}');
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── Simulation state (now driven by Python) ───────────────────────────────
let simulationRunning = false;
let startedAt = null;
let currentTickMs = TICK_MS;
let tickInterval = null;
let currentScenarioId = null;
let currentSeed = 42;

// Cached state (refreshed each tick from Python)
let lastSnapshot = null;
let aiInsightsCache = null;
let aiInsightsCacheAt = 0;

// ─── Initialize Python simulation ──────────────────────────────────────────
function pyInit(scenarioId = null, seed = 42) {
  const result = callPython(SIM_SERVER_SCRIPT, { action: 'snapshot' }, 5000);
  if (result.ok || result.step !== undefined) {
    lastSnapshot = result;
    console.log(`[Python sim] Initialized OK — step=${result.step ?? 0}`);
  } else {
    console.warn('[Python sim] Init warning:', result.error);
  }
}

function pySnapshot() {
  const result = callPython(SIM_SERVER_SCRIPT, { action: 'snapshot' }, 2000);
  if (result && !result.error) lastSnapshot = result;
  return lastSnapshot;
}

function pyStart(scenarioId, seed) {
  return callPython(SIM_SERVER_SCRIPT, { action: 'start', scenario_id: scenarioId, seed }, 3000);
}

function pyStop() {
  return callPython(SIM_SERVER_SCRIPT, { action: 'stop' }, 2000);
}

function pyReset(scenarioId, seed) {
  return callPython(SIM_SERVER_SCRIPT, { action: 'reset', scenario_id: scenarioId, seed }, 3000);
}

function pySetGpsDenied(enabled) {
  return callPython(SIM_SERVER_SCRIPT, { action: 'set_gps_denied', enabled }, 2000);
}

function pyGetScenarios() {
  const result = callPython(SIM_SERVER_SCRIPT, { action: 'scenarios' }, 3000);
  return result?.scenarios || [];
}

// ─── AI Insights ────────────────────────────────────────────────────────────
function getAiInsights(snapshot) {
  const now = Date.now();
  if (aiInsightsCache && now - aiInsightsCacheAt < AI_INSIGHTS_TTL_MS) {
    return aiInsightsCache;
  }
  const result = callPython(AI_BRIDGE_SCRIPT, snapshot, 1800);
  aiInsightsCache = result?.ok ? { ...result, source: 'python-ai-bridge' } : buildFallbackAiInsights(snapshot);
  aiInsightsCacheAt = now;
  return aiInsightsCache;
}

function buildFallbackAiInsights(snapshot) {
  const drones = snapshot?.drones || [];
  const active = drones.filter(d => d.status === 'active').length;
  const failed = drones.length - active;
  const avgBattery = drones.length ? drones.reduce((s, d) => s + (d.battery || 0), 0) / drones.length : 0;
  const suggestions = [];
  if (failed > 0) suggestions.push('RETURN_FAILED_UNITS');
  if (avgBattery < 28) suggestions.push('ROTATE_LOW_BATTERY_DRONES');
  if ((snapshot?.foundSurvivors?.length || 0) > 0) suggestions.push('PRIORITIZE_MEDICAL_EXTRACTION_ZONE');
  if (!suggestions.length) suggestions.push('CONTINUE_AUTONOMOUS_SWEEP');
  return {
    ok: true, source: 'node-fallback',
    health: { total_drones: drones.length, healthy: active, failed, health_pct: drones.length ? (active / drones.length * 100).toFixed(1) : 0 },
    missionStats: { detections: snapshot?.new_detections?.length || 0 },
    topZones: [],
    assignments: [],
    commandSuggestions: suggestions,
  };
}

// ─── Tick loop ───────────────────────────────────────────────────────────────
function startTick() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    if (!simulationRunning) return;
    const snapshot = pySnapshot();
    if (!snapshot) return;

    // Build enriched payload for frontend
    const payload = buildFrontendPayload(snapshot);
    io.emit('telemetrySnapshot', payload);
    io.emit('missionData', payload.missionData);
    io.emit('drones', payload.drones);
    io.emit('fogState', payload.fog);
    io.emit('lidarCloud', payload.lidar_cloud);
    io.emit('aiInsights', getAiInsights(snapshot));

    // Stop loop if Python sim finished
    if (snapshot.running === false) {
      simulationRunning = false;
      clearInterval(tickInterval);
      tickInterval = null;
      io.emit('missionComplete', { step: snapshot.step });
    }
  }, currentTickMs);
}

function stopTick() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

// ─── Passive state emitter (idle state) ─────────────────────────────────────
setInterval(() => {
  if (!simulationRunning) {
    const snapshot = lastSnapshot || {};
    const payload = buildFrontendPayload(snapshot);
    io.emit('telemetrySnapshot', payload);
    io.emit('fogState', payload.fog);
  }
}, 1500);

// ─── Payload builder ─────────────────────────────────────────────────────────
function buildFrontendPayload(snapshot) {
  const drones = (snapshot.drones || []).map(d => ({
    id: `DRN-${String((d.id ?? 0) + 1).padStart(3, '0')}`,
    // In GPS-denied mode show estimated position; otherwise true position
    x: snapshot.gps_denied ? (d.estimated_x ?? d.x ?? 0) : (d.x ?? 0),
    y: snapshot.gps_denied ? (d.estimated_y ?? d.y ?? 0) : (d.y ?? 0),
    z: d.z_altitude_m ?? 80,
    heading: d.heading_deg ?? 0,
    speed: 12,
    task: d.status === 'low_battery' ? 'returning' : (d.status ?? 'exploring'),
    status: d.battery <= 0 ? 'failed' : (d.status === 'low_battery' ? 'active' : (d.status ?? 'active')),
    battery: typeof d.battery === 'number'
      ? Math.round((d.battery / 50000) * 100)
      : (d.battery ?? 100),
    signalStrength: snapshot.gps_denied ? Math.max(20, 70 - (d.position_uncertainty ?? 0) * 5) : 92,
    // New fields for enhanced dashboard
    estimated_x: d.estimated_x ?? d.x ?? 0,
    estimated_y: d.estimated_y ?? d.y ?? 0,
    position_uncertainty: d.position_uncertainty ?? 0,
    gps_denied: snapshot.gps_denied ?? false,
    lidar_range: d.lidar_range ?? 8,
    lidar_known_obstacles: d.lidar_known_obstacles ?? 0,
    new_obstacles_discovered: d.new_obstacles_discovered ?? 0,
    last_lidar: d.last_lidar ?? null,
    apf_force: d.apf_force ?? null,
    trail: [],
    lastSeen: new Date().toISOString(),
    region: d.region ?? null,
  }));

  const mapState = snapshot.map || {};
  const obstacles = (mapState.obstacles || []).map((obs, i) => {
    const [x, y] = Array.isArray(obs) ? obs : [obs.x ?? 0, obs.y ?? 0];
    const height = mapState.obstacle_heights?.[y]?.[x] ?? 10;
    return {
      id: `OBS-${String(i + 1).padStart(3, '0')}`,
      x: (x / 50) * 280 - 140,
      y: (y / 50) * 280 - 140,
      radius: Math.max(5, height / 3),
      severity: height > 70 ? 'high' : height > 30 ? 'medium' : 'low',
      gridX: x, gridY: y,
    };
  });

  const hiddenSurvivors = (mapState.survivor_locations || []).map((s, i) => {
    const [x, y] = Array.isArray(s) ? s : [s.x ?? 0, s.y ?? 0];
    return { id: `HSV-${String(i + 1).padStart(3, '0')}`, x: (x / 50) * 280 - 140, y: (y / 50) * 280 - 140, severity: 'unknown' };
  });

  const foundSurvivors = (snapshot.new_detections || []).map((det, i) => ({
    id: `SURV-${i}-${Date.now()}`,
    sourceId: det.survivor_id,
    x: (det.x / 50) * 280 - 140,
    y: (det.y / 50) * 280 - 140,
    timestamp: new Date().toISOString(),
    confidence: det.confidence ?? 0.8,
    droneId: det.detected_by ?? 'D1',
  }));

  const fogState = snapshot.fog || {};
  const board = snapshot.mission_board || {};
  const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const fogStats = fogState.stats || {};

  const missionData = {
    coverage: fogStats.explored_pct ?? board.coverage_percent ?? 0,
    scannedCells: fogStats.scanned ?? board.scanned_cell_count ?? 0,
    totalCells: fogStats.total_cells ?? board.total_passable_cells ?? 2500,
    activeDrones: board.active_drones ?? drones.filter(d => d.status === 'active').length,
    failedDrones: board.low_battery_drones ?? 0,
    avgBattery: drones.length ? Math.round(drones.reduce((s, d) => s + d.battery, 0) / drones.length) : 0,
    avgSignal: drones.length ? Math.round(drones.reduce((s, d) => s + d.signalStrength, 0) / drones.length) : 0,
    foundSurvivors: board.survivors_found ?? 0,
    missionTimeSec: elapsed,
    gps_denied: snapshot.gps_denied ?? false,
    scenario: snapshot.scenario ?? null,
    triggeredEvents: snapshot.triggered_events ?? [],
    environment: snapshot.environment ?? {},
  };

  return {
    timestamp: new Date().toISOString(),
    simulationRunning,
    drones,
    obstacles,
    hiddenSurvivors,
    foundSurvivors,
    alerts: [],
    missionData,
    fog: fogState,
    lidar_cloud: snapshot.lidar_cloud ?? [],
    gps_denied: snapshot.gps_denied ?? false,
    scenario_id: currentScenarioId,
  };
}

// ─── Socket.IO ───────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  const snap = lastSnapshot || {};
  socket.emit('telemetrySnapshot', buildFrontendPayload(snap));
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// ─── REST API ─────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'droneshield', timestamp: new Date().toISOString() });
});

app.get('/api/mission/snapshot', (_req, res) => {
  const snap = pySnapshot();
  res.json(buildFrontendPayload(snap || {}));
});

app.get('/api/mission/status', (_req, res) => {
  res.json({ simulationRunning, scenario_id: currentScenarioId, seed: currentSeed });
});

app.get('/api/mission/ai-insights', (_req, res) => {
  const snap = lastSnapshot || {};
  res.json({ ...getAiInsights(snap), snapshotTimestamp: new Date().toISOString() });
});

// Get available scenarios
app.get('/api/scenarios', (_req, res) => {
  const scenarios = pyGetScenarios();
  res.json({ ok: true, scenarios });
});

// Configure simulation
app.post('/api/mission/configure', (req, res) => {
  if (simulationRunning) return res.status(400).json({ error: 'Stop simulation first.' });
  const { scenario_id, seed } = req.body;
  if (scenario_id) currentScenarioId = scenario_id;
  if (seed) currentSeed = Number(seed);
  res.json({ ok: true, scenario_id: currentScenarioId, seed: currentSeed });
});

// Start simulation
app.post('/api/mission/start', (req, res) => {
  if (simulationRunning) return res.status(400).json({ error: 'Already running' });
  const { scenario_id, seed } = req.body;
  if (scenario_id) currentScenarioId = scenario_id;
  if (seed) currentSeed = Number(seed);

  const result = pyStart(currentScenarioId, currentSeed);
  if (!result?.ok && result?.error) {
    return res.status(500).json({ error: result.error });
  }
  simulationRunning = true;
  startedAt = Date.now();
  startTick();
  console.log(`[Sim] STARTED — scenario=${currentScenarioId} seed=${currentSeed}`);
  res.json({ ok: true, message: 'Simulation started', scenario_id: currentScenarioId });
});

// Stop simulation
app.post('/api/mission/stop', (_req, res) => {
  simulationRunning = false;
  stopTick();
  pyStop();
  console.log('[Sim] STOPPED');
  res.json({ ok: true, message: 'Simulation stopped' });
});

// Reset simulation
app.post('/api/mission/reset', (req, res) => {
  const { scenario_id, seed } = req.body;
  if (scenario_id) currentScenarioId = scenario_id;
  if (seed) currentSeed = Number(seed);
  simulationRunning = false;
  stopTick();
  startedAt = null;
  pyReset(currentScenarioId, currentSeed);
  lastSnapshot = pySnapshot();
  console.log(`[Sim] RESET — scenario=${currentScenarioId}`);
  res.json({ ok: true, message: 'Simulation reset' });
});

// Toggle GPS-denied mode
app.post('/api/mission/gps-denied', (req, res) => {
  const { enabled } = req.body;
  const result = pySetGpsDenied(!!enabled);
  res.json({ ok: true, gps_denied: !!enabled, ...result });
});

// Map data (height map for 3D view)
app.get('/api/mission/map', (_req, res) => {
  const snap = lastSnapshot;
  const mapState = snap?.map || {};
  res.json({
    heightMap: mapState.obstacle_heights || [],
    rawSurvivors: (mapState.survivor_locations || []),
    gridSize: 50,
    worldBoundary: 140,
  });
});

// ─── Boot ────────────────────────────────────────────────────────────────────
pyInit();

server.listen(PORT, () => {
  console.log(`DroneShield Server running on port ${PORT}`);
  console.log(`Python simulation bridge: ${SIM_SERVER_SCRIPT}`);
  console.log(`Status: IDLE (POST /api/mission/start to begin)`);
});

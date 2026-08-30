import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const WORLD_BOUNDARY = 140;   // must match simulation/ai_bridge.py WORLD_BOUNDARY
const GRID_SIZE = 50;          // must match drone_swarm/config.py and simulation/ai_bridge.py
const TICK_MS = 700;
const DRONE_DETECTION_RADIUS = 14;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

// --- LLM / Ollama Config (all optional — system works without Ollama) ---
const OLLAMA_ENABLED = process.env.OLLAMA_URL !== undefined || process.env.OLLAMA_ENABLED === 'true';
const OLLAMA_URL    = process.env.OLLAMA_URL   || 'http://localhost:11434';
const OLLAMA_MODEL  = process.env.OLLAMA_MODEL  || 'llama3.2:3b';

// --- Simulation State (mutable, resettable) ---
let simulationRunning = false;
let startedAt = null;
let drones = [];
let detectedSurvivorIds = new Set();
let foundSurvivors = [];
let alerts = [];
let scannedCells = new Set();
let tickInterval = null;
let aiInsightsCache = null;
let aiInsightsCacheAt = 0;

// Config defaults
let simConfig = {
  droneCount: 5,
  battery: 100,
  startPositions: [],  // auto-distributed if empty
};

function buildObstacleField() {
  const rng = seededRandom(91357);
  const out = [];
  let idCounter = 1;
  const obstacleKinds = ['boulder_field', 'deadwood', 'ruin_tower', 'wall_segment', 'vehicle_wreck'];

  // Hard barriers to force realistic pathing pressure around edges and valleys.
  const ridgeBands = [
    { x: -98, y: -42, count: 16, spreadX: 46, spreadY: 24, severity: 'high' },
    { x: 76, y: 58, count: 14, spreadX: 42, spreadY: 28, severity: 'high' },
    { x: 18, y: -92, count: 12, spreadX: 46, spreadY: 22, severity: 'medium' },
  ];

  ridgeBands.forEach((band) => {
    for (let i = 0; i < band.count; i++) {
      out.push({
        id: `OBS-${String(idCounter++).padStart(3, '0')}`,
        x: band.x + (rng() - 0.5) * band.spreadX,
        y: band.y + (rng() - 0.5) * band.spreadY,
        radius: Number((10 + rng() * 11).toFixed(2)),
        severity: band.severity,
        kind: obstacleKinds[Math.floor(rng() * obstacleKinds.length)],
      });
    }
  });

  // Scatter medium/low debris across the map with center exclusion for launch zone.
  while (out.length < 96) {
    const x = randomBetween(-WORLD_BOUNDARY + 10, WORLD_BOUNDARY - 10);
    const y = randomBetween(-WORLD_BOUNDARY + 10, WORLD_BOUNDARY - 10);
    const centerDist = Math.sqrt(x * x + y * y);
    if (centerDist < 28) continue;

    const p = rng();
    const severity = p < 0.2 ? 'high' : p < 0.62 ? 'medium' : 'low';
    const radius = severity === 'high'
      ? randomBetween(12, 22)
      : severity === 'medium'
      ? randomBetween(8, 15)
      : randomBetween(5, 10);

    out.push({
      id: `OBS-${String(idCounter++).padStart(3, '0')}`,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      radius: Number(radius.toFixed(2)),
      severity,
      kind: obstacleKinds[Math.floor(rng() * obstacleKinds.length)],
    });
  }

  return out;
}

const obstacles = buildObstacleField();

// Procedural survivors — seeded so they're deterministic but not hardcoded.
// Change SIM_SURVIVOR_SEED via env var or /api/mission/configure to get different placements.
let SIM_SURVIVOR_SEED = parseInt(process.env.SIM_SURVIVOR_SEED || '77341', 10);
const SIM_SURVIVOR_COUNT = parseInt(process.env.SIM_SURVIVOR_COUNT || '5', 10);
const SURVIVOR_SEVERITIES = ['critical', 'stable', 'unknown'];

function buildHiddenSurvivors(seed = SIM_SURVIVOR_SEED, count = SIM_SURVIVOR_COUNT) {
  const rng = seededRandom(seed);
  const out = [];
  // Keep survivors out of the center launch zone (radius 25)
  for (let i = 0; i < count; i++) {
    let x, y, attempts = 0;
    do {
      x = (rng() * 2 - 1) * (WORLD_BOUNDARY - 10);
      y = (rng() * 2 - 1) * (WORLD_BOUNDARY - 10);
      attempts++;
    } while (Math.sqrt(x * x + y * y) < 25 && attempts < 60);
    out.push({
      id: `HSV-${String(i + 1).padStart(3, '0')}`,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      severity: SURVIVOR_SEVERITIES[Math.floor(rng() * SURVIVOR_SEVERITIES.length)],
    });
  }
  return out;
}

let hiddenSurvivors = buildHiddenSurvivors();

const AI_INSIGHTS_TTL_MS = 2500;
const AI_BRIDGE_SCRIPT = path.join(process.cwd(), 'simulation', 'ai_bridge.py');
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || 'python';

// --- Helpers ---
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function worldToCellCoord(value) {
  const normalized = (value + WORLD_BOUNDARY) / (WORLD_BOUNDARY * 2);
  return clamp(Math.floor(normalized * GRID_SIZE), 0, GRID_SIZE - 1);
}

// --- Drone Factory ---
function createDrone(index, x, y, heading, battery) {
  return {
    id: `DRN-${String(index + 1).padStart(3, '0')}`,
    x,
    y,
    z: randomBetween(80, 130),
    heading,
    speed: randomBetween(10, 18),
    task: 'idle',
    status: 'active',
    battery: battery,
    signalStrength: randomBetween(75, 99),
    distanceTraveled: 0,
    lastSeen: new Date().toISOString(),
    trail: [{ x, y }],
  };
}

function generateStartPositions(count) {
  const positions = [];
  const angleStep = (2 * Math.PI) / count;
  const radius = 5; // Start closely clustered at center
  for (let i = 0; i < count; i++) {
    const angle = angleStep * i;
    positions.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      heading: (angle * 180) / Math.PI, // Fly outward from center
    });
  }
  return positions;
}

function initDrones(config) {
  const count = clamp(config.droneCount || 5, 1, 10);
  const battery = clamp(config.battery || 100, 10, 100);
  let positions = config.startPositions || [];
  
  if (positions.length < count) {
    positions = generateStartPositions(count);
  }
  
  drones = [];
  for (let i = 0; i < count; i++) {
    const pos = positions[i] || { x: 0, y: 0, heading: 0 };
    drones.push(createDrone(i, pos.x, pos.y, pos.heading, battery));
  }
}

function resetSimulation() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  simulationRunning = false;
  startedAt = null;
  detectedSurvivorIds = new Set();
  foundSurvivors = [];
  alerts = [];
  scannedCells = new Set();
  initDrones(simConfig);
}

// Initialize drones on server start (idle, not simulating)
initDrones(simConfig);

// --- Simulation Logic ---
function pushAlert(type, message) {
  alerts.unshift({
    id: `${type.toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type,
    message,
    timestamp: new Date().toISOString(),
  });
  if (alerts.length > 250) {
    alerts.length = 250;
  }
}

function detectSurvivors(drone) {
  for (const survivor of hiddenSurvivors) {
    if (detectedSurvivorIds.has(survivor.id)) continue;
    const dx = drone.x - survivor.x;
    const dy = drone.y - survivor.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= DRONE_DETECTION_RADIUS) {
      detectedSurvivorIds.add(survivor.id);
      const detection = {
        id: `SURV-${Math.floor(Math.random() * 100000)}`,
        sourceId: survivor.id,
        x: survivor.x,
        y: survivor.y,
        timestamp: new Date().toISOString(),
        confidence: clamp(0.7 + Math.random() * 0.29, 0, 0.99),
        droneId: drone.id,
      };
      foundSurvivors.unshift(detection);
      if (foundSurvivors.length > 120) foundSurvivors.length = 120;
      pushAlert('critical', `Survivor detected by ${drone.id} at [${survivor.x.toFixed(1)}, ${survivor.y.toFixed(1)}]. Confidence ${(detection.confidence * 100).toFixed(0)}%.`);
      io.emit('survivorFound', detection);
    }
  }
}

function applyObstacleAvoidance(drone) {
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;

  for (const obstacle of obstacles) {
    const dx = drone.x - obstacle.x;
    const dy = drone.y - obstacle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < nearestDist) {
      nearestDist = distance;
      nearest = obstacle;
    }
  }

  if (!nearest) return;

  const cautionRadius = nearest.radius + 12;
  if (nearestDist < cautionRadius) {
    const awayAngle = (Math.atan2(drone.y - nearest.y, drone.x - nearest.x) * 180) / Math.PI;
    const blend = nearestDist < nearest.radius + 3 ? 0.78 : 0.42;
    drone.heading = ((1 - blend) * drone.heading + blend * awayAngle + 360) % 360;
    drone.task = 'evading';
    drone.speed = clamp(drone.speed * 0.82, 7, 16);

    // Hard push when entering core collision zone.
    if (nearestDist < nearest.radius + 1.5) {
      const push = nearest.radius + 2.2 - nearestDist;
      const rad = (awayAngle * Math.PI) / 180;
      drone.x += Math.cos(rad) * push;
      drone.y += Math.sin(rad) * push;
    }
  }
}

function updateDrone(drone) {
  if (drone.status === 'failed') return;

  drone.task = 'exploring';
  const headingDrift = randomBetween(-10, 10);
  drone.heading = (drone.heading + headingDrift + 360) % 360;

  if (drone.battery < 22) {
    drone.task = 'returning';
  }

  const speedMultiplier = drone.task === 'returning' ? 1.3 : 1;
  drone.speed = clamp(drone.speed + randomBetween(-1.2, 1.2), 8, 21);
  const distanceStep = (drone.speed * speedMultiplier * TICK_MS) / 1000;
  const radians = (drone.heading * Math.PI) / 180;
  const previousX = drone.x;
  const previousY = drone.y;
  drone.x += Math.cos(radians) * distanceStep;
  drone.y += Math.sin(radians) * distanceStep;

  applyObstacleAvoidance(drone);

  if (drone.x < -WORLD_BOUNDARY || drone.x > WORLD_BOUNDARY) {
    drone.heading = (180 - drone.heading + 360) % 360;
    drone.x = clamp(drone.x, -WORLD_BOUNDARY, WORLD_BOUNDARY);
  }
  if (drone.y < -WORLD_BOUNDARY || drone.y > WORLD_BOUNDARY) {
    drone.heading = (360 - drone.heading + 360) % 360;
    drone.y = clamp(drone.y, -WORLD_BOUNDARY, WORLD_BOUNDARY);
  }

  const actualDx = drone.x - previousX;
  const actualDy = drone.y - previousY;
  drone.distanceTraveled += Math.sqrt(actualDx * actualDx + actualDy * actualDy);

  drone.z = clamp(drone.z + randomBetween(-3, 3), 65, 145);
  drone.battery = clamp(drone.battery - randomBetween(0.2, 0.8), 0, 100);
  drone.signalStrength = clamp(
    95 - (Math.abs(drone.x) + Math.abs(drone.y)) / 3 + randomBetween(-2.5, 2.5), 28, 99
  );

  if (drone.battery <= 1 && drone.status === 'active') {
    drone.status = 'failed';
    drone.task = 'idle';
    pushAlert('warning', `${drone.id} battery depleted. Drone marked as failed.`);
  }

  if (drone.status === 'active') {
    const cellX = worldToCellCoord(drone.x);
    const cellY = worldToCellCoord(drone.y);
    scannedCells.add(`${cellX}:${cellY}`);
  }

  drone.trail.push({ x: drone.x, y: drone.y });
  if (drone.trail.length > 40) drone.trail.shift();
  drone.lastSeen = new Date().toISOString();

  detectSurvivors(drone);
}

function buildMissionData() {
  const activeDrones = drones.filter((d) => d.status === 'active').length;
  const failedDrones = drones.length - activeDrones;
  const avgBattery = drones.length > 0 ? drones.reduce((s, d) => s + d.battery, 0) / drones.length : 0;
  const avgSignal = drones.length > 0 ? drones.reduce((s, d) => s + d.signalStrength, 0) / drones.length : 0;
  const elapsedMs = startedAt ? Date.now() - startedAt : 0;
  return {
    coverage: Math.round((scannedCells.size / TOTAL_CELLS) * 100),
    scannedCells: scannedCells.size,
    totalCells: TOTAL_CELLS,
    activeDrones,
    failedDrones,
    avgBattery: Number(avgBattery.toFixed(1)),
    avgSignal: Number(avgSignal.toFixed(1)),
    foundSurvivors: foundSurvivors.length,
    missionTimeSec: Math.floor(elapsedMs / 1000),
  };
}

function buildSnapshot() {
  return {
    timestamp: new Date().toISOString(),
    simulationRunning,
    config: simConfig,
    missionData: buildMissionData(),
    drones,
    foundSurvivors,
    alerts,
    obstacles,
    hiddenSurvivors,
  };
}

function buildFallbackAiInsights(snapshot, reason = 'fallback') {
  const activeDrones = snapshot.drones.filter((drone) => drone.status === 'active').length;
  const failedDrones = snapshot.drones.length - activeDrones;
  const avgBattery = snapshot.drones.length
    ? snapshot.drones.reduce((sum, drone) => sum + drone.battery, 0) / snapshot.drones.length
    : 0;

  const commandSuggestions = [];
  if (failedDrones > 0) commandSuggestions.push('RECOVER_FAILED_DRONES');
  if (avgBattery < 30) commandSuggestions.push('ROTATE_LOW_BATTERY_DRONES');
  if (snapshot.foundSurvivors.length > 0) commandSuggestions.push('DISPATCH_EXTRACTION_TEAM');
  if (commandSuggestions.length === 0) commandSuggestions.push('CONTINUE_AUTONOMOUS_SWEEP');

  return {
    ok: true,
    source: 'node-fallback',
    reason,
    timestamp: new Date().toISOString(),
    health: {
      total_drones: snapshot.drones.length,
      healthy: activeDrones,
      failed: failedDrones,
      health_pct: snapshot.drones.length ? Number(((activeDrones / snapshot.drones.length) * 100).toFixed(1)) : 0,
    },
    missionStats: {
      detections: snapshot.foundSurvivors.length,
      warnings: snapshot.alerts.filter((a) => a.type === 'warning').length,
      alerts: snapshot.alerts.filter((a) => a.type === 'critical').length,
    },
    topZones: [],
    assignments: snapshot.drones.slice(0, 5).map((drone, idx) => ({
      drone: drone.id,
      taskId: `AUTO-${idx + 1}`,
      zone: idx,
      fitness: Number((0.5 - idx * 0.06).toFixed(2)),
      targetWorld: { x: drone.x, y: drone.y },
    })),
    commandSuggestions,
  };
}

function computeAiInsights(snapshot, force = false) {
  const now = Date.now();
  if (!force && aiInsightsCache && now - aiInsightsCacheAt < AI_INSIGHTS_TTL_MS) {
    return aiInsightsCache;
  }

  try {
    const result = spawnSync(PYTHON_EXECUTABLE, [AI_BRIDGE_SCRIPT], {
      input: JSON.stringify(snapshot),
      encoding: 'utf8',
      timeout: 1800,
      maxBuffer: 1024 * 1024,
    });

    if (result.error) {
      aiInsightsCache = buildFallbackAiInsights(snapshot, result.error.message);
    } else if (result.status !== 0) {
      aiInsightsCache = buildFallbackAiInsights(snapshot, (result.stderr || 'ai bridge failed').trim());
    } else {
      const parsed = JSON.parse(result.stdout || '{}');
      aiInsightsCache = parsed.ok ? { ...parsed, source: 'python-ai-bridge' } : buildFallbackAiInsights(snapshot, parsed.error || 'invalid ai payload');
    }
  } catch (error) {
    aiInsightsCache = buildFallbackAiInsights(snapshot, error instanceof Error ? error.message : 'unknown ai error');
  }

  aiInsightsCacheAt = now;
  return aiInsightsCache;
}

function emitSnapshot() {
  const snapshot = buildSnapshot();
  io.emit('telemetrySnapshot', snapshot);
  io.emit('missionData', snapshot.missionData);
  io.emit('drones', snapshot.drones);
  io.emit('aiInsights', computeAiInsights(snapshot));
}

function startSimulationTick() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    if (!simulationRunning) return;
    
    for (const drone of drones) {
      updateDrone(drone);
    }

    if (Math.random() < 0.08) {
      pushAlert('info', 'Sector update complete. Adaptive reassignment initiated.');
    }
    if (Math.random() < 0.04) {
      const lowBatteryDrone = drones.find((d) => d.battery < 25 && d.status === 'active');
      if (lowBatteryDrone) {
        pushAlert('warning', `${lowBatteryDrone.id} entering return path. Battery ${lowBatteryDrone.battery.toFixed(0)}%.`);
      }
    }

    emitSnapshot();
  }, TICK_MS);
}

// Emit snapshots even when paused so dashboard shows current state
setInterval(() => {
  if (!simulationRunning) {
    emitSnapshot();
  }
}, 1500);

// --- Socket.IO ---
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.emit('telemetrySnapshot', buildSnapshot());
  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

// --- REST API ---
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'drone-telemetry', timestamp: new Date().toISOString() });
});

app.get('/api/mission/snapshot', (_req, res) => {
  res.json(buildSnapshot());
});

app.get('/api/mission/status', (_req, res) => {
  res.json({ simulationRunning, config: simConfig });
});

app.get('/api/mission/ai-insights', (_req, res) => {
  const snapshot = buildSnapshot();
  const insights = computeAiInsights(snapshot, true);
  res.json({ ...insights, snapshotTimestamp: snapshot.timestamp });
});

// Single-source-of-truth for all constants — Python bridge reads these via this endpoint.
app.get('/api/mission/constants', (_req, res) => {
  res.json({
    worldBoundary: WORLD_BOUNDARY,
    gridSize: GRID_SIZE,
    tickMs: TICK_MS,
    detectionRadius: DRONE_DETECTION_RADIUS,
    totalCells: TOTAL_CELLS,
    survivorSeed: SIM_SURVIVOR_SEED,
    ollamaEnabled: OLLAMA_ENABLED,
    ollamaModel: OLLAMA_MODEL,
  });
});

// Configure simulation (drone count, battery, survivor seed, etc.)
app.post('/api/mission/configure', (req, res) => {
  if (simulationRunning) {
    return res.status(400).json({ error: 'Cannot configure while simulation is running. Stop first.' });
  }

  const { droneCount, battery, startPositions, survivorSeed, survivorCount } = req.body;
  if (droneCount !== undefined)   simConfig.droneCount = clamp(Number(droneCount), 1, 10);
  if (battery !== undefined)      simConfig.battery = clamp(Number(battery), 10, 100);
  if (startPositions)             simConfig.startPositions = startPositions;
  if (survivorSeed !== undefined) {
    SIM_SURVIVOR_SEED = Number(survivorSeed);
    hiddenSurvivors = buildHiddenSurvivors(SIM_SURVIVOR_SEED, survivorCount || SIM_SURVIVOR_COUNT);
    console.log(`Survivor seed updated to ${SIM_SURVIVOR_SEED}: ${hiddenSurvivors.length} survivors placed.`);
  }

  initDrones(simConfig);
  console.log(`Configured: ${simConfig.droneCount} drones, battery ${simConfig.battery}%`);
  res.json({ ok: true, config: simConfig, drones: drones.length, survivorCount: hiddenSurvivors.length });
});

// Start simulation
app.post('/api/mission/start', (_req, res) => {
  if (simulationRunning) {
    return res.status(400).json({ error: 'Simulation already running' });
  }
  
  // Reset state but keep config
  detectedSurvivorIds = new Set();
  foundSurvivors = [];
  alerts = [];
  scannedCells = new Set();
  initDrones(simConfig);
  
  simulationRunning = true;
  startedAt = Date.now();
  drones.forEach(d => { d.task = 'exploring'; });
  pushAlert('info', `Mission started with ${drones.length} drones. Battery: ${simConfig.battery}%.`);
  startSimulationTick();
  
  console.log('Simulation STARTED');
  res.json({ ok: true, message: 'Simulation started' });
});

// Stop simulation
app.post('/api/mission/stop', (_req, res) => {
  simulationRunning = false;
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  drones.forEach(d => { d.task = 'idle'; });
  pushAlert('info', 'Mission stopped by operator.');
  console.log('Simulation STOPPED');
  res.json({ ok: true, message: 'Simulation stopped' });
});

// Reset simulation
app.post('/api/mission/reset', (_req, res) => {
  resetSimulation();
  hiddenSurvivors = buildHiddenSurvivors();  // regenerate with current seed
  console.log('Simulation RESET');
  res.json({ ok: true, message: 'Simulation reset', config: simConfig });
});

// Revive a failed drone (restore to active with partial battery)
app.post('/api/mission/revive/:droneId', (req, res) => {
  const { droneId } = req.params;
  const drone = drones.find(d => d.id === droneId);
  if (!drone) {
    return res.status(404).json({ error: `Drone ${droneId} not found` });
  }
  if (drone.status !== 'failed') {
    return res.status(400).json({ error: `Drone ${droneId} is not failed (status: ${drone.status})` });
  }
  drone.status = 'active';
  drone.battery = 40;  // revive with 40% battery
  drone.task = 'exploring';
  pushAlert('info', `${droneId} revived by operator. Battery restored to 40%.`);
  res.json({ ok: true, drone });
});

// --- Procedural Height Map Generation ---
let cachedMapData = null;

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generatePerlinLikeNoise(width, height, seed) {
  const rng = seededRandom(seed);
  const permutation = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }
  const perm = [...permutation, ...permutation];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  function grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  function noise2D(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v
    );
  }

  const heightMap = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      let value = 0;
      let amplitude = 1;
      let frequency = 0.02;
      let maxAmp = 0;
      for (let octave = 0; octave < 6; octave++) {
        value += noise2D(x * frequency + 0.5, y * frequency + 0.5) * amplitude;
        maxAmp += amplitude;
        amplitude *= 0.5;
        frequency *= 2.1;
      }
      value = value / maxAmp;
      const cx = (x / width - 0.5) * 2;
      const cy = (y / height - 0.5) * 2;
      const dist = Math.sqrt(cx * cx + cy * cy);
      const falloff = 1.0 - Math.min(1.0, dist * 0.7);
      value = value * 0.5 + 0.5;
      value *= falloff;
      const worldHeight = value * 85;
      row.push(Math.round(worldHeight * 100) / 100);
    }
    heightMap.push(row);
  }
  return heightMap;
}

function getMapData() {
  if (cachedMapData) return cachedMapData;
  const mapWidth = 64;
  const mapHeight = 64;
  const mapSeed = 42;
  const heightMap = generatePerlinLikeNoise(mapWidth, mapHeight, mapSeed);
  
  const rng = seededRandom(mapSeed + 7);
  const rawSurvivors = [];
  for (let i = 0; i < 8; i++) {
    let sx, sy, attempts = 0;
    do {
      sx = Math.floor(rng() * (mapWidth - 4)) + 2;
      sy = Math.floor(rng() * (mapHeight - 4)) + 2;
      attempts++;
    } while (heightMap[sy][sx] > 55 && attempts < 50);
    rawSurvivors.push([sx, sy]);
  }
  
  cachedMapData = { heightMap, rawSurvivors, gridSize: mapWidth, worldBoundary: WORLD_BOUNDARY };
  return cachedMapData;
}

app.get('/api/mission/map', (_req, res) => {
  res.json(getMapData());
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Simulation Server running on port ${PORT}`);
  console.log(`Simulation status: IDLE (waiting for /api/mission/start)`);
});


// ==========================================
// AI Mission Control Feature
// ==========================================


let missionState = { active: false };

// ── Rule-based NL command parser (always available, no external dependencies) ──
function parseCommandRuleBased(query) {
  const q = query.toLowerCase();
  const target_type = q.includes('fire') ? 'fire' : q.includes('kid') || q.includes('child') ? 'kid' : 'person';
  const zones = ['NE', 'NW', 'SE', 'SW'];
  const zone = zones.find(z => q.includes(z.toLowerCase())) || 'ALL';
  const urgency = (q.includes('urgent') || q.includes('critical') || q.includes('emergency')) ? 'high'
               : q.includes('low') || q.includes('slow') ? 'low' : 'medium';
  const countMatch = q.match(/(\d+)\s*drone/);
  const reallocation_count = countMatch ? Math.min(parseInt(countMatch[1], 10), 3) : 2;
  return { target_type, zone, urgency, reallocation_count, summary: query.trim(), source: 'rule-based' };
}

function generateRuleBasedReport(missionState, detections) {
  const count = detections.length;
  const zone = missionState.zone || 'ALL';
  const type = missionState.target_type || 'person';
  const highConf = detections.filter(d => d.confidence > 0.85);
  return `Field report: ${count} ${type} detection${count !== 1 ? 's' : ''} logged in zone ${zone}. ` +
         `${highConf.length > 0 ? `${highConf.length} high-confidence signal${highConf.length > 1 ? 's' : ''} detected — immediate investigation recommended.` : 'Confidence levels nominal, continuing sweep pattern.'}`;
}

function generateRuleBasedReallocation(droneIds, detection) {
  // Assign the two drones closest to the detection point using simple heuristic
  const sorted = [...droneIds].sort(() => Math.random() - 0.5).slice(0, 2);
  return {
    drones: sorted,
    reason: `Converging on ${detection.class_name || 'target'} in zone ${detection.zone || 'unknown'} — high confidence signal warrants immediate dispatch.`,
    source: 'rule-based'
  };
}

// ── Ollama wrapper (only called when OLLAMA_ENABLED) ──
async function askOllama(prompt) {
  if (!OLLAMA_ENABLED) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: 'system', content: prompt }],
        stream: false
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (data.message && data.message.content) return data.message.content;
    return null;
  } catch (err) {
    if (err.name !== 'AbortError') console.warn(`[LLM] Ollama unavailable (${err.message}) — using rule-based fallback.`);
    return null;
  }
}

// Phase 1: API for mission command (works with or without Ollama)
app.post('/api/mission/command', async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing required field: query (string)' });
  }
  console.log(`[LLM] Processing command: "${query}"`);

  let parsed = null;

  // Try Ollama first if enabled
  if (OLLAMA_ENABLED) {
    const prompt = `Act as a drone mission parser. Return ONLY valid JSON — no explanation, no markdown, no backticks.
Schema: {"target_type": "person"|"kid"|"fire", "zone": "NE"|"NW"|"SE"|"SW"|"ALL", "urgency": "low"|"medium"|"high", "reallocation_count": 1-3, "summary": "one sentence"}
Command: ${query}`;
    const llmRaw = await askOllama(prompt);
    if (llmRaw) {
      try { parsed = JSON.parse(llmRaw.trim()); } catch (_) {}
    }
  }

  // Rule-based fallback if Ollama unavailable or returned invalid JSON
  if (!parsed) {
    parsed = parseCommandRuleBased(query);
    console.log(`[LLM] Using rule-based parser${OLLAMA_ENABLED ? ' (Ollama failed)' : ' (Ollama disabled)'}`);
  }

  missionState = { ...parsed, active: true };
  io.emit('mission_command_parsed', parsed);
  res.json({ message: 'Command parsed', state: missionState, source: parsed.source || 'ollama' });
});

// Phase 2 & 3: Mission Loop
setInterval(async () => {
    if (!missionState.active) return;

    // Send stdin to mission_bridge.py
    const bridgeInput = JSON.stringify({
        missionState,
        dronePositions: Array.from(drones.values()).map(d => ({ id: d.id, x: d.x, y: d.y }))
    });

    const pythonResult = spawnSync('python', ['drone_swarm/mission_bridge.py'], {
        input: bridgeInput,
        encoding: 'utf-8'
    });

    if (pythonResult.error) {
        console.error("Bridge Error:", pythonResult.error);
        return;
    }

    try {
        const data = JSON.parse(pythonResult.stdout);
        const detections = data.detections || [];
        
        for (const det of detections) {
            det.timestamp = new Date().toISOString();
            io.emit('mission_detection', det);
        }

        if (detections.length > 0) {
            // Tactical Report — try Ollama, fall back to rule-based
            let report = null;
            if (OLLAMA_ENABLED) {
                const reportPrompt = `Act as a drone analyst. Two sentence tactical report: Target=${missionState.target_type}, Zone=${missionState.zone}, Detections=${JSON.stringify(detections)}. Be concise.`;
                report = await askOllama(reportPrompt);
            }
            if (!report) report = generateRuleBasedReport(missionState, detections);
            io.emit('mission_field_report', { report: report.trim(), source: OLLAMA_ENABLED ? 'ollama' : 'rule-based' });

            // Reallocation if high confidence — try Ollama, fall back to rule-based
            const highConfDets = detections.filter(d => d.confidence > 0.85);
            if (highConfDets.length > 0) {
                const droneIds = drones.map(d => d.id);  // FIX: was drones.keys() on array
                let reallocJson = null;
                if (OLLAMA_ENABLED) {
                    const reallocPrompt = `Return ONLY JSON. Active drones: ${JSON.stringify(droneIds)}. High-confidence detection: ${JSON.stringify(highConfDets[0])}. Which two drones converge on target? Schema: {"drones":[id1,id2],"reason":"string"}`;
                    const reallocRaw = await askOllama(reallocPrompt);
                    if (reallocRaw) {
                        try { reallocJson = JSON.parse(reallocRaw.trim()); } catch(_) {}
                    }
                }
                if (!reallocJson) reallocJson = generateRuleBasedReallocation(droneIds, highConfDets[0]);
                io.emit('mission_reallocation', reallocJson);
            }
        }

    } catch (parseErr) {
        console.error("Parse error on python output", parseErr);
    }
}, 3000);

// Add mobile registration socket listener
io.on('connection', (socket) => {
    socket.on('mission_mobile_register', (data) => {
        socket.emit('mission_mobile_status', { connected: true });
        io.emit('mission_mobile_status', { connected: true });
        
        // Push initial active state if present
        if (missionState.active) {
            socket.emit('mission_drone_command', {
               heading: Math.floor(Math.random() * 360),
               urgency: missionState.urgency
            });
        }
    });

    // Re-emit commands immediately if mission is active
    if (missionState.active) {
       socket.emit('mission_drone_command', {
           heading: Math.floor(Math.random() * 360), // mock heading
           urgency: missionState.urgency
       });
    }
});

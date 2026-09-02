import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Shared Config (single source of truth: shared/simConfig.json) ──────────
const SIM_CONFIG = JSON.parse(
  readFileSync(path.join(__dirname, 'shared', 'simConfig.json'), 'utf8')
);

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

const WORLD_BOUNDARY = SIM_CONFIG.WORLD_BOUNDARY;
const GRID_SIZE = SIM_CONFIG.GRID_SIZE;
const TICK_MS = SIM_CONFIG.TICK_MS;
const DRONE_DETECTION_RADIUS = SIM_CONFIG.DETECTION_RADIUS;
const COMMUNICATION_RANGE = SIM_CONFIG.COMM_RANGE;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

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
        height: Number(randomBetween(150, 380).toFixed(2)), // Taller to match city
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
      height: Number(randomBetween(150, 380).toFixed(2)), // Taller to match city
      severity,
      kind: obstacleKinds[Math.floor(rng() * obstacleKinds.length)],
    });
  }

  return out;
}

let obstacles = buildObstacleField();

const hiddenSurvivors = [
  { id: 'HSV-001', x: -175, y: 49, severity: 'critical' },
  { id: 'HSV-002', x: 98, y: 161, severity: 'stable' },
  { id: 'HSV-003', x: 259, y: -91, severity: 'critical' },
  { id: 'HSV-004', x: -42, y: -266, severity: 'stable' },
  { id: 'HSV-005', x: 10, y: 7, severity: 'unknown' },
];

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
    z: randomBetween(60, 130),
    targetZ: randomBetween(60, 130),
    heading,
    targetHeading: heading,
    speed: randomBetween(35, 60),
    targetSpeed: randomBetween(35, 60),
    task: 'idle',
    status: 'active',
    battery: battery,
    signalStrength: randomBetween(75, 99),
    distanceTraveled: 0,
    lastSeen: new Date().toISOString(),
    trail: [{ x, y }],
    gpsMode: 'gps',
    positionUncertainty: 0,
    relayPath: null,
  };
}

function generateStartPositions(count) {
  const positions = [];
  const angleStep = (2 * Math.PI) / count;
  for (let i = 0; i < count; i++) {
    const angle = angleStep * i;
    // Spread drones randomly across the whole map instead of central cluster
    const radius = randomBetween(20, WORLD_BOUNDARY * 0.9); 
    positions.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      heading: (angle * 180) / Math.PI, 
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

// ═════════════════════════════════════════════════════════════════════════════
//  TICK LOOP — Three distinct, swappable stages
// ═════════════════════════════════════════════════════════════════════════════

// ─── STAGE 1: Decision Engine ─────────────────────────────────────────────────
//
// TODO(Person B): replace stubDecisionEngine with:
//   import { computeCommand } from './server/decisionEngine.js'
// once decisionEngine.test.js passes all fixtures.
// The swap is a single call-site change — nothing in applyActuation changes.
//
function stubDecisionEngine(drone) {
  let task = 'exploring';
  let targetHeading = (drone.targetHeading + randomBetween(-10, 10) + 360) % 360;
  let targetSpeed = clamp(drone.targetSpeed + randomBetween(-1.2, 1.2), 8, 21);
  let targetZ = clamp(drone.targetZ + randomBetween(-4, 4), 60, 130);

  if (drone.battery < 22) {
    task = 'returning';
  }

  // Obstacle avoidance — find nearest obstacle and steer away
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const obs of obstacles) {
    const dx = drone.x - obs.x;
    const dy = drone.y - obs.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < nearestDist) { nearestDist = dist; nearest = obs; }
  }

  let reason = task === 'returning' ? 'low-battery-rtb' : 'autonomous-sweep';

  if (nearest) {
    const cautionRadius = nearest.radius + 12;
    const clearanceZ = nearest.height + 25;

    if (nearestDist < cautionRadius && drone.z < clearanceZ) {
      const awayAngle = (Math.atan2(drone.y - nearest.y, drone.x - nearest.x) * 180) / Math.PI;
      const blend = nearestDist < nearest.radius + 3 ? 0.78 : 0.42;
      targetHeading = ((1 - blend) * targetHeading + blend * awayAngle + 360) % 360;
      targetSpeed = clamp(targetSpeed * 0.82, 7, 16);
      targetZ = Math.max(targetZ, clearanceZ + 5);
      task = 'evading';
      reason = 'obstacle-avoidance';
    }
  }

  return {
    droneId: drone.id,
    targetHeading,
    targetSpeed,
    targetZ,
    task,
    reason,
    priority: task === 'evading' ? 'high' : 'normal',
    issuedAt: new Date().toISOString(),
    issuedBy: 'stub',
  };
}

// ─── STAGE 2: Actuation Layer ─────────────────────────────────────────────────
// Pure physics — applies a Command and steps the drone's state forward one tick.
// No decisions made here; no obstacle arrays read here.
//
function applyActuation(drone, command) {
  drone.targetHeading = command.targetHeading ?? drone.targetHeading;
  drone.targetSpeed = command.targetSpeed ?? drone.targetSpeed;
  drone.targetZ = command.targetZ ?? drone.targetZ;
  drone.task = command.task ?? drone.task;

  const speedMultiplier = drone.task === 'returning' ? 1.3 : 1;

  // 1. Turn Rate Cap (max 25°/tick)
  let turnDiff = (drone.targetHeading - drone.heading + 360) % 360;
  if (turnDiff > 180) turnDiff -= 360;
  drone.heading = (drone.heading + clamp(turnDiff, -25, 25) + 360) % 360;

  // 2. Acceleration Cap (max 3.5 units/tick)
  drone.speed = clamp(drone.targetSpeed, drone.speed - 3.5, drone.speed + 3.5);

  // 3. Climb/Descent Rate Cap (max 12 units/tick)
  drone.z = clamp(drone.targetZ, drone.z - 12, drone.z + 12);

  // 4. Position advance
  const distanceStep = (drone.speed * speedMultiplier * TICK_MS) / 1000;
  const radians = (drone.heading * Math.PI) / 180;
  const previousX = drone.x;
  const previousY = drone.y;
  drone.x += Math.cos(radians) * distanceStep;
  drone.y += Math.sin(radians) * distanceStep;

  // 5. Boundary bounce
  if (drone.x < -WORLD_BOUNDARY || drone.x > WORLD_BOUNDARY) {
    drone.targetHeading = (180 - drone.heading + 360) % 360;
    drone.x = clamp(drone.x, -WORLD_BOUNDARY, WORLD_BOUNDARY);
  }
  if (drone.y < -WORLD_BOUNDARY || drone.y > WORLD_BOUNDARY) {
    drone.targetHeading = (360 - drone.heading + 360) % 360;
    drone.y = clamp(drone.y, -WORLD_BOUNDARY, WORLD_BOUNDARY);
  }

  // 6. Odometer
  const actualDx = drone.x - previousX;
  const actualDy = drone.y - previousY;
  drone.distanceTraveled += Math.sqrt(actualDx * actualDx + actualDy * actualDy);

  // 7. Battery drain
  drone.battery = clamp(drone.battery - randomBetween(0.2, 0.8), 0, 100);

  // 8. Signal degrade
  drone.signalStrength = clamp(
    95 - (Math.abs(drone.x) + Math.abs(drone.y)) / 3 + randomBetween(-2.5, 2.5),
    28, 99
  );

  // 9. GPS mode
  drone.gpsMode = drone.signalStrength > 40 ? 'gps' : 'dead-reckoning';
  drone.positionUncertainty = drone.signalStrength > 40 ? 0 :
    Number(((40 - drone.signalStrength) * 0.5).toFixed(1));

  // 10. Failure check
  if (drone.battery <= 1 && drone.status === 'active') {
    drone.status = 'failed';
    drone.task = 'idle';
    pushAlert('warning', `${drone.id} battery depleted. Drone marked as failed.`);
  }

  // 11. Coverage tracking
  if (drone.status === 'active') {
    scannedCells.add(`${worldToCellCoord(drone.x)}:${worldToCellCoord(drone.y)}`);
  }

  // 12. Trail
  drone.trail.push({ x: drone.x, y: drone.y });
  if (drone.trail.length > 40) drone.trail.shift();
  drone.lastSeen = new Date().toISOString();
}

// ─── STAGE 3A: Survivor Detection (pure — no global mutation) ─────────────────
function detectSurvivors(droneStates, survivors, alreadyDetectedIds) {
  const newDetections = [];
  for (const drone of droneStates) {
    if (drone.status !== 'active') continue;
    for (const survivor of survivors) {
      if (alreadyDetectedIds.has(survivor.id)) continue;
      const dx = drone.x - survivor.x;
      const dy = drone.y - survivor.y;
      if (Math.sqrt(dx * dx + dy * dy) <= DRONE_DETECTION_RADIUS) {
        alreadyDetectedIds.add(survivor.id);
        newDetections.push({
          id: `SURV-${Math.floor(Math.random() * 100000)}`,
          sourceId: survivor.id,
          x: survivor.x,
          y: survivor.y,
          timestamp: new Date().toISOString(),
          confidence: clamp(0.7 + Math.random() * 0.29, 0, 0.99),
          droneId: drone.id,
        });
      }
    }
  }
  return newDetections;
}

// ─── STAGE 3B: Mesh Links (pure) ─────────────────────────────────────────────
function buildMeshLinks(droneStates) {
  const links = [];
  for (let i = 0; i < droneStates.length; i++) {
    const a = droneStates[i];
    for (let j = i + 1; j < droneStates.length; j++) {
      const b = droneStates[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > COMMUNICATION_RANGE) continue;
      links.push({
        from: a.id,
        to: b.id,
        distance: Number(dist.toFixed(2)),
        signal: Number(Math.max(0.1, 1 - (dist / COMMUNICATION_RANGE) * 0.9).toFixed(2)),
      });
    }
  }
  return links;
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
    meshLinks: buildMeshLinks(drones),
  };
}

function startSimulationTick() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    if (!simulationRunning) return;

    // Per-drone: Decision → Actuation
    for (const drone of drones) {
      if (drone.status === 'failed') continue;
      const command = stubDecisionEngine(drone);   // STAGE 1
      applyActuation(drone, command);              // STAGE 2
    }

    // Per-tick: Detection
    const newDetections = detectSurvivors(drones, hiddenSurvivors, detectedSurvivorIds);
    for (const d of newDetections) {
      foundSurvivors.unshift(d);
      if (foundSurvivors.length > 120) foundSurvivors.length = 120;
      pushAlert(
        'critical',
        `Survivor detected by ${d.droneId} at [${d.x.toFixed(1)}, ${d.y.toFixed(1)}]. ` +
        `Confidence ${(d.confidence * 100).toFixed(0)}%.`
      );
      io.emit('survivorFound', d);
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
app.get('/api/config', (_req, res) => res.json(SIM_CONFIG));

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

// Configure simulation (drone count, battery, etc.)
app.post('/api/mission/configure', (req, res) => {
  if (simulationRunning) {
    return res.status(400).json({ error: 'Cannot configure while simulation is running. Stop first.' });
  }
  
  const { droneCount, battery, startPositions } = req.body;
  if (droneCount !== undefined) simConfig.droneCount = clamp(Number(droneCount), 1, 10);
  if (battery !== undefined) simConfig.battery = clamp(Number(battery), 10, 100);
  if (startPositions) simConfig.startPositions = startPositions;
  
  initDrones(simConfig);
  console.log(`Configured: ${simConfig.droneCount} drones, battery ${simConfig.battery}%`);
  res.json({ ok: true, config: simConfig, drones: drones.length });
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
  console.log('Simulation RESET');
  res.json({ ok: true, message: 'Simulation reset', config: simConfig });
});

// Dynamic Mesh Synchronization (Frontend sends physical GLB boundaries)
app.post('/api/mission/set-obstacles', (req, res) => {
  if (req.body && Array.isArray(req.body.obstacles)) {
    obstacles = req.body.obstacles;
    console.log(`[PHYSICS SYNC] Received ${obstacles.length} physical building collisions from the frontend scanner!`);
    res.json({ ok: true, count: obstacles.length });
  } else {
    res.status(400).json({ error: 'invalid format' });
  }
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

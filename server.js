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

const WORLD_BOUNDARY = 140;
const GRID_SIZE = 40;
const TICK_MS = 700;
const DRONE_DETECTION_RADIUS = 14;
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

const hiddenSurvivors = [
  { id: 'HSV-001', x: -50, y: 14, severity: 'critical' },
  { id: 'HSV-002', x: 28, y: 46, severity: 'stable' },
  { id: 'HSV-003', x: 74, y: -26, severity: 'critical' },
  { id: 'HSV-004', x: -12, y: -76, severity: 'stable' },
  { id: 'HSV-005', x: 3, y: 2, severity: 'unknown' },
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

async function askOllama(prompt) {
    try {
        const res = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'kimi-k2.5:cloud',
                messages: [{ role: 'system', content: prompt }],
                stream: false
            })
        });
        const data = await res.json();
        if (data.message && data.message.content) return data.message.content;
        console.error("Ollama error:", data);
        return '{"target_type":"person", "zone":"ALL", "urgency":"high", "reallocation_count": 3, "summary":"Fallback executed due to LLM error."}';
    } catch (err) {
        console.error("Ollama network error:", err.message);
        return '{"target_type":"person", "zone":"ALL", "urgency":"high", "reallocation_count": 3, "summary":"Fallback executed due to network error."}';
    }
}

// Phase 1: API for mission command
app.post('/api/mission/command', async (req, res) => {
    const { query } = req.body;
    console.log(`[LLM] Processing Command: ${query}`);
    const prompt = `Act as a drone mission parser. Return only valid JSON with no explanation, no markdown, and no backticks.
Schema:
{
  "target_type": "person", "kid", or "fire",
  "zone": "NE", "NW", "SE", "SW", or "ALL",
  "urgency": "low", "medium", or "high",
  "reallocation_count": number 1 to 3,
  "summary": "One sentence raw intent summary"
}
Command: ${query}`;

    const llmResponse = await askOllama(prompt);
    try {
        const parsed = JSON.parse(llmResponse.trim());
        missionState = { ...parsed, active: true };
        io.emit('mission_command_parsed', parsed);
        res.json({ message: "Command parsed", state: missionState });
    } catch (e) {
        res.status(500).json({ error: "Failed to parse LLM output", raw: llmResponse });
    }
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
            // Phase 3: Tactical Report
            const reportPrompt = `Act as a military drone analyst. Write a two sentence tactical field intelligence report based on: Target Type: ${missionState.target_type}, Priority Zone: ${missionState.zone}, Detections: ${JSON.stringify(detections)}. Be concise.`;
            const report = await askOllama(reportPrompt);
            if (report) {
                io.emit('mission_field_report', { report: report.trim() });
            }

            // Phase 3: Reallocation if high confidence
            const highConfDets = detections.filter(d => d.confidence > 0.85);
            if (highConfDets.length > 0) {
                const droneIds = Array.from(drones.keys());
                const reallocPrompt = `Return only JSON. Given active drones ${JSON.stringify(droneIds)} and high-confidence detection: ${JSON.stringify(highConfDets[0])}. Which two drones should converge on the target and a one sentence reason? Schema: {"drones": [id1, id2], "reason": "string"}`;
                const reallocRes = await askOllama(reallocPrompt);
                try {
                    const reallocJson = JSON.parse(reallocRes.trim());
                    io.emit('mission_reallocation', reallocJson);
                } catch(e) {}
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

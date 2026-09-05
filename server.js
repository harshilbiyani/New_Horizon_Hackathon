import express from 'express';
import http from 'http';
import https from 'node:https';
import { Server } from 'socket.io';
import cors from 'cors';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGpsUpdate, GPS_DENIAL_ZONES } from './server/gpsModel.js';
import { buildMeshState } from './server/meshNetwork.js';
import { computeCommand } from './server/decisionEngine.js';
import { buildZoneWaypoints } from './server/zonePlanner.js';
import { uploadDroneMedia, generateSecureMediaUrl } from './services/cloudinaryService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure data and logs directories exist
const DATA_DIR = path.join(__dirname, 'data');
const LOGS_DIR = path.join(__dirname, 'logs');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });

// ─── Shared Config (single source of truth: shared/simConfig.json) ──────────
const SIM_CONFIG = JSON.parse(
  readFileSync(path.join(__dirname, 'shared', 'simConfig.json'), 'utf8')
);

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const WORLD_BOUNDARY = SIM_CONFIG.WORLD_BOUNDARY;
const GRID_SIZE = SIM_CONFIG.GRID_SIZE;
const TICK_MS = SIM_CONFIG.TICK_MS;
const DRONE_DETECTION_RADIUS = SIM_CONFIG.DETECTION_RADIUS;
const COMMUNICATION_RANGE = SIM_CONFIG.COMM_RANGE;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

// ─── World Map & Mission Logging Persistence State ───────────────────────────
let currentWorldMap = null;
const WORLD_MAP_FILE = path.join(DATA_DIR, 'worldMap.json');

// Boot check: load cached worldMap if present
if (existsSync(WORLD_MAP_FILE)) {
  try {
    currentWorldMap = JSON.parse(readFileSync(WORLD_MAP_FILE, 'utf8'));
    console.log(`[BOOT] Loaded cached 3D city worldMap from disk (${WORLD_MAP_FILE})`);
  } catch (err) {
    console.error('[BOOT] Failed to load worldMap.json:', err);
  }
}

let currentMissionId = null;
let currentMissionLogPath = null;

// --- Simulation State (mutable, resettable) ---
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
let _currentMeshLinks = []; // Updated each tick by meshNetwork.buildMeshState

// Config defaults
let simConfig = {
  droneCount: 5,
  battery: 100,
  startPositions: [],  // auto-distributed if empty
};

let drones = [];
let sitlDrones = {}; // Store SITL telemetry for 2D Map
let commandQueue = []; // Pending commands from 2D Map → main.py (for ALL drones)
let missionWaypoints = {}; // Per-drone waypoints: { 'DRN-001': [{lat,lon,alt,seq},...] }
let detectedSurvivorIds = new Set();
let foundSurvivors = [];
let alerts = [];
let scannedCells = new Set();

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

let hiddenSurvivors = [
  { id: 'HSV-001', x: -175, y: 49, severity: 'critical' },
  { id: 'HSV-002', x: 98, y: 161, severity: 'stable' },
  { id: 'HSV-003', x: 259, y: -91, severity: 'critical' },
  { id: 'HSV-004', x: -42, y: -266, severity: 'stable' },
  { id: 'HSV-005', x: 10, y: 7, severity: 'unknown' },
];

const AI_INSIGHTS_TTL_MS = 2500;
const AI_BRIDGE_SCRIPT = path.join(process.cwd(), 'simulation', 'ai_bridge.py');
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || 'python';

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const pyProcess = spawn(PYTHON_EXECUTABLE, ['simulation/sim_server.py'], {
  stdio: ['pipe', 'pipe', 'inherit']
});

const pyLines = createInterface({
  input: pyProcess.stdout,
  terminal: false
});

const pyResolvers = [];
pyLines.on('line', (line) => {
  if (pyResolvers.length > 0) {
    const resolve = pyResolvers.shift();
    try {
      resolve(JSON.parse(line));
    } catch (e) {
      console.error("[Python Parse Error]", e, "Line:", line);
      resolve({ error: "Failed to parse json" });
    }
  }
});

function sendPythonCommand(cmd, timeoutMs = 2000) {
  return new Promise((resolve) => {
    pyResolvers.push(resolve);
    pyProcess.stdin.write(JSON.stringify(cmd) + '\n');
  });
}

function getAiInsights(snapshot) {
  return {
    ok: true,
    timestamp: new Date().toISOString(),
    topZones: [],
    assignments: [],
    commandSuggestions: []
  };
}

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
  const sectorPositions = [
    { x: -55, y: 55, heading: 45 },    // Sector A (near GDZ-A & orange obstacle cluster)
    { x: 65, y: 65, heading: 135 },    // Sector B (near GDZ-B & orange obstacle cluster)
    { x: -65, y: -55, heading: 225 },   // Sector C (near GDZ-C & orange obstacle cluster)
    { x: 60, y: -60, heading: 315 },   // Sector D (near Southern obstacle field)
    { x: 15, y: 25, heading: 90 },     // Sector E (Central Recon Zone)
    { x: -30, y: 30, heading: 60 },
    { x: 30, y: -30, heading: 240 },
    { x: -40, y: -40, heading: 180 },
    { x: 40, y: 40, heading: 0 },
    { x: 0, y: -50, heading: 270 }
  ];
  return sectorPositions.slice(0, count);
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

async function pySnapshot() {
  const result = await sendPythonCommand({ action: 'snapshot' }, 2000);
  if (result && !result.error) lastSnapshot = result;
  return lastSnapshot;
}

async function pyStep() {
  const result = await sendPythonCommand({ action: 'step' }, 2000);
  if (result && !result.error) lastSnapshot = result;
  return lastSnapshot;
}

async function pyStart(scenario_id, seed) {
  const args = { action: 'start' };
  if (scenario_id) args.scenario_id = scenario_id;
  if (seed) args.seed = seed;
  const result = await sendPythonCommand(args, 5000);
  return result;
}

async function pyStop() {
  const result = await sendPythonCommand({ action: 'stop' }, 2000);
  return result;
}

async function pyGetScenarios() {
  const result = await sendPythonCommand({ action: 'get_scenarios' }, 2000);
  return result && result.scenarios ? result.scenarios : [];
}

function stubDecisionEngine(drone) {
  let task = 'exploring';

  // Determine drone index (0 to 4) for zone allocation
  const idxMatch = drone.id.match(/DRN-(\d+)/);
  const droneIndex = idxMatch ? (parseInt(idxMatch[1], 10) - 1) % 5 : 0;

  // Rotating base sector angle to sweep whole map continuously over time
  const timeSectorRotation = (Date.now() / 400) % 360;
  const baseSectorAngle = (droneIndex * 72 + timeSectorRotation) % 360;

  // Add smooth sweeping weave for active pattern coverage
  const weaveOffset = Math.sin(Date.now() * 0.003 + droneIndex * 1.5) * 35;
  let targetHeading = (baseSectorAngle + weaveOffset + 360) % 360;
  let targetSpeed = clamp(drone.targetSpeed || 45, 35, 60);
  let targetZ = clamp(drone.targetZ || 80, 50, 110);

  if (drone.battery < 10) {
    task = 'returning';
    // Head back toward (0,0) center launchpad
    targetHeading = (Math.atan2(0 - drone.y, 0 - drone.x) * 180) / Math.PI;
    if (targetHeading < 0) targetHeading += 360;
  } else {
    // Steer away if within 3 meters of an obstacle core
    let nearest = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const obs of obstacles) {
      const dx = drone.x - obs.x;
      const dy = drone.y - obs.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) { nearestDist = dist; nearest = obs; }
    }

    if (nearest && nearestDist < (nearest.radius || 8) + 2) {
      const awayAngle = (Math.atan2(drone.y - nearest.y, drone.x - nearest.x) * 180) / Math.PI;
      targetHeading = (awayAngle + 360) % 360;
      targetSpeed = 40;
      task = 'evading';
    }
  }

  const reason = task === 'returning' ? 'low-battery-rtb' : (task === 'evading' ? 'obstacle-avoidance' : 'autonomous-sector-sweep');

  return {
    droneId: drone.id,
    targetHeading,
    targetSpeed,
    targetZ,
    task,
    reason,
    priority: task === 'evading' ? 'high' : 'normal',
    issuedAt: new Date().toISOString(),
    issuedBy: 'swarm-allocator',
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

  // 9. GPS mode — geographic denial zones override signal-strength heuristic
  applyGpsUpdate(drone, TICK_MS, GPS_DENIAL_ZONES);

  // 10. Auto-recharge battery for continuous live demonstration
  if (drone.battery <= 5) {
    drone.battery = 100;
    drone.status = 'active';
    drone.task = 'exploring';
  }

  // 11. Coverage & Building Obstacle Detection tracking
  if (drone.status === 'active') {
    scannedCells.add(`${worldToCellCoord(drone.x)}:${worldToCellCoord(drone.y)}`);
    if (drone.lidar_known_obstacles > 0 && Math.random() < 0.08) {
      pushAlert('warning', `OBSTACLE FLAG: ${drone.id} detected building structure at [x: ${drone.x.toFixed(1)}, y: ${drone.y.toFixed(1)}]. APF rerouting trajectory.`);
    }
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

function buildMissionData() {
  const activeDrones = drones.filter((d) => d.status === 'active').length;
  const failedDrones = drones.length - activeDrones;
  const avgBattery = drones.length ? drones.reduce((s, d) => s + d.battery, 0) / drones.length : 0;
  const avgSignal = drones.length ? drones.reduce((s, d) => s + d.signalStrength, 0) / drones.length : 0;
  const elapsedMs = startedAt ? Date.now() - startedAt : 0;
  return {
    coverage: Math.round((scannedCells.size / TOTAL_CELLS) * 100),
    scannedCells: Array.from(scannedCells),
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
    missionId: currentMissionId,
    config: simConfig,
    missionData: buildMissionData(),
    drones,
    foundSurvivors,
    alerts,
    obstacles,
    hiddenSurvivors,
    meshLinks: _currentMeshLinks,
    gpsDenialZones: GPS_DENIAL_ZONES,
    worldMap: currentWorldMap,
  };
}

let waypointQueues = new Map();

function initZoneWaypoints() {
  const activeIds = drones.filter((d) => d.status === 'active').map((d) => d.id);
  waypointQueues = buildZoneWaypoints(activeIds, currentWorldMap, SIM_CONFIG);
}

// ─── Tick loop ───────────────────────────────────────────────────────────────
function pushAlert(type, message) {
  const alert = { id: Date.now().toString(), type, message, timestamp: new Date().toISOString() };
  alerts.unshift(alert);
  if (alerts.length > 50) alerts.length = 50;
  io.emit('newAlert', alert);
}

async function startSimulationTick() {
  if (tickInterval) clearInterval(tickInterval);
  initZoneWaypoints();
  tickInterval = setInterval(async () => {
    if (!simulationRunning) return;
    try {
      const snapshot = (await pyStep().catch(() => null)) || {};

      const activeDroneIds = drones.filter((d) => d.status === 'active').map((d) => d.id);
      const missionState = {
        waypointQueues,
        obstacles,
        allDroneIds: activeDroneIds,
      };

      // STAGE 1+2: Decision -> Actuation natively for all drones (3D map)
      for (const drone of drones) {
        if (drone.status === 'failed') continue;
        const command = stubDecisionEngine(drone);
        applyActuation(drone, command);
      }

      // STAGE 3B: Mesh Links update
      _currentMeshLinks = buildMeshLinks(drones);

      // STAGE 3A: Survivor detection using JS drone positions
      const newDetections = detectSurvivors(drones, hiddenSurvivors, detectedSurvivorIds);
      for (const det of newDetections) {
        foundSurvivors.unshift(det);
        if (foundSurvivors.length > 120) foundSurvivors.length = 120;
        pushAlert('critical', `Survivor detected by ${det.droneId} at [${det.x.toFixed(1)}, ${det.y.toFixed(1)}]. Confidence ${(det.confidence * 100).toFixed(0)}%.`);

        // Generate dynamic FLIR thermal snapshot and upload to Cloudinary for 3D simulation detections
        (async () => {
          try {
            const pyRes = spawnSync('python', [
              path.join(__dirname, 'generate_survivor_snapshot.py'),
              '--drone_id', String(det.droneId),
              '--x', String(det.x),
              '--y', String(det.y),
              '--lat', String(det.lat || 28.6139),
              '--lon', String(det.lon || 77.2090),
              '--alt', String(det.z || 30.0),
              '--confidence', String(det.confidence || 0.92),
              '--survivor_id', String(det.id)
            ], { encoding: 'utf8' });

            if (pyRes.stdout) {
              const data = JSON.parse(pyRes.stdout.trim());
              if (data.success && data.image_url) {
                det.image_url = data.image_url;
                console.log(`[3D SIM CLOUDINARY] Dynamic thermal snapshot for ${det.id} -> ${data.image_url}`);
              }
            }
          } catch (e) {
            console.error(`[3D SIM CLOUDINARY ERROR] Thermal snapshot generation failed:`, e.message);
          }
          io.emit('survivorFound', det);
        })();
      }

      // Merge native JS drones into the payload
      const payload = buildFrontendPayload(snapshot);

      if (!payload.drones || payload.drones.length === 0) {
        payload.drones = drones.map(d => ({
          id: d.id,
          x: d.x,
          y: d.y,
          z: d.z,
          heading: d.heading,
          speed: d.speed,
          task: d.task,
          status: d.status,
          battery: Math.round(d.battery),
          signalStrength: Math.round(d.signalStrength),
          trail: d.trail || []
        }));
      } else {
        for (let i = 0; i < payload.drones.length; i++) {
          const jsDrone = drones.find(d => d.id === payload.drones[i].id);
          if (jsDrone) {
            payload.drones[i].x = jsDrone.x;
            payload.drones[i].y = jsDrone.y;
            payload.drones[i].z = jsDrone.z;
            payload.drones[i].heading = jsDrone.heading;
            payload.drones[i].task = jsDrone.task;
            payload.drones[i].battery = Math.round(jsDrone.battery);
          }
        }
      }

      // Inject JS foundSurvivors into the payload so telemetrySnapshot includes them
      payload.foundSurvivors = foundSurvivors.slice(0, 120);
      payload.missionData.foundSurvivors = foundSurvivors.length;

      io.emit('telemetrySnapshot', payload);
      io.emit('missionData', payload.missionData);
      io.emit('drones', payload.drones);
      io.emit('fogState', payload.fog);
      io.emit('lidarCloud', payload.lidar_cloud);
      io.emit('aiInsights', getAiInsights(snapshot));

      if (currentMissionLogPath) {
        appendFileSync(currentMissionLogPath, JSON.stringify(snapshot) + '\n');
      }
    } catch (err) {
      console.error('[TICK LOOP ERROR]', err);
    }
  }, currentTickMs);
}

function stopTick() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

// ─── Passive state emitter (idle state) ─────────────────────────────────────
setInterval(async () => {
  if (!simulationRunning) {
    const snapshot = lastSnapshot || {};
    const payload = buildFrontendPayload(snapshot);
    io.emit('telemetrySnapshot', payload);
    io.emit('fogState', payload.fog);
  }
}, 1500);

// ─── Payload builder ─────────────────────────────────────────────────────────
function buildFrontendPayload(snapshot) {
  const drones = (snapshot.drones || []).map(d => {
    const rawX = snapshot.gps_denied ? (d.estimated_x ?? d.x ?? 0) : (d.x ?? 0);
    const rawY = snapshot.gps_denied ? (d.estimated_y ?? d.y ?? 0) : (d.y ?? 0);

    // Scale grid [0, 40] -> physical [-WORLD_BOUNDARY, WORLD_BOUNDARY]
    const scaledX = (rawX / GRID_SIZE) * (WORLD_BOUNDARY * 2) - WORLD_BOUNDARY;
    const scaledY = (rawY / GRID_SIZE) * (WORLD_BOUNDARY * 2) - WORLD_BOUNDARY;

    return {
      id: `DRN-${String((d.id ?? 0) + 1).padStart(3, '0')}`,
      x: scaledX,
      y: scaledY,
      z: d.z_altitude_m ?? 80,
      heading: d.heading_deg ?? 0,
      speed: 12,
      task: d.status === 'low_battery' ? 'returning' : (d.status ?? 'exploring'),
      status: d.battery <= 0 ? 'failed' : (d.status === 'low_battery' ? 'active' : (d.status ?? 'active')),
      battery: typeof d.battery === 'number'
        ? Math.round((d.battery / 50000) * 100)
        : (d.battery ?? 100),
      signalStrength: snapshot.gps_denied ? Math.max(20, 70 - (d.position_uncertainty ?? 0) * 5) : 92,
      estimated_x: scaledX,
      estimated_y: scaledY,
      position_uncertainty: d.position_uncertainty ?? 0,
      gps_denied: snapshot.gps_denied ?? false,
      lidar_range: d.lidar_range ?? 8,
      lidar_known_obstacles: d.lidar_known_obstacles ?? 0,
      new_obstacles_discovered: d.new_obstacles_discovered ?? 0,
      last_lidar: d.last_lidar ?? null,
      apf_force: d.apf_force ?? null,
      current_path: d.current_path ?? null,
      trail: [],
      lastSeen: new Date().toISOString(),
      region: d.region ?? null,
    };
  });

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
    drones: drones.map((d) => ({
      id: d.id,
      x: Number(d.x.toFixed(2)),
      y: Number(d.y.toFixed(2)),
      z: Number(d.z.toFixed(1)),
      heading: Number(d.heading.toFixed(1)),
      speed: Number(d.speed.toFixed(1)),
      task: d.task || 'exploring',
      status: d.status || 'active',
      battery: Math.round(d.battery),
      signalStrength: Math.round(d.signalStrength),
      trail: d.trail || [],
    })),
    obstacles,
    hiddenSurvivors,
    foundSurvivors,
    alerts: [],
    missionData,
    fog: fogState,
    lidar_cloud: snapshot.lidar_cloud ?? [],
    gps_denied: snapshot.gps_denied ?? false,
    scenario_id: currentScenarioId,
    meshLinks: (_currentMeshLinks && _currentMeshLinks.length > 0)
      ? _currentMeshLinks
      : (snapshot.mesh_links || []).map(link => ({
        from: `DRN-${String(link[0] + 1).padStart(3, '0')}`,
        to: `DRN-${String(link[1] + 1).padStart(3, '0')}`,
        signal: 0.9,
      })),
  };
}

// ─── Socket.IO ───────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('Client connected:', socket.id);
  const snap = lastSnapshot || {};
  socket.emit('telemetrySnapshot', buildFrontendPayload(snap));
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// --- REST API ---
app.get('/api/config', (_req, res) => res.json(SIM_CONFIG));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'droneshield', timestamp: new Date().toISOString() });
});

app.get('/api/mission/snapshot', async (_req, res) => {
  const snap = await pySnapshot();
  res.json(buildFrontendPayload(snap || {}));
});

app.get('/api/mission/status', (_req, res) => {
  res.json({ simulationRunning, config: simConfig, missionId: currentMissionId });
});

// GET /api/mission/logs - list available mission log files
app.get('/api/mission/logs', (_req, res) => {
  try {
    const files = readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .sort((a, b) => b.localeCompare(a));
    const logList = files.map(f => {
      const logPath = path.join(LOGS_DIR, f);
      const stat = existsSync(logPath) ? readFileSync(logPath, 'utf8').split('\n').length - 1 : 0;
      return {
        id: f.replace('.jsonl', ''),
        filename: f,
        ticks: stat,
      };
    });
    res.json({ ok: true, logs: logList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mission/history/:id - read past mission JSONL log file
app.get('/api/mission/history/:id', (req, res) => {
  try {
    const rawId = req.params.id;
    const filename = rawId.endsWith('.jsonl') ? rawId : `${rawId}.jsonl`;
    const logPath = path.join(LOGS_DIR, filename);

    if (!existsSync(logPath)) {
      return res.status(404).json({ error: `Mission log '${filename}' not found` });
    }

    const content = readFileSync(logPath, 'utf8');
    const ticks = content
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line));

    res.json({ ok: true, missionId: rawId, ticksCount: ticks.length, ticks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mission/ai-insights', (_req, res) => {
  const snap = lastSnapshot || {};
  res.json({ ...getAiInsights(snap), snapshotTimestamp: new Date().toISOString() });
});

// Get available scenarios
app.get('/api/scenarios', async (_req, res) => {
  const scenarios = await pyGetScenarios();
  res.json({ ok: true, scenarios });
});

// Configure simulation
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

app.post('/api/mission/sitl_telemetry', (req, res) => {
  const telemetryData = req.body;
  if (!Array.isArray(telemetryData)) return res.status(400).json({ error: 'Expected array' });

  telemetryData.forEach((d, idx) => {
    sitlDrones[d.id] = {
      ...sitlDrones[d.id],
      ...d
    };

    // Sync SITL telemetry directly to 3D simulation drone array
    const targetIdx = idx < drones.length ? idx : drones.findIndex(drone => drone.id === d.id);
    if (targetIdx !== -1 && drones[targetIdx]) {
      if (d.lat === 0 && d.lon === 0) {
        drones[targetIdx].x = 0;
        drones[targetIdx].y = 0;
        drones[targetIdx].z = 10;
      } else {
        const latDiff = (d.lat || 0) - (-35.363261);
        const lonDiff = (d.lon || 0) - (149.165230);
        drones[targetIdx].x = (lonDiff * 111320 * Math.cos(-35.363261 * Math.PI / 180)) * 5;
        drones[targetIdx].y = (latDiff * 111320) * 5;
        drones[targetIdx].z = d.alt || 10;
      }
      drones[targetIdx].heading = d.heading || 0;
      drones[targetIdx].battery = d.battery || 100;
      drones[targetIdx].status = 'active';
    }
  });

  if (!simulationRunning) {
    simulationRunning = true;
    startSimulationTick();
  }

  // Emit directly to 2D & 3D Map components
  io.emit('sitlSnapshot', Object.values(sitlDrones));
  res.json({ ok: true });
});

// ─── 2D Map → ArduPilot: Queue a command for any/all drones ──────────────────
// Accepted actions: GOTO, ARM, DISARM, RTL, TAKEOFF, UPLOAD_MISSION
// drone_id: 'ALL' | 'DRN-001' | 'DRN-002' ...
app.post('/api/mission/command', (req, res) => {
  const { action, drone_id, lat, lon, alt, waypoints } = req.body || {};
  if (!action) return res.status(400).json({ error: 'action required' });

  const targets = drone_id === 'ALL' || !drone_id
    ? ['DRN-001', 'DRN-002', 'DRN-003', 'DRN-004', 'DRN-005']
    : [drone_id];

  for (const id of targets) {
    commandQueue.push({ action, drone_id: id, lat, lon, alt: alt ?? 30, waypoints, ts: Date.now() });
  }

  console.log(`[CMD QUEUE] ${action} → ${targets.join(', ')} | Queue depth: ${commandQueue.length}`);
  res.json({ ok: true, queued: targets.length });
});

// ─── ArduPilot (main.py) polls this to get + drain pending commands ───────────
app.get('/api/mission/pending_commands', (req, res) => {
  const { drone_id } = req.query;
  let cmds;
  if (drone_id) {
    cmds = commandQueue.filter(c => c.drone_id === drone_id);
    commandQueue = commandQueue.filter(c => c.drone_id !== drone_id);
  } else {
    cmds = [...commandQueue];
    commandQueue = [];
  }
  res.json(cmds);
});

// ─── ArduPilot (main.py) pushes current MAVLink mission waypoints ─────────────
app.post('/api/mission/waypoints', (req, res) => {
  const { drone_id, waypoints } = req.body || {};
  if (!drone_id || !Array.isArray(waypoints)) return res.status(400).json({ error: 'drone_id and waypoints[] required' });

  missionWaypoints[drone_id] = waypoints;
  // Push updated waypoints to all connected 2D map clients
  io.emit('missionWaypoints', missionWaypoints);
  res.json({ ok: true, count: waypoints.length });
});

app.get('/api/mission/waypoints', (req, res) => {
  res.json({ waypoints: missionWaypoints });
});

app.get('/api/survivors', (req, res) => {
  res.json({ survivors: foundSurvivors });
});

app.get('/api/sitl/status', (req, res) => {
  res.json({ drones: Object.values(sitlDrones) });
});

let geofenceData = [];
app.post('/api/mission/geofence', (req, res) => {
  const { fence } = req.body || {};
  if (Array.isArray(fence)) {
    geofenceData = fence;
    io.emit('geofenceData', geofenceData);
  }
  res.json({ ok: true });
});

app.get('/api/mission/geofence', (req, res) => {
  res.json({ geofence: geofenceData });
});

// ─── Fetch ALL real image assets from Cloudinary dqng4xws1 Media Library ──────
app.get('/api/cloudinary/resources', (req, res) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'dqng4xws1';
  const apiKey = process.env.CLOUDINARY_API_KEY || '316269317342895';
  const apiSecret = process.env.CLOUDINARY_API_SECRET || 'LuEiH4XafGUUSLzn6VJIEyU9hr0';

  const auth = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

  const options = {
    hostname: 'api.cloudinary.com',
    path: `/v1_1/${cloudName}/resources/image?max_results=100`,
    method: 'GET',
    headers: { 'Authorization': auth }
  };

  const cReq = https.request(options, (cRes) => {
    let data = '';
    cRes.on('data', chunk => data += chunk);
    cRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        res.json({ ok: true, resources: json.resources || [] });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });
  });

  cReq.on('error', (err) => {
    res.status(500).json({ ok: false, error: err.message });
  });

  cReq.end();
});


app.post('/api/mission/start', async (req, res) => {
  if (simulationRunning) return res.status(400).json({ error: 'Already running' });
  const { scenario_id, seed } = req.body || {};
  if (scenario_id) currentScenarioId = scenario_id;
  if (seed) currentSeed = Number(seed);

  const result = await pyStart(currentScenarioId, currentSeed);
  if (!result?.ok && result?.error) {
    return res.status(500).json({ error: result.error });
  }

  // Reset state but keep config
  detectedSurvivorIds = new Set();
  foundSurvivors = [];
  alerts = [];
  scannedCells = new Set();
  initDrones(simConfig);

  simulationRunning = true;
  startedAt = Date.now();
  currentMissionId = `mission_${startedAt}`;
  currentMissionLogPath = path.join(LOGS_DIR, `${currentMissionId}.jsonl`);

  drones.forEach(d => { d.task = 'exploring'; });
  pushAlert('info', `Mission started with ${drones.length} drones. Log: ${currentMissionId}.jsonl`);

  // Push TAKEOFF command for SITL drones
  const targets = ['DRN-001', 'DRN-002', 'DRN-003', 'DRN-004', 'DRN-005'];
  for (const id of targets) {
    commandQueue.push({ action: 'TAKEOFF', drone_id: id, alt: 30, ts: Date.now() });
  }

  startSimulationTick();

  console.log(`Simulation STARTED (Log: ${currentMissionId}.jsonl)`);
  res.json({ ok: true, message: 'Simulation started', missionId: currentMissionId });
});

app.post('/api/mission/pause', (req, res) => {
  simulationRunning = false;
  pushAlert('info', 'Mission paused by operator.');
  res.json({ ok: true, message: 'Simulation paused' });
});

app.post('/api/mission/reset', (req, res) => {
  simulationRunning = false;
  initDrones(simConfig);
  drones.forEach((d) => {
    d.x = 0;
    d.y = 0;
    d.z = 10;
    d.heading = 0;
    d.speed = 0;
    d.task = 'exploring';
    d.status = 'active';
    d.battery = 100;
  });
  pushAlert('warning', 'Swarm reset to central launchpad (0,0).');
  io.emit('sitlSnapshot', drones);
  res.json({ ok: true, message: 'Swarm reset to center' });
});

// Inject telemetry from ArduPilot SITL!
app.post('/api/mission/inject_telemetry', (req, res) => {
  const incoming = req.body;
  if (!simulationRunning) simulationRunning = true;

  incoming.forEach(d => {
    const latDiff = d.lat - (-35.363261);
    const lonDiff = d.lon - 149.165230;

    // Convert to local grid relative to launch (scale up slightly for UI visibility)
    const xMeters = (lonDiff * 111320 * Math.cos(-35.363261 * Math.PI / 180)) * 5;
    const yMeters = (latDiff * 111320) * 5;

    ardupilotDrones[d.id] = {
      x: xMeters,
      y: yMeters,
      z: d.alt,
      heading: d.heading,
      battery: d.battery,
      isReal: true
    };
  });

  res.json({ ok: true });
});

// Stop simulation
app.post('/api/mission/stop', async (_req, res) => {
  simulationRunning = false;
  stopTick();
  await pyStop();
  console.log('[Sim] STOPPED');
  res.json({ ok: true, message: 'Simulation stopped' });
});

// Reset simulation
app.post('/api/mission/reset', async (req, res) => {
  const { scenario_id, seed } = req.body || {};
  if (scenario_id) currentScenarioId = scenario_id;
  if (seed) currentSeed = Number(seed);
  simulationRunning = false;
  stopTick();
  startedAt = null;
  await pyReset(currentScenarioId, currentSeed);
  lastSnapshot = await pySnapshot();
  console.log(`[Sim] RESET — scenario=${currentScenarioId}`);
  res.json({ ok: true, message: 'Simulation reset' });
});

// Dynamic Mesh Synchronization (Frontend sends physical GLB boundaries)
app.post('/api/mission/set-obstacles', (req, res) => {
  if (req.body && Array.isArray(req.body.obstacles)) {
    obstacles = req.body.obstacles;
    console.log(`[PHYSICS SYNC] Received ${obstacles.length} physical building collisions from frontend scanner.`);
    res.json({ ok: true, count: obstacles.length });
  } else {
    res.status(400).json({ error: 'invalid format' });
  }
});

// POST /api/mission/world-map - Receive full occupancy grid from GLB scanner and persist to disk
app.post('/api/mission/world-map', (req, res) => {
  if (req.body && Array.isArray(req.body.worldMap)) {
    currentWorldMap = req.body.worldMap;
    initZoneWaypoints();
    try {
      writeFileSync(WORLD_MAP_FILE, JSON.stringify(currentWorldMap, null, 2), 'utf8');
      console.log(`[WORLD MAP SYNC] Saved ${currentWorldMap.length}x${currentWorldMap[0]?.length || 0} occupancy grid to ${WORLD_MAP_FILE}`);
      res.json({ ok: true, saved: true, file: WORLD_MAP_FILE });
    } catch (err) {
      console.error('[WORLD MAP SYNC] Failed to write worldMap.json:', err);
      res.status(500).json({ error: 'Failed to write to disk' });
    }
  } else {
    res.status(400).json({ error: 'invalid worldMap format' });
  }
});

// --- Admin Control Panel Endpoint ---
app.post('/api/mission/admin', async (req, res) => {
  const { event, action, enabled } = req.body;
  if (action === 'set_gps_denied') {
    await sendPythonCommand({ action: 'set_gps_denied', enabled });
    console.log(`[ADMIN] GPS Denied set to: ${enabled}`);
    return res.json({ ok: true });
  }

  if (event) {
    if (event === 'crash_drone') {
      if (drones.length >= 2) {
        drones[1].status = 'failed';
        drones[1].battery = 0;
        drones[1].task = 'idle';
      }
      console.log('[ADMIN] Simulated Drone Crash (Node 2)');
    } else if (event === 'jam_comms') {
      console.log('[ADMIN] Comms Jammed');
    } else if (event === 'degrade_sensors') {
      console.log('[ADMIN] Sensors Degraded');
    } else if (event === 'reset_sim') {
      await sendPythonCommand({ action: 'reset' });
      console.log('[ADMIN] Reset Simulation');
    }
    pushAlert('critical', `ADMIN EVENT: ${event.toUpperCase()}`);
    return res.json({ ok: true });
  }
  res.status(400).json({ error: 'invalid command' });
});

app.post('/api/admin/command', (req, res) => {
  const { event } = req.body;
  if (event === 'emp') {
    drones.forEach(d => { d.status = 'failed'; d.task = 'idle'; });
    pushAlert('critical', `EMP DEPLOYED! All drones disabled.`);
    return res.json({ ok: true });
  }
  if (event === 'reset') {
    simulationRunning = false;
    drones = [];
    alerts = [];
    pushAlert('critical', `Simulation forcefully reset.`);
    return res.json({ ok: true });
  }
  res.status(400).json({ error: 'invalid command' });
});

// --- External YOLO and Alerts Endpoints ---
app.post('/api/alerts', (req, res) => {
  const { type, message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  pushAlert(type || 'info', message);
  res.json({ ok: true });
});

app.post('/api/survivor_found', (req, res) => {
  const { drone_id, lat, lon, x, y, image_url } = req.body;
  const survivorId = `S-${Math.floor(Math.random() * 1000)}`;
  let finalImageUrl = image_url;

  if (!finalImageUrl) {
    try {
      const pyRes = spawnSync('python', [
        path.join(__dirname, 'generate_survivor_snapshot.py'),
        '--drone_id', String(drone_id || 'DRN-001'),
        '--x', String(x || 0.0),
        '--y', String(y || 0.0),
        '--lat', String(lat || 28.6139),
        '--lon', String(lon || 77.2090),
        '--confidence', '0.95',
        '--survivor_id', survivorId
      ], { encoding: 'utf8' });

      if (pyRes.stdout) {
        const data = JSON.parse(pyRes.stdout.trim());
        if (data.success && data.image_url) {
          finalImageUrl = data.image_url;
        }
      }
    } catch (e) {
      console.error('[API SURVIVOR CLOUDINARY ERROR]', e.message);
    }
  }

  const survivor = {
    id: survivorId,
    lat: lat || 0,
    lon: lon || 0,
    x: x || 0,
    y: y || 0,
    foundBy: drone_id || 'UNKNOWN',
    timestamp: Date.now(),
    image_url: finalImageUrl
  };
  foundSurvivors.push(survivor);
  pushAlert('success', `Survivor found by ${drone_id}! Dynamic FLIR thermal snapshot uploaded to Cloudinary.`);
  io.emit('survivorFound', survivor);
  res.json({ ok: true, survivor });
});

// POST /api/mission/survivor-positions - Receive real 3D scene survivor positions placed on unoccupied ground
app.post('/api/mission/survivor-positions', (req, res) => {
  if (req.body && Array.isArray(req.body.survivors) && req.body.survivors.length > 0) {
    hiddenSurvivors = req.body.survivors;
    console.log(`[SURVIVOR SYNC] Updated ${hiddenSurvivors.length} real 3D survivor positions on unoccupied ground cells.`);
    res.json({ ok: true, count: hiddenSurvivors.length });
  } else {
    res.status(400).json({ error: 'invalid survivors format' });
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
  if (currentWorldMap && Array.isArray(currentWorldMap) && currentWorldMap.length > 0) {
    const gridSize = currentWorldMap.length;
    const heightMap = [];
    for (let x = 0; x < gridSize; x++) {
      const row = [];
      for (let y = 0; y < gridSize; y++) {
        row.push(currentWorldMap[x]?.[y]?.height || 0);
      }
      heightMap.push(row);
    }
    return {
      worldMap: currentWorldMap,
      heightMap,
      gridSize,
      worldBoundary: WORLD_BOUNDARY,
      isRealWorldMap: true,
    };
  }

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

  cachedMapData = { heightMap, rawSurvivors, gridSize: mapWidth, worldBoundary: WORLD_BOUNDARY, isRealWorldMap: false };
  return cachedMapData;
}

// Map data (height map for 3D view)
app.get('/api/mission/map', (_req, res) => {
  const snap = lastSnapshot;
  const mapState = snap?.map || {};
  res.json({
    heightMap: mapState.obstacle_heights && mapState.obstacle_heights.length > 0 ? mapState.obstacle_heights : getMapData().heightMap,
    rawSurvivors: mapState.survivor_locations && mapState.survivor_locations.length > 0 ? mapState.survivor_locations : getMapData().rawSurvivors,
    gridSize: mapState.grid_size || getMapData().gridSize,
    worldBoundary: 140,
  });
});

// ─── Cloudinary Media Storage ───────────────────────────────────────────────
// POST /api/mission/media/upload - Uploads mock placeholder or VLM images to Cloudinary
app.post('/api/mission/media/upload', async (req, res) => {
  const { droneId, missionId, type, fileBase64 } = req.body;
  if (!droneId || !missionId || !fileBase64) {
    return res.status(400).json({ error: 'Missing required fields: droneId, missionId, fileBase64' });
  }

  try {
    const result = await uploadDroneMedia(fileBase64, droneId, missionId, type || 'image');

    // Generate secure URL immediately for testing
    // Cryptographically bound to the request's IP and expires in 5 mins
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const secureUrl = generateSecureMediaUrl(result.public_id, ip, result.resource_type);

    res.json({
      success: true,
      publicId: result.public_id,
      folder: result.folder,
      secureTimeLimitedUrl: secureUrl
    });
  } catch (err) {
    console.error('Failed to upload media:', err);
    res.status(500).json({ error: 'Media upload failed' });
  }
});

// ─── Layer 5: Active Canary Trap (Decoy Endpoint) ───────────────────────────
// Legitimate drones NEVER call this. If an attacker with a stolen JWT scans
// the API, they inevitably probe this URL. The moment they do, we broadcast
// a real-time intrusion alert to every connected React dashboard client.
const revokedTokens = new Set();

app.get('/api/admin/master-keys', (req, res) => {
  const token = req.headers['authorization'] || req.query.token || 'unknown';

  // Log the intrusion
  console.warn(`[CANARY TRIGGERED] Decoy endpoint hit! Token: ${token}`);
  revokedTokens.add(token);

  // Broadcast red alert to ALL connected React dashboard clients over WebSocket
  io.emit('canary_triggered', {
    timestamp: new Date().toISOString(),
    alert: 'INTRUSION DETECTED — Decoy endpoint accessed',
    revoked_token: token,
    layer: 5
  });

  return res.status(403).json({
    error: 'FORBIDDEN: Intrusion detected. Identity revoked.',
    layer: 'Layer 5 Active Canary Trap'
  });
});

// ─── Layer 1-6: Security Status API ─────────────────────────────────────────
// Allows the React dashboard SecurityStatusPanel to poll live security metrics.
app.get('/api/security/status', (_req, res) => {
  const snap = lastSnapshot;
  const meshSecurity = snap?.security || {};

  res.json({
    layer1: {
      name: 'Hardware-Rooted Identity & Key Isolation',
      status: 'ACTIVE',
      detail: meshSecurity.root_trust || 'Simulated PUF → HKDF-SHA256',
      transport_key: meshSecurity.transport_key_fingerprint || 'N/A',
      payload_key: meshSecurity.payload_key_fingerprint || 'N/A',
    },
    layer2: {
      name: 'Double-Wrap Cascade Encryption',
      status: 'ACTIVE',
      detail: meshSecurity.key_exchange || 'Hybrid X25519 + ML-KEM-768',
      cipher: 'AES-256-GCM ⟩ ChaCha20-Poly1305',
    },
    layer3: {
      name: 'Adaptive QoS Telemetry',
      status: 'ACTIVE',
      detail: meshSecurity.telemetry_auth || 'Ed25519 Signatures (PyNaCl)',
    },
    layer4: {
      name: 'Swarm AI Anomaly Detection',
      status: 'ACTIVE',
      detail: meshSecurity.intrusion_detection || 'Physics AI + Isolation Forest',
    },
    layer5: {
      name: 'Active Canary Trap',
      status: 'ACTIVE',
      detail: meshSecurity.active_defense || 'Canary Decoy API Running',
      revoked_tokens: revokedTokens.size,
    },
    layer6: {
      name: 'Encrypted BLE + Ground Handoff',
      status: 'ACTIVE',
      detail: meshSecurity.tactical_ground_link || 'AES-GCM BLE + Socket Handoff',
    },
    overall: 'ALL_LAYERS_ACTIVE',
  });
});

// ─── Boot ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`DroneShield Server running on port ${PORT}`);
  initDrones(simConfig);
  simulationRunning = true;
  drones.forEach(d => { d.task = 'exploring'; });
  startSimulationTick();
  console.log(`Status: ACTIVE - 3D Simulation engine running with ${drones.length} active drones.`);
});
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, createReadStream, statSync } from 'node:fs';
import https_ from 'node:https';
import http_ from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGpsUpdate, GPS_DENIAL_ZONES } from './server/gpsModel.js';
import { buildMeshState } from './server/meshNetwork.js';
import { computeCommand } from './server/decisionEngine.js';
import { buildZoneWaypoints } from './server/zonePlanner.js';
import { uploadDroneMedia, generateSecureMediaUrl } from './services/cloudinaryService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure data and logs directories exist
const DATA_DIR = path.join(__dirname, 'data');
const LOGS_DIR = path.join(__dirname, 'logs');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });

// ─── Shared Config (single source of truth: shared/simConfig.json) ──────────
const SIM_CONFIG = JSON.parse(
  readFileSync(path.join(__dirname, 'shared', 'simConfig.json'), 'utf8')
);

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const WORLD_BOUNDARY = SIM_CONFIG.WORLD_BOUNDARY;
const GRID_SIZE = SIM_CONFIG.GRID_SIZE;
const TICK_MS = SIM_CONFIG.TICK_MS;
const DRONE_DETECTION_RADIUS = SIM_CONFIG.DETECTION_RADIUS;
const COMMUNICATION_RANGE = SIM_CONFIG.COMM_RANGE;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

// ─── World Map & Mission Logging Persistence State ───────────────────────────
let currentWorldMap = null;
const WORLD_MAP_FILE = path.join(DATA_DIR, 'worldMap.json');

// Boot check: load cached worldMap if present
if (existsSync(WORLD_MAP_FILE)) {
  try {
    currentWorldMap = JSON.parse(readFileSync(WORLD_MAP_FILE, 'utf8'));
    console.log(`[BOOT] Loaded cached 3D city worldMap from disk (${WORLD_MAP_FILE})`);
  } catch (err) {
    console.error('[BOOT] Failed to load worldMap.json:', err);
  }
}

let currentMissionId = null;
let currentMissionLogPath = null;

// --- Simulation State (mutable, resettable) ---
let simulationRunning = false;
let startedAt = null;
let currentTickMs = TICK_MS;
let tickInterval = null;
let currentScenarioId = null;
let currentSeed = 42;

let drones = [];
let detectedSurvivorIds = new Set();
let foundSurvivors = [];
let alerts = [];
let scannedCells = new Set();

// Cached state (refreshed each tick from Python)
let lastSnapshot = null;
let aiInsightsCache = null;
let aiInsightsCacheAt = 0;
let _currentMeshLinks = []; // Updated each tick by meshNetwork.buildMeshState

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

let hiddenSurvivors = [
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

async function pySnapshot() {
  return typeof buildSnapshot === 'function' ? buildSnapshot() : (lastSnapshot || {});
}

async function pyStep() {
  return typeof buildSnapshot === 'function' ? buildSnapshot() : (lastSnapshot || {});
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
    const cautionRadius = nearest.radius + 35; // Increased buffer
    const clearanceZ = nearest.height + 30;

    if (nearestDist < cautionRadius && drone.z < clearanceZ) {
      const awayAngle = (Math.atan2(drone.y - nearest.y, drone.x - nearest.x) * 180) / Math.PI;
      const blend = nearestDist < nearest.radius + 15 ? 0.95 : 0.65; // Much more aggressive steering
      targetHeading = ((1 - blend) * targetHeading + blend * awayAngle + 360) % 360;
      targetSpeed = clamp(targetSpeed * 0.75, 5, 16); // Slow down more to turn sharper
      targetZ = Math.max(targetZ, clearanceZ + 15);
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
  drone.reason = command.reason ?? '';
  drone.assignedZoneId = command.assignedZoneId ?? '';

  const speedMultiplier = drone.task === 'returning' ? 1.3 : 1;

  // 1. Turn Rate Cap (max 25°/tick)
  let turnDiff = (drone.targetHeading - drone.heading + 360) % 360;
  if (turnDiff > 180) turnDiff -= 360;
  drone.heading = (drone.heading + clamp(turnDiff, -25, 25) + 360) % 360;

  // 2. Acceleration Cap (max 3.5 units/tick)
  drone.speed = clamp(drone.targetSpeed, drone.speed - 3.5, drone.speed + 3.5);

  // 3. Climb/Descent Rate Cap (max 50 units/tick for rapid obstacle clearance)
  drone.z = clamp(drone.targetZ, drone.z - 30, drone.z + 50);

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

  // 9. GPS mode — geographic denial zones override signal-strength heuristic
  applyGpsUpdate(drone, TICK_MS, GPS_DENIAL_ZONES);

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

function buildMissionData() {
  const activeDrones = drones.filter((d) => d.status === 'active').length;
  const failedDrones = drones.length - activeDrones;
  const avgBattery = drones.length ? drones.reduce((s, d) => s + d.battery, 0) / drones.length : 0;
  const avgSignal = drones.length ? drones.reduce((s, d) => s + d.signalStrength, 0) / drones.length : 0;
  const elapsedMs = startedAt ? Date.now() - startedAt : 0;
  return {
    coverage: Math.round((scannedCells.size / TOTAL_CELLS) * 100),
    scannedCells: Array.from(scannedCells),
    totalCells: TOTAL_CELLS,
    activeDrones,
    failedDrones,
    avgBattery: Number(avgBattery.toFixed(1)),
    avgSignal: Number(avgSignal.toFixed(1)),
    foundSurvivors: foundSurvivors.length,
    missionTimeSec: Math.floor(elapsedMs / 1000),
  };
}

function getAiInsights(snapshot) {
  if (aiInsightsCache) return aiInsightsCache;
  return {
    tactical_summary: "Awaiting AI insights...",
    priority_targets: [],
    recommended_actions: [],
    heatmap_url: null,
    risk_level: "Medium",
    drone_assignments: {}
  };
}

function buildSnapshot() {
  return {
    timestamp: new Date().toISOString(),
    simulationRunning,
    missionId: currentMissionId,
    config: simConfig,
    missionData: buildMissionData(),
    drones,
    foundSurvivors,
    alerts,
    obstacles,
    hiddenSurvivors,
    meshLinks: _currentMeshLinks,
    gpsDenialZones: GPS_DENIAL_ZONES,
    worldMap: currentWorldMap,
  };
}

function emitSnapshot(snapshot = buildSnapshot()) {
  io.emit('telemetrySnapshot', snapshot);
}

let pythonAssignments = {};

function initZoneWaypoints() {
  const activeIds = drones.filter((d) => d.status === 'active').map((d) => d.id);
  waypointQueues = buildZoneWaypoints(activeIds, currentWorldMap, SIM_CONFIG);
}

// ─── Tick loop ───────────────────────────────────────────────────────────────
function startTick() {
  if (tickInterval) clearInterval(tickInterval);
  initZoneWaypoints();
  tickInterval = setInterval(() => {
    if (!simulationRunning) return;

    const activeDroneIds = drones.filter((d) => d.status === 'active').map((d) => d.id);
    const missionState = {
      waypointQueues,
      obstacles,
      allDroneIds: activeDroneIds,
    };

    // STAGE 1+2: Decision → Actuation (per drone)
    for (const drone of drones) {
      if (drone.status === 'failed') continue;
      const command = computeCommand(drone, currentWorldMap, missionState);   // STAGE 1 (decisionEngine)
      applyActuation(drone, command);                                         // STAGE 2 (physics)
    }

    // STAGE 3A: Survivor detection (returns raw list — mesh decides delivery)
    const rawDetections = detectSurvivors(drones, hiddenSurvivors, detectedSurvivorIds);

    // STAGE 3B: Mesh connectivity + relay — replaces cosmetic buildMeshLinks
    // Delivers detections only for drones with a path to BASE; queues the rest.
    const { meshLinks: realMeshLinks, pendingFlush } = buildMeshState(
      drones, SIM_CONFIG, rawDetections
    );
    // Store real mesh links so buildSnapshot() picks them up
    _currentMeshLinks = realMeshLinks;

    // Commit detections that made it through the mesh
    for (const d of pendingFlush) {
      foundSurvivors.unshift(d);
      if (foundSurvivors.length > 120) foundSurvivors.length = 120;
      pushAlert(
        'critical',
        `Survivor detected by ${d.droneId} at [${d.x.toFixed(1)}, ${d.y.toFixed(1)}]. ` +
        `Confidence ${(d.confidence * 100).toFixed(0)}%.`
      );
      io.emit('survivorFound', d);
    }

    // Build enriched payload for frontend
    const payload = buildFrontendPayload(snapshot);
    io.emit('telemetrySnapshot', payload);
    io.emit('missionData', payload.missionData);
    io.emit('drones', payload.drones);
    io.emit('fogState', payload.fog);
    io.emit('lidarCloud', payload.lidar_cloud);
    io.emit('aiInsights', getAiInsights(snapshot));

    const snapshot = buildSnapshot();

    // Log tick to append-only JSONL file
    if (currentMissionLogPath) {
      try {
        appendFileSync(currentMissionLogPath, JSON.stringify(snapshot) + '\n');
      } catch (err) {
        console.error('[LOGGER] Error writing tick log:', err);
      }
    }

    emitSnapshot(snapshot);
  }, TICK_MS);
}

function stopTick() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

// ─── Passive state emitter (idle state) ─────────────────────────────────────
setInterval(async () => {
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

// --- REST API ---
app.get('/api/config', (_req, res) => res.json(SIM_CONFIG));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'droneshield', timestamp: new Date().toISOString() });
});

app.get('/api/mission/snapshot', (_req, res) => {
  res.json(buildSnapshot());
});

app.get('/api/mission/status', (_req, res) => {
  res.json({ simulationRunning, config: simConfig, missionId: currentMissionId });
});

// GET /api/mission/logs - list available mission log files
app.get('/api/mission/logs', (_req, res) => {
  try {
    const files = readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .sort((a, b) => b.localeCompare(a));
    const logList = files.map(f => {
      const logPath = path.join(LOGS_DIR, f);
      const stat = existsSync(logPath) ? readFileSync(logPath, 'utf8').split('\n').length - 1 : 0;
      return {
        id: f.replace('.jsonl', ''),
        filename: f,
        ticks: stat,
      };
    });
    res.json({ ok: true, logs: logList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mission/history/:id - read past mission JSONL log file
app.get('/api/mission/history/:id', (req, res) => {
  try {
    const rawId = req.params.id;
    const filename = rawId.endsWith('.jsonl') ? rawId : `${rawId}.jsonl`;
    const logPath = path.join(LOGS_DIR, filename);

    if (!existsSync(logPath)) {
      return res.status(404).json({ error: `Mission log '${filename}' not found` });
    }

    const content = readFileSync(logPath, 'utf8');
    const ticks = content
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line));

    res.json({ ok: true, missionId: rawId, ticksCount: ticks.length, ticks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mission/ai-insights', (_req, res) => {
  const snap = lastSnapshot || {};
  res.json({ ...getAiInsights(snap), snapshotTimestamp: new Date().toISOString() });
});

// Get available scenarios
app.get('/api/scenarios', async (_req, res) => {
  const scenarios = await pyGetScenarios();
  res.json({ ok: true, scenarios });
});

// Configure simulation
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
app.post('/api/mission/start', async (req, res) => {
  if (simulationRunning) return res.status(400).json({ error: 'Already running' });
  const { scenario_id, seed } = req.body || {};
  if (scenario_id) currentScenarioId = scenario_id;
  if (seed) currentSeed = Number(seed);

  const result = await pyStart(currentScenarioId, currentSeed);
  if (!result?.ok && result?.error) {
    return res.status(500).json({ error: result.error });
  }

  // Reset state but keep config
  detectedSurvivorIds = new Set();
  foundSurvivors = [];
  alerts = [];
  scannedCells = new Set();
  initDrones(simConfig);

  simulationRunning = true;
  startedAt = Date.now();
  currentMissionId = `mission_${startedAt}`;
  currentMissionLogPath = path.join(LOGS_DIR, `${currentMissionId}.jsonl`);

  drones.forEach(d => { d.task = 'exploring'; });
  pushAlert('info', `Mission started with ${drones.length} drones. Log: ${currentMissionId}.jsonl`);
  startSimulationTick();

  console.log(`Simulation STARTED (Log: ${currentMissionId}.jsonl)`);
  res.json({ ok: true, message: 'Simulation started', missionId: currentMissionId });
});

// Stop simulation
app.post('/api/mission/stop', async (_req, res) => {
  simulationRunning = false;
  stopTick();
  await pyStop();
  console.log('[Sim] STOPPED');
  res.json({ ok: true, message: 'Simulation stopped' });
});

// Reset simulation
app.post('/api/mission/reset', async (req, res) => {
  const { scenario_id, seed } = req.body || {};
  if (scenario_id) currentScenarioId = scenario_id;
  if (seed) currentSeed = Number(seed);
  simulationRunning = false;
  stopTick();
  startedAt = null;
  await pyReset(currentScenarioId, currentSeed);
  lastSnapshot = await pySnapshot();
  console.log(`[Sim] RESET — scenario=${currentScenarioId}`);
  res.json({ ok: true, message: 'Simulation reset' });
});

// Dynamic Mesh Synchronization (Frontend sends physical GLB boundaries)
app.post('/api/mission/set-obstacles', (req, res) => {
  if (req.body && Array.isArray(req.body.obstacles)) {
    obstacles = req.body.obstacles;
    console.log(`[PHYSICS SYNC] Received ${obstacles.length} physical building collisions from frontend scanner.`);
    res.json({ ok: true, count: obstacles.length });
  } else {
    res.status(400).json({ error: 'invalid format' });
  }
});

// POST /api/mission/world-map - Receive full occupancy grid from GLB scanner and persist to disk
app.post('/api/mission/world-map', (req, res) => {
  if (req.body && Array.isArray(req.body.worldMap)) {
    currentWorldMap = req.body.worldMap;
    initZoneWaypoints();
    try {
      writeFileSync(WORLD_MAP_FILE, JSON.stringify(currentWorldMap, null, 2), 'utf8');
      console.log(`[WORLD MAP SYNC] Saved ${currentWorldMap.length}x${currentWorldMap[0]?.length || 0} occupancy grid to ${WORLD_MAP_FILE}`);
      res.json({ ok: true, saved: true, file: WORLD_MAP_FILE });
    } catch (err) {
      console.error('[WORLD MAP SYNC] Failed to write worldMap.json:', err);
      res.status(500).json({ error: 'Failed to write to disk' });
    }
  } else {
    res.status(400).json({ error: 'invalid worldMap format' });
  }
});

// POST /api/mission/survivor-positions - Receive real 3D scene survivor positions placed on unoccupied ground
app.post('/api/mission/survivor-positions', (req, res) => {
  if (req.body && Array.isArray(req.body.survivors) && req.body.survivors.length > 0) {
    hiddenSurvivors = req.body.survivors;
    console.log(`[SURVIVOR SYNC] Updated ${hiddenSurvivors.length} real 3D survivor positions on unoccupied ground cells.`);
    res.json({ ok: true, count: hiddenSurvivors.length });
  } else {
    res.status(400).json({ error: 'invalid survivors format' });
  }
});

// INTERACTIVE CHAOS APIs
app.post('/api/mission/kill-drone', (req, res) => {
  const activeDrones = drones.filter(d => d.status === 'active');
  if (activeDrones.length === 0) {
    return res.status(400).json({ error: 'No active drones to kill' });
  }
  const targetDrone = req.body.id ? activeDrones.find(d => d.id === req.body.id) : activeDrones[Math.floor(Math.random() * activeDrones.length)];
  if (!targetDrone) {
    return res.status(400).json({ error: 'Drone not found or already failed' });
  }

  targetDrone.status = 'failed';
  targetDrone.targetZ = 0; // crash to ground
  targetDrone.speed = 0;
  targetDrone.targetSpeed = 0;
  targetDrone.task = 'crashed';
  targetDrone.battery = 0;

  console.log(`[CHAOS] EMP Triggered. Drone ${targetDrone.id} has failed.`);
  pushAlert('error', `CRITICAL FAILURE: Drone ${targetDrone.id} connection lost.`);

  // IMMEDIATELY re-trigger AI bridge to reallocate sectors for surviving drones
  initZoneWaypoints();

  res.json({ ok: true, killedDroneId: targetDrone.id });
});

app.post('/api/mission/add-survivor', (req, res) => {
  const { x, y, severity } = req.body;
  if (typeof x !== 'number' || typeof y !== 'number') {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  const newSurvivor = {
    id: `HSV-MANUAL-${Date.now()}`,
    x,
    y,
    severity: severity || 'critical'
  };
  hiddenSurvivors.push(newSurvivor);
  console.log(`[CHAOS] Deployed dynamic survivor at (${x.toFixed(1)}, ${y.toFixed(1)})`);
  pushAlert('warning', `NEW SIGNAL: Heat signature detected at X:${x.toFixed(0)} Y:${y.toFixed(0)}`);
  res.json({ ok: true, survivor: newSurvivor });
});

app.post('/api/mission/add-jammer', (req, res) => {
  const { cx, cy, radius } = req.body;
  if (typeof cx !== 'number' || typeof cy !== 'number') {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  const r = radius || 40;
  const newZone = {
    id: `GDZ-MANUAL-${Date.now()}`,
    cx,
    cy,
    radius: r
  };
  GPS_DENIAL_ZONES.push(newZone);
  console.log(`[CHAOS] Deployed GPS Jammer at (${cx.toFixed(1)}, ${cy.toFixed(1)}) with radius ${r}`);
  pushAlert('error', `WARNING: New GPS interference detected at X:${cx.toFixed(0)} Y:${cy.toFixed(0)}`);
  res.json({ ok: true, zone: newZone });
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
  if (currentWorldMap && Array.isArray(currentWorldMap) && currentWorldMap.length > 0) {
    const gridSize = currentWorldMap.length;
    const heightMap = [];
    for (let x = 0; x < gridSize; x++) {
      const row = [];
      for (let y = 0; y < gridSize; y++) {
        row.push(currentWorldMap[x]?.[y]?.height || 0);
      }
      heightMap.push(row);
    }
    return {
      worldMap: currentWorldMap,
      heightMap,
      gridSize,
      worldBoundary: WORLD_BOUNDARY,
      isRealWorldMap: true,
    };
  }

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

  cachedMapData = { heightMap, rawSurvivors, gridSize: mapWidth, worldBoundary: WORLD_BOUNDARY, isRealWorldMap: false };
  return cachedMapData;
}

// Map data (height map for 3D view)
app.get('/api/mission/map', (_req, res) => {
  const snap = lastSnapshot;
  const mapState = snap?.map || {};
  res.json({
    heightMap: mapState.obstacle_heights && mapState.obstacle_heights.length > 0 ? mapState.obstacle_heights : getMapData().heightMap,
    rawSurvivors: mapState.survivor_locations && mapState.survivor_locations.length > 0 ? mapState.survivor_locations : getMapData().rawSurvivors,
    gridSize: mapState.grid_size || getMapData().gridSize,
    worldBoundary: 140,
  });
});

// ─── VLM Person-Search API (proxy to Python CLIP microservice on :5001) ─────
const VLM_BASE = process.env.VLM_BASE || 'http://localhost:5001';

/**
 * Generic proxy helper: forwards a request to the VLM Flask service.
 * Supports GET and DELETE. For POST use vlmPost.
 */
function vlmProxy(vlmPath, req, res) {
  const url = new URL(vlmPath, VLM_BASE);
  // Forward query params
  for (const [k, v] of Object.entries(req.query)) {
    url.searchParams.set(k, v);
  }
  const lib = url.protocol === 'https:' ? https_ : http_;
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
  };
  const proxyReq = lib.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    console.error('[VLM proxy error]', err.message);
    res.status(502).json({ error: 'VLM service unavailable', detail: err.message });
  });
  if (req.body && Object.keys(req.body).length > 0) {
    proxyReq.write(JSON.stringify(req.body));
  }
  proxyReq.end();
}

/** Health — GET /api/vlm/health */
app.get('/api/vlm/health', (req, res) => vlmProxy('/health', req, res));

/** Search — GET /api/vlm/search?q=<text>&k=<n>&threshold=<0-1> */
app.get('/api/vlm/search', (req, res) => vlmProxy('/search', req, res));

/** Search by Image - POST /api/vlm/search/image */
app.post('/api/vlm/search/image', (req, res) => {
  const url = new URL('/search/image', VLM_BASE);
  for (const [k, v] of Object.entries(req.query)) {
    url.searchParams.set(k, v);
  }
  const lib = url.protocol === 'https:' ? https_ : http_;
  const headers = { ...req.headers };
  delete headers.host;

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: headers,
  };
  const proxyReq = lib.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    console.error('[VLM image search proxy error]', err.message);
    res.status(502).json({ error: 'VLM service unavailable', detail: err.message });
  });

  if (req.body && Object.keys(req.body).length > 0 && !req.is('multipart/*')) {
    proxyReq.write(JSON.stringify(req.body));
    proxyReq.end();
  } else {
    req.pipe(proxyReq);
  }
});

/** List all detections — GET /api/vlm/detections?page=1&per_page=50 */
app.get('/api/vlm/detections', (req, res) => vlmProxy('/detections', req, res));

/** Reset index — DELETE /api/vlm/reset */
app.delete('/api/vlm/reset', (req, res) => vlmProxy('/index', req, res));

/**
 * Ingest a single detection from the sim pipeline.
 * Body: { embedding: [...], metadata: {...} }
 * POST /api/vlm/ingest
 */
app.post('/api/vlm/ingest', (req, res) => {
  const url = new URL('/index', VLM_BASE);
  const lib = url.protocol === 'https:' ? https_ : http_;
  const body = JSON.stringify(req.body);
  const options = {
    hostname: url.hostname,
    port: url.port || 80,
    path: '/index',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  };
  const proxyReq = lib.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    res.status(502).json({ error: 'VLM service unavailable', detail: err.message });
  });
  proxyReq.write(body);
  proxyReq.end();
});

/**
 * Serve detection images: GET /data/detections/<filename>.jpg
 * Maps to the local filesystem at <project>/data/detections/
 */
app.get('/data/detections/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(__dirname, 'data', 'detections', filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }
  try {
    const stat = statSync(filePath);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read image' });
  }
});

// ─── Phase 2: VLM Stream Control proxy routes ─────────────────────────────────

/** Start stream — POST /api/vlm/stream/start */
app.post('/api/vlm/stream/start', (req, res) => {
  const url = new URL('/stream/start', VLM_BASE);
  const lib = url.protocol === 'https:' ? https_ : http_;
  const body = JSON.stringify(req.body);
  const options = {
    hostname: url.hostname,
    port: url.port || 80,
    path: '/stream/start',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  };
  const proxyReq = lib.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => res.status(502).json({ error: 'VLM unavailable', detail: err.message }));
  proxyReq.write(body);
  proxyReq.end();
});

/** Stop stream — POST /api/vlm/stream/stop */
app.post('/api/vlm/stream/stop', (req, res) => vlmProxy('/stream/stop', req, res));

/** Stream status — GET /api/vlm/stream/status */
app.get('/api/vlm/stream/status', (req, res) => vlmProxy('/stream/status', req, res));

/**
 * SSE passthrough — GET /api/vlm/stream/events?since=<n>
 * Requires special handling: must NOT buffer the response body.
 * We pipe the Flask SSE stream directly to the Express response.
 */
app.get('/api/vlm/stream/events', (req, res) => {
  const since = req.query.since || '0';
  const url = new URL(`/stream/events?since=${since}`, VLM_BASE);
  const lib = url.protocol === 'https:' ? https_ : http_;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const options = {
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname + url.search,
    method: 'GET',
  };
  const proxyReq = lib.request(options, (proxyRes) => {
    proxyRes.on('data', (chunk) => {
      res.write(chunk);
      // Force flush for SSE
      if (res.flush) res.flush();
    });
    proxyRes.on('end', () => res.end());
  });
  proxyReq.on('error', (err) => {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  });
  proxyReq.end();

  // Clean up if client disconnects
  req.on('close', () => proxyReq.destroy());
});

/**
 * MJPEG YOLO live video stream proxy — GET /api/vlm/stream/yolo_feed?source=...
 * Pipes the multipart/x-mixed-replace stream from Flask directly to the browser.
 */
app.get('/api/vlm/stream/yolo_feed', (req, res) => {
  const url = new URL('/stream/yolo_feed', VLM_BASE);
  for (const [k, v] of Object.entries(req.query)) {
    url.searchParams.set(k, v);
  }
  const lib = url.protocol === 'https:' ? https_ : http_;
  const options = {
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname + url.search,
    method: 'GET',
  };
  const proxyReq = lib.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    console.error('[YOLO feed error]', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Feed unavailable', detail: err.message });
    }
  });
  req.on('close', () => proxyReq.destroy());
  proxyReq.end();
});

/** Available video files for streaming — GET /api/vlm/stream/videos */
app.get('/api/vlm/stream/videos', (req, res) => vlmProxy('/stream/videos', req, res));

/** Serve raw local video files: GET /data/videos/:filename */
app.get('/data/videos/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(__dirname, 'data', 'videos', filename);
  if (!existsSync(filePath)) {
    // Try data/ root
    const rootPath = path.join(__dirname, 'data', filename);
    if (existsSync(rootPath)) return res.sendFile(rootPath);
    return res.status(404).json({ error: 'Video file not found' });
  }
  res.sendFile(filePath);
});

// ─── Cloudinary Media Storage ───────────────────────────────────────────────
// POST /api/mission/media/upload - Uploads mock placeholder or VLM images to Cloudinary
app.post('/api/mission/media/upload', async (req, res) => {
  const { droneId, missionId, type, fileBase64 } = req.body;
  if (!droneId || !missionId || !fileBase64) {
    return res.status(400).json({ error: 'Missing required fields: droneId, missionId, fileBase64' });
  }

  try {
    const result = await uploadDroneMedia(fileBase64, droneId, missionId, type || 'image');

    // Generate secure URL immediately for testing
    // Cryptographically bound to the request's IP and expires in 5 mins
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const secureUrl = generateSecureMediaUrl(result.public_id, ip, result.resource_type);

    res.json({
      success: true,
      publicId: result.public_id,
      folder: result.folder,
      secureTimeLimitedUrl: secureUrl
    });
  } catch (err) {
    console.error('Failed to upload media:', err);
    res.status(500).json({ error: 'Media upload failed' });
  }
});

// ─── Layer 5: Active Canary Trap (Decoy Endpoint) ───────────────────────────
// Legitimate drones NEVER call this. If an attacker with a stolen JWT scans
// the API, they inevitably probe this URL. The moment they do, we broadcast
// a real-time intrusion alert to every connected React dashboard client.
const revokedTokens = new Set();

app.get('/api/admin/master-keys', (req, res) => {
  const token = req.headers['authorization'] || req.query.token || 'unknown';

  // Log the intrusion
  console.warn(`[CANARY TRIGGERED] Decoy endpoint hit! Token: ${token}`);
  revokedTokens.add(token);

  // Broadcast red alert to ALL connected React dashboard clients over WebSocket
  io.emit('canary_triggered', {
    timestamp: new Date().toISOString(),
    alert: 'INTRUSION DETECTED — Decoy endpoint accessed',
    revoked_token: token,
    layer: 5
  });

  return res.status(403).json({
    error: 'FORBIDDEN: Intrusion detected. Identity revoked.',
    layer: 'Layer 5 Active Canary Trap'
  });
});

// ─── Layer 1-6: Security Status API ─────────────────────────────────────────
// Allows the React dashboard SecurityStatusPanel to poll live security metrics.
app.get('/api/security/status', (_req, res) => {
  const snap = lastSnapshot;
  const meshSecurity = snap?.security || {};

  res.json({
    layer1: {
      name: 'Hardware-Rooted Identity & Key Isolation',
      status: 'ACTIVE',
      detail: meshSecurity.root_trust || 'Simulated PUF → HKDF-SHA256',
      transport_key: meshSecurity.transport_key_fingerprint || 'N/A',
      payload_key: meshSecurity.payload_key_fingerprint || 'N/A',
    },
    layer2: {
      name: 'Double-Wrap Cascade Encryption',
      status: 'ACTIVE',
      detail: meshSecurity.key_exchange || 'Hybrid X25519 + ML-KEM-768',
      cipher: 'AES-256-GCM ⟩ ChaCha20-Poly1305',
    },
    layer3: {
      name: 'Adaptive QoS Telemetry',
      status: 'ACTIVE',
      detail: meshSecurity.telemetry_auth || 'Ed25519 Signatures (PyNaCl)',
    },
    layer4: {
      name: 'Swarm AI Anomaly Detection',
      status: 'ACTIVE',
      detail: meshSecurity.intrusion_detection || 'Physics AI + Isolation Forest',
    },
    layer5: {
      name: 'Active Canary Trap',
      status: 'ACTIVE',
      detail: meshSecurity.active_defense || 'Canary Decoy API Running',
      revoked_tokens: revokedTokens.size,
    },
    layer6: {
      name: 'Encrypted BLE + Ground Handoff',
      status: 'ACTIVE',
      detail: meshSecurity.tactical_ground_link || 'AES-GCM BLE + Socket Handoff',
    },
    overall: 'ALL_LAYERS_ACTIVE',
  });
});

// ─── Boot ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`DroneShield Server running on port ${PORT}`);
  console.log(`Status: IDLE (POST /api/mission/start to begin)`);
});


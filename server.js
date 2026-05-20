import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

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
const startedAt = Date.now();

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

function createDrone(index, x, y, heading) {
  return {
    id: `DRN-${String(index + 1).padStart(3, '0')}`,
    x,
    y,
    z: randomBetween(80, 130),
    heading,
    speed: randomBetween(10, 18),
    task: 'exploring',
    status: 'active',
    battery: randomBetween(72, 100),
    signalStrength: randomBetween(75, 99),
    distanceTraveled: 0,
    lastSeen: new Date().toISOString(),
    trail: [{ x, y }],
  };
}

const drones = [
  createDrone(0, -40, -25, 45),
  createDrone(1, 38, -10, 120),
  createDrone(2, 18, 60, 225),
  createDrone(3, -75, 30, 310),
  createDrone(4, 0, -70, 15),
];

const obstacles = [
  { id: 'OBS-001', x: -62, y: -4, radius: 9, severity: 'high' },
  { id: 'OBS-002', x: 52, y: 34, radius: 7, severity: 'medium' },
  { id: 'OBS-003', x: -15, y: 72, radius: 6, severity: 'low' },
  { id: 'OBS-004', x: 8, y: -58, radius: 10, severity: 'high' },
  { id: 'OBS-005', x: 85, y: -36, radius: 8, severity: 'medium' },
];

const hiddenSurvivors = [
  { id: 'HSV-001', x: -50, y: 14, severity: 'critical' },
  { id: 'HSV-002', x: 28, y: 46, severity: 'stable' },
  { id: 'HSV-003', x: 74, y: -26, severity: 'critical' },
  { id: 'HSV-004', x: -12, y: -76, severity: 'stable' },
  { id: 'HSV-005', x: 3, y: 2, severity: 'unknown' },
];

const detectedSurvivorIds = new Set();
const foundSurvivors = [];
const alerts = [];
const scannedCells = new Set();

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
    if (detectedSurvivorIds.has(survivor.id)) {
      continue;
    }
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
      if (foundSurvivors.length > 120) {
        foundSurvivors.length = 120;
      }
      pushAlert(
        'critical',
        `Survivor detected by ${drone.id} at [${survivor.x.toFixed(1)}, ${survivor.y.toFixed(1)}]. Confidence ${(detection.confidence * 100).toFixed(0)}%.`
      );
      io.emit('survivorFound', detection);
    }
  }
}

function updateDrone(drone) {
  if (drone.status === 'failed') {
    return;
  }

  const headingDrift = randomBetween(-10, 10);
  drone.heading = (drone.heading + headingDrift + 360) % 360;

  if (drone.battery < 22) {
    drone.task = 'returning';
  } else if (drone.task !== 'reassigned') {
    drone.task = 'exploring';
  }

  const speedMultiplier = drone.task === 'returning' ? 1.3 : 1;
  drone.speed = clamp(drone.speed + randomBetween(-1.2, 1.2), 8, 21);
  const distanceStep = (drone.speed * speedMultiplier * TICK_MS) / 1000;
  const radians = (drone.heading * Math.PI) / 180;
  const previousX = drone.x;
  const previousY = drone.y;
  drone.x += Math.cos(radians) * distanceStep;
  drone.y += Math.sin(radians) * distanceStep;

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
  const actualDistance = Math.sqrt(actualDx * actualDx + actualDy * actualDy);
  drone.distanceTraveled += actualDistance;

  drone.z = clamp(drone.z + randomBetween(-3, 3), 65, 145);
  drone.battery = clamp(drone.battery - randomBetween(0.2, 0.8), 0, 100);
  drone.signalStrength = clamp(
    95 - (Math.abs(drone.x) + Math.abs(drone.y)) / 3 + randomBetween(-2.5, 2.5),
    28,
    99
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
  if (drone.trail.length > 40) {
    drone.trail.shift();
  }
  drone.lastSeen = new Date().toISOString();

  detectSurvivors(drone);
}

function buildMissionData() {
  const activeDrones = drones.filter((drone) => drone.status === 'active').length;
  const failedDrones = drones.length - activeDrones;
  const avgBattery = drones.reduce((sum, drone) => sum + drone.battery, 0) / drones.length;
  const avgSignal = drones.reduce((sum, drone) => sum + drone.signalStrength, 0) / drones.length;
  const elapsedMs = Date.now() - startedAt;
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
  const missionData = buildMissionData();
  return {
    timestamp: new Date().toISOString(),
    missionData,
    drones,
    foundSurvivors,
    alerts,
    obstacles,
    hiddenSurvivors,
  };
}

function emitSnapshot() {
  const snapshot = buildSnapshot();
  io.emit('telemetrySnapshot', snapshot);

  // Backward-compatible events used by some panels.
  io.emit('missionData', snapshot.missionData);
  io.emit('drones', snapshot.drones);
}

io.on('connection', (socket) => {
  console.log('Client connected to tactical feed:', socket.id);
  socket.emit('telemetrySnapshot', buildSnapshot());
  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

setInterval(() => {
  for (const drone of drones) {
    updateDrone(drone);
  }

  if (Math.random() < 0.08) {
    pushAlert('info', 'Sector update complete. Adaptive reassignment initiated.');
  }
  if (Math.random() < 0.04) {
    const lowBatteryDrone = drones.find((drone) => drone.battery < 25 && drone.status === 'active');
    if (lowBatteryDrone) {
      pushAlert('warning', `${lowBatteryDrone.id} entering return path. Battery ${lowBatteryDrone.battery.toFixed(0)}%.`);
    }
  }

  emitSnapshot();
}, TICK_MS);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'drone-telemetry', timestamp: new Date().toISOString() });
});

app.get('/api/mission/snapshot', (_req, res) => {
  res.json(buildSnapshot());
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Simulation Server running on port ${PORT}`);
});

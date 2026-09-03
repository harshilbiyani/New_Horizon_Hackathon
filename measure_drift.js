import { computeCommand } from './server/decisionEngine.js';

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

const bounds = {
    'DRN-001': [-350, -116.66],
    'DRN-002': [-116.66, 116.66],
    'DRN-003': [116.66, 350]
};

let drones = [
    { id: 'DRN-001', x: -113.75, y: 0, z: 95, heading: 90, targetHeading: 90, speed: 15, targetSpeed: 15, task: 'exploring' },
    { id: 'DRN-002', x: -96.25, y: 0, z: 95, heading: 90, targetHeading: 90, speed: 15, targetSpeed: 15, task: 'exploring' },
    { id: 'DRN-003', x: 200, y: 0, z: 95, heading: 90, targetHeading: 90, speed: 15, targetSpeed: 15, task: 'exploring' }
];

const waypointQueues = new Map();
waypointQueues.set('DRN-001', [{ x: -113.75, y: 4000, z: 95 }]);
waypointQueues.set('DRN-002', [{ x: -96.25, y: 4000, z: 95 }]);
waypointQueues.set('DRN-003', [{ x: 200, y: 4000, z: 95 }]);

function applyActuation(drone, command, TICK_MS = 700) {
    drone.targetHeading = command.targetHeading ?? drone.targetHeading;
    drone.targetSpeed = command.targetSpeed ?? drone.targetSpeed;
    drone.targetZ = command.targetZ ?? drone.targetZ;
    drone.task = command.task ?? drone.task;

    let turnDiff = (drone.targetHeading - drone.heading + 360) % 360;
    if (turnDiff > 180) turnDiff -= 360;
    drone.heading = (drone.heading + clamp(turnDiff, -25, 25) + 360) % 360;

    drone.speed = clamp(drone.targetSpeed, drone.speed - 3.5, drone.speed + 3.5);
    drone.z = clamp(drone.targetZ, drone.z - 12, drone.z + 12);

    const distanceStep = (drone.speed * TICK_MS) / 1000;
    const radians = (drone.heading * Math.PI) / 180;
    drone.x += Math.cos(radians) * distanceStep;
    drone.y += Math.sin(radians) * distanceStep;
}

const stats = {
    'DRN-001': { crossings: 0, ticksOutside: 0, wasOutside: false, lastCrossingTick: -999, oscillations: 0 },
    'DRN-002': { crossings: 0, ticksOutside: 0, wasOutside: false, lastCrossingTick: -999, oscillations: 0 },
    'DRN-003': { crossings: 0, ticksOutside: 0, wasOutside: false, lastCrossingTick: -999, oscillations: 0 }
};

const TICKS = 300;

for (let i = 0; i < TICKS; i++) {
    const missionState = {
        obstacles: [],
        waypointQueues,
        allDroneIds: ['DRN-001', 'DRN-002', 'DRN-003'],
        activeDrones: drones
    };

    const currentDrones = JSON.parse(JSON.stringify(drones));

    for (let d of currentDrones) {
        const cmd = computeCommand(d, null, missionState);
        const ref = drones.find(x => x.id === d.id);
        applyActuation(ref, cmd);

        const [minX, maxX] = bounds[ref.id];
        const isOutside = (ref.x < minX || ref.x >= maxX);
        const st = stats[ref.id];

        if (isOutside) {
            st.ticksOutside++;
            if (!st.wasOutside) {
                st.crossings++;
                if (i - st.lastCrossingTick < 8) {
                    st.oscillations++;
                }
                st.lastCrossingTick = i;
            }
        }
        st.wasOutside = isOutside;
    }
}

let totalTicksOutside = 0;
for (const [id, st] of Object.entries(stats)) {
    console.log('--- ' + id + ' ---');
    console.log('Crossings: ' + st.crossings);
    console.log('Oscillations (<8 ticks gap): ' + st.oscillations);
    console.log('% Outside: ' + ((st.ticksOutside / TICKS) * 100).toFixed(2) + '%');
    totalTicksOutside += st.ticksOutside;
}
console.log('Overall % Outside: ' + ((totalTicksOutside / (TICKS * 3)) * 100).toFixed(2) + '%');
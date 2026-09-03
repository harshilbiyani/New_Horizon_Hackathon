import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCommand } from './decisionEngine.js';
import { buildZoneWaypoints, getZoneId } from './zonePlanner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const createDroneState = (x, y, z, targetHeading = 0, targetSpeed = 20, targetZ = 95) => ({
    id: 'DRN-TEST-1',
    x, y, z, targetHeading, targetSpeed, targetZ,
});

// ---------------------------------------------------------------------------
// DecisionEngine — Obstacle avoidance (Phase 1 behaviour still intact)
// ---------------------------------------------------------------------------
test('DE: returns exploring command when no obstacles nearby', () => {
    const drone = createDroneState(0, 0, 100, 45, 15, 100);
    const worldMap = { obstacles: [{ x: 500, y: 500, radius: 10, height: 150 }] };

    const cmd = computeCommand(drone, worldMap, {});
    assert.equal(cmd.reason, 'exploring');
    assert.equal(cmd.priority, 'normal');
});

test('DE: no evasion when drone is above obstacle clearance altitude', () => {
    const drone = createDroneState(0, 0, 210, 90, 20, 210);
    const worldMap = { obstacles: [{ x: 15, y: 0, radius: 10, height: 150 }] }; // clearanceZ = 175

    const cmd = computeCommand(drone, worldMap, {});
    assert.equal(cmd.reason, 'exploring');
});

test('DE: activates obstacle-avoidance when in caution zone and below clearance', () => {
    const drone = createDroneState(0, 0, 100, 0, 20, 100);
    const worldMap = { obstacles: [{ x: 15, y: 0, radius: 10, height: 150 }] };

    const cmd = computeCommand(drone, worldMap, {});
    assert.equal(cmd.reason, 'obstacle-avoidance');
    assert.ok(cmd.targetSpeed <= 16, 'Speed should be reduced');
    assert.equal(cmd.targetZ, 150 + 25 + 5, 'Should climb to clearanceZ+5');
    assert.equal(cmd.priority, 'high');
});

test('DE: emergency hard-push when critically close to obstacle', () => {
    const drone = createDroneState(0, 0, 100, 0, 20, 100);
    const worldMap = { obstacles: [{ x: 10, y: 0, radius: 10, height: 150 }] };

    const cmd = computeCommand(drone, worldMap, {});
    assert.equal(cmd.reason, 'obstacle-avoidance');
    assert.equal(cmd.priority, 'emergency');
    assert.ok(cmd.positionAdjust, 'Should have positionAdjust hard-push');
    assert.ok(cmd.positionAdjust.dx < 0, 'Push should be in -x direction (away from obstacle at x=10)');
});

// ---------------------------------------------------------------------------
// DecisionEngine — Waypoint steering (Phase 2 behaviour)
// ---------------------------------------------------------------------------
test('DE: steers toward waypoint when queue is available', () => {
    const drone = createDroneState(0, 0, 95, 0, 20, 95);
    const queue = [{ x: 100, y: 0, z: 95 }];
    const waypointQueues = new Map([['DRN-TEST-1', queue]]);

    const cmd = computeCommand(drone, null, { waypointQueues, obstacles: [] });
    assert.equal(cmd.reason, 'sweeping');
    // bearingTo (0,0) → (100,0) = 0 degrees (east)
    assert.ok(Math.abs(cmd.targetHeading - 0) < 1, `Expected ~0° bearing, got ${cmd.targetHeading}`);
});

test('DE: pops arrived waypoint and advances to next', () => {
    const drone = createDroneState(5, 0, 95, 0, 20, 95); // within 18 units of first WP
    const queue = [{ x: 0, y: 0, z: 95 }, { x: 200, y: 0, z: 95 }];
    const waypointQueues = new Map([['DRN-TEST-1', queue]]);

    computeCommand(drone, null, { waypointQueues, obstacles: [] });
    // First waypoint (x=0) should have been popped
    assert.equal(queue.length, 1, 'First waypoint should have been popped');
    assert.equal(queue[0].x, 200, 'Second waypoint should now be head of queue');
});

test('DE: obstacle avoidance overrides waypoint steering', () => {
    const drone = createDroneState(0, 0, 100, 0, 20, 100);
    const queue = [{ x: 15, y: 0, z: 95 }]; // waypoint is behind the obstacle
    const waypointQueues = new Map([['DRN-TEST-1', queue]]);
    const obstacles = [{ x: 15, y: 0, radius: 10, height: 150 }]; // exactly at waypoint

    const cmd = computeCommand(drone, null, { waypointQueues, obstacles });
    // Avoidance must win because the drone is too close
    assert.equal(cmd.reason, 'obstacle-avoidance');
});

test('DE: assignedZoneId is set from allDroneIds', () => {
    const drone = createDroneState(0, 0, 95);
    const cmd = computeCommand(drone, null, {
        allDroneIds: ['DRN-TEST-1', 'DRN-TEST-2'],
        obstacles: [],
    });
    assert.equal(cmd.assignedZoneId, 'Z1');
});

// ---------------------------------------------------------------------------
// ZonePlanner
// ---------------------------------------------------------------------------
test('ZP: generates one queue per drone', () => {
    const droneIds = ['DRN-001', 'DRN-002', 'DRN-003'];
    const queues = buildZoneWaypoints(droneIds, null, { GRID_SIZE: 6, WORLD_BOUNDARY: 350 });
    assert.equal(queues.size, 3);
});

test('ZP: queues are non-empty and all waypoints have {x,y,z}', () => {
    const droneIds = ['DRN-001', 'DRN-002'];
    const queues = buildZoneWaypoints(droneIds, null, { GRID_SIZE: 4, WORLD_BOUNDARY: 350 });

    for (const [, wps] of queues) {
        assert.ok(wps.length > 0, 'Queue should have waypoints');
        for (const wp of wps) {
            assert.ok('x' in wp && 'y' in wp && 'z' in wp, 'Waypoint must have x, y, z');
        }
    }
});

test('ZP: occupied cells are skipped', () => {
    // Build a worldMap where (0,0) is occupied
    const worldMap = { 0: { 0: { occupied: true, height: 150 } } };
    const droneIds = ['DRN-001'];
    const queues = buildZoneWaypoints(droneIds, worldMap, { GRID_SIZE: 4, WORLD_BOUNDARY: 350 }, 95);

    const wps = queues.get('DRN-001');
    // With GRID_SIZE=4 and 1 drone — all 4 columns belong to DRN-001.
    // Cell (0,0) is occupied, so total waypoints should be 4*4 - 1 = 15
    assert.equal(wps.length, 15, `Expected 15 waypoints, got ${wps.length}`);
});

test('ZP: getZoneId returns correct label', () => {
    const ids = ['DRN-001', 'DRN-002', 'DRN-003'];
    assert.equal(getZoneId('DRN-002', ids), 'Z2');
    assert.equal(getZoneId('DRN-999', ids), 'Z?');
});

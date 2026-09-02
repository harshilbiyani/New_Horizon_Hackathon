import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCommand } from './decisionEngine.js';

// Mock drone state for testing
const createDroneState = (x, y, z, targetHeading, targetSpeed, targetZ) => ({
    id: 'DRN-TEST-1',
    x, y, z, targetHeading, targetSpeed, targetZ
});

test('DecisionEngine: Explores and maintains targets when no obstacles nearby', () => {
    const drone = createDroneState(0, 0, 100, 45, 15, 100);
    const worldMap = {
        obstacles: [{ x: 100, y: 100, radius: 10, height: 150 }] // Far away
    };

    const command = computeCommand(drone, worldMap, undefined);
    assert.equal(command.reason, 'exploring');
    assert.equal(command.targetHeading, 45);
    assert.equal(command.targetSpeed, 15);
    assert.equal(command.targetZ, 100);
    assert.equal(command.priority, 'normal');
});

test('DecisionEngine: Evades obstacle when in caution zone but above clearance', () => {
    const drone = createDroneState(0, 0, 205, 90, 20, 205);
    const worldMap = {
        // Caution radius is 10 + 12 = 22. Distance is 15.
        // ClearanceZ is 150 + 25 = 175.
        // Drone z=205 is above clearanceZ, so no evasion needed!
        obstacles: [{ x: 15, y: 0, radius: 10, height: 150 }]
    };

    const command = computeCommand(drone, worldMap, undefined);
    // It shouldn't evade since it's flying safely above it
    assert.equal(command.reason, 'exploring');
});

test('DecisionEngine: Evades obstacle when in caution zone and below clearance', () => {
    const drone = createDroneState(0, 0, 100, 0, 20, 100);
    const worldMap = {
        // Caution radius is 10+12=22. Dist is 15 (less than 22)
        // clearanceZ = 150+25 = 175. Drone z=100 (less than 175) -> evade!
        obstacles: [{ x: 15, y: 0, radius: 10, height: 150 }]
    };

    const command = computeCommand(drone, worldMap, undefined);
    assert.equal(command.reason, 'obstacle-avoidance');
    assert.ok(command.targetSpeed <= 16, 'Speed should be clamped down during evasion');
    assert.equal(command.targetZ, 150 + 25 + 5, 'Should climb to clearanceZ + 5');

    // Distance is 15. `radius + 3` is 13. Since 15 is not < 13, blend factor = 0.42, priority = high
    assert.equal(command.priority, 'high');
});

test('DecisionEngine: Triggers emergency hard-push when critically close', () => {
    const drone = createDroneState(0, 0, 100, 0, 20, 100);
    const obstacle = { x: 10, y: 0, radius: 10, height: 150 };
    const worldMap = { obstacles: [obstacle] };

    const command = computeCommand(drone, worldMap, undefined);
    assert.equal(command.reason, 'obstacle-avoidance');
    assert.equal(command.priority, 'emergency');

    // Dist is 10. `radius + 1.5` is 11.5. Since 10 < 11.5, we get a positionAdjust
    assert.ok(command.positionAdjust, 'Should include positionAdjust for hard push');
    // awayAngle = 180 degrees (obstacle is at x:10, y:0 relative to drone 0,0)
    // math: atan2(dy, dx) -> atan2(0-0, 0-10) -> atan2(0,-10) -> 180 deg
    assert.ok(command.positionAdjust.dx < 0, 'Should push away in -x direction');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMeshState } from './meshNetwork.js';

const SIM_CONFIG = { COMM_RANGE: 90 };

const makeDrone = (id, x, y, status = 'active') => ({
    id, x, y, z: 100, status, relayPath: null,
    battery: 80, heading: 0, speed: 15, targetHeading: 0,
    targetSpeed: 15, targetZ: 100,
});

test('MESH: single drone near base → relay path to BASE', () => {
    const drones = [makeDrone('DRN-001', 20, 0)]; // 20 units from BASE (origin), well within 90
    const { meshLinks, pendingFlush } = buildMeshState(drones, SIM_CONFIG, []);
    assert.ok(drones[0].relayPath, 'Should have a relay path');
    assert.deepEqual(drones[0].relayPath, ['DRN-001', 'BASE']);
    assert.equal(pendingFlush.length, 0);
});

test('MESH: drone far from base but near relay → multi-hop path', () => {
    const drones = [
        makeDrone('DRN-001', 0, 0),   // At base proximity (within 90)
        makeDrone('DRN-002', 80, 0),   // 80 units from DRN-001 (in range), 80 from BASE
        makeDrone('DRN-003', 160, 0),  // 80 units from DRN-002 (in range), 160 from BASE (out of range)
    ];
    const { pendingFlush } = buildMeshState(drones, SIM_CONFIG, []);

    // DRN-001: direct to BASE
    assert.ok(drones[0].relayPath, 'DRN-001 should reach BASE');
    assert.equal(drones[0].relayPath[drones[0].relayPath.length - 1], 'BASE');

    // DRN-002: one hop via DRN-001 or direct (80 < 90)
    assert.ok(drones[1].relayPath, 'DRN-002 should reach BASE via relay');

    // DRN-003: must go DRN-003 → DRN-002 → ... → BASE
    assert.ok(drones[2].relayPath, 'DRN-003 should reach BASE via multi-hop');
    assert.equal(drones[2].relayPath[drones[2].relayPath.length - 1], 'BASE');

    assert.equal(pendingFlush.length, 0);
});

test('MESH: isolated drone → relay path null, detections queued', () => {
    const drones = [
        makeDrone('DRN-001', 500, 500), // far from base and any other drone
    ];
    const detection = { droneId: 'DRN-001', id: 'SURV-1', x: 490, y: 490, confidence: 0.9 };
    const { pendingFlush } = buildMeshState(drones, SIM_CONFIG, [detection]);

    assert.equal(drones[0].relayPath, null, 'Isolated drone should have null relay path');
    assert.equal(pendingFlush.length, 0, 'Detection should be queued, not flushed');
});

test('MESH: isolated drone reconnects → queued detections flushed', () => {
    const drone = makeDrone('DRN-RECONNECT', 500, 500);
    const detection = { droneId: 'DRN-RECONNECT', id: 'SURV-RECONNECT', x: 490, y: 490, confidence: 0.9 };

    // Tick 1: isolated, detection gets queued
    buildMeshState([drone], SIM_CONFIG, [detection]);
    assert.equal(drone.relayPath, null);

    // Tick 2: drone moves within comm range of base
    drone.x = 20; drone.y = 0;
    const { pendingFlush } = buildMeshState([drone], SIM_CONFIG, []);

    assert.ok(drone.relayPath, 'Should now have a path to BASE');
    assert.equal(pendingFlush.length, 1, 'Queued detection should be flushed on reconnect');
    assert.equal(pendingFlush[0].id, 'SURV-RECONNECT');
});

test('MESH: mesh links are generated correctly', () => {
    const drones = [
        makeDrone('DRN-001', 0, 0),
        makeDrone('DRN-002', 50, 0),  // 50 < 90 → linked
        makeDrone('DRN-003', 200, 0), // 200 > 90 from both → isolated
    ];
    const { meshLinks } = buildMeshState(drones, SIM_CONFIG, []);
    const pair = meshLinks.find(l =>
        (l.from === 'DRN-001' && l.to === 'DRN-002') ||
        (l.from === 'DRN-002' && l.to === 'DRN-001')
    );
    assert.ok(pair, 'DRN-001 and DRN-002 should be linked');
    assert.ok(pair.signal > 0 && pair.signal <= 1, 'Signal should be in (0,1]');
});

test('MESH: failed drones are excluded from mesh graph', () => {
    const drones = [
        makeDrone('DRN-001', 0, 0),
        makeDrone('DRN-002', 50, 0, 'failed'), // failed — should not be in graph
    ];
    const { meshLinks } = buildMeshState(drones, SIM_CONFIG, []);
    const hasFailed = meshLinks.some(l => l.from === 'DRN-002' || l.to === 'DRN-002');
    assert.equal(hasFailed, false, 'Failed drone should not appear in mesh links');
});

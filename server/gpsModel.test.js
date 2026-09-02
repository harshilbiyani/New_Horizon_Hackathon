import test from 'node:test';
import assert from 'node:assert/strict';
import { getGpsStatus, applyGpsUpdate, GPS_DENIAL_ZONES } from './gpsModel.js';

// GPS_DENIAL_ZONES: GDZ-A centre (-98,-42) r=55, GDZ-B (76,58) r=50, GDZ-C (18,-92) r=45

test('GPS: drone far from all zones → gps mode', () => {
    const { inZone } = getGpsStatus(0, 0, GPS_DENIAL_ZONES);
    assert.equal(inZone, false);
});

test('GPS: drone inside GDZ-A → reported in zone', () => {
    const { inZone, zoneId } = getGpsStatus(-98, -42, GPS_DENIAL_ZONES); // exact centre
    assert.equal(inZone, true);
    assert.equal(zoneId, 'GDZ-A');
});

test('GPS: drone inside GDZ-B → reported in zone', () => {
    const { inZone, zoneId } = getGpsStatus(76, 58, GPS_DENIAL_ZONES);
    assert.equal(inZone, true);
    assert.equal(zoneId, 'GDZ-B');
});

test('GPS: drone just beyond edge of GDZ-A → not in zone', () => {
    // GDZ-A radius=55, so 57 units from centre is outside
    const { inZone } = getGpsStatus(-98 + 57, -42, GPS_DENIAL_ZONES);
    assert.equal(inZone, false);
});

test('GPS: applyGpsUpdate — first tick in denial zone sets dead-reckoning', () => {
    const drone = {
        id: 'DRN-001', x: -98, y: -42, z: 100, // inside GDZ-A
        heading: 0, speed: 20,
        gpsMode: 'gps', positionUncertainty: 0,
        _drDeniedTicks: 0,
    };
    applyGpsUpdate(drone, 700, GPS_DENIAL_ZONES);
    assert.equal(drone.gpsMode, 'dead-reckoning');
    assert.ok(drone.positionUncertainty > 0, 'Uncertainty should be positive');
    assert.equal(drone.denialZoneId, 'GDZ-A');
});

test('GPS: applyGpsUpdate — uncertainty grows each tick', () => {
    const drone = {
        id: 'DRN-001', x: -98, y: -42, z: 100,
        heading: 0, speed: 20,
        gpsMode: 'gps', positionUncertainty: 0,
    };
    applyGpsUpdate(drone, 700, GPS_DENIAL_ZONES);
    const u1 = drone.positionUncertainty;
    applyGpsUpdate(drone, 700, GPS_DENIAL_ZONES);
    const u2 = drone.positionUncertainty;
    assert.ok(u2 > u1, `Uncertainty should grow: ${u1} → ${u2}`);
});

test('GPS: applyGpsUpdate — snaps back when exiting zone', () => {
    const drone = {
        id: 'DRN-001', x: -98, y: -42, z: 100,
        heading: 0, speed: 20,
        gpsMode: 'dead-reckoning', positionUncertainty: 40,
        _drDeniedTicks: 5, _drLastX: -98, _drLastY: -42,
    };
    // Move drone outside any denial zone
    drone.x = 0; drone.y = 0;
    applyGpsUpdate(drone, 700, GPS_DENIAL_ZONES);
    assert.equal(drone.gpsMode, 'gps');
    assert.equal(drone.positionUncertainty, 0);
    assert.equal(drone.denialZoneId, null);
});

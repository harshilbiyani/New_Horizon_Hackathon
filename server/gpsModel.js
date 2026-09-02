/**
 * gpsModel.js — GPS-denial zones and dead-reckoning fallback
 *
 * GPS-denial zones are circular areas where multipath interference / jamming
 * prevents reliable position fixes. Two are placed behind the two tallest
 * obstacle clusters defined in buildObstacleField():
 *   Zone A: around the ridge band at (-98, -42) — high cluster
 *   Zone B: around the ridge band at ( 76,  58) — high cluster
 *   Zone C: centre-dense canyon area useful for demo at (18, -92)
 *
 * While inside a zone, `gpsMode` = 'dead-reckoning' and `positionUncertainty`
 * grows proportional to sqrt(seconds elapsed). On zone exit it snaps back.
 */

/** @type {{ id: string, cx: number, cy: number, radius: number }[]} */
export const GPS_DENIAL_ZONES = [
    { id: 'GDZ-A', cx: -98, cy: -42, radius: 55 },  // behind ridge band A
    { id: 'GDZ-B', cx: 76, cy: 58, radius: 50 },  // behind ridge band B
    { id: 'GDZ-C', cx: 18, cy: -92, radius: 45 },  // canyon cluster C
];

/**
 * Determine whether world position (x, y) falls inside any denial zone.
 *
 * @param {number} x
 * @param {number} y
 * @param {typeof GPS_DENIAL_ZONES} zones
 * @returns {{ inZone: boolean, zoneId: string|null }}
 */
export function getGpsStatus(x, y, zones = GPS_DENIAL_ZONES) {
    for (const zone of zones) {
        const dx = x - zone.cx;
        const dy = y - zone.cy;
        if (Math.sqrt(dx * dx + dy * dy) <= zone.radius) {
            return { inZone: true, zoneId: zone.id };
        }
    }
    return { inZone: false, zoneId: null };
}

/**
 * Update a drone's GPS state in-place for one tick.
 *
 * - If the drone is inside a denial zone:
 *     · Set gpsMode to 'dead-reckoning'
 *     · Accumulate `deniedTicks` counter
 *     · Grow positionUncertainty = sqrt(deniedTicks) * UNCERTAINTY_RATE  (world units)
 *     · Override the drone's x/y with a dead-reckoned estimate instead of
 *       the "ground truth" physics position (caller must pass the tick duration).
 *
 * - If the drone is NOT in a denial zone:
 *     · Restore gpsMode to 'gps', snap positionUncertainty back to 0, clear counter.
 *
 * @param {Object} drone        — mutable drone object
 * @param {number} tickMs       — tick duration in milliseconds
 * @param {typeof GPS_DENIAL_ZONES} zones
 */
const UNCERTAINTY_RATE = 8; // world-units per sqrt(tick)

export function applyGpsUpdate(drone, tickMs, zones = GPS_DENIAL_ZONES) {
    const { inZone, zoneId } = getGpsStatus(drone.x, drone.y, zones);

    if (inZone) {
        if (drone.gpsMode !== 'dead-reckoning') {
            // Just entered — record the last known good position
            drone._drLastX = drone.x;
            drone._drLastY = drone.y;
            drone._drDeniedTicks = 0;
        }

        drone.gpsMode = 'dead-reckoning';
        drone.denialZoneId = zoneId;
        drone._drDeniedTicks = (drone._drDeniedTicks || 0) + 1;

        // Dead-reckoning: integrate heading + speed from last known position
        const elapsedSec = (drone._drDeniedTicks * tickMs) / 1000;
        const radians = (drone.heading * Math.PI) / 180;
        const distSinceGpsLoss = drone.speed * elapsedSec;
        drone._drEstX = (drone._drLastX || drone.x) + Math.cos(radians) * distSinceGpsLoss;
        drone._drEstY = (drone._drLastY || drone.y) + Math.sin(radians) * distSinceGpsLoss;

        // Grow uncertainty (sqrt of time = realistic inertial drift model)
        drone.positionUncertainty = Number(
            (Math.sqrt(drone._drDeniedTicks) * UNCERTAINTY_RATE).toFixed(1)
        );
    } else {
        if (drone.gpsMode === 'dead-reckoning') {
            // Exiting zone — snap back
            drone._drDeniedTicks = 0;
            drone._drEstX = undefined;
            drone._drEstY = undefined;
        }
        drone.gpsMode = 'gps';
        drone.positionUncertainty = 0;
        drone.denialZoneId = null;
    }
}

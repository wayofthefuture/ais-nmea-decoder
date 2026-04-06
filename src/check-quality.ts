import type { AisParseResults, QualityOptions } from "./definitions";

const dynamicMovingTimeout = 600_000;     // 10 minutes
const dynamicStoppedTimeout = 1_800_000;  // 30 minutes
const dynamicDistanceTimeout = 30_000;    // 30 seconds
const staticTimeout = 1_800_000;          // 30 minutes

type DynamicStats = {
    receive: number;
    count: number;
    lon?: number | undefined;
    lat?: number | undefined;
}

let requiredDynamic: number, requiredStatic: number, maxDistanceNm: number;

const dynamicStats: Record<number, DynamicStats> = {};
const staticStats: Record<number, DynamicStats> = {};

export function configureQuality(options: QualityOptions = {}) {
    requiredDynamic = options.requiredDynamic ?? requiredDynamic;
    requiredStatic = options.requiredStatic ?? requiredStatic;
    maxDistanceNm = options.maxDistanceNm ?? maxDistanceNm;
}

export function checkQuality(result: AisParseResults) {
    if (typeof result.lon === 'number') {
        checkDynamicResult(result);
    } else {
        checkStaticResult(result);
    }
}

/**
 * Validate a dynamic (position) result for a given MMSI.
 * Dynamic messages (types 1-3, 18, 19, etc.) contain position data and are transmitted frequently - typically every 2-10 seconds.
 *
 * Quality checks performed:
 *   1. Skip the first N transmissions (requiredDynamic) to filter out stale or initial data from a newly received vessel.
 *   2. Reset the count if more than dynamic timeout since last transmission, treating it as a new contact.
 *   3. Reject positions that jump more than maxDistanceNm from the previous position (except sar aircraft).
 */
export function checkDynamicResult(result: AisParseResults) {
    if (requiredDynamic === 0) return true;

    const { mmsi, mtype, lon, lat, sog } = result;
    if (!mmsi) throw new Error('Quality: Missing MMSI.');

    const now = Date.now();
    const prev = dynamicStats[mmsi] as DynamicStats;

    const resetTimeout = (typeof sog === 'number' && sog < 1) ? dynamicStoppedTimeout : dynamicMovingTimeout;

    // If no previous record, or stale beyond the dynamic timeout, start fresh
    if (!prev || now - prev.receive > resetTimeout) {
        dynamicStats[mmsi] = { count: 1, receive: now, lon, lat };
        throw new Error('Quality: Skipping initial dynamic transmission #1');
    }

    // Update count and check if we've received enough initial transmissions
    if (++prev.count <= requiredDynamic) {
        prev.receive = now;
        prev.lon = lon!;
        prev.lat = lat!;
        throw new Error(`Quality: Skipping initial dynamic transmission #${prev.count}`);
    }

    // Distance check: use longer window for stopped/slow vessels - except for sar aircraft
    if (mtype !== 9 && now - prev.receive < dynamicDistanceTimeout) {
        const distance = distanceInNm(prev.lon!, prev.lat!, lon!, lat!);
        if (distance > maxDistanceNm) {
            throw new Error(`Quality: Skipping where position jumped ${distance.toFixed(2)} nm (max ${maxDistanceNm} nm).`);
        }
    }

    // Store current position and time for next comparison
    prev.receive = now;
    prev.lon = lon!;
    prev.lat = lat!;

    return true;
}

/**
 * Validate a static (non-position) result for a given MMSI.
 *
 * Static messages (types 5, 24, etc.) contain vessel name, callsign, dimensions,
 * and destination — transmitted much less frequently (every 6 minutes or on request).
 *
 * Quality checks performed:
 *   1. Skip the first N transmissions (requiredStatic) to filter out stale or initial data from a newly received vessel.
 *   2. Reset the count if more than staticTimeout since last transmission, treating it as a new contact.
 */
export function checkStaticResult(result: AisParseResults) {
    if (requiredStatic === 0) return true;

    const { mmsi } = result;
    if (!mmsi) throw new Error('Quality: Missing MMSI.');

    const now = Date.now();
    const prev = staticStats[mmsi];

    // If no previous record, or stale beyond the static reset timeout, start fresh
    if (!prev || now - prev.receive > staticTimeout) {
        staticStats[mmsi] = { count: 1, receive: now };
        throw new Error('Quality: Skipping initial static transmission #1');
    }

    // Update count and check if we've received enough initial transmissions
    if (++prev.count <= requiredStatic) {
        prev.receive = now;
        throw new Error(`Quality: Skipping initial static transmission #${prev.count}`);
    }

    // Store time for next comparison
    prev.receive = now;

    return true;
}

/**
 * Use planar calculation of distance for performance - accurate enough for short distances
 */
export function distanceInNm(lon1: number, lat1: number, lon2: number, lat2: number) {
    const midLatRad = (lat1 + lat2) / 2 * Math.PI / 180;
    const verticalNm = (lat2 - lat1) * 60;
    const horizontalNm = (lon2 - lon1) * 60 * Math.cos(midLatRad);
    return Math.sqrt(verticalNm * verticalNm + horizontalNm * horizontalNm);
}

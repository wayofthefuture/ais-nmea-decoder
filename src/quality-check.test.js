import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {checkQuality, checkDynamicResult, checkStaticResult, distanceInNm, configureQuality} from './check-quality.js';
import {defaultOptions} from './ais-decoder.js';

describe('quality-check', () => {
    configureQuality(defaultOptions.qualityOptions);

    describe('checkDynamicResult', () => {
        it('should throw if mmsi is missing', () => {
            expect(() => checkDynamicResult({})).toThrow('Missing MMSI');
        });

        it('should skip the first dynamic transmission', () => {
            expect(() => checkDynamicResult({mmsi: '100000001', lon: 1, lat: 1}))
                .toThrow('Skipping initial dynamic transmission #1');
        });

        it('should skip the second dynamic transmission', () => {
            expect(() => checkDynamicResult({mmsi: '100000001', lon: 1, lat: 1}))
                .toThrow('Skipping initial dynamic transmission #2');
        });

        it('should accept the third dynamic transmission', () => {
            expect(checkDynamicResult({mmsi: '100000001', lon: 1, lat: 1})).toBe(true);
        });

        it('should accept subsequent dynamic transmissions', () => {
            expect(checkDynamicResult({mmsi: '100000001', lon: 1, lat: 1})).toBe(true);
        });

        it('should track each mmsi independently', () => {
            expect(() => checkDynamicResult({mmsi: '100000002', lon: 1, lat: 1}))
                .toThrow('Skipping initial dynamic transmission #1');

            expect(() => checkDynamicResult({mmsi: '100000003', lon: 1, lat: 1}))
                .toThrow('Skipping initial dynamic transmission #1');

            expect(() => checkDynamicResult({mmsi: '100000002', lon: 1, lat: 1}))
                .toThrow('Skipping initial dynamic transmission #2');
            expect(checkDynamicResult({mmsi: '100000002', lon: 1, lat: 1})).toBe(true);
        });
    });

    describe('checkDynamicResult reset timeout based on SOG', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it('should reset after 10 minutes for moving vessel (sog >= 1)', () => {
            const mmsi = '200000001';
            const pos = {mmsi, lon: 10, lat: 50, sog: 5};

            expect(() => checkDynamicResult(pos)).toThrow('#1');
            expect(() => checkDynamicResult(pos)).toThrow('#2');
            expect(checkDynamicResult(pos)).toBe(true);

            // Advance 10 min 1 sec — should reset
            vi.advanceTimersByTime(600_001);
            expect(() => checkDynamicResult(pos)).toThrow('#1');
        });

        it('should not reset within 10 minutes for moving vessel', () => {
            const mmsi = '200000002';
            const pos = {mmsi, lon: 10, lat: 50, sog: 5};

            expect(() => checkDynamicResult(pos)).toThrow('#1');
            expect(() => checkDynamicResult(pos)).toThrow('#2');
            expect(checkDynamicResult(pos)).toBe(true);

            vi.advanceTimersByTime(599_999);
            expect(checkDynamicResult(pos)).toBe(true);
        });

        it('should reset after 30 minutes for stopped vessel (sog < 1)', () => {
            const mmsi = '200000003';
            const pos = {mmsi, lon: 10, lat: 50, sog: 0};

            expect(() => checkDynamicResult(pos)).toThrow('#1');
            expect(() => checkDynamicResult(pos)).toThrow('#2');
            expect(checkDynamicResult(pos)).toBe(true);

            // Advance 30 min 1 sec — should reset
            vi.advanceTimersByTime(1_800_001);
            expect(() => checkDynamicResult(pos)).toThrow('#1');
        });

        it('should not reset within 30 minutes for stopped vessel', () => {
            const mmsi = '200000004';
            const pos = {mmsi, lon: 10, lat: 50, sog: 0.5};

            expect(() => checkDynamicResult(pos)).toThrow('#1');
            expect(() => checkDynamicResult(pos)).toThrow('#2');
            expect(checkDynamicResult(pos)).toBe(true);

            vi.advanceTimersByTime(1_799_999);
            expect(checkDynamicResult(pos)).toBe(true);
        });

        it('should use 10-minute timeout when sog is undefined', () => {
            const mmsi = '200000005';
            const pos = {mmsi, lon: 10, lat: 50};

            expect(() => checkDynamicResult(pos)).toThrow('#1');
            expect(() => checkDynamicResult(pos)).toThrow('#2');
            expect(checkDynamicResult(pos)).toBe(true);

            vi.advanceTimersByTime(600_001);
            expect(() => checkDynamicResult(pos)).toThrow('#1');
        });
    });

    describe('checkStaticResult', () => {
        it('should throw if mmsi is missing', () => {
            expect(() => checkStaticResult({})).toThrow('Missing MMSI');
        });

        it('should skip the first static transmission', () => {
            expect(() => checkStaticResult({mmsi: '100000001'}))
                .toThrow('Skipping initial static transmission #1');
        });

        it('should accept the second static transmission', () => {
            expect(checkStaticResult({mmsi: '100000001'})).toBe(true);
        });

        it('should accept subsequent static transmissions', () => {
            expect(checkStaticResult({mmsi: '100000001'})).toBe(true);
        });

        it('should track each mmsi independently', () => {
            expect(() => checkStaticResult({mmsi: '100000002'}))
                .toThrow('Skipping initial static transmission #1');

            expect(checkStaticResult({mmsi: '100000002'})).toBe(true);

            expect(() => checkStaticResult({mmsi: '100000003'}))
                .toThrow('Skipping initial static transmission #1');
        });
    });

    describe('checkStaticResult 30-minute reset', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it('should reset count if more than 30 minutes since last transmission', () => {
            const mmsi = '600000001';
            const msg = {mmsi};

            // Build up to accepted (2 transmissions)
            expect(() => checkStaticResult(msg)).toThrow('Skipping initial static transmission #1');
            expect(checkStaticResult(msg)).toBe(true);

            // Advance 31 minutes — should reset and start over
            vi.advanceTimersByTime(31 * 60_000);
            expect(() => checkStaticResult(msg)).toThrow('Skipping initial static transmission #1');
            expect(checkStaticResult(msg)).toBe(true);
        });

        it('should not reset if within 30 minutes', () => {
            const mmsi = '600000002';
            const msg = {mmsi};

            expect(() => checkStaticResult(msg)).toThrow('#1');
            expect(checkStaticResult(msg)).toBe(true);

            // Advance 15 minutes — should NOT reset
            vi.advanceTimersByTime(15 * 60_000);
            expect(checkStaticResult(msg)).toBe(true);
        });
    });

    describe('checkQuality', () => {
        it('should route to dynamic check when result has lon', () => {
            expect(() => checkQuality({mmsi: '300000001', lon: 1.5, lat: 1}))
                .toThrow('Skipping initial dynamic transmission #1');
        });

        it('should route to static check when result has no lon', () => {
            expect(() => checkQuality({mmsi: '300000001', name: 'VESSEL'}))
                .toThrow('Skipping initial static transmission #1');
        });

        it('should route to static check when lon is not a number', () => {
            expect(() => checkQuality({mmsi: '300000002', lon: undefined}))
                .toThrow('Skipping initial static transmission #1');
        });
    });

    describe('distanceInNm', () => {
        it('should return 0 for the same point', () => {
            expect(distanceInNm(0, 0, 0, 0)).toBe(0);
        });

        it('should calculate ~60 nm for 1 degree of latitude', () => {
            const d = distanceInNm(0, 0, 0, 1);
            expect(d).toBeCloseTo(60, 0);
        });

        it('should calculate a short distance correctly', () => {
            // ~0.5 nm apart
            const d = distanceInNm(144.0, -38.0, 144.008, -38.0);
            expect(d).toBeLessThan(1);
            expect(d).toBeGreaterThan(0);
        });
    });

    describe('checkDynamicResult distance check', () => {
        it('should accept when position is within 1 nm', () => {
            const mmsi = '400000001';
            const pos = {mmsi, lon: 144.0, lat: -38.0};

            // skip first 2
            try {checkDynamicResult(pos)} catch {}
            try {checkDynamicResult(pos)} catch {}
            // 3rd accepted, stores position
            checkDynamicResult(pos);

            // 4th with nearby position should pass
            const nearby = {mmsi, lon: 144.005, lat: -38.005};
            expect(checkDynamicResult(nearby)).toBe(true);
        });

        it('should throw when position jumps more than 1 nm', () => {
            const mmsi = '400000002';
            const pos = {mmsi, lon: 10.0, lat: 50.0};

            try {checkDynamicResult(pos)} catch {}
            try {checkDynamicResult(pos)} catch {}
            checkDynamicResult(pos);

            // 4th with far away position should throw
            const farAway = {mmsi, lon: 12.0, lat: 52.0};
            expect(() => checkDynamicResult(farAway)).toThrow('position jumped');
        });

        it('should not check distance on the first accepted transmission', () => {
            const mmsi = '400000003';
            const pos = {mmsi, lon: 100.0, lat: 20.0};

            try {checkDynamicResult(pos)} catch {}
            try {checkDynamicResult(pos)} catch {}

            // 3rd is first accepted — no previous position, should pass
            expect(checkDynamicResult(pos)).toBe(true);
        });
    });

    describe('checkDynamicResult distance window (30 seconds)', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it('should reject a far jump within 30 seconds', () => {
            const mmsi = '500000010';
            const pos = {mmsi, lon: 10.0, lat: 50.0};

            try {checkDynamicResult(pos)} catch {}
            try {checkDynamicResult(pos)} catch {}
            checkDynamicResult(pos);

            vi.advanceTimersByTime(10_000);
            const farAway = {mmsi, lon: 12.0, lat: 52.0};
            expect(() => checkDynamicResult(farAway)).toThrow('position jumped');
        });

        it('should skip distance check after 30 seconds', () => {
            const mmsi = '500000011';
            const pos = {mmsi, lon: 10.0, lat: 50.0};

            try {checkDynamicResult(pos)} catch {}
            try {checkDynamicResult(pos)} catch {}
            checkDynamicResult(pos);

            vi.advanceTimersByTime(31_000);
            const farAway = {mmsi, lon: 12.0, lat: 52.0};
            expect(checkDynamicResult(farAway)).toBe(true);
        });
    });

    describe('checkDynamicResult SAR aircraft exemption', () => {
        it('should skip distance check for mtype 9 (SAR aircraft)', () => {
            const mmsi = '500000020';
            const pos = {mmsi, mtype: 9, lon: 10.0, lat: 50.0};

            try {checkDynamicResult(pos)} catch {}
            try {checkDynamicResult(pos)} catch {}
            checkDynamicResult(pos);

            // SAR aircraft can jump far — distance check should be skipped
            const farAway = {mmsi, mtype: 9, lon: 15.0, lat: 55.0};
            expect(checkDynamicResult(farAway)).toBe(true);
        });

        it('should still check distance for non-SAR mtype', () => {
            const mmsi = '500000021';
            const pos = {mmsi, mtype: 1, lon: 10.0, lat: 50.0};

            try {checkDynamicResult(pos)} catch {}
            try {checkDynamicResult(pos)} catch {}
            checkDynamicResult(pos);

            const farAway = {mmsi, mtype: 1, lon: 12.0, lat: 52.0};
            expect(() => checkDynamicResult(farAway)).toThrow('position jumped');
        });
    });

    describe('configureQuality', () => {
        it('should allow setting requiredDynamic to 0 to disable dynamic checks', () => {
            configureQuality({requiredDynamic: 0});
            const result = checkDynamicResult({mmsi: '900000001', lon: 1, lat: 1});
            expect(result).toBe(true);
            // restore default
            configureQuality({requiredDynamic: 2});
        });

        it('should allow setting requiredStatic to 0 to disable static checks', () => {
            configureQuality({requiredStatic: 0});
            const result = checkStaticResult({mmsi: '900000002'});
            expect(result).toBe(true);
            // restore default
            configureQuality({requiredStatic: 1});
        });

        it('should allow changing maxDistanceNm', () => {
            configureQuality({maxDistanceNm: 200});
            const mmsi = '900000003';
            const pos = {mmsi, lon: 10.0, lat: 50.0};

            try {checkDynamicResult(pos)} catch {}
            try {checkDynamicResult(pos)} catch {}
            checkDynamicResult(pos);

            // far jump that would normally fail at 1 nm, but passes at 200 nm
            const far = {mmsi, lon: 11.0, lat: 51.0};
            expect(checkDynamicResult(far)).toBe(true);
            // restore default
            configureQuality({maxDistanceNm: 1});
        });
    });
});

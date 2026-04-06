import { describe, it, expect } from 'vitest';
import { PayloadBits } from './payload-bits';

const textEncoder = new TextEncoder();

describe('PayloadBits', () => {
    describe('decode', () => {
        it('should produce 6 bits per character', () => {
            const bits = new PayloadBits(textEncoder.encode('0'));
            expect(bits.bits.length).toBe(6);
        });

        it('should decode multiple characters', () => {
            const bits = new PayloadBits(textEncoder.encode('000'));
            expect(bits.bits.length).toBe(18);
        });

        it('should decode "0" (ASCII 48) to 6-bit value 0 → all zeros', () => {
            const bits = new PayloadBits(textEncoder.encode('0'));
            expect(bits.bits).toEqual([0, 0, 0, 0, 0, 0]);
        });

        it('should decode "W" (ASCII 87) to 6-bit value 39', () => {
            const bits = new PayloadBits(textEncoder.encode('W'));
            expect(bits.bits).toEqual([1, 0, 0, 1, 1, 1]);
        });

        it('should decode "`" (ASCII 96) to 6-bit value 40', () => {
            const bits = new PayloadBits(textEncoder.encode('`'));
            expect(bits.bits).toEqual([1, 0, 1, 0, 0, 0]);
        });

        it('should decode "w" (ASCII 119) to 6-bit value 63 → all ones', () => {
            const bits = new PayloadBits(textEncoder.encode('w'));
            expect(bits.bits).toEqual([1, 1, 1, 1, 1, 1]);
        });

        it('should throw for ASCII below 48', () => {
            expect(() => new PayloadBits(textEncoder.encode('/'))).toThrow('invalid character');
        });

        it('should throw for ASCII above 119', () => {
            expect(() => new PayloadBits(textEncoder.encode('x'))).toThrow('invalid character');
        });

        it('should throw for ASCII in the gap 88-95 (e.g. "X")', () => {
            expect(() => new PayloadBits(textEncoder.encode('X'))).toThrow('invalid character');
        });

        it('should throw for ASCII in the gap 88-95 (e.g. "_")', () => {
            expect(() => new PayloadBits(textEncoder.encode('_'))).toThrow('invalid character');
        });
    });

    describe('getLength', () => {
        it('should return the number of bits', () => {
            const bits = new PayloadBits(textEncoder.encode('D5CD'));
            expect(bits.getLength()).toBe(24);
        });
    });

    describe('bitsToNumber', () => {
        it('should convert [0] to 0', () => {
            const bits = new PayloadBits(textEncoder.encode('0'));
            expect(bits.bitsToNumber([0])).toBe(0);
        });

        it('should convert [1] to 1', () => {
            const bits = new PayloadBits(textEncoder.encode('0'));
            expect(bits.bitsToNumber([1])).toBe(1);
        });

        it('should convert [1, 0, 1] to 5', () => {
            const bits = new PayloadBits(textEncoder.encode('0'));
            expect(bits.bitsToNumber([1, 0, 1])).toBe(5);
        });

        it('should convert [1, 1, 1, 1, 1, 1] to 63', () => {
            const bits = new PayloadBits(textEncoder.encode('0'));
            expect(bits.bitsToNumber([1, 1, 1, 1, 1, 1])).toBe(63);
        });

        it('should convert [0, 0, 0, 0, 0, 0] to 0', () => {
            const bits = new PayloadBits(textEncoder.encode('0'));
            expect(bits.bitsToNumber([0, 0, 0, 0, 0, 0])).toBe(0);
        });

        it('should convert an empty array to 0', () => {
            const bits = new PayloadBits(textEncoder.encode('0'));
            expect(bits.bitsToNumber([])).toBe(0);
        });
    });

    describe('getInt', () => {
        it('should extract an unsigned integer', () => {
            // "w" = 6-bit value 63 = [1,1,1,1,1,1]
            const bits = new PayloadBits(textEncoder.encode('w'));
            expect(bits.getInt(0, 6, false)).toBe(63);
        });

        it('should extract a smaller unsigned integer from the middle', () => {
            // "5" = ASCII 53, 53-48=5, 6-bit = [0,0,0,1,0,1]
            // "C" = ASCII 67, 67-48=19, 6-bit = [0,1,0,0,1,1]
            // combined: [0,0,0,1,0,1, 0,1,0,0,1,1]
            const bits = new PayloadBits(textEncoder.encode('5C'));
            expect(bits.getInt(0, 4, false)).toBe(1);   // [0,0,0,1] = 1
            expect(bits.getInt(4, 4, false)).toBe(5);   // [0,1,0,1] = 5
        });

        it('should extract a signed negative integer (two\'s complement)', () => {
            // "w" = all ones [1,1,1,1,1,1] → signed 6-bit = -1
            const bits = new PayloadBits(textEncoder.encode('w'));
            expect(bits.getInt(0, 6, true)).toBe(-1);
        });

        it('should extract a signed positive integer when MSB is 0', () => {
            // "5" = 6-bit value 5 = [0,0,0,1,0,1] → signed = 5
            const bits = new PayloadBits(textEncoder.encode('5'));
            expect(bits.getInt(0, 6, true)).toBe(5);
        });

        it('should return 0 for all-zero bits signed', () => {
            const bits = new PayloadBits(textEncoder.encode('0'));
            expect(bits.getInt(0, 6, true)).toBe(0);
        });
    });

    describe('getBool', () => {
        it('should return true for bit value 1', () => {
            // "w" = [1,1,1,1,1,1]
            const bits = new PayloadBits(textEncoder.encode('w'));
            expect(bits.getBool(0)).toBe(true);
        });

        it('should return false for bit value 0', () => {
            // "0" = [0,0,0,0,0,0]
            const bits = new PayloadBits(textEncoder.encode('0'));
            expect(bits.getBool(0)).toBe(false);
        });
    });

    describe('getStr', () => {
        it('should decode "TEST"', () => {
            const bits = new PayloadBits(textEncoder.encode('D5CD'));
            expect(bits.getStr(0, 24)).toBe('TEST');
        });

        it('should stop at @ (AIS code 0, end-of-name marker)', () => {
            // "0" = 6-bit value 0 = '@' = end marker
            // "D5CD" + "0" = "TEST" + end marker
            const bits = new PayloadBits(textEncoder.encode('D5CD0'));
            expect(bits.getStr(0, 30)).toBe('TEST');
        });

        it('should decode digits (AIS codes 32-63 map directly to ASCII)', () => {
            // AIS code 48 = ASCII 48 = '0', AIS code 49 = '1', etc.
            // '0' char (ASCII 48) → 6-bit 0 → '@' (end marker), so digits start at 6-bit 32+
            // "P" = ASCII 80, 80-48=32, 6-bit value 32 → ASCII 32 = space
            const bits = new PayloadBits(textEncoder.encode('P'));
            expect(bits.getStr(0, 6)).toBe('');
        });

        it('should trim leading and trailing spaces but preserve internal spaces', () => {
            // ' TE ST ' : P=space(32), D=T(20), 5=E(5), P=space(32), C=S(19), D=T(20), P=space(32)
            const bits = new PayloadBits(textEncoder.encode('PD5PCDP'));
            expect(bits.getStr(0, 42)).toBe('TE ST');
        });

        it('should truncate to available data aligned to 6-bit boundary', () => {
            // 'D5CD' = 24 bits, encoding "TEST"
            const bits = new PayloadBits(textEncoder.encode('D5CD'));
            // request 120 bits but only 24 available
            const result = bits.getStr(0, 120);
            expect(result).toBe('TEST');
        });

        it('should return empty string when start exceeds available bits', () => {
            const bits = new PayloadBits(textEncoder.encode('D5CD'));
            const result = bits.getStr(100, 120);
            expect(result).toBe('');
        });

        it('should decode from an offset', () => {
            // Two characters then "TEST": need 6 padding bits + TEST
            // "1" = ASCII 49, 49-48=1, 6-bit [0,0,0,0,0,1]
            // then D5CD = TEST
            const bits = new PayloadBits(textEncoder.encode('1D5CD'));
            expect(bits.getStr(6, 24)).toBe('TEST');
        });
    });

    describe('getLon', () => {
        it('should convert a 28-bit signed integer to longitude', () => {
            // Use a known AIS message payload for msg1: '133REv0P00P=K?TMDH6P0?vN289>'
            // lon should be 2.9328833333333333
            const bits = new PayloadBits(textEncoder.encode('133REv0P00P=K?TMDH6P0?vN289>'));
            // longitude is at bit 61, 28 bits in msg type 1
            expect(bits.getLon(61)).toBeCloseTo(2.9328833333333333, 6);
        });
    });

    describe('getLat', () => {
        it('should convert a 27-bit signed integer to latitude', () => {
            // Same msg1 payload, lat should be 51.23759
            const bits = new PayloadBits(textEncoder.encode('133REv0P00P=K?TMDH6P0?vN289>'));
            // latitude is at bit 89, 27 bits in msg type 1
            expect(bits.getLat(89)).toBeCloseTo(51.23759, 5);
        });

        it('should handle negative latitude', () => {
            // msg4 payload: '4@4k1EQutd87k:Etkmb:JM7P08Na'
            // lat should be -38.16343333333333
            const bits = new PayloadBits(textEncoder.encode('4@4k1EQutd87k:Etkmb:JM7P08Na'));
            // msg type 4: lon at bit 79 (28 bits), lat at bit 107 (27 bits)
            expect(bits.getLat(107)).toBeCloseTo(-38.16343333333333, 5);
        });
    });

    describe('getStr truncation', () => {
        it('should return correct truncated string from available data', () => {
            // 'D5CD' is 4 characters = 24 bits, encoding "TEST"
            const bits = new PayloadBits(textEncoder.encode('D5CD'));
            // request 120 bits starting at bit 0, but only 24 bits available
            // truncation should return the 4 characters that fit
            const result = bits.getStr(0, 120);
            expect(result).toBe('TEST');
        });

        it('should return empty string when start exceeds available bits', () => {
            const bits = new PayloadBits(textEncoder.encode('H42O55'));
            // start beyond available bits produces negative length
            const result = bits.getStr(100, 120);
            expect(result).toBe('');
        });
    });
});

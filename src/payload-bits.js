import bitwise from 'bitwise';

const textDecoder = new TextDecoder();

export default class PayloadBits {
    constructor(payload) {
        this.decode(payload);
    }

    // Converts AIS "armored ASCII" payload into a flat array of bits.
    // See AIVDM/AIVDO Payload Armoring in the guide for details.
    //
    // The data payload is an ASCII-encoded bit vector. Each character
    // represents six bits of data using two ASCII ranges:
    //   6-bit 0-39  → ASCII 48-87  ('0' to 'W')
    //   6-bit 40-63 → ASCII 96-119 ('`' to 'w')
    //
    // The gap ASCII 88-95 ('X' to '_') is unused.
    //
    decode(payload) {
        const bits = [];

        for (let i = 0; i < payload.length; i++) {
            let code = payload[i];  // standard ascii char code

            // check invalid ASCII ranges outside of 48-87 and 96-119
            if (code < 48 || code > 119) {
                throw new Error('Payload contains invalid character.');
            }
            if (code > 87 && code < 96) {
                throw new Error('Payload contains invalid character.');
            }

            // Each character represents six bits of data. To recover the six bits, subtract 48
            // from the ASCII character value - if the result is greater than 40 - subtract 8.
            code -= 48;
            if (code > 40) {
                code -= 8;
            }

            // convert 6-bit value to individual bits
            const eightBits = bitwise.byte.read(code);
            bits.push(...eightBits.slice(2));
        }
        
        this.bits = bits;
    }

    getLength() {
        return this.bits.length;
    }

    getLon(start) {
        return this.getInt(start, 28, true) / 600000;
    }

    getLat(start) {
        return this.getInt(start, 27, true) / 600000;
    }

    // Extract an integer (signed or unsigned) from the bit array.
    //
    // - For unsigned integers, the bits are converted directly to a number.
    // - For signed integers, the first bit (MSB) indicates the sign:
    //     0 = positive → convert bits to number as-is
    //     1 = negative → use two's complement to get the negative value
    //
    getInt(start, length, signed) {
        const bits = this.bits.slice(start, start + length);

        const negative = (signed && bits[0] === 1);
        if (negative) {
            //two's complement: invert bits, convert to number, add 1, negate
            const inverted = bitwise.bits.not(bits);
            return -(this.bitsToNumber(inverted) + 1);
        }

        return this.bitsToNumber(bits);
    }

    // Extract a boolean (single bit) from the bit array
    getBool(start) {
        return (this.bits[start] === 1);
    }

    // Extract a text string from the bit array
    // @param length - number of bits to extract - if not provided, extracts to end of array
    getStr(start, length) {
        if (start >= this.bits.length) {
            return '';
        }

        // if no length specified, use remaining bits
        if (length === undefined) {
            length = this.bits.length - start;
        }

        // default to remaining bits, aligned to 6-bit boundary
        if (start + length > this.bits.length) {
            length = Math.floor((this.bits.length - start) / 6) * 6;
        }

        // messages in the wild sometimes produce a negative len
        if (length <= 0) return '';

        const bytes = new Uint8Array(length / 6);
        let count = 0;

        for (let i = 0; i < length; i += 6) {
            const charBits = this.bits.slice(start + i, start + i + 6);
            let charCode = this.bitsToNumber(charBits);

            // Map 6-bit AIS character code to ASCII character code:
            //   AIS 0-31  → ASCII 64-95 - add 64 to get the ASCII value
            //   AIS 32-63 → ASCII 32-63 - already valid ASCII, no change needed
            if (charCode < 32) {
                charCode += 64;
            }
            // 64 is '@' which marks the end of name/text
            if (charCode === 64) break;
            
            bytes[count++] = charCode;
        }

        return textDecoder.decode(bytes.subarray(0, count)).trim();
    }

    // Convert an array of bits (0s and 1s) to an unsigned integer ([1, 0, 1] => 5)
    bitsToNumber(bits) {
        let result = 0;
        for (let i = 0; i < bits.length; i++) {
            result = result * 2 + bits[i];
        }
        return result;
    }
}

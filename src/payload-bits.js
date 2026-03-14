const textDecoder = new TextDecoder();

// Decode printable 6bit AIS/IEC binary format
export default class PayloadBits {
    constructor(payload) {
        this.decode(payload);
    }
    
    decode(payload) {
        const bits = new Array(payload.length);

        for (let i = 0; i < payload.length; i++) {
            let byte = payload[i];

            // check byte is not out of range
            if ((byte < 0x30) || (byte > 0x77)) {
                throw new Error('AisDecode: Payload contains invalid character.');
            }
            if ((0x57 < byte) && (byte < 0x60)) {
                throw new Error('AisDecode: Payload contains invalid character.');
            }

            // move from printable char to 6 bit representation
            byte += 0x28;
            if (byte > 0x80) {
                byte += 0x20;
            } else {
                byte += 0x28;
            }

            bits[i] = byte;
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

    // Extract an integer sign or unsigned from payload
    getInt(start, len, signed) {
        let acc = 0;
        let cp, cx, c0, cs;

        for (let i = 0; i < len; i++) {
            acc = acc << 1;
            cp = Math.floor((start + i) / 6);
            cx = this.bits[cp];
            cs = 5 - ((start + i) % 6);
            c0 = (cx >> cs) & 1;
            // if signed value and first bit is 1, pad with 1's
            if (i === 0 && signed && c0) {
                acc = ~acc;
            }
            acc |= c0;
        }

        return acc;
    }

    // Extract a boolean (single bit) from payload
    getBool(start) {
        const cp = Math.floor(start / 6);
        const cs = 5 - (start % 6);
        return ((this.bits[cp] >> cs) & 1) === 1;
    }

    // Extract a string from payload [1st bits is index 0]
    getStr(start, len) {
        // If requested string exceeds available data, truncate to what's available (aligned to 6-bit boundary)
        if (this.bits.length < (start + len) / 6) {
            len = Math.floor(((this.bits.length - start / 6) / 6) * 6) * 6;
        }

        // messages in the wild sometimes produce a negative len which will cause a buffer range error
        if (len < 0) return '';

        const bytes = new Uint8Array(len / 6);
        let cp, cx, cs, c0;
        let acc = 0;
        let k = 0;
        let i = 0;

        while (i < len) {
            acc = 0;
            for (let j = 0; j < 6; j++) {
                acc = acc << 1;
                cp = Math.floor((start + i) / 6);
                cx = this.bits[cp];
                cs = 5 - ((start + i) % 6);
                c0 = (cx >> cs) & 1;
                acc |= c0;
                i++;
            }
            bytes[k] = acc;
            if (acc < 0x20) {
                bytes[k] += 0x40;
            } else {
                bytes[k] = acc;
            }
            if (bytes[k] === 0x40) break; // name end with '@'
            k++;
        }

        return textDecoder.decode(bytes.subarray(0, k));
    }
}

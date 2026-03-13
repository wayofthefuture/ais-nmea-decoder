/*
Copyright 2014 Fulup Ar Foll
Copyright 2026 wayofthefuture

Licensed under the Apache License, Version 2.0
https://www.apache.org/licenses/LICENSE-2.0
*/

'use strict';

import {MSG_TYPE, NAV_STATUS, VESSEL_TYPE, ERI_TYPE} from './constants.js';

const enableLogging = false;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export default class AisDecode {
    constructor(input, session) {
        this.bitarray = [];
        this.valid = false;
        this.error = '';

        const parts = this._getMessageParts(input);
        if (!parts) return;
        
        const ready = this._parseMessage(parts, session);
        if (!ready) return;

        this._decodeBitArray();
        this._decodeMessageType(input);
    }

    _getMessageParts(input) {
        if (typeof input !== 'string') {
            this.error = 'AisDecode: Sentence is not of type string.';
            return undefined;
        }

        input = input.trim();

        if (input.length === 0) {
            this.error = 'AisDecode: Sentence is empty or spaces.';
            return undefined;
        }

        if (!this._validateChecksum(input)) {
            this.error = 'AisDecode: Sentence checksum is invalid.';
            return undefined;
        }

        // split nmea message !AIVDM,1,1,,B,B69>7mh0?J<:>05B0`0e;wq2PHI8,0*3D'
        const parts = input.split(',');

        if (parts.length !== 7) {
            this.error = 'AisDecode: Sentence contains invalid number of parts.';
            return undefined;
        }

        // AIVDM = standard ais message, AIVDO = own vessel through pilot plug
        if (parts[0] !== '!AIVDM' && parts[0] !== '!AIVDO') {
            this.error = 'AisDecode: Invalid message prefix.';
            return undefined;
        }

        // positive total number of fragments
        if (Number(parts[1]) === 0) {
            this.error = 'AisDecode: Invalid fragment count.';
            return undefined;
        }

        return parts;
    }
    
    // Parse message fragments into a session object and return true when all fragments have been received
    _parseMessage(parts, session) {
        const totalFragments = Number(parts[1]);
        const channel = parts[4];
        const rawPayload = parts[5];

        this.channel = channel;

        if (totalFragments === 1) {
            this.payload = textEncoder.encode(rawPayload);
            return true;
        }

        // parse multi-fragment message
        const messageType = parts[0];
        const currentFragment = Number(parts[2]);
        const sequenceId = parts[3].length > 0 ? Number(parts[3]) : NaN;

        const error = this._validateFragment(session, messageType, currentFragment, sequenceId);
        if (error) {
            this.error = error;
            return false;
        }

        session[currentFragment] = {rawPayload};

        // store metadata once so that subsequent fragments can be validated by checking for the same metadata
        if (currentFragment === 1) {
            session.messageType = messageType;
            session.totalFragments = totalFragments;
            session.sequenceId = sequenceId;
        }
        
        if (currentFragment < totalFragments) {
            return false;
        }

        this._combinePayloads(session);
        return true;
    }

    _validateFragment(session, messageType, currentFragment, sequenceId) {
        if (!session) {
            return 'AisDecode: A session object is required to maintain state for decoding multi-fragment AIS messages.';
        }

        if (currentFragment <= 1) return null;

        if (messageType !== session.messageType) {
            return 'AisDecode: Sentence does not match messageType of current session.';
        }

        if (session[currentFragment - 1] === undefined) {
            return 'AisDecode: Session is missing prior fragment, cannot parse partial AIS message.';
        }

        if (session.sequenceId !== sequenceId) {
            return 'AisDecode: Session IDs do not match. Cannot reconstruct AIS message.';
        }

        return null;
    }

    _combinePayloads(session) {
        const payloads = [];

        for (let i = 1; i <= session.totalFragments; ++i) {
            payloads.push(session[i].rawPayload);
        }

        this.payload = textEncoder.encode(payloads.join(''));
    }

    _decodeBitArray() {
        // decode printable 6bit AIS/IEC binary format
        for (let i = 0; i < this.payload.length; i++) {
            let byte = this.payload[i];

            // check byte is not out of range
            if ((byte < 0x30) || (byte > 0x77)) return;
            if ((0x57 < byte) && (byte < 0x60)) return;

            // move from printable char to wacky AIS/IEC 6 bit representation
            byte += 0x28;
            if(byte > 0x80)  byte += 0x20;
            else             byte += 0x28;
            this.bitarray[i]=byte;
        }

        this.aistype = this.getInt(0,6);
        this.repeat  = this.getInt(6,2);
        this.immsi   = this.getInt(8,30);
        this.mmsi    = ('000000000' + this.immsi).slice(-9);
    }

    _decodeMessageType(input) {
        switch (this.aistype) {
            case 1:
            case 2:
            case 3:
                this._decodeClassAPositionReport();
                break;
            case 4:
            case 11:
                this._decodeBaseStationReport();
                break;
            case 5:
                this._decodeStaticVoyageData();
                break;
            case 9:
                this._decodeSarAircraftReport();
                break;
            case 14:
                this._decodeTextMessage();
                break;
            case 18:
                this._decodeClassBPositionReport();
                break;
            case 19:
                this._decodeExtendedClassBPositionReport();
                break;
            case 21:
                this._decodeAidToNavigation();
                break;
            case 24:
                this._decodeStaticDataReport();
                break;
            case 27:
                this._decodeLongRangeBroadcast();
                break;
            default:
                if (enableLogging) console.log('---- type=%d %s %s -> %s', this.aistype, this.getAisType(this.aistype), this.mmsi, input);
                break;
        }
    }

    _decodeClassAPositionReport() {
        this.class = 'A';
        this.navstatus = this.getInt(38, 4);

        const lon = this.getLon(61);
        const lat = this.getLat(89);

        if (lon <= 180 && lat <= 90) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;

        this.rot = this.getInt(42, 8, true)
        this.sog = this.getInt(50, 10) / 10;
        this.cog = this.getInt(116, 12) / 10;
        this.hdg = this.getInt(128, 9);
        this.utc = this.getInt(137, 6);
        this.smi = this.getInt(143, 2);
    }

    _decodeClassBPositionReport() {
        this.class = 'B';
        this.status = -1;  // Class B targets have no status.  Enforce this...
        this.repeat = this.getInt(6,2);
        this.accuracy = this.getInt(56, 1);

        const lon = this.getLon(57);
        const lat = this.getLat(85);

        if (lon <= 180 && lat <= 90) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;

        this.sog = this.getInt(46, 10) / 10;
        this.cog = this.getInt(112, 12) / 10;
        this.hdg = this.getInt(124, 9);
        this.utc = this.getInt(134, 6);
        this.dsc = this.getBool(143);
    }

    _decodeExtendedClassBPositionReport() {
        this.class = 'B';
        this.status = -1;  // Class B targets have no status.  Enforce this...

        const lon = this.getLon(57);
        const lat = this.getLat(85);

        if (lon <= 180 && lat <= 90) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;

        this.sog = this.getInt(46, 10) / 10;
        this.cog = this.getInt(112, 12) / 10;
        this.hdg = this.getInt(124, 9);
        this.utc = this.getInt(133, 6);

        this.name = this.getStr(143,120).trim();
        this.type = this.getInt(263,8);

        this.dimA = this.getInt(271, 9);
        this.dimB = this.getInt(280, 9);
        this.dimC = this.getInt(289, 6);
        this.dimD = this.getInt(295, 6);
        this.len  = this.dimA + this.dimB;
        this.wid  = this.dimC + this.dimD;
    }

    _decodeStaticVoyageData() {
        this.class = 'A';

        // Get the AIS Version indicator
        // 0 = station compliant with Recommendation ITU-R M.1371-1
        // 1 = station compliant with Recommendation ITU-R M.1371-3 (or later)
        // 2 = station compliant with Recommendation ITU-R M.1371-5 (or later)
        // 3 = station compliant with future editions

        const AIS_version_indicator = this.getInt(38,2);
        if (AIS_version_indicator < 3) {
            this.imo    = this.getInt(40, 30);
            this.sign   = this.getStr(70, 42).trim();
            this.name   = this.getStr(112, 120).trim();
            this.type   = this.getInt(232, 8);
            this.dimA   = this.getInt(240, 9);
            this.dimB   = this.getInt(249, 9);
            this.dimC   = this.getInt(258, 6);
            this.dimD   = this.getInt(264, 6);
            this.etaMo  = this.getInt(274, 4);
            this.etaDy  = this.getInt(278, 5);
            this.etaHr  = this.getInt(283, 5);
            this.etaMn  = this.getInt(288, 6);
            this.draft  = this.getInt(294, 8) / 10;
            this.dest   = this.getStr(302, 120).trim();
            this.len    = this.dimA + this.dimB;
            this.wid    = this.dimC + this.dimD;
            this.valid  = true;
        }
    }

    _decodeStaticDataReport() {
        this.class = 'B';
        this.part = this.getInt(38, 2);

        if (this.part === 0) {
            this.name = this.getStr(40, 120).trim();
            this.valid = true;
            return;
        }

        if (this.part === 1) {
            this.type = this.getInt(40, 8);
            this.sign = this.getStr(90, 42).trim();

            // 98 = auxiliary craft
            if (Math.floor(this.immsi / 10000000) === 98) {
                const mothership = this.getInt(132, 30);
                this.mothership = ('000000000' + mothership).slice(-9);
            } else {
                this.dimA = this.getInt(132, 9);
                this.dimB = this.getInt(141, 9);
                this.dimC = this.getInt(150, 6);
                this.dimD = this.getInt(156, 6);
                this.len  = this.dimA + this.dimB;
                this.wid  = this.dimC + this.dimD;
            }
            this.valid = true;
        }
    }

    _decodeBaseStationReport() {
        this.class = '-';

        const lon = this.getLon(79);
        const lat = this.getLat(107);

        if (lon <= 180 && lat <= 90) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;
    }

    _decodeSarAircraftReport() {
        this.class = '-';
        this.alt = this.getInt(38, 12);

        const lon = this.getLon(61);
        const lat = this.getLat(89);

        if (lon <= 180 && lat <= 90) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;

        //whole numbers for aircraft speed
        this.sog = this.getInt(50, 10);
        this.cog = this.getInt(116, 12) / 10;
    }

    _decodeAidToNavigation() {
        this.class = '-';
        this.type = this.getInt(38, 5);
        this.name = this.getStr(43, 120).trim();

        const lon = this.getLon(164);
        const lat = this.getLat(192);

        if (lon <= 180 && lat <= 90) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;

        this.dimA = this.getInt(219, 9);
        this.dimB = this.getInt(228, 9);
        this.dimC = this.getInt(237, 6);
        this.dimD = this.getInt(243, 6);
        this.len  = this.dimA + this.dimB;
        this.wid  = this.dimC + this.dimD;

        this.utc = this.getInt(253, 6);
        this.offpos = this.getInt(259, 1);
        this.virtual = this.getInt(269, 1);

        const len = Math.floor(((this.bitarray.length - 272 / 6) / 6) * 6) * 6;
        this.txt = this.getStr(272, len).trim();
    }

    _decodeTextMessage() {
        this.class = '-';
        if (this.bitarray.length > 40 / 6) {
            const len = Math.floor(((this.bitarray.length - 40 / 6) / 6) * 6) * 6;
            this.txt = this.getStr(40, len).trim();
            this.valid = true;
        }
    }

    _decodeLongRangeBroadcast() {
        this.class = '-';
        this.navstatus = this.getInt(40, 4);

        const lon = this.getInt(44, 18) / 600;
        const lat = this.getInt(62, 17) / 600;

        if (lon <= 180 && lat <= 90) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;

        this.sog = this.getInt(79, 6);
        this.cog = this.getInt(85, 9);
    }

    _validateChecksum(input) {
        if (typeof input !== 'string') return false;

        const loc1 = input.indexOf('!');
        const loc2 = input.indexOf('*');

        if (loc1 !== 0 || loc2 <= 0) return false;

        const body = input.substring(1, loc2);
        const checksum = input.substring(loc2 + 1);

        let sum = 0;
        for (let i = 0; i < body.length; i++) {
            sum ^= body.charCodeAt(i);  // xor based checksum
        }

        let hex = sum.toString(16).toUpperCase();
        if (hex.length === 1) hex = '0' + hex;  // single digit hex needs preceding 0, '0F'

        return (checksum === hex);
    }

    getLon(start) {
        let lon = this.getInt(start, 28);
        if (lon & 0x08000000) lon |= 0xf0000000;
        return lon / 600000;
    }

    getLat(start) {
        let lat = this.getInt(start, 27);
        if (lat & 0x04000000) lat |= 0xf8000000;
        return lat / 600000;
    }

    // Extract an integer sign or unsigned from payload
    getInt(start, len, signed) {
        let acc = 0;
        let cp, cx, c0, cs;

        for (let i = 0; i < len; i++) {
            acc = acc << 1;
            cp = Math.floor((start + i) / 6);
            cx = this.bitarray[cp];
            cs = 5 - ((start + i) % 6);
            c0 = (cx >> cs) & 1;

            if (i === 0 && signed && c0) { // if signed value and first bit is 1, pad with 1's
                acc = ~acc;
            }
            acc |= c0;

            //console.log ('**** bitarray[%d]=cx=%s i=%d cs=%d  co=%s acc=%s'
            //,cp , this.bitarray[cp].toString(2), i, cs,  c0.toString(2),acc.toString(2));
        }
        //console.log ('---- start=%d len=%d acc=%s acc=%d', start, len ,  acc.toString(2), acc);
        return acc;
    }

    // Extract a boolean (single bit) from payload
    getBool(start) {
        const cp = Math.floor(start / 6);
        const cs = 5 - (start % 6);
        return ((this.bitarray[cp] >> cs) & 1) === 1;
    }

    // Extract a string from payload [1st bits is index 0]
    getStr(start, len) {

        // extended message are not supported
        if (this.bitarray.length < (start + len) / 6) {
            //console.log ('AisDecode: ext msg not implemented getStr(%d,%d)', start, len);
            len = Math.floor(((this.bitarray.length - start / 6) / 6) * 6) * 6;
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
                cx = this.bitarray[cp];
                cs = 5 - ((start + i) % 6);
                c0 = (cx >> (5 - ((start + i) % 6))) & 1;
                acc |= c0;
                i++;
            }
            bytes[k] = acc;
            if (acc < 0x20) bytes[k] += 0x40;
            else            bytes[k] = acc;
            if (bytes[k] === 0x40) break; // name end with '@'
            k++;
        }

        return textDecoder.decode(bytes.subarray(0, k));
    }

    getNavStatus() {
        return NAV_STATUS[this.navstatus];
    }

    getAisType() {
        return MSG_TYPE[this.aistype];
    }

    getVesselType() {
        return VESSEL_TYPE[this.type];
    }

    // map ERI Classification to other vessel types
    getEriType(eri) {
        return ERI_TYPE[eri] ?? eri;
    }
}

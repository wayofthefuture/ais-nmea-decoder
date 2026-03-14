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

const defaultOptions = {
    preserveReserved: false
};

export default class AisDecode {
    constructor(input, session, options) {
        this.options = {...defaultOptions, ...options};
        this.bitarray = [];

        try {
            const parts = this._getMessageParts(input);

            const ready = this._parseMessage(parts, session);
            if (!ready) return;

            this._decodeBitArray();
            this._decodeMessageType(input);
            this._cleanDecoded();
        } catch (error) {
            this.error = error.message;
        }
    }

    _getMessageParts(input) {
        if (typeof input !== 'string') {
            throw new Error('AisDecode: Sentence is not of type string.');
        }

        input = input.trim();

        if (input.length === 0) {
            throw new Error('AisDecode: Sentence is empty or spaces.');
        }

        if (!this._validateChecksum(input)) {
            throw new Error('AisDecode: Sentence checksum is invalid.');
        }

        // split nmea message !AIVDM,1,1,,B,B69>7mh0?J<:>05B0`0e;wq2PHI8,0*3D'
        const parts = input.split(',');

        if (parts.length !== 7) {
            throw new Error('AisDecode: Sentence contains invalid number of parts.');
        }

        // AIVDM = standard ais message, AIVDO = own vessel through pilot plug
        if (parts[0] !== '!AIVDM' && parts[0] !== '!AIVDO') {
            throw new Error('AisDecode: Invalid message prefix.');
        }

        // positive total number of fragments
        if (Number(parts[1]) === 0) {
            throw new Error('AisDecode: Invalid fragment count.');
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

        const valid = this._validateFragment(session, messageType, currentFragment, sequenceId);
        if (!valid) return false;

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
            throw new Error('AisDecode: A session object is required to maintain state for decoding multi-fragment AIS messages.');
        }

        if (currentFragment <= 1) {
            return true;
        }

        if (messageType !== session.messageType) {
            throw new Error('AisDecode: Sentence does not match messageType of current session.');
        }

        if (session[currentFragment - 1] === undefined) {
            throw new Error('AisDecode: Session is missing prior fragment, cannot parse partial AIS message.');
        }

        if (session.sequenceId !== sequenceId) {
            throw new Error('AisDecode: Session IDs do not match. Cannot reconstruct AIS message.');
        }

        return true;
    }

    _combinePayloads(session) {
        const payloads = [];

        for (let i = 1; i <= session.totalFragments; ++i) {
            payloads.push(session[i].rawPayload);
        }

        this.payload = textEncoder.encode(payloads.join(''));
    }

    // Decode printable 6bit AIS/IEC binary format
    _decodeBitArray() {
        for (let i = 0; i < this.payload.length; i++) {
            let byte = this.payload[i];

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

            this.bitarray[i] = byte;
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

        this.lon = this.getLon(61);
        this.lat = this.getLat(89);
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in Class A position report');
        }

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

        this.lon = this.getLon(57);
        this.lat = this.getLat(85);
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in Class B position report');
        }

        this.sog = this.getInt(46, 10) / 10;
        this.cog = this.getInt(112, 12) / 10;
        this.hdg = this.getInt(124, 9);
        this.utc = this.getInt(134, 6);
        this.dsc = this.getBool(143);
    }

    _decodeExtendedClassBPositionReport() {
        this.class = 'B';
        this.status = -1;  // Class B targets have no status.  Enforce this...

        this.lon = this.getLon(57);
        this.lat = this.getLat(85);
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in Extended Class B position report');
        }

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

        this.ver   = this.getInt(38,2);
        this.imo   = this.getInt(40, 30);
        this.sign  = this.getStr(70, 42).trim();
        this.name  = this.getStr(112, 120).trim();
        this.type  = this.getInt(232, 8);

        this.dimA  = this.getInt(240, 9);
        this.dimB  = this.getInt(249, 9);
        this.dimC  = this.getInt(258, 6);
        this.dimD  = this.getInt(264, 6);

        this.etaMo = this.getInt(274, 4);
        this.etaDy = this.getInt(278, 5);
        this.etaHr = this.getInt(283, 5);
        this.etaMn = this.getInt(288, 6);
        this.draft = this.getInt(294, 8) / 10;
        this.dest  = this.getStr(302, 120).trim();

        this.len = this.dimA + this.dimB;
        this.wid = this.dimC + this.dimD;
    }

    _decodeStaticDataReport() {
        this.class = 'B';
        this.part = this.getInt(38, 2);

        if (this.part === 0) {
            this.name = this.getStr(40, 120).trim();
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
            return;
        }

        throw new Error('Invalid part number for static data report');
    }

    _decodeBaseStationReport() {
        this.class = '-';

        this.lon = this.getLon(79);
        this.lat = this.getLat(107);
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in Base Station report');
        }
    }

    _decodeSarAircraftReport() {
        this.class = '-';
        this.alt = this.getInt(38, 12);

        this.lon = this.getLon(61);
        this.lat = this.getLat(89);
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in SAR Aircraft report');
        }

        //whole numbers for aircraft speed
        this.sog = this.getInt(50, 10);
        this.cog = this.getInt(116, 12) / 10;
    }

    _decodeAidToNavigation() {
        this.class = '-';
        this.type = this.getInt(38, 5);
        this.name = this.getStr(43, 120).trim();

        this.lon = this.getLon(164);
        this.lat = this.getLat(192);
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in Aid to Navigation report');
        }

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

        if (this.bitarray.length <= 40 / 6) {
            throw new Error('Text message is too short');
        }

        const len = Math.floor(((this.bitarray.length - 40 / 6) / 6) * 6) * 6;
        this.txt = this.getStr(40, len).trim();
    }

    _decodeLongRangeBroadcast() {
        this.class = '-';
        this.navstatus = this.getInt(40, 4);

        // lon/lat has different format than other messages
        this.lon = this.getInt(44, 18) / 600;
        this.lat = this.getInt(62, 17) / 600;
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in Long Range Broadcast report');
        }

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

    _validatePosition(lon, lat) {
        return (Math.abs(lon) <= 180 && Math.abs(lat) <= 90);
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

    _cleanDecoded() {
        if (!this.options.preserveReserved) {
            if (this.sog === 102.3) {
                delete this.sog;
            }
            if (this.cog === 511) {
                delete this.cog;
            }
            if (this.hdg === 511) {
                delete this.hdg;
            }
        }
        // todo: add additional here
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

    getEriType(eri) {
        return ERI_TYPE[eri] ?? eri;
    }
}

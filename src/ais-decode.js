/*
Copyright 2014 Fulup Ar Foll
Copyright 2026 wayofthefuture

Licensed under the Apache License, Version 2.0
https://www.apache.org/licenses/LICENSE-2.0
*/

'use strict';

import {MSG_TYPE, NAV_STATUS, VESSEL_TYPE, ERI_TYPE} from './constants.js';
import PayloadBits from './payload-bits.js';

const enableLogging = false;
const textEncoder = new TextEncoder();

/**
 * @typedef {Object} AisDecodeOptions
 * @property {Boolean} [bypassClean] - Skip cleaning reserved values from decoded output.
 * @property {Array<[string, string]>} [propertyNames] - Map standard property names to custom property names.
 */

export default class AisDecode {
    constructor(input, session, options = {}) {
        this.options = options;

        try {
            const parts = this._getMessageParts(input);
            const ready = this._parseMessage(parts, session);
            if (!ready) return;

            this._decodeMessage(input);
        } catch (error) {
            this.error = error.message;
            return;
        }

        this._cleanDecoded();
        if (options.propertyNames) {
            this._mapProperties(options.propertyNames);
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

    _decodeMessage(input) {
        const bits = new PayloadBits(this.payload);

        this.aistype = bits.getInt(0,6);
        this.repeat  = bits.getInt(6,2);
        this.immsi   = bits.getInt(8,30);
        this.mmsi    = ('000000000' + this.immsi).slice(-9);

        switch (this.aistype) {
            case 1:
            case 2:
            case 3:
                this._decodeClassAPositionReport(bits);
                break;
            case 4:
            case 11:
                this._decodeBaseStationReport(bits);
                break;
            case 5:
                this._decodeStaticVoyageData(bits);
                break;
            case 9:
                this._decodeSarAircraftReport(bits);
                break;
            case 14:
                this._decodeTextMessage(bits);
                break;
            case 18:
                this._decodeClassBPositionReport(bits);
                break;
            case 19:
                this._decodeExtendedClassBPositionReport(bits);
                break;
            case 21:
                this._decodeAidToNavigation(bits);
                break;
            case 24:
                this._decodeStaticDataReport(bits);
                break;
            case 27:
                this._decodeLongRangeBroadcast(bits);
                break;
            default:
                if (enableLogging) console.log('---- type=%d %s %s -> %s', this.aistype, this.getAisType(this.aistype), this.mmsi, input);
                break;
        }
    }

    _decodeClassAPositionReport(bits) {
        this.class = 'A';
        this.navstatus = bits.getInt(38, 4);

        this.lon = bits.getLon(61);
        this.lat = bits.getLat(89);
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in Class A position report');
        }

        this.rot = bits.getInt(42, 8, true)
        this.sog = bits.getInt(50, 10) / 10;
        this.cog = bits.getInt(116, 12) / 10;
        this.hdg = bits.getInt(128, 9);
        this.utc = bits.getInt(137, 6);
        this.smi = bits.getInt(143, 2);
    }

    _decodeClassBPositionReport(bits) {
        this.class = 'B';
        this.status = -1;  // Class B targets have no status.  Enforce this...
        this.repeat = bits.getInt(6,2);
        this.accuracy = bits.getInt(56, 1);

        this.lon = bits.getLon(57);
        this.lat = bits.getLat(85);
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in Class B position report');
        }

        this.sog = bits.getInt(46, 10) / 10;
        this.cog = bits.getInt(112, 12) / 10;
        this.hdg = bits.getInt(124, 9);
        this.utc = bits.getInt(134, 6);
        this.dsc = bits.getBool(143);
    }

    _decodeExtendedClassBPositionReport(bits) {
        this.class = 'B';
        this.status = -1;  // Class B targets have no status.  Enforce this...

        this.lon = bits.getLon(57);
        this.lat = bits.getLat(85);
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in Extended Class B position report');
        }

        this.sog = bits.getInt(46, 10) / 10;
        this.cog = bits.getInt(112, 12) / 10;
        this.hdg = bits.getInt(124, 9);
        this.utc = bits.getInt(133, 6);

        this.name = bits.getStr(143,120).trim();
        this.type = bits.getInt(263,8);

        this.dimA = bits.getInt(271, 9);
        this.dimB = bits.getInt(280, 9);
        this.dimC = bits.getInt(289, 6);
        this.dimD = bits.getInt(295, 6);
        this.len  = this.dimA + this.dimB;
        this.wid  = this.dimC + this.dimD;
    }

    _decodeStaticVoyageData(bits) {
        this.class = 'A';

        this.ver   = bits.getInt(38,2);
        this.imo   = bits.getInt(40, 30);
        this.sign  = bits.getStr(70, 42).trim();
        this.name  = bits.getStr(112, 120).trim();
        this.type  = bits.getInt(232, 8);

        this.dimA  = bits.getInt(240, 9);
        this.dimB  = bits.getInt(249, 9);
        this.dimC  = bits.getInt(258, 6);
        this.dimD  = bits.getInt(264, 6);

        this.etaMo = bits.getInt(274, 4);
        this.etaDy = bits.getInt(278, 5);
        this.etaHr = bits.getInt(283, 5);
        this.etaMn = bits.getInt(288, 6);
        this.draft = bits.getInt(294, 8) / 10;
        this.dest  = bits.getStr(302, 120).trim();

        this.len = this.dimA + this.dimB;
        this.wid = this.dimC + this.dimD;
    }

    _decodeStaticDataReport(bits) {
        this.class = 'B';
        this.part = bits.getInt(38, 2);

        if (this.part === 0) {
            this.name = bits.getStr(40, 120).trim();
            return;
        }

        if (this.part === 1) {
            this.type = bits.getInt(40, 8);
            this.sign = bits.getStr(90, 42).trim();

            // 98 = auxiliary craft
            if (Math.floor(this.immsi / 10000000) === 98) {
                const mothership = bits.getInt(132, 30);
                this.mothership = ('000000000' + mothership).slice(-9);
            } else {
                this.dimA = bits.getInt(132, 9);
                this.dimB = bits.getInt(141, 9);
                this.dimC = bits.getInt(150, 6);
                this.dimD = bits.getInt(156, 6);
                this.len  = this.dimA + this.dimB;
                this.wid  = this.dimC + this.dimD;
            }
            return;
        }

        throw new Error('Invalid part number for static data report');
    }

    _decodeBaseStationReport(bits) {
        this.class = '-';

        this.lon = bits.getLon(79);
        this.lat = bits.getLat(107);
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in Base Station report');
        }
    }

    _decodeSarAircraftReport(bits) {
        this.class = '-';
        this.alt = bits.getInt(38, 12);

        this.lon = bits.getLon(61);
        this.lat = bits.getLat(89);
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in SAR Aircraft report');
        }

        //whole numbers for aircraft speed
        this.sog = bits.getInt(50, 10);
        this.cog = bits.getInt(116, 12) / 10;
    }

    _decodeAidToNavigation(bits) {
        this.class = '-';
        this.type = bits.getInt(38, 5);
        this.name = bits.getStr(43, 120).trim();

        this.lon = bits.getLon(164);
        this.lat = bits.getLat(192);
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in Aid to Navigation report');
        }

        this.dimA = bits.getInt(219, 9);
        this.dimB = bits.getInt(228, 9);
        this.dimC = bits.getInt(237, 6);
        this.dimD = bits.getInt(243, 6);
        this.len  = this.dimA + this.dimB;
        this.wid  = this.dimC + this.dimD;

        this.utc = bits.getInt(253, 6);
        this.offpos = bits.getInt(259, 1);
        this.virtual = bits.getInt(269, 1);

        const bitLen = bits.getLength();
        const txtLen = Math.floor(((bitLen - 272 / 6) / 6) * 6) * 6;
        this.text = bits.getStr(272, txtLen).trim();
    }

    _decodeTextMessage(bits) {
        this.class = '-';

        const bitLen = bits.getLength();
        if (bitLen <= 40 / 6) {
            throw new Error('Text message is too short');
        }

        const txtLen = Math.floor(((bitLen - 40 / 6) / 6) * 6) * 6;
        this.text = bits.getStr(40, txtLen).trim();
    }

    _decodeLongRangeBroadcast(bits) {
        this.class = '-';
        this.navstatus = bits.getInt(40, 4);

        // lon/lat has different format than other messages
        this.lon = bits.getInt(44, 18) / 600;
        this.lat = bits.getInt(62, 17) / 600;
        if (!this._validatePosition(this.lon, this.lat)) {
            throw new Error('Invalid longitude/latitude in Long Range Broadcast report');
        }

        this.sog = bits.getInt(79, 6);
        this.cog = bits.getInt(85, 9);
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

    // Apply encoded undefined values to the decoded object
    _cleanDecoded() {
        if (this.options.bypassClean) return;

        if (this.sog === 102.3) {
            delete this.sog;
        }
        if (this.cog === 511) {
            delete this.cog;
        }
        if (this.hdg === 511) {
            delete this.hdg;
        }

        //todo: more needed here
    }

    // Map standard property names to custom property names
    _mapProperties(propertyNames) {
        for (const [key, value] of propertyNames) {
            if (this[key] === undefined) continue;
            this[value] = this[key];
            delete this[key];
        }
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

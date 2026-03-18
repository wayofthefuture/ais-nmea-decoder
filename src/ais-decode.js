/*
Copyright 2014 Fulup Ar Foll
Copyright 2026 wayofthefuture

Licensed under the Apache License, Version 2.0
https://www.apache.org/licenses/LICENSE-2.0
*/

import {checkQuality, configureQuality} from './check-quality.js';
import {MSG_TYPE, NAV_STATUS, VESSEL_TYPE, ERI_TYPE} from './constants.js';
import PayloadBits from './payload-bits.js';

const enableLogging = false;
const textEncoder = new TextEncoder();

export const defaultOptions = {
    cleanDecoded: false,     // Delete encoded undefined variables (i.e. sog will be undefined vs 102.3).
    propertyNames: null,     // Map vessel properties names to custom property names.
    qualityCheck: false,     // Perform additional data integrity checks according to `qualityOptions`.
    qualityOptions: {
        requiredDynamic: 2,  // Number of required consecutive messages with position for an mmsi before accepting.
        requiredStatic: 1,   // Number of required consecutive messages with static information for an mmsi before accepting.
        maxDistanceNm: 1     // Maximum distance in nautical miles between consecutive position reports within the distance timeout.
    }
};

export default class AisDecode {
    constructor(options) {
        this.options = {...defaultOptions, ...options};
        configureQuality(this.options.qualityOptions);
    }
    
    parse(input) {
        try {
            const data = this._getMessageData(input);
            const result = this._parseMessage(data);
            if (result.pending) return result;

            this._decodeMessage(result, input);
            if (this.options.qualityCheck) checkQuality();

            this._cleanDecoded(result);
            this._mapProperties(result);

            return result;
        } catch (error) {
            return {error: error.message};
        }
    }

    _getMessageData(input) {
        if (typeof input !== 'string') {
            throw new Error('Sentence is not of type string.');
        }

        input = input.trim();

        if (input.length === 0) {
            throw new Error('Sentence is empty or spaces.');
        }

        if (!this._validateChecksum(input)) {
            throw new Error('Sentence checksum is invalid.');
        }

        // split nmea message !AIVDM,1,1,,B,B69>7mh0?J<:>05B0`0e;wq2PHI8,0*3D'
        const parts = input.split(',');
        if (parts.length !== 7) {
            throw new Error('Sentence contains invalid number of parts.');
        }
        
        let [messagePrefix, totalFragments, currentFragment, sequenceId, channel, rawPayload] = parts;

        // AIVDM = standard ais message, AIVDO = own vessel through pilot plug
        if (messagePrefix !== '!AIVDM' && messagePrefix !== '!AIVDO') {
            throw new Error('Invalid message prefix: ' + messagePrefix);
        }

        if (!isNumeric(totalFragments)) {
            throw new Error('Invalid total fragment count.');
        }

        if (!isNumeric(currentFragment)) {
            throw new Error('Invalid fragment number.');
        }
        
        if (!rawPayload.trim().length) {
            throw new Error('Payload is empty.');
        }

        totalFragments = +totalFragments;
        currentFragment = +currentFragment;
        
        return {messagePrefix, totalFragments, currentFragment, sequenceId, channel, rawPayload};
    }
    
    // Parse message fragments into a session object and return the encoded payload when all fragments have been received
    _parseMessage(data) {
        const {totalFragments, currentFragment, channel, rawPayload} = data;

        const result = {channel};

        // one-part message
        if (totalFragments === 1) {
            result.payload = textEncoder.encode(rawPayload);
            return result;
        }
        if (totalFragments !== 2) {
            throw new Error('Invalid total fragment count.');
        }

        // parse two-part message - store data for validation - always overwrite session on new two-part sequence
        if (currentFragment === 1) {
            this.session = data;
            this.session.receive = Date.now();
            result.pending = true;
            return result;
        }
        if (currentFragment !== 2) {
            throw new Error('Invalid fragment number for two-part message.');
        }

        const error = this._validateTwoPart(this.session, data);
        if (error) {
            this.session = undefined;
            throw new Error(error);
        }

        // encode combined part 1 and part 2 message payloads
        result.payload = textEncoder.encode(this.session.rawPayload + rawPayload);
        this.session = undefined;
        return result;
    }

    // Validate a two-part message (type 5, 19) and ensure that parts from different vessels aren't mis-matched
    _validateTwoPart(session, data) {
        if (!session) {
            return 'Part 1 missing from two-part message.';
        }

        // implement a timeout since we have no absolute way to determine if the 2nd message pairs with the 1st
        if (Date.now() - session.receive > 3_000) {
            return 'Part 2 message is too old relative to part 1.';
        }

        if (session.messagePrefix !== data.messagePrefix) {
            return 'Part 2 message does not match part 1 message prefix.';
        }

        if (session.sequenceId !== data.sequenceId) {
            return 'Part 2 message sequence id does not match part 1 sequence id.';
        }

        if (session.channel !== data.channel) {
            return 'Part 2 message channel does not match part 1 channel.';
        }

        return false;
    }

    _decodeMessage(result, input) {
        const bits = new PayloadBits(result.payload);

        result.mtype  = bits.getInt(0, 6);
        result.repeat = bits.getInt(6, 2);
        result.mmsi   = bits.getInt(8, 30);

        switch (result.mtype) {
            case 1:
            case 2:
            case 3:
                this._decodeClassAPositionReport(bits, result);
                break;
            case 4:
            case 11:
                this._decodeBaseStationReport(bits, result);
                break;
            case 5:
                this._decodeStaticVoyageData(bits, result);
                break;
            case 9:
                this._decodeSarAircraftReport(bits, result);
                break;
            case 14:
                this._decodeTextMessage(bits, result);
                break;
            case 18:
                this._decodeClassBPositionReport(bits, result);
                break;
            case 19:
                this._decodeExtendedClassBPositionReport(bits, result);
                break;
            case 21:
                this._decodeAidToNavigation(bits, result);
                break;
            case 24:
                this._decodeStaticDataReport(bits, result);
                break;
            case 27:
                this._decodeLongRangeBroadcast(bits, result);
                break;
            default:
                if (enableLogging) console.log('---- type=%d %s %s -> %s', result.mtype, this.getAisType(result.mtype), result.mmsi, input);
                throw new Error('Invalid message type: ' + result.mtype);
        }
        
        return result;
    }

    _decodeClassAPositionReport(bits, res) {
        res.class = 'A';
        res.nav = bits.getInt(38, 4);

        res.lon = bits.getLon(61);
        res.lat = bits.getLat(89);
        if (!this._validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in Class A position report');
        }

        res.rot = bits.getInt(42, 8, true)
        res.sog = bits.getInt(50, 10) / 10;
        res.cog = bits.getInt(116, 12) / 10;
        res.hdg = bits.getInt(128, 9);
        res.utc = bits.getInt(137, 6);
        res.smi = bits.getInt(143, 2);
    }

    _decodeClassBPositionReport(bits, res) {
        res.class = 'B';
        res.repeat = bits.getInt(6,2);
        res.accuracy = bits.getInt(56, 1);

        res.lon = bits.getLon(57);
        res.lat = bits.getLat(85);
        if (!this._validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in Class B position report');
        }

        res.sog = bits.getInt(46, 10) / 10;
        res.cog = bits.getInt(112, 12) / 10;
        res.hdg = bits.getInt(124, 9);
        res.utc = bits.getInt(134, 6);
        res.dsc = bits.getBool(143);
    }

    _decodeExtendedClassBPositionReport(bits, res) {
        res.class = 'B';

        res.lon = bits.getLon(57);
        res.lat = bits.getLat(85);
        if (!this._validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in Extended Class B position report');
        }

        res.sog  = bits.getInt(46, 10) / 10;
        res.cog  = bits.getInt(112, 12) / 10;
        res.hdg  = bits.getInt(124, 9);
        res.utc  = bits.getInt(133, 6);
        res.name = bits.getStr(143,120);
        res.type = bits.getInt(263,8);
        res.dimA = bits.getInt(271, 9);
        res.dimB = bits.getInt(280, 9);
        res.dimC = bits.getInt(289, 6);
        res.dimD = bits.getInt(295, 6);
        res.len  = res.dimA + res.dimB;
        res.wid  = res.dimC + res.dimD;
    }

    _decodeStaticVoyageData(bits, res) {
        res.class = 'A';
        res.ver   = bits.getInt(38,2);
        res.imo   = bits.getInt(40, 30);
        res.sign  = bits.getStr(70, 42);
        res.name  = bits.getStr(112, 120);
        res.type  = bits.getInt(232, 8);
        res.dimA  = bits.getInt(240, 9);
        res.dimB  = bits.getInt(249, 9);
        res.dimC  = bits.getInt(258, 6);
        res.dimD  = bits.getInt(264, 6);
        res.etaMo = bits.getInt(274, 4);
        res.etaDy = bits.getInt(278, 5);
        res.etaHr = bits.getInt(283, 5);
        res.etaMn = bits.getInt(288, 6);
        res.draft = bits.getInt(294, 8) / 10;
        res.dest  = bits.getStr(302, 120);

        res.len = res.dimA + res.dimB;
        res.wid = res.dimC + res.dimD;
    }

    // Decode type 24 static data report which comes in multiple formats based on the specification.
    // Note that `part` here is a message format (A/B) identifier rather than a message part number.
    // Message format `B` also has two sub formats (mothership/dimensions)
    _decodeStaticDataReport(bits, res) {
        res.class = 'B';
        res.part = bits.getInt(38, 2);

        // Message format `A`
        if (res.part === 0) {
            res.name = bits.getStr(40, 120);
            return;
        }

        // Message format `B` - auxilary craft - an MMSI is associated with an auxiliary craft when it is of the form 98XXXYYYY
        if (res.part === 1 && String(res.mmsi).length === 9 && String(res.mmsi).startsWith('98')) {
            res.type = bits.getInt(40, 8);
            res.sign = bits.getStr(90, 42);
            res.mother = bits.getInt(132, 30);
            return;
        }

        // Message format `B` - non-auxilary craft
        if (res.part === 1) {
            res.type = bits.getInt(40, 8);
            res.sign = bits.getStr(90, 42);
            res.dimA = bits.getInt(132, 9);
            res.dimB = bits.getInt(141, 9);
            res.dimC = bits.getInt(150, 6);
            res.dimD = bits.getInt(156, 6);
            res.len  = res.dimA + res.dimB;
            res.wid  = res.dimC + res.dimD;
            return;
        }

        throw new Error('Invalid part number for static data report');
    }

    _decodeBaseStationReport(bits, res) {
        res.lon = bits.getLon(79);
        res.lat = bits.getLat(107);
        if (!this._validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in Base Station report');
        }
    }

    _decodeSarAircraftReport(bits, res) {
        res.alt = bits.getInt(38, 12);

        res.lon = bits.getLon(61);
        res.lat = bits.getLat(89);
        if (!this._validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in SAR Aircraft report');
        }

        //whole numbers for aircraft speed
        res.sog = bits.getInt(50, 10);
        res.cog = bits.getInt(116, 12) / 10;
    }

    _decodeAidToNavigation(bits, res) {
        res.type = bits.getInt(38, 5);
        res.name = bits.getStr(43, 120) + bits.getStr(272);  // name + name extension

        res.lon = bits.getLon(164);
        res.lat = bits.getLat(192);
        if (!this._validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in Aid to Navigation report');
        }

        res.dimA = bits.getInt(219, 9);
        res.dimB = bits.getInt(228, 9);
        res.dimC = bits.getInt(237, 6);
        res.dimD = bits.getInt(243, 6);
        res.utc  = bits.getInt(253, 6);

        res.len  = res.dimA + res.dimB;
        res.wid  = res.dimC + res.dimD;
    }

    _decodeTextMessage(bits, res) {
        const text = bits.getStr(40);
        if (!text) throw new Error('Text message is empty');
        res.text = text;
    }

    _decodeLongRangeBroadcast(bits, res) {
        res.nav = bits.getInt(40, 4);

        // lon/lat has different format than other messages
        res.lon = bits.getInt(44, 18) / 600;
        res.lat = bits.getInt(62, 17) / 600;
        if (!this._validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in Long Range Broadcast report');
        }

        res.sog = bits.getInt(79, 6);
        res.cog = bits.getInt(85, 9);
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

    // Delete encoded undefined variables (i.e. sog will be undefined vs 102.3)
    _cleanDecoded(result) {
        if (!this.options.cleanDecoded) return;

        if (result.sog === 102.3) {
            delete result.sog;
        }
        if (result.cog === 511) {
            delete result.cog;
        }
        if (result.hdg === 511) {
            delete result.hdg;
        }

        //todo: more needed here
    }

    // Map standard property names to custom property names
    _mapProperties(result) {
        const {propertyNames} = this.options;
        if (!propertyNames) return;

        for (const [key, value] of propertyNames) {
            if (result[key] === undefined) continue;
            result[value] = result[key];
            delete result[key];
        }
    }

    getNavStatus(nav) {
        return NAV_STATUS[nav];
    }

    getAisType(mtype) {
        return MSG_TYPE[mtype];
    }

    getVesselType(type) {
        return VESSEL_TYPE[type];
    }

    getEriType(eri) {
        return ERI_TYPE[eri] ?? eri;
    }
}

function isNumeric(val) {
    return (!isNaN(parseFloat(val)) && isFinite(val));  //should return true if string number or actual number, i.e. '5' or 5
}

/*
Copyright 2014 Fulup Ar Foll
Copyright 2026 wayofthefuture

Licensed under the Apache License, Version 2.0
https://www.apache.org/licenses/LICENSE-2.0
*/

import {MSG_TYPE} from './constants';
import {PayloadBits} from './payload-bits';
import type {AisParsedMessage, AisParseResult, AisPayloadMessage, AisSuccessResult} from './definitions';

const textEncoder = new TextEncoder();

export type AisDecoderOptions = {
    /**
     * Enable logging of unknown message types to the console.
     */
    enableLogging?: boolean;
    /**
     * Rename default property names to custom property names according to `propertyMap`.
     */
    mapPropertyNames?: boolean;
    /**
     * Rename default property names to custom property names.
     */
    propertyMap?: [string, string][] | null;
};

export type AisMessageData = {
    messagePrefix: string;
    totalFragments: number;
    currentFragment: number;
    sequenceId: string;
    channel: string;
    rawPayload: string;
}

/** Part 1 of a two-part message held until part 2 arrives, stamped with its receive time */
type SessionData = AisMessageData & {
    receive: number;
}

export const defaultOptions = {
    enableLogging: false,
    mapPropertyNames: false,
    propertyMap: null
};

/**
 * Determine if the result is a successful parse and narrow the type to the {@link AisSuccessResult}
 * @param result
 */
export function isDecoded(result: AisParseResult): result is AisSuccessResult {
    return result.status === 'decoded';
}

/**
 * AIS NMEA sentence decoder.
 * This decoder is stateful and will store the last two-part message in memory.
 */
export class AisDecoder {
    private options: Required<AisDecoderOptions>;
    private session: SessionData | undefined;

    constructor(options?: AisDecoderOptions) {
        this.options = {...defaultOptions, ...options};
    }

    /**
     * Parse an AIS NMEA sentence.
     * @param input The AIS NMEA sentence to parse.
     * @returns The parsed AIS message.
     */
    parse(input: string): AisParseResult {
        try {
            const data = this.getMessageData(input);
            const parsed = this.parseMessage(data);
            if (parsed.status === 'pending') return parsed;

            const result = this.decodeMessage(parsed, input);
            if (this.options.mapPropertyNames) this.mapProperties(result);

            return result;
        } catch (error) {
            return {status: 'error', error: error.message};
        }
    }

    private getMessageData(input: string): AisMessageData {
        if (typeof input !== 'string') {
            throw new Error('Sentence is not of type string.');
        }

        input = input.trim();

        if (input.length === 0) {
            throw new Error('Sentence is empty or spaces.');
        }

        const data = this.parseNmeaSentence(input);
        if (!data) {
            throw new Error('Sentence is invalid or fails checksum.');
        }

        const parts = data.split(',');
        if (parts.length !== 7) {
            throw new Error('Sentence contains invalid number of parts.');
        }

        // Safe to assert: the length check above guarantees all 7 elements exist
        let [messagePrefix, totalFragments, currentFragment, sequenceId, channel, rawPayload] =
            parts as [string, string, string, string, string, string, string];

        // AIVDM = standard ais message, AIVDO = own vessel through pilot plug
        if (messagePrefix !== 'AIVDM' && messagePrefix !== 'AIVDO') {
            throw new Error('Invalid message prefix: ' + messagePrefix);
        }

        if (!isNumeric(totalFragments)) {
            throw new Error('Invalid total fragment count.');
        }

        if (!isNumeric(currentFragment)) {
            throw new Error('Invalid fragment number.');
        }

        if (!rawPayload?.trim().length) {
            throw new Error('Payload is empty.');
        }

        return {
            messagePrefix,
            totalFragments: +totalFragments,
            currentFragment: +currentFragment,
            sequenceId,
            channel,
            rawPayload
        };
    }

    // Parse message fragments into a session object and return the encoded payload when all fragments have been received
    private parseMessage(data: AisMessageData): AisParsedMessage {
        const {totalFragments, currentFragment, channel, rawPayload} = data;

        // one-part message
        if (totalFragments === 1) {
            return {
                status: 'decoded',
                payload: textEncoder.encode(rawPayload),
                channel
            };
        }
        if (totalFragments !== 2) {
            throw new Error('Invalid total fragment count.');
        }

        // parse two-part message - store data for validation - always overwrite session on new two-part sequence
        if (currentFragment === 1) {
            this.session = data as SessionData;  //no clone on the hot-path
            this.session.receive = Date.now();
            return {
                status: 'pending',
                channel
            };
        }
        if (currentFragment !== 2) {
            throw new Error('Invalid fragment number for two-part message.');
        }

        const session = this.session;
        if (!session) {
            throw new Error('Part 1 missing from two-part message.');
        }

        const error = this.validateTwoPart(session, data);
        if (error) {
            this.session = undefined;
            throw new Error(error);
        }

        // encode combined part 1 and part 2 message payloads
        let payload = textEncoder.encode(session.rawPayload + rawPayload);
        this.session = undefined;
        return {status: 'decoded', payload, channel};
    }

    /**
     * Validate a two-part message (type 5, 19) and ensure that parts from different vessels aren't mis-matched
     */
    private validateTwoPart(session: SessionData, data: AisMessageData) {
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

    private decodeMessage(message: AisPayloadMessage, input: string): AisSuccessResult {
        const result = message as AisSuccessResult;
        const bits = new PayloadBits(result.payload);

        result.mtype = bits.getInt(0, 6);
        result.repeat = bits.getInt(6, 2);
        result.mmsi = bits.getInt(8, 30);

        switch (result.mtype) {
            case 1:
            case 2:
            case 3:
                this.decodeClassAPositionReport(bits, result);
                break;
            case 4:
            case 11:
                this.decodeBaseStationReport(bits, result);
                break;
            case 5:
                this.decodeStaticVoyageData(bits, result);
                break;
            case 9:
                this.decodeSarAircraftReport(bits, result);
                break;
            case 14:
                this.decodeTextMessage(bits, result);
                break;
            case 18:
                this.decodeClassBPositionReport(bits, result);
                break;
            case 19:
                this.decodeExtendedClassBPositionReport(bits, result);
                break;
            case 21:
                this.decodeAidToNavigation(bits, result);
                break;
            case 24:
                this.decodeStaticDataReport(bits, result);
                break;
            case 27:
                this.decodeLongRangeBroadcast(bits, result);
                break;
            default:
                if (this.options.enableLogging) console.log('---- type=%d %s %s -> %s', result.mtype, MSG_TYPE[result.mtype], result.mmsi, input);
                throw new Error('Invalid message type: ' + result.mtype);
        }

        return result;
    }

    private decodeClassAPositionReport(bits: PayloadBits, res: AisSuccessResult) {
        res.class = 'A';
        res.nav = bits.getInt(38, 4);

        res.lon = bits.getLon(61);
        res.lat = bits.getLat(89);
        if (!this.validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in Class A position report');
        }

        res.rot = bits.getInt(42, 8, true)
        res.sog = bits.getInt(50, 10) / 10;
        res.cog = bits.getInt(116, 12) / 10;
        res.hdg = bits.getInt(128, 9);
        res.utc = bits.getInt(137, 6);
        res.smi = bits.getInt(143, 2);
    }

    private decodeClassBPositionReport(bits: PayloadBits, res: AisSuccessResult) {
        res.class = 'B';
        res.repeat = bits.getInt(6, 2);
        res.accuracy = bits.getInt(56, 1);

        res.lon = bits.getLon(57);
        res.lat = bits.getLat(85);
        if (!this.validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in Class B position report');
        }

        res.sog = bits.getInt(46, 10) / 10;
        res.cog = bits.getInt(112, 12) / 10;
        res.hdg = bits.getInt(124, 9);
        res.utc = bits.getInt(134, 6);
        res.dsc = bits.getBool(143);
    }

    private decodeExtendedClassBPositionReport(bits: PayloadBits, res: AisSuccessResult) {
        res.class = 'B';

        res.lon = bits.getLon(57);
        res.lat = bits.getLat(85);
        if (!this.validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in Extended Class B position report');
        }

        res.sog = bits.getInt(46, 10) / 10;
        res.cog = bits.getInt(112, 12) / 10;
        res.hdg = bits.getInt(124, 9);
        res.utc = bits.getInt(133, 6);
        res.name = bits.getStr(143, 120);
        res.type = bits.getInt(263, 8);
        res.dimA = bits.getInt(271, 9);
        res.dimB = bits.getInt(280, 9);
        res.dimC = bits.getInt(289, 6);
        res.dimD = bits.getInt(295, 6);

        res.len = res.dimA + res.dimB;
        res.wid = res.dimC + res.dimD;
    }

    private decodeStaticVoyageData(bits: PayloadBits, res: AisSuccessResult) {
        res.class = 'A';
        res.ver = bits.getInt(38, 2);
        res.imo = bits.getInt(40, 30);
        res.sign = bits.getStr(70, 42);
        res.name = bits.getStr(112, 120);
        res.type = bits.getInt(232, 8);
        res.dimA = bits.getInt(240, 9);
        res.dimB = bits.getInt(249, 9);
        res.dimC = bits.getInt(258, 6);
        res.dimD = bits.getInt(264, 6);
        res.etaMo = bits.getInt(274, 4);
        res.etaDy = bits.getInt(278, 5);
        res.etaHr = bits.getInt(283, 5);
        res.etaMn = bits.getInt(288, 6);
        res.draft = bits.getInt(294, 8) / 10;
        res.dest = bits.getStr(302, 120);

        res.len = res.dimA + res.dimB;
        res.wid = res.dimC + res.dimD;
    }

    /**
     * Decode type 24 static data report which comes in multiple formats based on the specification.
     * Note that `part` here is a message format (A/B) identifier rather than a message part number.
     * Message format `B` also has two sub formats (mothership/dimensions)
     */
    private decodeStaticDataReport(bits: PayloadBits, res: AisSuccessResult) {
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
            res.len = res.dimA + res.dimB;
            res.wid = res.dimC + res.dimD;
            return;
        }

        throw new Error('Invalid part number for static data report');
    }

    private decodeBaseStationReport(bits: PayloadBits, res: AisSuccessResult) {
        res.lon = bits.getLon(79);
        res.lat = bits.getLat(107);
        if (!this.validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in Base Station report');
        }
    }

    private decodeSarAircraftReport(bits: PayloadBits, res: AisSuccessResult) {
        res.alt = bits.getInt(38, 12);

        res.lon = bits.getLon(61);
        res.lat = bits.getLat(89);
        if (!this.validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in SAR Aircraft report');
        }

        //whole numbers for aircraft speed
        res.sog = bits.getInt(50, 10);
        res.cog = bits.getInt(116, 12) / 10;
    }

    private decodeAidToNavigation(bits: PayloadBits, res: AisSuccessResult) {
        res.type = bits.getInt(38, 5);
        res.name = bits.getStr(43, 120) + bits.getStr(272);  // name + name extension

        res.lon = bits.getLon(164);
        res.lat = bits.getLat(192);
        if (!this.validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in Aid to Navigation report');
        }

        res.dimA = bits.getInt(219, 9);
        res.dimB = bits.getInt(228, 9);
        res.dimC = bits.getInt(237, 6);
        res.dimD = bits.getInt(243, 6);
        res.utc = bits.getInt(253, 6);

        res.len = res.dimA + res.dimB;
        res.wid = res.dimC + res.dimD;
    }

    private decodeTextMessage(bits: PayloadBits, res: AisSuccessResult) {
        const text = bits.getStr(40);
        if (!text) throw new Error('Text message is empty');
        res.text = text;
    }

    private decodeLongRangeBroadcast(bits: PayloadBits, res: AisSuccessResult) {
        res.nav = bits.getInt(40, 4);

        // lon/lat has different format than other messages
        res.lon = bits.getInt(44, 18) / 600;
        res.lat = bits.getInt(62, 17) / 600;
        if (!this.validatePosition(res.lon, res.lat)) {
            throw new Error('Invalid longitude/latitude in Long Range Broadcast report');
        }

        res.sog = bits.getInt(79, 6);
        res.cog = bits.getInt(85, 9);
    }

    /**
     * Validate nmea checksum with the specified character prefix
     * @param sentence The NMEA sentence to validate.
     * @param symbol The character prefix to use for validation.
     * @returns The message without symbol/checksum if valid, or null if invalid.
     */
    private parseNmeaSentence(sentence: string, symbol = '!'): string | null {
        const start = sentence.indexOf(symbol) + 1;
        if (start !== 1) return null;

        const asterisk = sentence.indexOf('*');
        if (asterisk <= start) return null;

        //perform checksum using xor based calculation
        let checksum = 0;
        for (let i = start; i < asterisk; i++) {
            checksum ^= sentence.charCodeAt(i);
        }

        const checked = checksum.toString(16).toUpperCase().padStart(2, '0');  //i.e. '0F'
        const provided = sentence.slice(asterisk + 1, asterisk + 3).toUpperCase();
        if (checked !== provided) return null;

        return sentence.substring(start, asterisk);
    }

    private validatePosition(lon: number, lat: number): boolean {
        return (Math.abs(lon) <= 180 && Math.abs(lat) <= 90);
    }

    /**
     * Map standard property names to custom property names
     */
    private mapProperties(result: AisSuccessResult) {
        const {propertyMap} = this.options;
        if (!propertyMap) return;

        for (const [key, value] of propertyMap) {
            if (key === 'status' || result[key] === undefined) continue;
            result[value] = result[key];
            delete result[key];
        }
    }
}

/**
 * Check if a value is a finite number or a string containing a finite number (i.e. '5.5' or 5.5)
 */
export function isNumeric(val: unknown): val is string | number {
    return !Number.isNaN(parseFloat(val as string)) && Number.isFinite(Number(val));
}

/*
Copyright 2014 Fulup Ar Foll
Copyright 2026 wayofthefuture

Licensed under the Apache License, Version 2.0
https://www.apache.org/licenses/LICENSE-2.0
*/

// Reference: http://catb.org/gpsd/AIVDM.html

'use strict';

import {MSG_TYPE, NAV_STATUS, VESSEL_TYPE, ERI_SHIPTYPE_MAP} from'./constants';

const DEBUG = false;


// Ais payload is represented in a 6bits encoded string !(
// This method is a direct transcription in nodejs of C++ ais-decoder code
class AisDecode {
    constructor(input, session) {
        this.bitarray = [];
        this.valid = false; // will move to 'true' if parsing succeed
        this.error = '';    // for returning error message if not valid

        if (Object.prototype.toString.call(input) !== '[object String]') {
            this.error = 'AisDecode: Sentence is not of type string.';
            return;
        } else {
            input = input.trim();
        }

        if (input.length === 0) {
            this.error = 'AisDecode: Sentence is empty or spaces.';
            return;
        } else if (!this.validateChecksum(input)) {
            this.error = 'AisDecode: Sentence checksum is invalid.';
            return;
        }

        // split nmea message !AIVDM,1,1,,B,B69>7mh0?J<:>05B0`0e;wq2PHI8,0*3D'
        const nmea = input.split(',');

        if (nmea.length !== 7) {
            this.error = 'AisDecode: Sentence contains invalid number of parts.';
            return;
        } else if (nmea[0] !== '!AIVDM' && nmea[0] !== '!AIVDO') {   //AIVDM = standard, AIVDO = own ship
            this.error = 'AisDecode: Invalid message prefix.';
            return;
        }

        // the input string is part of a multipart message, make sure we were
        // passed a session object.
        const message_count = Number(nmea[1]);
        const message_id = Number(nmea[2]);
        const sequence_id = nmea[3].length > 0 ? Number(nmea[3]) : NaN;

        if (message_count > 1) {
            if (Object.prototype.toString.call(session) !== '[object Object]') {
                throw 'A session object is required to maintain state for decoding multipart AIS messages.';
            }

            if (message_id > 1) {
                if (nmea[0] !== session.formatter) {
                    this.error = 'AisDecode: Sentence does not match formatter of current session.';
                    return;
                }

                if (session[message_id - 1] === undefined) {
                    this.error = 'AisDecode: Session is missing prior message part, cannot parse partial AIS message.';
                    return;
                }

                if (session.sequence_id !== sequence_id) {
                    this.error = 'AisDecode: Session IDs do not match. Cannot recontruct AIS message.';
                    return;
                }
            } else {
                session.formatter = nmea[0];
                session.message_count = message_count;
                session.sequence_id = sequence_id;
            }
        }

        // extract binary payload and other usefull information from nmea paquet
        this.payload = new Buffer(nmea [5]);
        this.msglen = this.payload.length;

        this.channel = nmea[4];  // vhf channel A/B

        if (message_count > 1) {
            session[message_id] = {payload: this.payload, length: this.msglen};

            // Not done building the session
            if (message_id < message_count) return;

            const payloads = [];
            let len = 0;

            for (let i = 1; i <= session.message_count; ++i) {
                payloads.push(session[i].payload);
                len += session[i].length;
            }

            this.payload = Buffer.concat(payloads, len);
            this.msglen = this.payload.length;
        }


        // decode printable 6bit AIS/IEC binary format
        for (let i = 0; i < this.msglen; i++) {
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

        this.aistype   = this.GetInt (0,6);
        this.repeat    = this.GetInt (6,2);
        this.immsi     = this.GetInt (8,30);
        this.mmsi      = ('000000000' + this.immsi).slice(-9);

        switch (this.aistype) {
            case 1:
            case 2:
            case 3:
                this._decodeClassAPositionReport();
                break;
            case 18:
                this._decodeClassBPositionReport();
                break;
            case 19:
                this._decodeExtendedClassBPositionReport();
                break;
            case 5:
                this._decodeStaticVoyageData();
                break;
            case 24:
                this._decodeStaticDataReport();
                break;
            case 4:
            case 11:
                this._decodeBaseStationReport();
                break;
            case 9:
                this._decodeSarAircraftReport();
                break;
            case 21:
                this._decodeAidToNavigation();
                break;
            case 14:
                this._decodeTextMessage();
                break;
            case 8:
                this._decodeBinaryBroadcastMessage(input);
                break;
            case 27:
                this._decodeLongRangeBroadcast();
                break;
            default:
                if (DEBUG) {
                    console.log('---- type=%d %s %s -> %s', this.aistype, this.Getaistype(this.aistype), this.mmsi, input);
                }
                break;
        }
    }

    _decodeClassAPositionReport() {
        this.class = 'A';
        this.navstatus = this.GetInt(38, 4);

        let lon = this.GetInt(61, 28);
        if (lon & 0x08000000) lon |= 0xf0000000;
        lon = parseFloat(lon / 600000);

        let lat = this.GetInt(89, 27);
        if (lat & 0x04000000) lat |= 0xf8000000;
        lat = parseFloat(lat / 600000);

        if ((lon <= 180.) && (lat <= 90.)) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;

        this.rot = this.GetInt(42, 8, true)
        this.sog = this.GetInt(50, 10) / 10;
        this.cog = this.GetInt(116, 12) / 10;
        this.hdg = parseFloat(this.GetInt(128, 9));
        this.utc = this.GetInt(137, 6);
        this.smi = this.GetInt(143, 2);
    }

    _decodeClassBPositionReport() {
        this.class = 'B';
        this.status = -1;  // Class B targets have no status.  Enforce this...
        let lon = this.GetInt(57, 28);
        if (lon & 0x08000000) lon |= 0xf0000000;
        lon = parseFloat(lon / 600000);

        let lat = this.GetInt(85, 27);
        if (lat & 0x04000000) lat |= 0xf8000000;
        lat = parseFloat(lat / 600000);

        if ((lon <= 180.) && (lat <= 90.)) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;

        this.sog = this.GetInt(46, 10) / 10;
        this.cog = this.GetInt(112, 12) / 10;
        this.hdg = parseFloat(this.GetInt(124, 9));
        this.utc = this.GetInt(134, 6);
    }

    _decodeExtendedClassBPositionReport() {
        this.class = 'B';
        this.status = -1;  // Class B targets have no status.  Enforce this...

        let lon = this.GetInt(57, 28);
        if (lon & 0x08000000) lon |= 0xf0000000;
        lon = parseFloat(lon / 600000);

        let lat = this.GetInt(85, 27);
        if (lat & 0x04000000) lat |= 0xf8000000;
        lat = parseFloat(lat / 600000);

        if ((lon <= 180.) && (lat <= 90.)) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;

        this.sog = this.GetInt(46, 10) / 10;
        this.cog = this.GetInt(112, 12) / 10;
        this.hdg = parseFloat(this.GetInt(124, 9));
        this.utc = this.GetInt(133, 6);

        this.shipname = this.GetStr(143,120).trim();
        this.cargo    = this.GetInt(263,8);

        this.dimA = this.GetInt(271, 9);
        this.dimB = this.GetInt(280, 9);
        this.dimC = this.GetInt(289, 6);
        this.dimD = this.GetInt(295, 6);
        this.length = this.dimA + this.dimB;
        this.width = this.dimC + this.dimD;
    }

    _decodeStaticVoyageData() {
        this.class = 'A';
        // Get the AIS Version indicator
        // 0 = station compliant with Recommendation ITU-R M.1371-1
        // 1 = station compliant with Recommendation ITU-R M.1371-3 (or later)
        // 2 = station compliant with Recommendation ITU-R M.1371-5 (or later)
        // 3 = station compliant with future editions
        const AIS_version_indicator = this.GetInt(38,2);
        if (AIS_version_indicator < 3) {
            this.imo         = this.GetInt(40,30);
            this.callsign    = this.GetStr(70,42).trim();
            this.shipname    = this.GetStr(112,120).trim();
            this.cargo       = this.GetInt(232,8);
            this.dimA        = this.GetInt(240,9);
            this.dimB        = this.GetInt(249,9);
            this.dimC        = this.GetInt(258,6);
            this.dimD        = this.GetInt(264,6);
            this.etaMo       = this.GetInt(274,4);
            this.etaDay      = this.GetInt(278,5);
            this.etaHr       = this.GetInt(283,5);
            this.etaMin      = this.GetInt(288,6);
            this.draught     = this.GetInt(294, 8 ) / 10.0;
            this.destination = this.GetStr(302, 120).trim();
            this.length      = this.dimA + this.dimB;
            this.width       = this.dimC + this.dimD;
            this.valid       = true;
        }
    }

    _decodeStaticDataReport() {
        this.class = 'B';
        this.part = this.GetInt(38, 2);
        if (0 === this.part) {
            this.shipname = this.GetStr(40, 120).trim();
            this.valid = true;
        } else if (this.part === 1) {
            this.cargo    = this.GetInt(40, 8);
            this.callsign = this.GetStr(90, 42).trim();

            // 98 = auxiliary craft
            if (parseInt(this.immsi / 10000000) === 98) {
                const mothership = this.GetInt(132, 30);
                this.mothership = ('000000000' + mothership).slice(-9);
            } else {
                this.dimA = this.GetInt(132, 9);
                this.dimB = this.GetInt(141, 9);
                this.dimC = this.GetInt(150, 6);
                this.dimD = this.GetInt(156, 6);
                this.length = this.dimA + this.dimB;
                this.width = this.dimC + this.dimD;
            }
            this.valid = true;
        }
    }

    _decodeBaseStationReport() {
        this.class = '-';

        let lon = this.GetInt(79, 28);
        if (lon & 0x08000000) lon |= 0xf0000000;
        lon = parseFloat(lon / 600000);

        let lat = this.GetInt(107, 27);
        if (lat & 0x04000000) lat |= 0xf8000000;
        lat = parseFloat(lat / 600000);

        if ((lon <= 180.) && (lat <= 90.)) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;
    }

    _decodeSarAircraftReport() {
        this.class = '-';

        this.alt = this.GetInt(38, 12);

        let lon = this.GetInt(61, 28);
        if (lon & 0x08000000) lon |= 0xf0000000;
        lon = parseFloat(lon / 600000);

        let lat = this.GetInt(89, 27);
        if (lat & 0x04000000) lat |= 0xf8000000;
        lat = parseFloat(lat / 600000);

        if ((lon <= 180.) && (lat <= 90.)) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;

        this.sog = parseFloat(this.GetInt(50, 10));
        this.cog = this.GetInt(116, 12) / 10;
    }

    _decodeAidToNavigation() {
        this.class = '-';

        this.aidtype = this.GetInt(38, 5);
        this.shipname = this.GetStr(43, 120).trim();

        let lon = this.GetInt(164, 28);
        if (lon & 0x08000000) lon |= 0xf0000000;
        lon = parseFloat(lon / 600000);

        let lat = this.GetInt(192, 27);
        if (lat & 0x04000000) lat |= 0xf8000000;
        lat = parseFloat(lat / 600000);

        if ((lon <= 180.) && (lat <= 90.)) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;

        this.dimA   = this.GetInt(219, 9);
        this.dimB   = this.GetInt(228, 9);
        this.dimC   = this.GetInt(237, 6);
        this.dimD   = this.GetInt(243, 6);
        this.length = this.dimA + this.dimB;
        this.width  = this.dimC + this.dimD;

        this.utc = this.GetInt(253, 6);
        this.offpos = this.GetInt(259, 1);

        const len = parseInt(((this.bitarray.length - 272 / 6) / 6) * 6) * 6;
        this.txt = this.GetStr(272, len).trim();
    }

    _decodeTextMessage() {
        this.class = '-';
        if (this.bitarray.length > 40 / 6) {
            const len = parseInt(((this.bitarray.length - 40 / 6) / 6) * 6) * 6;
            this.txt = this.GetStr(40, len).trim();
            this.valid = true;
        }
    }

    _decodeBinaryBroadcastMessage(input) {
        this.dac = this.GetInt(40, 10);
        this.fid = this.GetInt(50, 6);
        // Inland ship static and voyage related data
        if (this.dac === 200 && this.fid === 10) {
            this.class       = '-';
            this.ENI         = this.GetStr(56,48).trim();
            this.length      = parseFloat(this.GetInt(104, 13)) / 10.;
            this.width       = parseFloat(this.GetInt(117, 10)) / 10.;
            this.draught     = parseFloat(this.GetInt(144, 11)) / 100.0;
            this.shiptypeERI = this.GetInt(127, 14);
            this.valid       = true;
        } else {
            if (DEBUG) {
                console.log('---- type=%d %s dac=%d fid=%d %s', this.aistype, this.mmsi, this.dac, this.fid, input);
            }
        }
    }

    _decodeLongRangeBroadcast() {
        this.class = '-';
        this.navstatus = this.GetInt(40, 4);

        let lon = this.GetInt(44, 18);
        lon = parseFloat(lon) / 600;

        let lat = this.GetInt(62, 17);
        lat = parseFloat(lat) / 600;

        if ((lon <= 180.) && (lat <= 90.)) {
            this.lon = lon;
            this.lat = lat;
            this.valid = true;
        } else this.valid = false;

        this.sog = this.GetInt(79, 6);
        this.cog = this.GetInt(85, 9);
    }

    validateChecksum(input) {
        if (typeof input === 'string') {
            const loc1 = input.indexOf('!');
            const loc2 = input.indexOf('*');

            if (loc1 === 0 && loc2 > 0) {
                const body = input.substring(1, loc2);
                const checksum = input.substring(loc2 + 1);

                let sum = 0;
                for (let i = 0; i < body.length; i++) {
                    sum ^= body.charCodeAt(i);  //xor based checksum
                }
                let hex = sum.toString(16).toUpperCase();
                if (hex.length === 1) hex = '0' + hex;      //single digit hex needs preceding 0, '0F'

                return (checksum === hex);
            }
        }
        return false;
    }

    // Extract an integer sign or unsigned from payload
    GetInt(start, len, signed) {
        let acc = 0;
        let cp, cx, c0, cs;

        for (let i = 0; i < len; i++) {
            acc = acc << 1;
            cp = parseInt((start + i) / 6);
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

    // Extract a string from payload [1st bits is index 0]
    GetStr(start, len) {

        // extended message are not supported
        if (this.bitarray.length < (start + len) / 6) {
            //console.log ('AisDecode: ext msg not implemented GetStr(%d,%d)', start, len);
            len = parseInt(((this.bitarray.length - start / 6) / 6) * 6) * 6;
        }
        // messages in the wild sometimes produce a negative len which will cause a buffer range error
        // exception, stating size argument must not be negative. This occurs in the new Buffer() below.
        if (len < 0) {
            return '';
        }

        //char temp_str[85];
        const buffer = new Buffer(len / 6);
        let cp, cx, cs, c0;
        let acc = 0;
        let k = 0;
        let i = 0;
        while (i < len) {
            acc = 0;
            for (let j = 0; j < 6; j++) {
                acc = acc << 1;
                cp = parseInt((start + i) / 6);
                cx = this.bitarray[cp];
                cs = 5 - ((start + i) % 6);
                c0 = (cx >> (5 - ((start + i) % 6))) & 1;
                acc |= c0;
                i++;
            }
            buffer[k] = acc; // opencpn
            if (acc < 0x20) buffer[k] += 0x40;
            else            buffer[k] = acc;  // opencpn enfoce (acc & 0x3f) ???
            if (buffer[k] === 0x40) break; // name end with '@'
            k++;
        }
        return (buffer.toString('utf8', 0, k));
    }

    GetNavStatus() {
        return (NAV_STATUS [this.navstatus]);
    }

    Getaistype() {
        return (MSG_TYPE [this.aistype]);
    }

    GetVesselType() {
        return (VESSEL_TYPE [this.cargo]);
    }

    // map ERI Classification to other vessel types
    GetERIShiptype(shiptypeERI) {
        return ERI_SHIPTYPE_MAP[shiptypeERI] ?? shiptypeERI;
    }
}

module.exports = AisDecode; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/

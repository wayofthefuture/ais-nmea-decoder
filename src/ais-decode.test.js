/*
Copyright 2014 Fulup Ar Foll
Copyright 2026 wayofthefuture

Licensed under the Apache License, Version 2.0
https://www.apache.org/licenses/LICENSE-2.0
*/

import {describe, it, expect} from 'vitest';
import AisDecode from './ais-decode.js';

const testCases = {
    msg24a: { // class B static info
        raw: '!AIVDM,1,1,,A,H42O55i18tMET00000000000000,0*6F',
        mtype: 24,
        part: 0,
        mmsi: '271041815',
        name: 'PROGUY'
    },
    msg24b: { // class AB static info
        raw: '!AIVDM,1,1,,A,H42O55lt0000000D3nink000?0500,0*70',
        mtype: 24,
        part: 1,
        mmsi: '271041815',
        type: 60,
        sign: 'TC6163',
        dimA: 0,
        dimB: 15,
        dimC: 0,
        dimD: 5
    },
    msg18: { // standard class B Position report
        raw: '!AIVDM,1,1,,A,B69>7mh0?B<:>05B0`0e8TN000000,0*72',
        mtype: 18,
        mmsi: '412321751',
        cog: 72.2,
        sog: 6.1,
        repeat: 0,
        dsc: false,
        accuracy: 0,
        lon: 122.47338666666667,
        lat: 36.91968
    },
    msg18b: { // standard class B Position report - repeat=1,dsc=true
        raw: '!AIVDM,1,1,,A,BF9>7mh0?B<:>05B0`0e8TN100000,0*03',
        mtype: 18,
        mmsi: '412321751',
        cog: 72.2,
        sog: 6.1,
        repeat: 1,
        dsc: true,
        accuracy: 0,
        lon: 122.47338666666667,
        lat: 36.91968
    },
    msg19: { // Extended class B Position report
        raw: ['!AIVDM,2,1,9,B,C43NbT0008VGWDVHNs0000N10PHb`NL00000,0*6D', '!AIVDM,2,2,9,B,00000000N0`90RPP,0*59'],
        mtype: 19,
        mmsi: '272083600',
        cog: 0,
        sog: 0,
        lon: 33.527321666666666,
        lat: 44.61725333333333,
        name: 'PLUTON'
    },
    msg5: { // class A static info
        raw: '!AIVDM,1,1,,A,55?MbV42;H;s<HtKR20EHE:0@T4@Dn2222222216L961O0000i000000000000000000000,0*2D',
        mtype: 5,
        mmsi: '351759000',
        ver: 1,
        imo: 9134270,
        sign: '3FOF8',
        name: 'EVER DIADEM',
        dest: "",
        type: 70,
        dimA: 225,
        dimB: 70,
        dimC: 1,
        dimD: 31,
        etaMn: 0,
        etaHr: 0,
        etaDy: 0,
        etaMo: 0,
        draft: 19.6
    },
    msg5_2: { // class A static info
        raw: ['!AIVDM,2,1,3,B,59NWwC@2>6th7Q`7800858l8Dd00000000000018Cp:A:6a=0G@TQCADR0EQ,0*09', '!AIVDM,2,2,3,B,CP000000000,2*37'],
        mtype: 5,
        mmsi: '636092237',
        imo: 9313228,
        sign: 'A8ZA2',
        name: 'BARMBEK',
        dest: 'BREMERHAVEN',
        type: 72,
        dimA: 159,
        dimB: 10,
        dimC: 17,
        dimD: 10,
        etaMn: 0,
        etaHr: 13,
        etaDy: 18,
        etaMo: 10,
        draft: 9.3
    },
    msg5_3: { // class A static info version 2
        raw: ['!AIVDM,2,1,9,A,53Moi:81Qk8LLpQH000PD98T@D4r118Tp<E=<0153@f594ke07TSm21D,0*63', '!AIVDM,2,2,9,A,hF@000000000000,2*73'],
        mtype: 5,
        mmsi: '232649000',
        imo: 6409351,
        sign: 'GNHV',
        name: 'HEBRIDEAN PRINCESS',
        dest: 'ROTHESAY',
        type: 69,
        dimA: 26,
        dimB: 46,
        dimC: 5,
        dimD: 9,
        etaMn: 0,
        etaHr: 13,
        etaDy: 7,
        etaMo: 3,
        draft: 3
    },
    msg4: { // base station
        raw: '!AIVDM,1,1,,B,4@4k1EQutd87k:Etkmb:JM7P08Na,0*38',
        mtype: 4,
        mmsi: '005030230',
        lon: 144.60521666666668,
        lat: -38.16343333333333
    },
    msg21: { // aid of navigation
        raw: '!AIVDM,1,1,,B,ENlt;J@aSqP0000000000000000E;WUdm7Mu800003vP10,4*46',
        mtype: 21,
        mmsi: '995036009',
        name: 'SG3',
        type: 1,
        lon: 144.88636666666667,
        lat: -38.03993166666667,
        text: "",
        virtual: 1,
        offpos: 0
    },
    msg21a: { // aid of navigation with extra text
        raw: '!AIVDM,1,1,,B,EvjO`>C2qHtq@8:W:0h9PW@1Pb0Paq`g;STu`10888N00313p12H31@hi@,4*0E',
        mtype: 21,
        mmsi: '992471097',
        name: 'E2192 PUNTA SAN CATA',
        type: 6,
        lon: 18.306638333333332,
        lat: 40.390795,
        text: 'LDO DI LECCE',
        virtual: 0,
        offpos: 0
    },
    msg9: { // sar aircraft
        raw: '!AIVDM,1,1,,B,900048wwTiJamA6Eu>B7Pd@20<6M,0*66',
        mtype: 9,
        mmsi: '000001059',
        lon: -74.747675,
        lat: 38.37196,
        alt: 4094,
        sog: 305,
        cog: 192.2
    },
    msg1: {
        raw: '!AIVDM,1,1,,A,133REv0P00P=K?TMDH6P0?vN289>,0*46',
        mtype: 1,
        mmsi: '205035000',
        rot: -128,
        smi: 0,
        sog: 0,
        cog: 0,
        lon: 2.9328833333333333,
        lat: 51.23759
    },
    msg1_1: { // sample with rot
        raw: '!AIVDM,1,1,,A,13u?etPv2;0n:dDPwUM1U1Cb069D,0*24',
        mtype: 1,
        mmsi: '265547250',
        rot: -8,
        smi: 0,
        sog: 13.9,
        cog: 40.4,
        lon: 11.832976666666667,
        lat: 57.66035333333333
    },
    msg1_2: { // position for mob
        raw: '!AIVDM,1,1,,B,1>O5`4wP01:F?39b6mD>4?w81P00,0*0D',
        mtype: 1,
        mmsi: '972122131',
        lon: 144.66747333333333,
        lat: -38.2612,
        rot: -128,
        smi: 0,
        sog: 0.1,
        cog: 360,
        nav: 15
    },
    msg14: { // text msg
        raw: '!AIVDM,1,1,,A,>>O5`4tlt:1@E=@,2*15',
        mtype: 14,
        mmsi: '972122131',
        text: 'MOB TEST'
    },
    msg27: { // position lon range
        raw: '!AIVDM,1,1,,B,K9TJi5H@o9jiPP2D,0*3E',
        mtype: 27,
        mmsi: '642167061',
        lon: 23.531666666666666,
        lat: 37.86833333333333,
        sog: 0,
        cog: 37,
        nav: 1
    }
};

function decode(testCase) {
    if (Array.isArray(testCase.raw)) {
        const session = {};
        new AisDecode(testCase.raw[0], session);
        return new AisDecode(testCase.raw[1], session);
    }
    return new AisDecode(testCase.raw);
}

for (const [name, props] of Object.entries(testCases)) {
    describe(name, () => {
        const decoded = decode(props);

        it('should be valid', () => {
            expect(decoded.error).toBeUndefined();
        });

        for (const [field, value] of Object.entries(props)) {
            if (field === 'raw') continue;

            it(`should decode ${field} correctly`, () => {
                expect(value).toBe(decoded[field]);
            });
        }
    });
}

describe('mapProperties', () => {
    it('should map properties according to the propertyNames', () => {
        AisDecode.configure({
            propertyNames: [
                ['mmsi', 'vesselId'],
                ['sog', 'speedOverGround'],
                ['cog', 'courseOverGround']
            ]
        });
        const decoded = new AisDecode(testCases.msg1.raw);

        expect(decoded.vesselId).toBe('205035000');
        expect(decoded.speedOverGround).toBe(0);
        expect(decoded.courseOverGround).toBe(0);
        expect(decoded.mmsi).toBeUndefined();
        expect(decoded.sog).toBeUndefined();
        expect(decoded.cog).toBeUndefined();
    });

    it('should skip mapping for undefined properties', () => {
        AisDecode.configure({
            propertyNames: [
                ['mmsi', 'vesselId'],
                ['nonExistent', 'renamed']
            ]
        });
        const decoded = new AisDecode(testCases.msg1.raw);

        expect(decoded.vesselId).toBe('205035000');
        expect(decoded.renamed).toBeUndefined();
    });
});

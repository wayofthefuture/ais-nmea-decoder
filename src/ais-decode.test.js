/*
Copyright 2014 Fulup Ar Foll
Copyright 2026 wayofthefuture

Licensed under the Apache License, Version 2.0
https://www.apache.org/licenses/LICENSE-2.0
*/

// Reference: http://catb.org/gpsd/AIVDM.html

'use strict';

var AisDecode= require ('../ApiExport').AisDecode;
var fs       = require('fs');

function AisDecodeTest (args) {

    if (args !== undefined) this.testSet = args;
    else this.testSet = {
        msg24a: {// class B static info
            aistype    : 24,
            part       : 0,
            nmea       : "!AIVDM,1,1,,A,H42O55i18tMET00000000000000,0*6F",
            cargo      : 60,
            callsign   : "AB1234",
            mmsi       : "271041815",
            shipname   : "PROGUY"
        }

        ,msg24b: {// class AB static info
            aistype    : 24,
            part       : 1,
            nmea       : "!AIVDM,1,1,,A,H42O55lt0000000D3nink000?0500,0*70",
            mmsi       : "271041815",
            cargo      : 60,
            callsign   : "TC6163",
            dimA       : 0,
            dimB       : 15,
            dimC       : 0,
            dimD       : 5
        }
        ,msg18: { // standard class B Position report
            aistype    : 18,
            nmea       : '!AIVDM,1,1,,A,B69>7mh0?B<:>05B0`0e8TN000000,0*72',
            cog        : 72.2,
            sog        : 6.1,
            dsc        : false,
            repeat     : false,
            accuracy   : true,
            lon        : 122.47338666666667,
            lat        : 36.91968,
            second     : 50,
            mmsi       : "412321751"
        }
        ,msg19: { // Extended class B Position report
            aistype    : 19,
            nmea       : ['!AIVDM,2,1,9,B,C43NbT0008VGWDVHNs0000N10PHb`NL00000,0*6D',
                '!AIVDM,2,2,9,B,00000000N0`90RPP,0*59'],
            mmsi       : "272083600",
            cog        : 0,
            sog        : 0,
            lon        : 33.527321666666666,
            lat        : 44.61725333333333,
            second     : 60,
            shipname   : "PLUTON"
        }
        ,msg5: { // class A static info
            aistype    : 5,
            nmea       : "!AIVDM,1,1,,A,55?MbV42;H;s<HtKR20EHE:0@T4@Dn2222222216L961O0000i000000000000000000000,0*2D",
            //"!AIVDM,2,2,1,A,88888888880,2*25"], // [extentions for destination not implemented]
            mmsi       : "351759000",
            imo        : 9134270,
            callsign   : "3FOF8",
            shipname   : "EVER DIADEM",
            destination: "",
            cargo      : 70,
            dimA       : 225,
            dimB       : 70,
            dimC       :  1,
            dimD       : 31,
            fixaistype :  1,
            etamn      :  0,
            etaho      :  0,
            etaday     :  0,
            etamonth   :  0,
            draught    : 19.6
        }
        ,msg5_2: { // class A static info
            aistype    : 5,
            nmea       : ["!AIVDM,2,1,3,B,59NWwC@2>6th7Q`7800858l8Dd00000000000018Cp:A:6a=0G@TQCADR0EQ,0*09",
                "!AIVDM,2,2,3,B,CP000000000,2*37"],
            mmsi       : "235074703",
            imo        : 12894435639,
            callsign   : "A8ZA2",
            shipname   : "BARMBEK",
            destination: "BREMERHAVEN",
            cargo      : 72,
            dimA       : 159,
            dimB       : 10,
            dimC       : 17,
            dimD       : 10,
            fixaistype :  1,
            etamn      :  0,
            etaho      : 13,
            etaday     : 18,
            etamonth   : 10,
            draught    : 9.3
        }
        ,msg5_3: { // class A static info version 2
            aistype    : 5,
            nmea       : ["!AIVDM,2,1,9,A,53Moi:81Qk8LLpQH000PD98T@D4r118Tp<E=<0153@f594ke07TSm21D,0*63",
                "!AIVDM,2,2,9,A,hF@000000000000,2*73"],
            mmsi       : "235074703",
            imo        : 6409351,
            callsign   : "GNHV",
            shipname   : "HEBRIDEAN PRINCESS",
            destination: "ROTHESAY",
            cargo      : 69,
            dimA       : 26,
            dimB       : 46,
            dimC       : 5,
            dimD       : 9,
            fixaistype : 1,
            etamn      : 0,
            etaho      : 13,
            etaday     : 7,
            etamonth   : 3,
            draught    : 3
        }
        ,msg4: { // base station
            aistype    : 4,
            nmea       : "!AIVDM,1,1,,B,4@4k1EQutd87k:Etkmb:JM7P08Na,0*38",
            mmsi       : "005030230",
            lon        : 144.60521666666668,
            lat        : -38.16343333333333
        }
        ,msg21: { // aid of navigation
            aistype    : 21,
            nmea       : "!AIVDM,1,1,,B,ENlt;J@aSqP0000000000000000E;WUdm7Mu800003vP10,4*46",
            mmsi       : "995036009",
            shipname   : "SG3",
            aidtype    : 1,
            lon        : 144.88636666666667,
            lat        : -38.03993166666667,
            txt        : "",
            virtual    : 1,
            offpos     : 0
        }
        ,msg21a: { // aid of navigation with extra text
            aistype    : 21,
            nmea       : "!AIVDM,1,1,,B,EvjO`>C2qHtq@8:W:0h9PW@1Pb0Paq`g;STu`10888N00313p12H31@hi@,4*0E",
            mmsi       : "992471097",
            shipname   : "E2192 PUNTA SAN CATA",
            aidtype    : 6,
            lon        : 18.306638333333332,
            lat        : 40.390795,
            txt        : "LDO DI LECCE",
            virtual    : 0,
            offpos     : 0
        }
        ,msg9: { // sar aircraft
            aistype    : 9,
            nmea       : "!AIVDM,1,1,,B,900048wwTiJamA6Eu>B7Pd@20<6M,0*66",
            mmsi       : "000001059",
            lon        : -74.747675,
            lat        : 38.37196,
            alt        : 4094,
            sog        : 305,
            cog        : 192.2
        }
        ,msg1: {
            aistype    : 1,
            nmea       : "!AIVDM,1,1,,A,133REv0P00P=K?TMDH6P0?vN289>,0*46",
            mmsi       : "205035000",
            rot        : -128,
            smi        : 0,
            sog        : 0,
            cog        : 0,
            lon        : 2.9328833333333333,
            lat        : 51.23759
        }
        ,msg1_1: { // sample with rot
            aistype    : 1,
            nmea       : "!AIVDM,1,1,,A,13u?etPv2;0n:dDPwUM1U1Cb069D,0*24",
            mmsi       : "265547250",
            rot        : -8,
            smi        : 0,
            sog        : 13.9,
            cog        : 40.4,
            lon        : 11.832976666666667,
            lat        : 57.66035333333333
        }
        ,msg1_2: { // position for mob
            aistype    : 1,
            nmea       : "!AIVDM,1,1,,B,1>O5`4wP01:F?39b6mD>4?w81P00,0*0D",
            mmsi       : "972122131",
            lon        : 144.66747333333333,
            lat        : -38.2612,
            rot        : -128,
            smi        : 0,
            sog        : 0.1,
            cog        : 360,
            navstatus  : 15
        }
        ,msg14: { // text msg
            aistype    : 14,
            nmea       : "!AIVDM,1,1,,A,>>O5`4tlt:1@E=@,2*15",
            mmsi       : "972122131",
            txt        : "MOB TEST"
        }
        ,msg8_200_10: { // dac 200 fid 10 msg static inland ship
            aistype    : 8,
            nmea       : "!AIVDM,1,1,,A,85Mv070j2d>=<e<<=PQhhg`59P00,0*26",
            mmsi       : "366968860",
            length     : 27,
            width      : 9.7,
            draught    : 3.04,
            shiptypeERI: 8000
        }
        ,msg8_001_11: { // dac 001 fid 11 meteorological and hydrographic data
            aistype    : 800111,
            nmea       : "!AIVDM,1,1,,A,802R5Ph0BkCwP0E<>jGaPPTHS7wwwwwwwk6wwwwwwwwwwwwwwwwwwtPwwwt,2*72",
            mmsi       : "002655619",
            lon        : 11.573166666666667,
            lat        : 57.88800,
            avgwindspd : 2,
            winddir    : 280,
            airtemp    : undefined,
            watertemp  : 13.1
        }
        ,msg8_001_31: { // dac 001 fid 31 meteorological and hydrographic data
            aistype    : 800131,
            nmea       : "!AIVDM,1,1,1,B,8>h8nkP0Glr=<hFI0D6??wvlFR06EuOwgwl?wnSwe7wvlOw?sAwwnSGmwvh0,0*17",
            mmsi       : "990000846",
            lon        : 171.5985,
            lat        : 12.2283,
            avgwindspd : undefined,
            winddir    : undefined,
            airtemp    : undefined,
            watertemp  : undefined,
            waterlevel : undefined
        }
        ,msg8_001_31_2: { // dac 001 fid 31 meteorological and hydrographic data
            aistype    : 800131,
            nmea       : "!AIVDM,1,1,,A,8@2R5Ph0GhEUJiaWPFkt4RqUdf06EuFPB22p1Pd3S@h>:WwwsAwwnS@vwvwt,0*57",
            mmsi       : "002655619",
            lon        : 11.7881,
            lat        : 57.6811,
            avgwindspd : 36,
            winddir    : 203,
            airtemp    : undefined,
            watertemp  : 6.2,
            waterlevel : 0.47
        }
        ,msg8_367_33_0: { // dac 367 fid 33 meteorological and hydrographic data location
            aistype    : 836733,
            nmea       : "!AIVDM,1,1,,A,8P3QiWAKp@dw8>5LlaB1aQkhCr@P,0*28",
            mmsi       : "003699101",
            siteid     : 3,
            lon        : -122.954,
            lat        : 46.106
        }
        ,msg8_367_33_2: { // dac 367 fid 33 meteorological and hydrographic data wind
            aistype    : 836733,
            nmea       : "!AIVDM,1,1,,B,8>k1oCQKpBdvs:750l;7mre0<N00,0*4C",
            mmsi       : "993032014",
            siteid     : 50,
            avgwindspd : 7,
            winddir    : 13
        }
        ,msg27: { // position lon range
            aistype    : 27,
            nmea       : "!AIVDM,1,1,,B,K9TJi5H@o9jiPP2D,0*3E",
            mmsi       : "642167061",
            lon        : 23.531666666666666,
            lat        : 37.86833333333333,
            sog        : 0,
            cog        : 37,
            navstatus  : 1
        }

    }}

// compare input with decoded outputs
AisDecodeTest.prototype.CheckResult = function (test, aisin, aisout, controls) {
    var slot;
    var count=0;
    console.log ("\nChecking: [%s] --> [%s]", test, aisin.nmea);
    for (var element in controls){
        slot = controls[element];
        if (aisout[slot] !== aisin[slot]) {
            count ++;
            console.log ("--> FX (%s) in:[%s] != out:[%s]", slot, aisin[slot], aisout [slot]);
        } else {
            console.log ("--> OK (%s) in:[%s] == out:[%s]", slot, aisin[slot], aisout [slot]);
        }
    }

    if (count > 0)  console.log ("** FX Test [%s] Count=%d **", test, count);
    else console.log ("## OK Test [%s] ##", test);
};

AisDecodeTest.prototype.CheckDecode = function () {

    // make sure we get expected output from reference messages
    for (var test in this.testSet) {
        var aisTest     = this.testSet [test];

        // Require a string or an array. Turn string into an array. Return for
        // anything else.
        if(aisTest.nmea instanceof Object) {
            var session={};
            var aisDecoded = new AisDecode(aisTest.nmea[0], session);
            var aisDecoded = new AisDecode(aisTest.nmea[1], session);
        } else {
            var aisDecoded = new AisDecode(aisTest.nmea);
        }

        if (aisDecoded.valid !== true) {
            console.log ("\n[%s] invalid AIS payload: %s", test, aisDecoded.error);
        } else {
            switch (aisTest.aistype) {
                case 1:
                    this.CheckResult (test, aisTest, aisDecoded, ["mmsi", 'lon', 'lat', 'sog', 'cog', 'rot', 'smi']);
                    break;
                case 4:
                    this.CheckResult (test, aisTest, aisDecoded, ["mmsi", 'lon', 'lat']);
                    break;
                case 5:
                    this.CheckResult (test, aisTest, aisDecoded, ["shipname", 'callsign', 'destination', 'cargo', 'draught', 'dimA', 'dimB', "dimC", 'dimD']);
                    break;
                case 9:
                    this.CheckResult (test, aisTest, aisDecoded, ["mmsi", 'lon', 'lat', 'alt', 'sog', 'cog']);
                    break;
                case 14:
                    this.CheckResult (test, aisTest, aisDecoded, ["mmsi", 'txt']);
                    break;
                case 18:
                    this.CheckResult (test, aisTest, aisDecoded, ["mmsi", 'lon', 'lat', 'cog', "sog"]);
                    break;
                case 19:
                    this.CheckResult (test, aisTest, aisDecoded, ["mmsi", 'lon', 'lat', 'cog', "sog", 'shipname']);
                    break;
                case 21:
                    this.CheckResult (test, aisTest, aisDecoded, ["mmsi", 'shipname', 'aidtype', 'lat', 'lon', 'txt', 'offpos', 'virtual']);
                    break;
                case 24:
                    switch (aisTest.part) {
                        case 0: this.CheckResult(test, aisTest, aisDecoded, ["shipname"]); break;
                        case 1: this.CheckResult(test, aisTest, aisDecoded, ['callsign', 'cargo', 'dimA', 'dimB', "dimC", 'dimD']); break;
                        default: console.log ("hoop test=[%s] message type=[%d] invalid part number [%s]", test, aisTest.type, aisDecoded.part);
                    }
                    break;
                case 8:
                    this.CheckResult (test, aisTest, aisDecoded, ["mmsi", 'length', 'width', 'draught', 'shiptypeERI']);
                    break;
                case 800111:
                    this.CheckResult (test, aisTest, aisDecoded, ["mmsi", 'lon', 'lat', 'avgwindspd', 'winddir', 'airtemp', 'watertemp']);
                    break;
                case 800131:
                    this.CheckResult (test, aisTest, aisDecoded, ["mmsi", 'lon', 'lat', 'avgwindspd', 'winddir', 'airtemp', 'watertemp', 'waterlevel']);
                    break;
                case 836733:
                    this.CheckResult (test, aisTest, aisDecoded, ["mmsi", 'siteid', 'lon', 'lat', 'avgwindspd', 'winddir']);
                    break;
                case 27:
                    this.CheckResult (test, aisTest, aisDecoded, ["mmsi", 'lon', 'lat', 'cog', "sog", 'navstatus']);
                    break;
                default:
                    console.log ("hoop test=[%s] message type=[%d] not implemented", test, aisTest.type);
            }
        }
    }
};

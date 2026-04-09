[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/wayofthefuture/ais-nmea-decoder/actions/workflows/CI.yaml/badge.svg)](https://github.com/wayofthefuture/ais-nmea-decoder/actions/workflows/CI.yaml)
[![codecov](https://codecov.io/gh/wayofthefuture/ais-nmea-decoder/graph/badge.svg)](https://codecov.io/gh/wayofthefuture/ais-nmea-decoder)
[![NPM Version](https://img.shields.io/npm/v/ais-nmea-decoder)](https://www.npmjs.com/package/ais-nmea-decoder)

### *Currently under development...

Decode AIS NMEA messages into structured objects.

This project originates from 'ggencoder' and aims to modernize the decoding of AIS/NMEA messages with a focus on data integrity, maintainability, and performance.

The AIS standard is intentionally flexible, and many existing decoding implementations have evolved from behaviors observed in transceiver equipment operating “in the wild.” As a result, decoding logic across projects has become inconsistent and difficult to maintain.

Given the critical nature of AIS data in the maritime industry, improving the reliability and transparency of decoding systems is essential.

This project focuses on modernizing the decoding approach by incorporating contemporary development practices, including:

- Strong typing with TypeScript
- Automated testing and coverage workflows
- Clear and maintainable decoding logic
- Improved validation and error handling
- Better tooling for long-term maintainability

## Install

```bash
npm install ais-nmea-decoder
```

## Usage

```js
import {AisDecoder} from 'ais-nmea-decoder';

const decoder = new AisDecoder();

let result = decoder.parse('!AIVDM,1,1,,B,15MqhT0026:Otl8EoR4<H?vL0<1h,0*2C');
if (result.error) return;
if (result.pending) return; // multi-part message awaiting next fragment

console.log(result);
// { channel, mtype, mmsi, lat, lon, sog, cog, ... }
```

Two-part messages (e.g. type 5) are handled automatically - feed each sentence in order:

```js
let result = decoder.parse('!AIVDM,2,1,3,B,59NWwC@2>6th7Q`7800858l8Dd00000000000018Cp:A:6a=0G@TQCADR0EQ,0*09');
// result.pending === true

result = decoder.parse('!AIVDM,2,2,3,B,CP000000000,2*37');
console.log(result);
// { channel, mtype, mmsi, name, sign, imo, dest, draft, ... }
```

Example parser function that could be used to read from a stream:

```js
import {AisDecoder} from 'ais-nmea-decoder';

const decoder = new AisDecoder();

function parseLine(line) {
    const result = decoder.parse(line);
    if (result.error) return;    // log error here if desired
    if (result.pending) return;  // wait for next message fragment

    // result is a fully decoded message
    console.log(result.mmsi, result.lat, result.lon);
    return result;
}
```

## Options

```js
const decoder = new AisDecoder({
    enableLogging: false,    // (default false) log unknown message types to console
    cleanDecoded: true,      // (default false) remove undefined/invalid fields from result
    propertyNames: [         // (default null) rename default property names to custom names
        ['sog', 'speed'],
        ['cog', 'course']
    ],
    qualityCheck: true,      // (default false) enable data integrity checks
    qualityOptions: {
        requiredDynamic: 2,  // (default 2) consecutive position reports required before accepting
        requiredStatic: 1,   // (default 1) consecutive static messages required before accepting
        maxDistanceNm: 1,    // (default 1) max distance (nm) between consecutive positions
    },
});
```

## Supported Message Types

1, 2, 3, 4, 5, 9, 11, 14, 18, 19, 21, 24, 27

## Decoded Fields

Every result includes these **common fields**:

| Field | Description |
|-------|-------------|
| `channel` | VHF channel (A or B) |
| `mtype` | Message type number |
| `repeat` | Repeat indicator |
| `mmsi` | Maritime Mobile Service Identity |

**Additional fields by message type:**

Note: use the `propertyNames` option to rename default field names.

| Field | Type | Description | Message Types |
|-------|------|-------------|---------------|
| `class` | string | Vessel class (`A` or `B`) | 1–3, 5, 18, 19, 24 |
| `nav` | int | Navigation status | 1–3, 27 |
| `lat` | float | Latitude | 1–4, 9, 11, 18, 19, 21, 27 |
| `lon` | float | Longitude | 1–4, 9, 11, 18, 19, 21, 27 |
| `sog` | float | Speed over ground (knots, ×10 for 1–3/18/19) | 1–3, 9, 18, 19, 27 |
| `cog` | float | Course over ground | 1–3, 9, 18, 19, 27 |
| `hdg` | int | True heading | 1–3, 18, 19 |
| `rot` | int | Rate of turn | 1–3 |
| `utc` | int | UTC second | 1–3, 18, 19, 21 |
| `smi` | int | Special manoeuvre indicator | 1–3 |
| `accuracy` | int | Position accuracy | 18 |
| `dsc` | bool | DSC flag | 18 |
| `alt` | int | Altitude (m) | 9 |
| `name` | string | Vessel/station name | 5, 19, 21, 24 |
| `sign` | string | Call sign | 5, 24 |
| `imo` | int | IMO number | 5 |
| `ver` | int | AIS version | 5 |
| `type` | int | Vessel/aid type | 5, 19, 21, 24 |
| `dimA` | int | Dimension to bow | 5, 19, 21, 24 |
| `dimB` | int | Dimension to stern | 5, 19, 21, 24 |
| `dimC` | int | Dimension to port | 5, 19, 21, 24 |
| `dimD` | int | Dimension to starboard | 5, 19, 21, 24 |
| `len` | int | Overall length (dimA + dimB) | 5, 19, 21, 24 |
| `wid` | int | Overall width (dimC + dimD) | 5, 19, 21, 24 |
| `draft` | float | Draught | 5 |
| `dest` | string | Destination | 5 |
| `etaMo` | int | ETA month | 5 |
| `etaDy` | int | ETA day | 5 |
| `etaHr` | int | ETA hour | 5 |
| `etaMn` | int | ETA minute | 5 |
| `part` | int | Part number (0 = A, 1 = B) | 24 |
| `mother` | int | Mothership MMSI | 24 |
| `text` | string | Safety-related text | 14 |

## Development

Pull requests should be clear, concise, and favor readability and performance. All lines of code should be covered by a test. Run `npm run coverage` to generate a coverage report at `coverage/index.html`.

The AIS decoding guide can be viewed [here](https://wayofthefuture.github.io/ais-nmea-decoder/).

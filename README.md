[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/wayofthefuture/ais-nmea-decoder/actions/workflows/CI.yaml/badge.svg)](https://github.com/wayofthefuture/ais-nmea-decoder/actions/workflows/CI.yaml)
[![codecov](https://codecov.io/gh/wayofthefuture/ais-nmea-decoder/graph/badge.svg)](https://codecov.io/gh/wayofthefuture/ais-nmea-decoder)
[![NPM Version](https://img.shields.io/npm/v/ais-nmea-decoder)](https://www.npmjs.com/package/ais-nmea-decoder)
[![Static Badge](https://img.shields.io/badge/https%3A%2F%2Fwayofthefuture.github.io%2Fais-nmea-decoder%2F?label=Documentation)](https://wayofthefuture.github.io/ais-nmea-decoder/)

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

Feed each sentence in order - two-part messages (e.g. type 5) are handled automatically:

```js
import {AisDecoder, isDecoded} from 'ais-nmea-decoder';

const decoder = new AisDecoder();

function parseLine(line) {
    const result = decoder.parse(line);
    if (!isDecoded(result)) return;       // result type is narrowed to `AisSuccessResult` here

    console.log(result);                  // {status: 'decoded', channel, mtype, mmsi, lat, lon, ...}
    return result;
}

parseLine('!AIVDM,1,1,,B,15MqhT0026:Otl8EoR4<H?vL0<1h,0*2C');
```

## Options

```js
const decoder = new AisDecoder({
    enableLogging: false,     // (default false) log unknown message types to console
    mapPropertyNames: true,   // (default false) rename properties according to `propertyMap`
    propertyMap: [            // (default null) rename default property names to custom names
        ['sog', 'speed'],
        ['cog', 'course']
    ],
});
```

The decoder uses short field names (`sog`, `cog`, `hdg`, ...) to keep results compact. If your application expects different names — for example to match an existing database schema or API contract — set `mapPropertyNames: true` and provide a `propertyMap` of `[default, custom]` pairs. Each decoded result will then carry the custom name in place of the default; pairs whose default name is not present in a given message are simply skipped.

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

Note: enable the `mapPropertyNames` option to rename default field names according to `propertyMap`.

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

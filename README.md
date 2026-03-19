# ais-nmea-decoder

**This project is currently under development...**

Decode AIS NMEA sentences into structured objects.

This project originates from 'ggencoder' and aims to modernize the decoding of AIS/NMEA messages with a focus on data integrity, maintainability, and performance. It focuses on modernizing the decoding approach by incorporating contemporary development practices, including:

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
const result = decoder.parse('!AIVDM,1,1,,B,15MqhT0026:Otl8EoR4<H?vL0<1h,0*2C');

if (result.error) return;
if (result.pending) return; // multi-part message awaiting next fragment

console.log(result);
// { channel, mtype, mmsi, lat, lon, sog, cog, ... }
```

## Options

```js
const decoder = new AisDecoder({
    cleanDecoded: true,      // (default false) remove undefined/invalid fields from result
    propertyNames: [         // (default null) rename default property names to custom property names
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

## Development

Any pull requests submitted to this project should be done in a clear and concise way that favors readability and performance. All lines of code should be covered by a test. Run `npm coverage` to view a coverage report locally at coverage/index.html.

The AIS decoding guide can be viewed [here](https://wayofthefuture.github.io/ais-nmea-decoder/).

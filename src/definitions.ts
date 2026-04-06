export type AisParseResults = {
    // state data
    payload?: Uint8Array;
    pending?: boolean;
    error?: string;
    // common fields
    /** VHF channel (A or B) */
    channel?: string;
    /** Message type number */
    mtype?: number;
    /** Repeat indicator */
    repeat?: number;
    /** Maritime Mobile Service Identity */
    mmsi?: number;
    // message specific fields
    /** Vessel class (`A` or `B`) | 1–3, 5, 18, 19, 24 | */
    class?: string;
    /** Navigation status | 1–3, 27 | */
    nav?: number;
    /** Latitude | 1–4, 9, 11, 18, 19, 21, 27 | */
    lat?: number;
    /** Longitude | 1–4, 9, 11, 18, 19, 21, 27 | */
    lon?: number;
    /** Speed over ground(knots, ×10 for 1–3 / 18 / 19) | 1–3, 9, 18, 19, 27 | */
    sog?: number;
    /** Course over ground | 1–3, 9, 18, 19, 27 | */
    cog?: number;
    /** True heading | 1–3, 18, 19 | */
    hdg?: number;
    /** Rate of turn | 1–3 | */
    rot?: number;
    /** UTC second | 1–3, 18, 19, 21 | */
    utc?: number;
    /** Special manoeuvre indicator | 1–3 | */
    smi?: number;
    /** Position accuracy | 18 | */
    accuracy?: number;
    /** DSC flag | 18 | */
    dsc?: boolean;
    /** Altitude(m) | 9 | */
    alt?: number;
    /** Vessel / station name | 5, 19, 21, 24 | */
    name?: string;
    /** Call sign | 5, 24 | */
    sign?: string;
    /** IMO number | 5 | */
    imo?: number;
    /** AIS version | 5 | */
    ver?: number;
    /** Vessel / aid type | 5, 19, 21, 24 | */
    type?: number;
    /** Dimension to bow | 5, 19, 21, 24 | */
    dimA?: number;
    /** Dimension to stern | 5, 19, 21, 24 | */
    dimB?: number;
    /** Dimension to port | 5, 19, 21, 24 | */
    dimC?: number;
    /** Dimension to starboard | 5, 19, 21, 24 | */
    dimD?: number;
    /** Overall length(dimA + dimB) | 5, 19, 21, 24 | */
    len?: number;
    /** Overall width(dimC + dimD) | 5, 19, 21, 24 | */
    wid?: number;
    /** Draught | 5 | */
    draft?: number;
    /** Destination | 5 | */
    dest?: string;
    /** ETA month | 5 | */
    etaMo?: number;
    /** ETA day | 5 | */
    etaDy?: number;
    /** ETA hour | 5 | */
    etaHr?: number;
    /** ETA minute | 5 | */
    etaMn?: number;
    /** Part number(0 = A, 1 = B) | 24 | */
    part?: number;
    /** Mothership MMSI | 24 | */
    mother?: number;
    /** Safety - related text | 14 | */
    text?: string;
}

export type QualityOptions = {
    /**
     * Number of required consecutive messages with position for an mmsi before accepting.
     */
    requiredDynamic?: number;
    /**
     * Number of required consecutive messages with static information for an mmsi before accepting.
     */
    requiredStatic?: number;
    /**
     * Maximum distance in nautical miles between consecutive position reports within the distance timeout.
     */
    maxDistanceNm?: number;
}
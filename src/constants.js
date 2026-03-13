
export const MSG_TYPE = {
    1: 'Position Report Class A',
    2: 'Position Report Class A (Assigned schedule)',
    3: 'Position Report Class A (Response to interrogation)',
    4: 'Base Station Report',
    5: 'Static and Voyage Related Data',
    6: 'Binary Addressed Message',
    7: 'Binary Acknowledge',
    8: 'Binary Broadcast Message',
    9: 'Standard SAR Aircraft Position Report',
    10: 'UTC and Date Inquiry',
    11: 'UTC and Date Response',
    12: 'Addressed Safety Related Message',
    13: 'Safety Related Acknowledgement',
    14: 'Safety Related Broadcast Message',
    15: 'Interrogation',
    16: 'Assignment Mode Command',
    17: 'DGNSS Binary Broadcast Message',
    18: 'Standard Class B CS Position Report',
    19: 'Extended Class B Equipment Position Report',
    20: 'Data Link Management',
    21: 'Aid-to-Navigation Report',
    22: 'Channel Management',
    23: 'Group Assignment Command',
    24: 'Static Data Report',
    25: 'Single Slot Binary Message,',
    26: 'Multiple Slot Binary Message With Communications State',
    27: 'Position Report For Long-Range Applications'
};

export const NAV_STATUS = {
    0: 'Under way using engine',
    1: 'At anchor',
    2: 'Not under command',
    3: 'Restricted manoeuverability',
    4: 'Constrained by her draught',
    5: 'Moored',
    6: 'Aground',
    7: 'Engaged in Fishing',
    8: 'Under way sailing',
    9: 'Reserved for future amendment of Navigational Status for HSC',
    10: 'Reserved for future amendment of Navigational Status for WIG',
    11: 'Reserved for future use',
    12: 'Reserved for future use',
    13: 'Reserved for future use',
    14: 'AIS-SART is active',
    15: 'Not defined (default)'
};

export const VESSEL_TYPE = {
    0: 'Not available (default)',
    // 1-19 Reserved for future usage
    20: 'Wing in ground (WIG), all ships of this type',
    21: 'Wing in ground (WIG), Hazardous category A',
    22: 'Wing in ground (WIG), Hazardous category B',
    23: 'Wing in ground (WIG), Hazardous category C',
    24: 'Wing in ground (WIG), Hazardous category D',
    25: 'Wing in ground (WIG), Reserved for future use',
    26: 'Wing in ground (WIG), Reserved for future use',
    27: 'Wing in ground (WIG), Reserved for future use',
    28: 'Wing in ground (WIG), Reserved for future use',
    29: 'Wing in ground (WIG), Reserved for future use',
    30: 'Fishing',
    31: 'Towing',
    32: 'Towing: length exceeds 200m or breadth exceeds 25m',
    33: 'Dredging or underwater ops',
    34: 'Diving ops',
    35: 'Military ops',
    36: 'Sailing',
    37: 'Pleasure Craft',
    38: 'Reserved',
    39: 'Reserved',
    40: 'High speed craft (HSC), all ships of this type',
    41: 'High speed craft (HSC), Hazardous category A',
    42: 'High speed craft (HSC), Hazardous category B',
    43: 'High speed craft (HSC), Hazardous category C',
    44: 'High speed craft (HSC), Hazardous category D',
    45: 'High speed craft (HSC), Reserved for future use',
    46: 'High speed craft (HSC), Reserved for future use',
    47: 'High speed craft (HSC), Reserved for future use',
    48: 'High speed craft (HSC), Reserved for future use',
    49: 'High speed craft (HSC), No additional information',
    50: 'Pilot Vessel',
    51: 'Search and Rescue vessel',
    52: 'Tug',
    53: 'Port Tender',
    54: 'Anti-pollution equipment',
    55: 'Law Enforcement',
    56: 'Spare - Local Vessel',
    57: 'Spare - Local Vessel',
    58: 'Medical Transport',
    59: 'Noncombatant ship according to RR Resolution No. 18',
    60: 'Passenger, all ships of this type',
    61: 'Passenger, Hazardous category A',
    62: 'Passenger, Hazardous category B',
    63: 'Passenger, Hazardous category C',
    64: 'Passenger, Hazardous category D',
    65: 'Passenger, Reserved for future use',
    66: 'Passenger, Reserved for future use',
    67: 'Passenger, Reserved for future use',
    68: 'Passenger, Reserved for future use',
    69: 'Passenger, No additional information',
    70: 'Cargo, all ships of this type',
    71: 'Cargo, Hazardous category A',
    72: 'Cargo, Hazardous category B',
    73: 'Cargo, Hazardous category C',
    74: 'Cargo, Hazardous category D',
    75: 'Cargo, Reserved for future use',
    76: 'Cargo, Reserved for future use',
    77: 'Cargo, Reserved for future use',
    78: 'Cargo, Reserved for future use',
    79: 'Cargo, No additional information',
    80: 'Tanker, all ships of this type',
    81: 'Tanker, Hazardous category A',
    82: 'Tanker, Hazardous category B',
    83: 'Tanker, Hazardous category C',
    84: 'Tanker, Hazardous category D',
    85: 'Tanker, Reserved for future use',
    86: 'Tanker, Reserved for future use',
    87: 'Tanker, Reserved for future use',
    88: 'Tanker, Reserved for future use',
    89: 'Tanker, No additional information',
    90: 'Other Type, all ships of this type',
    91: 'Other Type, Hazardous category A',
    92: 'Other Type, Hazardous category B',
    93: 'Other Type, Hazardous category C',
    94: 'Other Type, Hazardous category D',
    95: 'Other Type, Reserved for future use',
    96: 'Other Type, Reserved for future use',
    97: 'Other Type, Reserved for future use',
    98: 'Other Type, Reserved for future use',
    99: 'Other Type, no additional information'
};

export const ERI_SHIPTYPE_MAP = {
    8000: 99, // Vessel, type unknown
    8010: 79, // Motor freighter
    8020: 89, // Motor tanker
    8021: 80, // Motor tanker, liquid cargo, type N
    8022: 80, // Motor tanker, liquid cargo, type C
    8023: 89, // Motor tanker, dry cargo as if liquid (e.g. cement)
    8030: 79, // Container vessel
    8040: 80, // Gas tanker
    8050: 79, // Motor freighter, tug
    8060: 89, // Motor tanker, tug
    8070: 79, // Motor freighter with one or more ships alongside
    8080: 89, // Motor freighter with tanker
    8090: 79, // Motor freighter pushing one or more freighters
    8100: 89, // Motor freighter pushing at least one tank-ship
    8110: 79, // Tug, freighter
    8120: 89, // Tug, tanker
    8130: 31, // Tug freighter, coupled
    8140: 31, // Tug, freighter/tanker, coupled
    8150: 99, // Freightbarge
    8160: 99, // Tankbarge
    8161: 90, // Tankbarge, liquid cargo, type N
    8162: 90, // Tankbarge, liquid cargo, type C
    8163: 99, // Tankbarge, dry cargo as if liquid (e.g. cement)
    8170: 99, // Freightbarge with containers
    8180: 90, // Tankbarge, gas
    8210: 79, // Pushtow, one cargo barge
    8220: 79, // Pushtow, two cargo barges
    8230: 79, // Pushtow, three cargo barges
    8240: 79, // Pushtow, four cargo barges
    8250: 79, // Pushtow, five cargo barges
    8260: 79, // Pushtow, six cargo barges
    8270: 79, // Pushtow, seven cargo barges
    8280: 79, // Pushtow, eight cargo barges
    8290: 79, // Pushtow, nine or more barges
    8310: 80, // Pushtow, one tank/gas barge
    8320: 80, // Pushtow, two barges at least one tanker or gas barge
    8330: 80, // Pushtow, three barges at least one tanker or gas barge
    8340: 80, // Pushtow, four barges at least one tanker or gas barge
    8350: 80, // Pushtow, five barges at least one tanker or gas barge
    8360: 80, // Pushtow, six barges at least one tanker or gas barge
    8370: 80  // Pushtow, seven barges at least one tanker or gas barge
};

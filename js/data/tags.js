// ============================================================================
// Prairie Gold Processing — Plant 7 tag database
// Every I/O point in the simulated PLC. kind: ai=analog in, di=discrete in,
// ao=analog out, mtr=motor run status, vlv=valve (0-100 cmd)
// ============================================================================

export const AREAS = {
  PREP:       { name: 'Bean Prep',            num: '11xx' },
  EXTRACTION: { name: 'Extraction / DT',      num: '22xx-23xx' },
  REFINERY:   { name: 'Oil Refinery',         num: '31xx-34xx' },
  UTILITIES:  { name: 'Boiler / Cooling',     num: '41xx-42xx' },
  MEAL:       { name: 'Meal & Loadout',       num: '51xx' },
};

// base = normal operating value, noise = random walk amplitude
export const TAGS = [
  // ---------------- PREP ----------------
  { tag: 'M-1105',   kind: 'mtr', area: 'PREP', desc: 'Bean Receiving Conveyor CV-1105', base: 1 },
  { tag: 'IT-1105',  kind: 'ai',  area: 'PREP', desc: 'CV-1105 Motor Current', eu: 'A', base: 22, noise: 1.2, hi: 40 },
  { tag: 'M-1110',   kind: 'mtr', area: 'PREP', desc: 'Cracking Mill A Main Motor', base: 1 },
  { tag: 'IT-1110',  kind: 'ai',  area: 'PREP', desc: 'Cracking Mill A Motor Current', eu: 'A', base: 104, noise: 3, hi: 145 },
  { tag: 'VT-1120',  kind: 'ai',  area: 'PREP', desc: 'Cracking Mill A Bearing Vibration', eu: 'in/s', base: 0.12, noise: 0.02, hi: 0.40, dec: 2 },
  { tag: 'M-1112',   kind: 'mtr', area: 'PREP', desc: 'Cracking Mill B Main Motor', base: 1 },
  { tag: 'IT-1112',  kind: 'ai',  area: 'PREP', desc: 'Cracking Mill B Motor Current', eu: 'A', base: 99, noise: 3, hi: 145 },
  { tag: 'TT-1115',  kind: 'ai',  area: 'PREP', desc: 'Bean Conditioner Outlet Temp', eu: '°F', base: 144, noise: 0.8, lo: 130, hi: 165 },
  { tag: 'TCV-1116', kind: 'vlv', area: 'PREP', desc: 'Conditioner Steam Control Valve', eu: '%', base: 38, noise: 1.5 },
  { tag: 'ZT-1116',  kind: 'ai',  area: 'PREP', desc: 'TCV-1116 Valve Position Feedback', eu: '%', base: 38, noise: 1.5 },
  { tag: 'PT-1117',  kind: 'ai',  area: 'PREP', desc: 'Conditioner Steam Supply Pressure', eu: 'psi', base: 46, noise: 0.8, lo: 30 },
  { tag: 'M-1125',   kind: 'mtr', area: 'PREP', desc: 'Flaking Mill Main Motor', base: 1 },
  { tag: 'IT-1125',  kind: 'ai',  area: 'PREP', desc: 'Flaking Mill Motor Current', eu: 'A', base: 182, noise: 4, hi: 240 },
  { tag: 'LT-1130',  kind: 'ai',  area: 'PREP', desc: 'Flake Surge Bin Level', eu: '%', base: 62, noise: 1.5, lo: 15, hi: 92 },
  { tag: 'M-1135',   kind: 'mtr', area: 'PREP', desc: 'Flake Conveyor to Extraction', base: 1 },

  // ---------------- EXTRACTION ----------------
  { tag: 'M-2105',   kind: 'mtr', area: 'EXTRACTION', desc: 'Extractor Main Drive', base: 1 },
  { tag: 'IT-2105',  kind: 'ai',  area: 'EXTRACTION', desc: 'Extractor Main Drive Current', eu: 'A', base: 96, noise: 2.5, hi: 138 },
  { tag: 'ST-2105',  kind: 'ai',  area: 'EXTRACTION', desc: 'Extractor Rotor Speed', eu: 'rpm', base: 0.82, noise: 0.02, dec: 2, lo: 0.3 },
  { tag: 'LT-2110',  kind: 'ai',  area: 'EXTRACTION', desc: 'Extractor Bed Level', eu: '%', base: 71, noise: 1.4, hi: 90 },
  { tag: 'FT-2115',  kind: 'ai',  area: 'EXTRACTION', desc: 'Hexane Recycle Flow', eu: 'gpm', base: 318, noise: 6, lo: 180 },
  { tag: 'PT-2116',  kind: 'ai',  area: 'EXTRACTION', desc: 'Hexane Spray Header Pressure', eu: 'psi', base: 38, noise: 1, lo: 22 },
  { tag: 'M-2120',   kind: 'mtr', area: 'EXTRACTION', desc: 'Hexane Recycle Pump P-2120', base: 1 },
  { tag: 'LSH-2130', kind: 'di',  area: 'EXTRACTION', desc: 'Spent Flake Discharge Hopper Hi-Level Switch', base: 0 },
  { tag: 'M-2135',   kind: 'mtr', area: 'EXTRACTION', desc: 'Spent Flake Drag Conveyor to DT', base: 1 },
  { tag: 'TT-2210',  kind: 'ai',  area: 'EXTRACTION', desc: 'DT Tray 4 Temperature', eu: '°F', base: 214, noise: 1.2, hi: 235 },
  { tag: 'TT-2212',  kind: 'ai',  area: 'EXTRACTION', desc: 'DT Tray 7 Temperature', eu: '°F', base: 228, noise: 1.2, hi: 245 },
  { tag: 'PT-2206',  kind: 'ai',  area: 'EXTRACTION', desc: 'DT Sparge Steam Pressure', eu: 'psi', base: 52, noise: 1 },
  { tag: 'TCV-2208', kind: 'vlv', area: 'EXTRACTION', desc: 'DT Sparge Steam Control Valve', eu: '%', base: 28, noise: 1.2 },
  { tag: 'ZT-2208',  kind: 'ai',  area: 'EXTRACTION', desc: 'TCV-2208 Valve Position Feedback', eu: '%', base: 28, noise: 1.2 },
  { tag: 'FT-2209',  kind: 'ai',  area: 'EXTRACTION', desc: 'DT Sparge Steam Flow', eu: 'lb/hr', base: 5200, noise: 90, dec: 0 },
  { tag: 'M-2220',   kind: 'mtr', area: 'EXTRACTION', desc: 'DT Discharge Airlock', base: 1 },
  { tag: 'AT-2301',  kind: 'ai',  area: 'EXTRACTION', desc: 'Hexane Vapor Detector — Pump Alley', eu: '%LEL', base: 3, noise: 0.6, hi: 20, dec: 1 },
  { tag: 'M-2302',   kind: 'mtr', area: 'EXTRACTION', desc: 'Miscella Transfer Pump P-2302', base: 1 },
  { tag: 'PT-2305',  kind: 'ai',  area: 'EXTRACTION', desc: 'P-2302 Discharge Pressure', eu: 'psi', base: 74, noise: 1.5, lo: 45 },
  { tag: 'LSL-2303', kind: 'di',  area: 'EXTRACTION', desc: 'P-2302 Seal Pot Lo-Level Switch (1=OK)', base: 1 },
  { tag: 'FSL-2304', kind: 'di',  area: 'EXTRACTION', desc: 'P-2302 Seal Flush Lo-Flow Switch (1=OK)', base: 1 },
  { tag: 'TT-2310',  kind: 'ai',  area: 'EXTRACTION', desc: 'Hexane Condenser Outlet Temp', eu: '°F', base: 96, noise: 1, hi: 115 },
  { tag: 'FT-2312',  kind: 'ai',  area: 'EXTRACTION', desc: 'Cooling Water Flow to Condensers', eu: 'gpm', base: 840, noise: 12, lo: 500, dec: 0 },

  // ---------------- REFINERY ----------------
  { tag: 'TT-3105',  kind: 'ai',  area: 'REFINERY', desc: 'Degumming Mixer Temp', eu: '°F', base: 158, noise: 1 },
  { tag: 'FT-3107',  kind: 'ai',  area: 'REFINERY', desc: 'Citric Acid Dosing Flow', eu: 'gph', base: 14, noise: 0.5, dec: 1 },
  { tag: 'PT-3140',  kind: 'ai',  area: 'REFINERY', desc: 'Bleacher Vacuum', eu: 'inHg', base: 25.5, noise: 0.3, lo: 20, dec: 1 },
  { tag: 'TT-3145',  kind: 'ai',  area: 'REFINERY', desc: 'Bleacher Temp', eu: '°F', base: 221, noise: 1 },
  { tag: 'M-3148',   kind: 'mtr', area: 'REFINERY', desc: 'Bleach Slurry Pump P-3148', base: 1 },
  { tag: 'PT-3410',  kind: 'ai',  area: 'REFINERY', desc: 'Vacuum Ejector Motive Steam Pressure', eu: 'psi', base: 148, noise: 2, lo: 120 },
  { tag: 'PCV-3412', kind: 'vlv', area: 'REFINERY', desc: 'Ejector Steam Supply Valve', eu: '%', base: 62, noise: 1.5 },
  { tag: 'ZT-3412',  kind: 'ai',  area: 'REFINERY', desc: 'PCV-3412 Valve Position Feedback', eu: '%', base: 62, noise: 1.5 },
  { tag: 'LT-3220',  kind: 'ai',  area: 'REFINERY', desc: 'Deodorizer Level', eu: '%', base: 47, noise: 1, hi: 78 },
  { tag: 'TT-3225',  kind: 'ai',  area: 'REFINERY', desc: 'Deodorizer Temp', eu: '°F', base: 482, noise: 2 },
  { tag: 'PT-3230',  kind: 'ai',  area: 'REFINERY', desc: 'Deodorizer Vacuum', eu: 'torr', base: 3.1, noise: 0.15, dec: 1 },
  { tag: 'M-3225',   kind: 'mtr', area: 'REFINERY', desc: 'Deodorizer Discharge Pump P-3225', base: 1 },
  { tag: 'IT-3226',  kind: 'ai',  area: 'REFINERY', desc: 'P-3225 Motor Current', eu: 'A', base: 31, noise: 1, hi: 48 },
  { tag: 'OL-3225',  kind: 'di',  area: 'REFINERY', desc: 'P-3225 Overload Relay (1=OK)', base: 1 },
  { tag: 'FT-3250',  kind: 'ai',  area: 'REFINERY', desc: 'RBD Oil to Storage Flow', eu: 'gpm', base: 88, noise: 2, dec: 0 },

  // ---------------- UTILITIES ----------------
  { tag: 'PT-4105',  kind: 'ai',  area: 'UTILITIES', desc: 'Main Steam Header Pressure', eu: 'psi', base: 126, noise: 1.2, lo: 105 },
  { tag: 'FT-4107',  kind: 'ai',  area: 'UTILITIES', desc: 'Boiler Steam Flow', eu: 'klb/hr', base: 64, noise: 1.5, dec: 1 },
  { tag: 'LT-4110',  kind: 'ai',  area: 'UTILITIES', desc: 'Boiler Drum Level', eu: '%', base: 50, noise: 1, lo: 30, hi: 70 },
  { tag: 'FT-4111',  kind: 'ai',  area: 'UTILITIES', desc: 'Boiler Feedwater Flow', eu: 'gpm', base: 132, noise: 2.5, dec: 0 },
  { tag: 'FCV-4112', kind: 'vlv', area: 'UTILITIES', desc: 'Boiler Feedwater Control Valve', eu: '%', base: 55, noise: 1.5 },
  { tag: 'ZT-4112',  kind: 'ai',  area: 'UTILITIES', desc: 'FCV-4112 Valve Position Feedback', eu: '%', base: 55, noise: 1.5 },
  { tag: 'M-4115',   kind: 'mtr', area: 'UTILITIES', desc: 'Boiler Feedwater Pump P-4115', base: 1 },
  { tag: 'PT-4116',  kind: 'ai',  area: 'UTILITIES', desc: 'BFW Pump Discharge Pressure', eu: 'psi', base: 215, noise: 2.5 },
  { tag: 'TT-4210',  kind: 'ai',  area: 'UTILITIES', desc: 'Cooling Water Supply Temp', eu: '°F', base: 85, noise: 0.7, hi: 97 },
  { tag: 'TT-4211',  kind: 'ai',  area: 'UTILITIES', desc: 'Cooling Water Return Temp', eu: '°F', base: 99, noise: 0.8 },
  { tag: 'M-4215',   kind: 'mtr', area: 'UTILITIES', desc: 'Cooling Tower Fan CT-1', base: 1 },
  { tag: 'VFD-4215', kind: 'di',  area: 'UTILITIES', desc: 'CT-1 Fan VFD Fault (1=FAULTED)', base: 0 },
  { tag: 'M-4220',   kind: 'mtr', area: 'UTILITIES', desc: 'Cooling Water Circulation Pump P-4220', base: 1 },
  { tag: 'PT-4221',  kind: 'ai',  area: 'UTILITIES', desc: 'Cooling Water Header Pressure', eu: 'psi', base: 62, noise: 1 },
  { tag: 'LT-4225',  kind: 'ai',  area: 'UTILITIES', desc: 'Cooling Tower Basin Level', eu: '%', base: 74, noise: 1 },

  // ---------------- MEAL ----------------
  { tag: 'M-5110',   kind: 'mtr', area: 'MEAL', desc: 'Pellet Mill Main Motor', base: 1 },
  { tag: 'IT-5110',  kind: 'ai',  area: 'MEAL', desc: 'Pellet Mill Motor Current', eu: 'A', base: 156, noise: 4, hi: 210 },
  { tag: 'TT-5120',  kind: 'ai',  area: 'MEAL', desc: 'Pellet Cooler Discharge Temp', eu: '°F', base: 109, noise: 1.2, hi: 135 },
  { tag: 'M-5115',   kind: 'mtr', area: 'MEAL', desc: 'Pellet Cooler Exhaust Fan', base: 1 },
  { tag: 'M-5118',   kind: 'mtr', area: 'MEAL', desc: 'Cooler Discharge Rotary Airlock RV-5118', base: 1 },
  { tag: 'SS-5118',  kind: 'di',  area: 'MEAL', desc: 'RV-5118 Zero-Speed Switch (1=TURNING)', base: 1 },
  { tag: 'LT-5125',  kind: 'ai',  area: 'MEAL', desc: 'Pellet Cooler Bed Level', eu: '%', base: 55, noise: 1.5, hi: 85 },
];

export const TAGMAP = Object.fromEntries(TAGS.map(t => [t.tag, t]));

export function normTag(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
export const TAG_BY_NORM = Object.fromEntries(TAGS.map(t => [normTag(t.tag), t]));

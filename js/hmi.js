// ============================================================================
// FactoryTalk View SE — style HMI. Screens are 1200x620 coordinate space,
// SVG for graphics + absolutely positioned HTML for live values.
// ============================================================================
import { TAGMAP } from './data/tags.js';

const W = 1200, H = 620;
const pct = (x, y) => `left:${(x / W * 100).toFixed(2)}%;top:${(y / H * 100).toFixed(2)}%;`;

// ---------------- SVG symbol builders ----------------
const sv = {
  vessel(x, y, w, h, fill = '#c7ccd1') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(14, w / 4)}" fill="${fill}" stroke="#39434c" stroke-width="2"/>`;
  },
  column(x, y, w, h) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" fill="#c7ccd1" stroke="#39434c" stroke-width="2"/>` +
      Array.from({ length: Math.floor(h / 28) - 1 }, (_, i) =>
        `<line x1="${x + 4}" y1="${y + 24 + i * 28}" x2="${x + w - 4}" y2="${y + 24 + i * 28}" stroke="#9aa5ad" stroke-width="1.5"/>`).join('');
  },
  drum(x, y, w, h) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#cfc49a" stroke="#39434c" stroke-width="2"/>`;
  },
  hopper(x, y, w, h) {
    return `<polygon points="${x},${y} ${x + w},${y} ${x + w * 0.65},${y + h} ${x + w * 0.35},${y + h}" fill="#c7ccd1" stroke="#39434c" stroke-width="2"/>`;
  },
  pump(x, y, tag, r = 16) {
    return `<g data-mtag="${tag}"><circle cx="${x}" cy="${y}" r="${r}" fill="#888" stroke="#222" stroke-width="2"/>` +
      `<polygon points="${x - r * 0.45},${y - r * 0.55} ${x - r * 0.45},${y + r * 0.55} ${x + r * 0.62},${y}" fill="#fff"/></g>`;
  },
  fan(x, y, tag, r = 18) {
    return `<g data-mtag="${tag}"><circle cx="${x}" cy="${y}" r="${r}" fill="#888" stroke="#222" stroke-width="2"/>` +
      `<path d="M ${x} ${y} l ${r * 0.8} ${-r * 0.5} a ${r} ${r} 0 0 0 ${-r * 1.6} 0 z" fill="#fff"/>` +
      `<path d="M ${x} ${y} l ${-r * 0.8} ${r * 0.5} a ${r} ${r} 0 0 0 ${r * 1.6} 0 z" fill="#fff" transform="rotate(180 ${x} ${y})"/></g>`;
  },
  valve(x, y, tag) {
    return `<g data-vtag="${tag}"><polygon points="${x - 14},${y - 9} ${x - 14},${y + 9} ${x},${y} ${x + 14},${y + 9} ${x + 14},${y - 9} ${x},${y}" fill="#888" stroke="#222" stroke-width="2"/>` +
      `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 16}" stroke="#222" stroke-width="2"/>` +
      `<rect x="${x - 9}" y="${y - 26}" width="18" height="10" fill="#d8b020" stroke="#222" stroke-width="1.5"/></g>`;
  },
  pipe(pts, color = '#39434c', w2 = 5) {
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w2}" stroke-linejoin="round"/>`;
  },
  arrow(x, y, dir = 'r') {
    const m = { r: '0', d: '90', l: '180', u: '270' }[dir];
    return `<polygon points="${x},${y - 7} ${x + 12},${y} ${x},${y + 7}" fill="#39434c" transform="rotate(${m} ${x} ${y})"/>`;
  },
  lamp(x, y, id) {
    return `<circle data-lamp="${id}" cx="${x}" cy="${y}" r="9" fill="#444" stroke="#222" stroke-width="2"/>`;
  },
  text(x, y, s, size = 13, color = '#0a1620', anchor = 'middle', bold = true) {
    return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-family="Tahoma" ${bold ? 'font-weight="bold"' : ''}>${s}</text>`;
  },
};

// HTML live element shorthands
const PV = (tag, x, y, label) => ({ k: 'pv', tag, x, y, label });
const ST = (tag, x, y, label) => ({ k: 'st', tag, x, y, label });
const LBL = (x, y, text, size) => ({ k: 'lbl', x, y, text, size });

// ---------------- screen definitions ----------------
const SCREENS = {
  OVERVIEW: {
    title: 'PLANT 7 OVERVIEW — SOYBEAN EXTRACTION & REFINING',
    svg() {
      let s = '';
      const blocks = [
        [60, 90, 300, 180, 'BEAN PREP', 'ov_PREP'],
        [430, 90, 320, 180, 'EXTRACTION / DT', 'ov_EXTRACTION'],
        [820, 90, 320, 180, 'OIL REFINERY', 'ov_REFINERY'],
        [430, 360, 320, 180, 'UTILITIES', 'ov_UTILITIES'],
        [60, 360, 300, 180, 'MEAL & LOADOUT', 'ov_MEAL'],
      ];
      for (const [x, y, w, h, name, lamp] of blocks) {
        s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#b3bcc3" stroke="#39434c" stroke-width="2.5" rx="4"/>`;
        s += sv.text(x + w / 2, y + 24, name, 15);
        s += sv.lamp(x + w - 24, y + 22, lamp);
      }
      s += sv.pipe([[360, 180], [430, 180]]); s += sv.arrow(415, 180);
      s += sv.pipe([[750, 180], [820, 180]]); s += sv.arrow(805, 180);
      s += sv.pipe([[510, 270], [510, 305], [240, 305], [240, 360]]); s += sv.arrow(240, 345, 'd');
      s += sv.pipe([[590, 360], [590, 270]], '#7d2f4f'); s += sv.arrow(590, 285, 'u');
      s += sv.text(640, 320, 'STEAM / CW', 12, '#5a2a3a');
      return s;
    },
    html: [
      PV('IT-1110', 110, 130, 'MILL A AMPS'), PV('TT-1115', 110, 170, 'COND TEMP'), PV('IT-1125', 110, 210, 'FLAKER AMPS'),
      PV('IT-2105', 480, 130, 'EXTR AMPS'), PV('TT-2210', 480, 170, 'DT TRAY 4'), PV('AT-2301', 480, 210, 'LEL ALLEY'),
      PV('PT-3140', 870, 130, 'BLCH VAC'), PV('LT-3220', 870, 170, 'DEOD LVL'), PV('FT-3250', 870, 210, 'RBD FLOW'),
      PV('PT-4105', 480, 400, 'STM HDR'), PV('LT-4110', 480, 440, 'DRUM LVL'), PV('TT-4210', 480, 480, 'CW SUPPLY'),
      PV('TT-5120', 110, 400, 'COOLER TEMP'), PV('LT-5125', 110, 440, 'BED LEVEL'), PV('IT-5110', 110, 480, 'PELLET AMPS'),
      LBL(950, 380, 'CLICK ANY VALUE FOR TREND', 12),
      LBL(950, 410, 'AREA LAMPS FLASH ON ALARM', 12),
    ],
  },

  PREP: {
    title: 'AREA 11 — BEAN PREP',
    svg() {
      let s = '';
      s += sv.pipe([[30, 160], [150, 160]]); s += sv.arrow(135, 160);
      s += sv.text(70, 145, 'BEANS FROM STORAGE', 11);
      s += sv.vessel(150, 110, 110, 100); s += sv.text(205, 100, 'CRACKING MILL A');
      s += sv.vessel(150, 260, 110, 100); s += sv.text(205, 250, 'CRACKING MILL B');
      s += sv.pipe([[260, 160], [340, 160], [340, 230], [400, 230]]);
      s += sv.pipe([[260, 310], [340, 310], [340, 230]]);
      s += sv.arrow(388, 230);
      s += sv.drum(400, 195, 220, 70); s += sv.text(510, 185, 'BEAN CONDITIONER');
      s += sv.valve(560, 320, 'TCV-1116');
      s += sv.pipe([[560, 335], [560, 380]], '#7d2f4f'); s += sv.pipe([[560, 305], [560, 265]], '#7d2f4f', 4);
      s += sv.text(610, 372, 'STEAM 50#', 11, '#5a2a3a');
      s += sv.pipe([[620, 230], [700, 230]]); s += sv.arrow(688, 230);
      s += sv.vessel(700, 180, 120, 110); s += sv.text(760, 170, 'FLAKING MILL');
      s += sv.pipe([[820, 230], [890, 230]]); s += sv.arrow(878, 230);
      s += sv.hopper(890, 170, 110, 130); s += sv.text(945, 160, 'SURGE BIN');
      s += sv.pipe([[945, 300], [945, 350], [1100, 350]]); s += sv.arrow(1085, 350);
      s += sv.text(1030, 335, 'TO EXTRACTION', 11);
      s += sv.pump(330, 430, 'M-1105'); s += sv.text(330, 465, 'CV-1105 RECEIVING');
      s += sv.pump(700, 430, 'M-1135'); s += sv.text(700, 465, 'CV-1135 TO EXTR');
      return s;
    },
    html: [
      ST('M-1110', 165, 120, 'MILL A'), PV('IT-1110', 165, 150, 'AMPS'), PV('VT-1120', 165, 180, 'VIB'),
      ST('M-1112', 165, 270, 'MILL B'), PV('IT-1112', 165, 300, 'AMPS'),
      PV('TT-1115', 430, 210, 'OUTLET TEMP'), PV('TCV-1116', 480, 290, 'TCV OUT'), PV('ZT-1116', 600, 290, 'POSITION'),
      PV('PT-1117', 650, 400, 'STM SUPPLY'),
      ST('M-1125', 715, 195, 'FLAKER'), PV('IT-1125', 715, 225, 'AMPS'),
      PV('LT-1130', 905, 200, 'BIN LEVEL'),
      ST('M-1105', 280, 400, 'RUN'), ST('M-1135', 650, 400, 'RUN'),
    ],
  },

  EXTRACTION: {
    title: 'AREA 22/23 — EXTRACTION & DESOLVENTIZING',
    svg() {
      let s = '';
      s += sv.pipe([[20, 140], [90, 140]]); s += sv.arrow(78, 140); s += sv.text(50, 125, 'FLAKES', 11);
      s += sv.drum(90, 100, 280, 90); s += sv.text(230, 90, 'ROTARY EXTRACTOR');
      s += sv.pump(120, 260, 'M-2120'); s += sv.text(120, 295, 'P-2120 HEXANE');
      s += sv.pipe([[120, 244], [120, 190]], '#8a6d1a'); s += sv.pipe([[150, 260], [250, 260], [250, 190]], '#8a6d1a', 4);
      s += sv.hopper(300, 195, 80, 80); s += sv.text(340, 300, 'SPENT FLAKE');
      s += sv.pipe([[340, 275], [340, 330], [470, 330]]); s += sv.arrow(458, 330);
      s += sv.text(420, 318, 'DRAG CONV', 10);
      s += sv.column(470, 130, 90, 260); s += sv.text(515, 120, 'DT TOWER');
      s += sv.valve(620, 350, 'TCV-2208');
      s += sv.pipe([[634, 350], [700, 350]], '#7d2f4f'); s += sv.pipe([[606, 350], [560, 350]], '#7d2f4f', 4);
      s += sv.text(700, 335, 'SPARGE STEAM', 10, '#5a2a3a');
      s += sv.pump(620, 470, 'M-2220'); s += sv.text(620, 505, 'RV-2220 AIRLOCK');
      s += sv.pipe([[515, 390], [515, 470], [604, 470]]);
      s += sv.pipe([[515, 470], [515, 540], [300, 540]]); s += sv.arrow(315, 540, 'l'); s += sv.text(380, 528, 'MEAL TO AREA 51', 10);
      // miscella / pump alley
      s += sv.pump(800, 220, 'M-2302'); s += sv.text(800, 255, 'P-2302 MISCELLA');
      s += sv.pipe([[370, 145], [800, 145], [800, 204]], '#8a6d1a');
      s += sv.pipe([[816, 220], [930, 220], [930, 120], [1080, 120]], '#8a6d1a'); s += sv.arrow(1066, 120);
      s += sv.text(1010, 105, 'TO DISTILLATION', 10);
      s += sv.lamp(860, 300, 'lel'); s += sv.text(905, 304, '%LEL', 11);
      // condensers
      s += sv.vessel(950, 330, 170, 60, '#aebac2'); s += sv.text(1035, 320, 'HEXANE CONDENSERS');
      s += sv.pipe([[950, 360], [880, 360], [880, 420]], '#1a5a7a'); s += sv.text(880, 440, 'CW', 11, '#1a5a7a');
      return s;
    },
    html: [
      ST('M-2105', 110, 110, 'DRIVE'), PV('IT-2105', 110, 140, 'AMPS'), PV('ST-2105', 200, 140, 'SPEED'), PV('LT-2110', 290, 140, 'BED LVL'),
      PV('FT-2115', 60, 330, 'HEX FLOW'), PV('PT-2116', 160, 330, 'HDR PSI'),
      ST('LSH-2130', 305, 215, 'HOPPER HI'), ST('M-2135', 395, 360, 'DRAG'),
      PV('TT-2210', 480, 200, 'TRAY 4'), PV('TT-2212', 480, 250, 'TRAY 7'), PV('PT-2206', 480, 300, 'SPG PSI'),
      PV('TCV-2208', 580, 390, 'TCV OUT'), PV('ZT-2208', 680, 390, 'POSITION'), PV('FT-2209', 580, 430, 'STM FLOW'),
      ST('M-2220', 560, 440, 'RUN'),
      ST('M-2302', 750, 180, 'RUN'), PV('PT-2305', 850, 180, 'DISCH'), ST('LSL-2303', 740, 300, 'SEAL POT'), ST('FSL-2304', 740, 340, 'SEAL FLUSH'),
      PV('AT-2301', 940, 290, 'LEL ALLEY'),
      PV('TT-2310', 955, 400, 'COND OUT'), PV('FT-2312', 1075, 400, 'CW FLOW'),
    ],
  },

  REFINERY: {
    title: 'AREA 31-34 — OIL REFINERY',
    svg() {
      let s = '';
      s += sv.pipe([[20, 150], [80, 150]], '#8a6d1a'); s += sv.arrow(68, 150); s += sv.text(45, 135, 'CRUDE OIL', 10);
      s += sv.vessel(80, 100, 110, 100); s += sv.text(135, 90, 'DEGUMMING');
      s += sv.pipe([[190, 150], [270, 150]], '#8a6d1a'); s += sv.arrow(258, 150);
      s += sv.vessel(270, 90, 130, 130); s += sv.text(335, 80, 'BLEACHER V-3140');
      // ejector set above bleacher
      s += sv.drum(430, 60, 130, 40); s += sv.text(495, 50, 'EJECTOR J-3410');
      s += sv.pipe([[335, 90], [335, 80], [430, 80]], '#5a6a7a', 4);
      s += sv.valve(610, 80, 'PCV-3412');
      s += sv.pipe([[624, 80], [690, 80]], '#7d2f4f'); s += sv.pipe([[596, 80], [560, 80]], '#7d2f4f', 4);
      s += sv.text(700, 65, 'MOTIVE STEAM 150#', 10, '#5a2a3a');
      s += sv.pump(335, 290, 'M-3148'); s += sv.text(335, 325, 'P-3148 SLURRY');
      s += sv.pipe([[335, 220], [335, 274]], '#8a6d1a');
      s += sv.pipe([[351, 290], [520, 290], [520, 200]], '#8a6d1a'); s += sv.arrow(520, 215, 'u');
      s += sv.column(490, 200, 80, 280); s += sv.text(530, 190, 'DEODORIZER C-3220');
      s += sv.pump(640, 460, 'M-3225'); s += sv.text(640, 495, 'P-3225 DISCHARGE');
      s += sv.pipe([[530, 480], [530, 460], [624, 460]], '#8a6d1a');
      s += sv.pipe([[656, 460], [820, 460], [820, 380]], '#8a6d1a'); s += sv.arrow(820, 395, 'u');
      s += sv.vessel(760, 280, 120, 100, '#d8d8c8'); s += sv.text(820, 270, 'RBD STORAGE');
      s += sv.pipe([[880, 330], [1090, 330]], '#8a6d1a'); s += sv.arrow(1075, 330); s += sv.text(1000, 315, 'TO LOADOUT', 10);
      return s;
    },
    html: [
      PV('TT-3105', 95, 115, 'MIX TEMP'), PV('FT-3107', 95, 155, 'ACID DOSE'),
      PV('PT-3140', 285, 110, 'VACUUM'), PV('TT-3145', 285, 160, 'TEMP'),
      PV('PT-3410', 440, 110, 'MOTIVE PSI'), PV('PCV-3412', 575, 115, 'PCV OUT'), PV('ZT-3412', 670, 115, 'POSITION'),
      ST('M-3148', 285, 260, 'RUN'),
      PV('LT-3220', 500, 230, 'LEVEL'), PV('TT-3225', 500, 280, 'TEMP'), PV('PT-3230', 500, 330, 'VAC TORR'),
      ST('M-3225', 590, 420, 'RUN'), PV('IT-3226', 690, 420, 'AMPS'), ST('OL-3225', 590, 530, 'OVERLOAD OK'),
      PV('FT-3250', 880, 420, 'RBD FLOW'),
    ],
  },

  UTILITIES: {
    title: 'AREA 41/42 — STEAM & COOLING WATER',
    svg() {
      let s = '';
      s += sv.vessel(120, 90, 240, 180, '#b8a890'); s += sv.text(240, 80, 'BOILER NO. 1');
      s += sv.drum(150, 110, 180, 46); s += sv.text(240, 103, 'STEAM DRUM', 10);
      s += sv.pipe([[360, 130], [520, 130]], '#7d2f4f'); s += sv.arrow(505, 130); s += sv.text(450, 115, 'MAIN HEADER', 10, '#5a2a3a');
      s += sv.valve(80, 330, 'FCV-4112');
      s += sv.pipe([[80, 315], [80, 200], [150, 156]], '#1a5a7a', 4);
      s += sv.pump(80, 440, 'M-4115'); s += sv.text(80, 475, 'P-4115 BFW');
      s += sv.pipe([[80, 424], [80, 345]], '#1a5a7a', 4);
      s += sv.pipe([[20, 440], [64, 440]], '#1a5a7a'); s += sv.text(38, 425, 'FROM DA', 9);
      // cooling tower
      s += sv.vessel(700, 120, 260, 180, '#9db8c8'); s += sv.text(830, 110, 'COOLING TOWER CT-1');
      s += sv.fan(770, 160, 'M-4215'); s += sv.fan(890, 160, 'M-4220-X');
      s += sv.lamp(770, 200, 'vfdflt'); s += sv.text(815, 204, 'VFD FAULT', 10);
      s += sv.pump(700, 400, 'M-4220'); s += sv.text(700, 435, 'P-4220 CW CIRC');
      s += sv.pipe([[700, 384], [700, 300]], '#1a5a7a', 4);
      s += sv.pipe([[716, 400], [1080, 400]], '#1a5a7a'); s += sv.arrow(1065, 400); s += sv.text(1000, 385, 'CW SUPPLY TO PLANT', 10, '#1a5a7a');
      s += sv.pipe([[1080, 250], [960, 250]], '#7a4a1a'); s += sv.arrow(975, 250, 'l'); s += sv.text(1030, 235, 'CW RETURN', 10, '#7a4a1a');
      return s;
    },
    html: [
      PV('LT-4110', 200, 170, 'DRUM LVL'), PV('PT-4105', 420, 150, 'HDR PSI'), PV('FT-4107', 420, 190, 'STM FLOW'),
      PV('FCV-4112', 110, 300, 'FCV OUT'), PV('ZT-4112', 110, 350, 'POSITION'), PV('FT-4111', 200, 230, 'FW FLOW'),
      ST('M-4115', 140, 420, 'RUN'), PV('PT-4116', 140, 450, 'DISCH PSI'),
      ST('M-4215', 740, 240, 'FAN CT-1'), ST('VFD-4215', 850, 240, 'VFD FLT'),
      ST('M-4220', 640, 370, 'RUN'), PV('PT-4221', 800, 430, 'CW HDR'), PV('LT-4225', 900, 430, 'BASIN'),
      PV('TT-4210', 800, 470, 'SUPPLY °F'), PV('TT-4211', 900, 470, 'RETURN °F'),
    ],
  },

  MEAL: {
    title: 'AREA 51 — MEAL FINISHING & LOADOUT',
    svg() {
      let s = '';
      s += sv.pipe([[20, 150], [100, 150]]); s += sv.arrow(88, 150); s += sv.text(55, 135, 'MEAL FROM DT', 10);
      s += sv.vessel(100, 100, 130, 110); s += sv.text(165, 90, 'PELLET MILL');
      s += sv.pipe([[230, 150], [330, 150]]); s += sv.arrow(318, 150);
      s += sv.vessel(330, 100, 180, 200, '#cfc49a'); s += sv.text(420, 90, 'COUNTERFLOW COOLER');
      s += sv.fan(560, 120, 'M-5115'); s += sv.text(560, 90, 'EXHAUST', 10);
      s += sv.pipe([[510, 140], [542, 132]], '#5a6a7a', 4);
      s += sv.pump(420, 370, 'M-5118'); s += sv.text(420, 405, 'RV-5118 AIRLOCK');
      s += sv.pipe([[420, 300], [420, 354]]);
      s += sv.lamp(490, 370, 'zerospeed'); s += sv.text(540, 374, 'ZERO SPD', 10);
      s += sv.pipe([[420, 386], [420, 470], [700, 470]]); s += sv.arrow(685, 470);
      s += sv.hopper(700, 380, 130, 140); s += sv.text(765, 370, 'LOADOUT SILO');
      s += sv.pipe([[765, 520], [765, 555]]); s += sv.text(860, 545, 'TRUCK SCALE →', 11);
      return s;
    },
    html: [
      ST('M-5110', 120, 115, 'MILL'), PV('IT-5110', 120, 145, 'AMPS'),
      PV('TT-5120', 350, 130, 'DISCH TEMP'), PV('LT-5125', 350, 180, 'BED LEVEL'),
      ST('M-5115', 610, 130, 'FAN'),
      ST('M-5118', 340, 340, 'MOTOR'), ST('SS-5118', 480, 320, 'ROTOR TURNING'),
    ],
  },

  ALARMS: { title: 'ALARM SUMMARY', svg() { return ''; }, html: [] },
  TREND:  { title: 'TREND DISPLAY', svg() { return ''; }, html: [] },
};

// ============================================================================
export class HMI {
  constructor(sim, game) {
    this.sim = sim;
    this.game = game;
    this.el = document.getElementById('hmi');
    this.screenEl = document.getElementById('hmi-screen');
    this.titleEl = document.getElementById('hmi-title-text');
    this.abRows = document.getElementById('hmi-ab-rows');
    this.clockEl = document.getElementById('hmi-clock');
    this.current = 'OVERVIEW';
    this.trendPens = [];
    this.liveEls = [];   // {el, tag, k}
    this.open = false;

    document.querySelectorAll('[data-hmiscreen]').forEach(b =>
      b.addEventListener('click', () => this.show(b.dataset.hmiscreen)));
    document.getElementById('hmi-ack').addEventListener('click', () => this.game.ackAlarm(false));
    document.getElementById('hmi-ackall').addEventListener('click', () => this.game.ackAlarm(true));
  }

  openOverlay(screen) {
    this.open = true;
    this.el.classList.remove('hidden');
    this.show(screen || this.autoScreen());
  }
  closeOverlay() { this.open = false; this.el.classList.add('hidden'); }

  // jump straight to the subject of the active alarm
  autoScreen() {
    const sc = this.game.activeScenario;
    return sc ? sc.screen : 'OVERVIEW';
  }

  show(name) {
    this.current = name;
    const def = SCREENS[name];
    this.titleEl.textContent = `FactoryTalk View SE Client — PGP_PLANT7 — [${name}]`;
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('activenav', b.dataset.hmiscreen === name));

    if (name === 'ALARMS') { this._buildAlarmSummary(); return; }
    if (name === 'TREND') { this._buildTrend(); return; }

    let html = `<svg id="hmi-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${def.svg()}</svg>`;
    html += `<div class="hmi-title-block">${def.title}</div>`;
    this.screenEl.innerHTML = html;
    this.liveEls = [];
    for (const e of def.html) {
      const d = document.createElement('div');
      if (e.k === 'pv') {
        d.className = 'hmi-pv'; d.style.cssText = pct(e.x, e.y);
        d.dataset.tag = e.tag;
        d.title = `${e.tag} — ${TAGMAP[e.tag]?.desc || ''}`;
        d.addEventListener('click', () => { this.trendPens = [e.tag]; this.show('TREND'); });
        const lab = document.createElement('div');
        lab.className = 'hmi-pv-label'; lab.style.cssText = pct(e.x, e.y - 16);
        lab.textContent = `${e.label || ''} ${e.tag}`;
        this.screenEl.appendChild(lab);
      } else if (e.k === 'st') {
        d.className = 'hmi-state off'; d.style.cssText = pct(e.x, e.y);
        d.dataset.tag = e.tag;
        const lab = document.createElement('div');
        lab.className = 'hmi-pv-label'; lab.style.cssText = pct(e.x, e.y - 16);
        lab.textContent = `${e.label || ''} ${e.tag}`;
        this.screenEl.appendChild(lab);
      } else if (e.k === 'lbl') {
        d.className = 'hmi-equip-label'; d.style.cssText = pct(e.x, e.y);
        d.textContent = e.text;
      }
      this.screenEl.appendChild(d);
      if (e.tag) this.liveEls.push({ el: d, tag: e.tag, k: e.k });
    }
    const hint = document.createElement('div');
    hint.className = 'hmi-faceplate-hint';
    hint.textContent = 'Click a value to trend it';
    this.screenEl.appendChild(hint);
    this.refresh();
  }

  _buildAlarmSummary() {
    this.screenEl.innerHTML = `<div class="hmi-title-block">ALARM SUMMARY — PLANT 7</div>
      <div class="alm-table"><table><thead><tr>
      <th>TIME</th><th>TAG</th><th>ALARM</th><th>DESCRIPTION</th><th>VALUE</th><th>STATE</th></tr></thead>
      <tbody id="alm-tbody"></tbody></table></div>`;
    this.refresh();
  }

  _buildTrend() {
    const sc = this.game.activeScenario;
    if (this.trendPens.length === 0) {
      this.trendPens = sc ? [...sc.trendTags] : ['PT-4105', 'LT-4110', 'TT-4210'];
    }
    this.screenEl.innerHTML = `<div class="hmi-title-block">TREND — 10 MINUTE WINDOW</div>
      <canvas id="trend-canvas"></canvas>
      <div id="trend-side"><b>PENS</b> (click to toggle)<div id="trend-pen-list"></div>
      <div style="margin-top:8px;font-size:11px">Scenario tags are pre-loaded when an alarm is active.</div></div>`;
    const list = this.screenEl.querySelector('#trend-pen-list');
    const all = new Set([...(sc ? sc.trendTags : []), ...this.trendPens, 'PT-4105', 'TT-4210']);
    for (const tag of all) {
      const b = document.createElement('button');
      b.className = 'trend-pen' + (this.trendPens.includes(tag) ? ' on' : '');
      b.textContent = tag;
      b.addEventListener('click', () => {
        if (this.trendPens.includes(tag)) this.trendPens = this.trendPens.filter(t => t !== tag);
        else this.trendPens.push(tag);
        this._buildTrend();
      });
      list.appendChild(b);
    }
    this.refresh();
  }

  _drawTrend() {
    const cv = this.screenEl.querySelector('#trend-canvas');
    if (!cv) return;
    const wrap = this.screenEl.getBoundingClientRect();
    cv.width = Math.max(200, wrap.width - 280); cv.height = Math.max(200, wrap.height - 70);
    const cx = cv.getContext('2d');
    cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.strokeStyle = '#143018'; cx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      cx.beginPath(); cx.moveTo(cv.width * i / 10, 0); cx.lineTo(cv.width * i / 10, cv.height); cx.stroke();
      cx.beginPath(); cx.moveTo(0, cv.height * i / 10); cx.lineTo(cv.width, cv.height * i / 10); cx.stroke();
    }
    const colors = ['#00ff00', '#ff4040', '#40a0ff', '#ffe000', '#ff80ff', '#00e0e0'];
    this.trendPens.forEach((tag, pi) => {
      const h = this.sim.history[tag]; if (!h || h.length < 2) return;
      let lo = Infinity, hi = -Infinity;
      for (const p of h) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); }
      const m = TAGMAP[tag];
      if (m && (m.kind === 'mtr' || m.kind === 'di')) { lo = -0.1; hi = 1.1; }
      if (hi - lo < 1e-6) { hi = lo + 1; }
      const pad2 = (hi - lo) * 0.1; lo -= pad2; hi += pad2;
      cx.strokeStyle = colors[pi % colors.length]; cx.lineWidth = 1.6;
      cx.beginPath();
      h.forEach((p, i) => {
        const x = (i / 599) * cv.width;
        const y = cv.height - ((p.v - lo) / (hi - lo)) * cv.height;
        if (i === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
      });
      cx.stroke();
      cx.fillStyle = colors[pi % colors.length];
      cx.font = '12px Consolas';
      cx.fillText(`${tag}  ${this.sim.fmt(tag)} ${m?.eu || ''}  [${lo.toFixed(1)}..${hi.toFixed(1)}]`, 10, 16 + pi * 16);
    });
  }

  // called every frame while open
  refresh() {
    if (!this.open) return;
    const now = new Date();
    this.clockEl.textContent = now.toTimeString().slice(0, 8);

    // alarm banner
    const alarms = this.game.alarmRows();
    this.abRows.innerHTML = alarms.slice(0, 4).map(a =>
      `<div class="ab-row ${a.cls}${a.acked ? '' : ' unack'}">
        <span>${a.time}</span><span>${a.tag}</span><span>${a.text}</span><span>${a.state}</span></div>`
    ).join('') || '<div class="ab-row norm"><span>— NO ACTIVE ALARMS —</span></div>';

    if (this.current === 'ALARMS') {
      const tb = this.screenEl.querySelector('#alm-tbody');
      if (tb) tb.innerHTML = alarms.map(a =>
        `<tr class="${a.cls}"><td>${a.time}</td><td>${a.tag}</td><td>${a.name}</td><td>${a.desc}</td>
         <td>${this.sim.fmt(a.tag)} ${TAGMAP[a.tag]?.eu || ''}</td><td>${a.state}</td></tr>`).join('') ||
        '<tr class="norm"><td colspan="6">— NO ACTIVE ALARMS — ALL SYSTEMS NORMAL —</td></tr>';
      return;
    }
    if (this.current === 'TREND') { this._drawTrend(); return; }

    // live values
    const alarmTag = this.game.activeScenario?.alarm.tag;
    const tier = this.game.tier;
    for (const le of this.liveEls) {
      const m = TAGMAP[le.tag];
      if (!m) continue;
      if (le.k === 'pv') {
        le.el.innerHTML = `${this.sim.fmt(le.tag)} <span class="pv-eu">${m.eu || ''}</span>`;
        const v = this.sim.get(le.tag);
        const inAlarm = (m.hi !== undefined && v > m.hi) || (m.lo !== undefined && v < m.lo);
        le.el.classList.toggle('alm-crit', inAlarm && (le.tag === alarmTag ? tier >= 2 : false) || (inAlarm && le.tag === alarmTag && tier >= 2));
        le.el.classList.toggle('alm-warn', inAlarm && !(le.tag === alarmTag && tier >= 2));
      } else if (le.k === 'st') {
        const v = this.sim.get(le.tag) >= 0.5;
        const isFault = le.tag.startsWith('VFD');
        let cls, txt;
        if (isFault) { cls = v ? 'stop' : 'run'; txt = v ? 'FAULT' : 'OK'; }
        else if (m.kind === 'mtr') { cls = v ? 'run' : 'stop'; txt = v ? 'RUN' : 'STOP'; }
        else { cls = v ? 'run' : 'off'; txt = v ? 'ON' : 'OFF'; }
        le.el.className = `hmi-state ${cls}`;
        le.el.textContent = txt;
      }
    }
    // SVG motors / valves / lamps
    this.screenEl.querySelectorAll('[data-mtag]').forEach(el => {
      const tag = el.dataset.mtag;
      const v = this.sim.get(tag);
      const run = v === undefined ? true : v >= 0.5;
      el.querySelector('circle')?.setAttribute('fill', run ? '#00b000' : '#c00000');
    });
    this.screenEl.querySelectorAll('[data-vtag]').forEach(el => {
      const tag = el.dataset.vtag;
      const v = this.sim.get(tag) ?? 0;
      el.querySelector('polygon')?.setAttribute('fill', v > 5 ? '#00b000' : '#c00000');
    });
    this.screenEl.querySelectorAll('[data-lamp]').forEach(el => {
      const id = el.dataset.lamp;
      let on = false, color = '#ff2020';
      if (id === 'lel') { on = this.sim.get('AT-2301') > 15; }
      else if (id === 'vfdflt') { on = this.sim.get('VFD-4215') >= 0.5; }
      else if (id === 'zerospeed') { on = this.sim.get('SS-5118') < 0.5 && this.sim.get('M-5118') >= 0.5; }
      else if (id.startsWith('ov_')) {
        const area = id.slice(3);
        on = this.game.activeScenario && this.game.activeScenario.area === area && tier > 0;
        color = tier >= 2 ? '#ff2020' : '#ffb000';
      }
      const blink = on && (Math.floor(performance.now() / 350) % 2 === 0);
      el.setAttribute('fill', blink ? color : (on ? '#552222' : '#444'));
    });
  }
}

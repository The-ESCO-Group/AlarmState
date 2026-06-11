// ============================================================================
// 3D plant world — Prairie Gold Processing Plant 7
// ============================================================================
import * as THREE from 'three';

const M = {
  steel:    new THREE.MeshStandardMaterial({ color: 0x8a9097, roughness: 0.55, metalness: 0.6 }),
  steelDk:  new THREE.MeshStandardMaterial({ color: 0x565d64, roughness: 0.6, metalness: 0.55 }),
  tankWhite:new THREE.MeshStandardMaterial({ color: 0xd8dcd8, roughness: 0.5, metalness: 0.25 }),
  tankTan:  new THREE.MeshStandardMaterial({ color: 0xc9b98a, roughness: 0.65, metalness: 0.2 }),
  pipe:     new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.4, metalness: 0.7 }),
  pipeYel:  new THREE.MeshStandardMaterial({ color: 0xc8a818, roughness: 0.5, metalness: 0.4 }),
  pipeGrn:  new THREE.MeshStandardMaterial({ color: 0x2f7d4f, roughness: 0.5, metalness: 0.4 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x9b9b94, roughness: 0.95, metalness: 0 }),
  asphalt:  new THREE.MeshStandardMaterial({ color: 0x3c3e40, roughness: 1, metalness: 0 }),
  wallTan:  new THREE.MeshStandardMaterial({ color: 0xb9aE8e, roughness: 0.9, metalness: 0 }),
  wallBlue: new THREE.MeshStandardMaterial({ color: 0x4a6a7a, roughness: 0.85, metalness: 0.1 }),
  roof:     new THREE.MeshStandardMaterial({ color: 0x5a5e62, roughness: 0.9, metalness: 0.1 }),
  motor:    new THREE.MeshStandardMaterial({ color: 0x2a5a9a, roughness: 0.45, metalness: 0.5 }),
  motorRed: new THREE.MeshStandardMaterial({ color: 0x9a2a2a, roughness: 0.45, metalness: 0.5 }),
  yellow:   new THREE.MeshStandardMaterial({ color: 0xd8b020, roughness: 0.6, metalness: 0.3 }),
  dirt:     new THREE.MeshStandardMaterial({ color: 0x6a6a55, roughness: 1 }),
  glassDk:  new THREE.MeshStandardMaterial({ color: 0x16202a, roughness: 0.2, metalness: 0.6 }),
  screenOn: new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x2a5a8a, emissiveIntensity: 1.2, roughness: 0.3 }),
  screenEng:new THREE.MeshStandardMaterial({ color: 0xc8ffc8, emissive: 0x1a6a2a, emissiveIntensity: 1.1, roughness: 0.3 }),
  rust:     new THREE.MeshStandardMaterial({ color: 0x7a5238, roughness: 0.9, metalness: 0.2 }),
};

function box(w, h, d, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  return m;
}
function cyl(rt, rb, h, mat, x, y, z, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}
function hcyl(r, len, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 18), mat);
  m.rotation.z = Math.PI / 2; m.position.set(x, y, z); m.rotation.y = ry;
  return m;
}
// pipe run along points
function pipeRun(group, pts, r = 0.12, mat = M.pipe) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]);
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    group.add(m);
  }
}

function makeLabel(text, opts = {}) {
  const pad = 8, fs = opts.fs || 34;
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d');
  cx.font = `bold ${fs}px Consolas, monospace`;
  const w = cx.measureText(text).width;
  cv.width = w + pad * 2; cv.height = fs + pad * 2;
  cx.font = `bold ${fs}px Consolas, monospace`;
  cx.fillStyle = opts.bg || 'rgba(20,26,32,0.85)';
  cx.fillRect(0, 0, cv.width, cv.height);
  cx.strokeStyle = opts.border || '#e8a020';
  cx.lineWidth = 3; cx.strokeRect(1.5, 1.5, cv.width - 3, cv.height - 3);
  cx.fillStyle = opts.fg || '#ffd887';
  cx.textBaseline = 'middle';
  cx.fillText(text, pad, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }));
  const scale = opts.scale || 0.013;
  sp.scale.set(cv.width * scale, cv.height * scale, 1);
  return sp;
}

function motorUnit(g, x, y, z, ry = 0, mat = M.motor) {
  const u = new THREE.Group();
  u.add(hcyl(0.32, 0.9, mat, 0, 0.32, 0));
  u.add(box(0.5, 0.1, 0.5, M.steelDk, 0, 0.05, 0));
  u.add(hcyl(0.12, 0.4, M.steel, 0.62, 0.32, 0));
  u.position.set(x, y, z); u.rotation.y = ry;
  g.add(u);
  return u;
}

function pumpUnit(g, x, y, z, ry = 0) {
  const u = new THREE.Group();
  u.add(box(1.9, 0.25, 0.8, M.concrete, 0, 0.125, 0));
  u.add(hcyl(0.3, 0.85, M.motor, -0.45, 0.62, 0));
  u.add(cyl(0.34, 0.34, 0.5, M.steelDk, 0.55, 0.62, 0));
  const volute = cyl(0.18, 0.18, 0.7, M.pipe, 0.55, 1.1, 0); u.add(volute);
  u.position.set(x, y, z); u.rotation.y = ry;
  g.add(u);
  return u;
}

function valveUnit(g, x, y, z, ry = 0) {
  const u = new THREE.Group();
  u.add(hcyl(0.14, 0.7, M.pipe, 0, 0, 0));
  u.add(cyl(0.1, 0.1, 0.45, M.steelDk, 0, 0.22, 0));
  u.add(cyl(0.3, 0.34, 0.32, M.yellow, 0, 0.55, 0));   // actuator
  u.position.set(x, y, z); u.rotation.y = ry;
  g.add(u);
  return u;
}

function beaconPole(g, x, z, h = 5) {
  const grp = new THREE.Group();
  grp.add(cyl(0.05, 0.07, h, M.steelDk, 0, h / 2, 0));
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x661111, emissive: 0x000000, roughness: 0.4 });
  const lamp = cyl(0.16, 0.16, 0.38, lampMat, 0, h + 0.2, 0);
  grp.add(lamp);
  const light = new THREE.PointLight(0xff3010, 0, 26, 1.8);
  light.position.set(0, h + 0.2, 0);
  grp.add(light);
  grp.position.set(x, 0, z);
  g.add(grp);
  return { lampMat, light };
}

function hmiKiosk(g, x, z, ry, screen) {
  const u = new THREE.Group();
  u.add(box(0.8, 1.1, 0.5, M.steelDk, 0, 0.55, 0));
  u.add(box(1.0, 0.75, 0.08, M.glassDk, 0, 1.55, 0.0));
  const scr = box(0.9, 0.62, 0.02, M.screenOn, 0, 1.55, 0.06);
  u.add(scr);
  const lbl = makeLabel('HMI — ' + screen, { fs: 26, scale: 0.01 });
  lbl.position.set(0, 2.15, 0);
  u.add(lbl);
  u.position.set(x, 0, z); u.rotation.y = ry;
  g.add(u);
  return { pos: new THREE.Vector3(x, 1.4, z), group: u };
}

// ============================================================================
export function buildWorld(scene) {
  const world = {
    anchors: {}, interactables: [], colliders: [], beacons: {},
    ambientVents: [], mapRects: [], labelAnchors: [],
  };
  const addCollider = (cx, cz, w, d) => {
    world.colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - w / 2, 0, cz - d / 2), new THREE.Vector3(cx + w / 2, 4, cz + d / 2)));
  };
  const mapRect = (x, z, w, d, label, color) => world.mapRects.push({ x, z, w, d, label, color });

  // ---------- sky / light / ground ----------
  scene.background = new THREE.Color(0xb8c4cc);
  scene.fog = new THREE.Fog(0xb8c4cc, 60, 260);
  scene.add(new THREE.HemisphereLight(0xcfd8e0, 0x55584a, 1.05));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
  sun.position.set(60, 90, 30);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), M.dirt);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
  scene.add(ground);

  // roads
  const roadNS = new THREE.Mesh(new THREE.PlaneGeometry(8, 300), M.asphalt);
  roadNS.rotation.x = -Math.PI / 2; roadNS.position.set(8, 0, -20); scene.add(roadNS);
  const roadEW = new THREE.Mesh(new THREE.PlaneGeometry(300, 8), M.asphalt);
  roadEW.rotation.x = -Math.PI / 2; roadEW.position.set(0, 0.001, -2); scene.add(roadEW);

  // perimeter fence (visual only)
  const fenceMat = new THREE.MeshBasicMaterial({ color: 0x666c70, wireframe: true });
  for (const [w, d, x, z] of [[300, 0.1, 0, -148], [300, 0.1, 0, 148], [0.1, 300, -148, 0], [0.1, 300, 148, 0]]) {
    scene.add(box(w, 2.4, Math.max(d, 0.1), fenceMat, x, 1.2, z));
  }

  const g = new THREE.Group(); scene.add(g);

  // pads under each area
  const pad = (x, z, w, d) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.concrete);
    p.rotation.x = -Math.PI / 2; p.position.set(x, 0.02, z); g.add(p);
  };

  const tagLabel = (text, x, y, z) => {
    const l = makeLabel(text);
    l.position.set(x, y, z); g.add(l);
  };

  // ======================= CONTROL ROOM =======================
  {
    const cx = 0, cz = 26;
    pad(cx, cz, 26, 16);
    mapRect(cx, cz, 20, 11, 'CONTROL ROOM', '#3a6a8a');
    // walls with door opening on north side
    g.add(box(20, 3.4, 0.3, M.wallBlue, cx, 1.7, cz + 5.5));           // south wall
    g.add(box(8.2, 3.4, 0.3, M.wallBlue, cx - 5.9, 1.7, cz - 5.5));    // north wall L
    g.add(box(8.2, 3.4, 0.3, M.wallBlue, cx + 5.9, 1.7, cz - 5.5));    // north wall R
    g.add(box(0.3, 3.4, 11, M.wallBlue, cx - 10, 1.7, cz));
    g.add(box(0.3, 3.4, 11, M.wallBlue, cx + 10, 1.7, cz));
    g.add(box(20.6, 0.25, 11.6, M.roof, cx, 3.5, cz));
    addCollider(cx, cz + 5.5, 20, 0.4);
    addCollider(cx - 5.9, cz - 5.5, 8.2, 0.4);
    addCollider(cx + 5.9, cz - 5.5, 8.2, 0.4);
    addCollider(cx - 10, cz, 0.4, 11);
    addCollider(cx + 10, cz, 0.4, 11);

    // operator consoles: three HMI stations
    const consoles = [
      { x: cx - 5, screen: 'OVERVIEW' }, { x: cx, screen: 'EXTRACTION' }, { x: cx + 5, screen: 'ALARMS' },
    ];
    for (const c of consoles) {
      g.add(box(3.4, 0.9, 1.2, M.steelDk, c.x, 0.45, cz + 2.2));
      g.add(box(3.0, 1.4, 0.15, M.glassDk, c.x, 1.7, cz + 2.7));
      g.add(box(2.8, 1.2, 0.04, M.screenOn, c.x, 1.7, cz + 2.6));
      world.interactables.push({ type: 'hmi', screen: c.screen, pos: new THREE.Vector3(c.x, 1.4, cz + 2.2), label: 'HMI Console' });
      addCollider(c.x, cz + 2.2, 3.4, 1.2);
    }
    // engineering workstation (development node) — corner desk
    g.add(box(2.6, 0.9, 1.2, M.rust, cx + 7.6, 0.45, cz - 3.4));
    g.add(box(1.6, 1.0, 0.12, M.glassDk, cx + 7.6, 1.55, cz - 3.0));
    g.add(box(1.45, 0.85, 0.04, M.screenEng, cx + 7.6, 1.55, cz - 2.93));
    const engLbl = makeLabel('ENG WORKSTATION — LOGIX', { border: '#3aff6a', fg: '#aaffcc', fs: 24, scale: 0.011 });
    engLbl.position.set(cx + 7.6, 2.4, cz - 3.2); g.add(engLbl);
    world.interactables.push({ type: 'eng', pos: new THREE.Vector3(cx + 7.6, 1.4, cz - 3.2), label: 'Engineering Workstation (Ladder Logic)' });
    addCollider(cx + 7.6, cz - 3.4, 2.6, 1.2);

    const crLbl = makeLabel('CONTROL ROOM', { fs: 40, scale: 0.018 });
    crLbl.position.set(cx, 4.6, cz - 5.5); g.add(crLbl);
  }

  // ======================= PREP =======================
  {
    const ax = -55, az = -25;
    pad(ax, az, 44, 36);
    mapRect(ax, az, 44, 36, 'BEAN PREP', '#7a6a3a');
    world.anchors.prepArea = new THREE.Vector3(ax, 2, az);

    // building shell (open sides)
    g.add(box(40, 0.4, 32, M.roof, ax, 9.2, az));
    for (const [px, pz] of [[-19, -15], [19, -15], [-19, 15], [19, 15]].map(([a, b]) => [ax + a, az + b])) {
      g.add(box(0.5, 9.2, 0.5, M.steelDk, px, 4.6, pz));
    }

    // cracking mills A & B
    const mill = (mx, mz, name, mat) => {
      g.add(box(3.4, 2.6, 2.4, mat, mx, 1.3, mz));
      g.add(box(2.6, 1.4, 1.8, M.steelDk, mx, 3.0, mz));
      motorUnit(g, mx + 2.4, 0.95, mz, 0);
      tagLabel(name, mx, 4.6, mz);
      addCollider(mx, mz, 3.6, 2.6);
    };
    mill(ax - 12, az - 8, 'CRACKING MILL A  M-1110', M.steel);
    mill(ax - 12, az + 2, 'CRACKING MILL B  M-1112', M.steel);
    world.anchors.crackingA = new THREE.Vector3(ax - 12, 2.5, az - 8);
    tagLabel('VT-1120', ax - 10.2, 2.4, az - 9.6);

    // conditioner — long horizontal drum w/ steam jacket
    g.add(hcyl(1.6, 12, M.tankTan, ax + 2, 3.2, az - 8));
    g.add(box(0.8, 2.6, 0.8, M.steelDk, ax - 4, 1.3, az - 8));
    g.add(box(0.8, 2.6, 0.8, M.steelDk, ax + 8, 1.3, az - 8));
    tagLabel('BEAN CONDITIONER  TT-1115', ax + 2, 5.6, az - 8);
    addCollider(ax + 2, az - 8, 12, 3.4);
    world.anchors.conditioner = new THREE.Vector3(ax + 2, 3.4, az - 8);
    // steam valve to conditioner
    valveUnit(g, ax + 9.5, 1.1, az - 6, 0.4);
    tagLabel('TCV-1116', ax + 9.5, 2.6, az - 6);
    pipeRun(g, [[ax + 9.5, 1.1, az - 6], [ax + 9.5, 4.4, az - 6], [ax + 6, 4.4, az - 7.5]], 0.12, M.pipe);

    // flaking mill
    g.add(box(4.2, 3.4, 3.0, M.steel, ax + 2, 1.7, az + 5));
    g.add(cyl(1.0, 1.0, 2.8, M.steelDk, ax + 2, 4.6, az + 5));
    motorUnit(g, ax + 5.2, 0.95, az + 5, 0, M.motorRed);
    tagLabel('FLAKING MILL  M-1125', ax + 2, 6.4, az + 5);
    addCollider(ax + 2, az + 5, 4.4, 3.2);
    world.anchors.flaker = new THREE.Vector3(ax + 2, 3, az + 5);

    // surge bin
    g.add(cyl(2.2, 2.2, 5, M.tankWhite, ax + 12, 5.5, az + 8));
    g.add(cyl(0.4, 2.2, 2.2, M.tankWhite, ax + 12, 1.9, az + 8));
    tagLabel('FLAKE SURGE BIN  LT-1130', ax + 12, 8.6, az + 8);
    addCollider(ax + 12, az + 8, 4.6, 4.6);

    // area HMI kiosk + beacon
    const k = hmiKiosk(g, ax + 16, az - 2, Math.PI / 2, 'PREP');
    world.interactables.push({ type: 'hmi', screen: 'PREP', pos: k.pos, label: 'Field HMI — Prep' });
    world.beacons.prep = beaconPole(g, ax + 18, az - 14);
    const sign = makeLabel('AREA 11 — BEAN PREP', { fs: 44, scale: 0.02, border: '#fff' });
    sign.position.set(ax, 10.4, az); g.add(sign);
  }

  // ======================= EXTRACTION =======================
  {
    const ax = -12, az = -62;
    pad(ax, az, 52, 40);
    mapRect(ax, az, 52, 40, 'EXTRACTION / DT', '#3a7a4a');

    // Extractor — big horizontal rotary vessel on legs
    g.add(hcyl(2.6, 14, M.tankWhite, ax - 12, 4.6, az - 6));
    for (const lx of [-18, -12, -6]) {
      g.add(box(0.7, 3.4, 0.7, M.steelDk, ax + lx, 1.7, az - 7.8));
      g.add(box(0.7, 3.4, 0.7, M.steelDk, ax + lx, 1.7, az - 4.2));
    }
    motorUnit(g, ax - 19.5, 4.4, az - 6, 0, M.motorRed);
    tagLabel('EXTRACTOR  M-2105 / IT-2105', ax - 12, 8.4, az - 6);
    addCollider(ax - 12, az - 6, 15, 6);
    world.anchors.extractor = new THREE.Vector3(ax - 12, 5, az - 6);
    // spent flake hopper + drag conveyor
    g.add(cyl(1.6, 0.5, 2.6, M.rust, ax - 4, 2.2, az - 6));
    tagLabel('LSH-2130', ax - 4, 4.4, az - 6);
    g.add(box(9, 0.8, 1.1, M.steelDk, ax + 1, 1.2, az - 6, 0));
    tagLabel('DRAG CONV  M-2135', ax + 2, 2.8, az - 6);

    // DT — tall stacked tower
    const dtx = ax + 8, dtz = az - 10;
    for (let i = 0; i < 5; i++) g.add(cyl(2.5, 2.5, 2.2, i % 2 ? M.tankTan : M.tankWhite, dtx, 1.2 + i * 2.3, dtz));
    g.add(cyl(0.5, 1.2, 1.6, M.steelDk, dtx, 12.5, dtz));
    g.add(cyl(0.18, 0.18, 3.4, M.pipe, dtx + 1.2, 13.4, dtz));   // relief stack
    tagLabel('DESOLVENTIZER-TOASTER (DT)', dtx, 14.2, dtz);
    tagLabel('TT-2210 TRAY 4', dtx + 2.9, 5.5, dtz);
    addCollider(dtx, dtz, 5.4, 5.4);
    world.anchors.dt = new THREE.Vector3(dtx + 1.2, 13.5, dtz);
    valveUnit(g, dtx + 4.2, 1.1, dtz + 3, 0.8);
    tagLabel('TCV-2208', dtx + 4.2, 2.6, dtz + 3);
    pipeRun(g, [[dtx + 4.2, 1.1, dtz + 3], [dtx + 4.2, 6, dtz + 3], [dtx + 2.2, 6, dtz + 1]], 0.14, M.pipe);

    // pump alley — row of 3 pumps under pipe bridge
    const pax = ax + 4, paz = az + 8;
    pumpUnit(g, pax - 3, 0, paz, 0);
    pumpUnit(g, pax, 0, paz, 0);
    pumpUnit(g, pax + 3, 0, paz, 0);
    tagLabel('P-2120', pax - 3, 2.2, paz);
    tagLabel('P-2302  LSL-2303', pax, 2.2, paz);
    tagLabel('MISCELLA PUMP ALLEY  AT-2301', pax, 3.6, paz + 1.5);
    addCollider(pax, paz, 9, 1.6);
    world.anchors.pumpAlley = new THREE.Vector3(pax, 1, paz);
    pipeRun(g, [[pax - 6, 3.4, paz], [pax + 6, 3.4, paz]], 0.16, M.pipeYel);

    // condensers
    g.add(hcyl(1.1, 5, M.steel, ax + 16, 3.4, az + 2, 0.3));
    g.add(hcyl(1.1, 5, M.steel, ax + 16, 5.2, az + 2, 0.3));
    tagLabel('HEXANE CONDENSERS  TT-2310', ax + 16, 7, az + 2);
    addCollider(ax + 16, az + 2, 5.4, 3);

    // hexane storage w/ dike
    g.add(cyl(3, 3, 4.2, M.tankWhite, ax + 20, 2.1, az - 12));
    g.add(box(9, 0.9, 9, M.concrete, ax + 20, 0.45, az - 12));
    tagLabel('HEXANE STORAGE TK-230', ax + 20, 5.4, az - 12);
    addCollider(ax + 20, az - 12, 9, 9);

    const k = hmiKiosk(g, ax - 2, az + 2, Math.PI, 'EXTRACTION');
    world.interactables.push({ type: 'hmi', screen: 'EXTRACTION', pos: k.pos, label: 'Field HMI — Extraction' });
    world.beacons.extraction = beaconPole(g, ax - 6, az + 4, 6);
    const sign = makeLabel('AREA 22/23 — EXTRACTION', { fs: 44, scale: 0.02, border: '#fff' });
    sign.position.set(ax, 12, az + 6); g.add(sign);
  }

  // ======================= REFINERY =======================
  {
    const ax = 42, az = -58;
    pad(ax, az, 44, 38);
    mapRect(ax, az, 44, 38, 'OIL REFINERY', '#7a3a5a');

    // degumming / mixer
    g.add(cyl(1.8, 1.8, 3.4, M.steel, ax - 14, 1.7, az - 8));
    motorUnit(g, ax - 14, 3.8, az - 8, Math.PI / 2);
    tagLabel('DEGUMMING MIXER  TT-3105', ax - 14, 5.4, az - 8);
    addCollider(ax - 14, az - 8, 4, 4);

    // bleacher + ejector platform
    const bx = ax - 4, bz = az - 8;
    g.add(cyl(2.2, 2.2, 6, M.tankTan, bx, 3, bz));
    tagLabel('BLEACHER V-3140  PT-3140', bx, 7, bz);
    addCollider(bx, bz, 4.8, 4.8);
    // elevated ejector platform
    g.add(box(5, 0.3, 3.4, M.steelDk, bx + 5, 6.0, bz));
    for (const [lx, lz] of [[3, -1.4], [7, -1.4], [3, 1.4], [7, 1.4]]) g.add(box(0.4, 6, 0.4, M.steelDk, bx + lx, 3, bz + lz));
    g.add(hcyl(0.5, 3.2, M.steel, bx + 5, 6.8, bz));
    valveUnit(g, bx + 5, 6.45, bz + 1.2, 0);
    tagLabel('EJECTOR J-3410  PCV-3412', bx + 5, 8.4, bz);
    addCollider(bx + 5, bz, 5, 3.6);
    world.anchors.bleacher = new THREE.Vector3(bx + 5, 6.8, bz);
    pipeRun(g, [[bx + 9, 0.5, bz], [bx + 9, 6.6, bz], [bx + 6.8, 6.8, bz]], 0.16, M.pipe);

    // deodorizer — tall column
    const dx = ax + 8, dz = az + 4;
    g.add(cyl(2.4, 2.4, 14, M.tankWhite, dx, 7, dz));
    g.add(cyl(2.5, 2.5, 0.7, M.steelDk, dx, 1.0, dz));
    tagLabel('DEODORIZER C-3220  LT-3220', dx, 15, dz);
    addCollider(dx, dz, 5.2, 5.2);
    world.anchors.deodorizer = new THREE.Vector3(dx + 3, 1, dz + 3);
    // discharge pump
    pumpUnit(g, dx + 4, 0, dz + 3.4, 0.6);
    tagLabel('P-3225  M-3225 / OL-3225', dx + 4, 2.3, dz + 3.4);

    const k = hmiKiosk(g, ax - 2, az + 8, Math.PI, 'REFINERY');
    world.interactables.push({ type: 'hmi', screen: 'REFINERY', pos: k.pos, label: 'Field HMI — Refinery' });
    world.beacons.refinery = beaconPole(g, ax - 8, az + 10, 6);
    const sign = makeLabel('AREA 31-34 — REFINERY', { fs: 44, scale: 0.02, border: '#fff' });
    sign.position.set(ax, 12, az + 8); g.add(sign);

    // RBD tank farm
    for (let i = 0; i < 3; i++) {
      g.add(cyl(4, 4, 6, M.tankWhite, ax + 22, 3, az - 12 + i * 10));
      addCollider(ax + 22, az - 12 + i * 10, 8.4, 8.4);
    }
    tagLabel('RBD OIL STORAGE', ax + 22, 8, az - 2);
  }

  // ======================= UTILITIES =======================
  {
    const ax = 78, az = -8;
    pad(ax, az, 40, 44);
    mapRect(ax, az, 40, 44, 'UTILITIES', '#5a5a7a');

    // boiler house
    g.add(box(14, 8, 12, M.wallTan, ax - 8, 4, az - 8));
    g.add(cyl(0.9, 0.9, 16, M.steelDk, ax - 12, 14, az - 12));  // stack
    tagLabel('BOILER NO.1  LT-4110', ax - 8, 9.4, az - 8);
    addCollider(ax - 8, az - 8, 14, 12);
    world.anchors.boiler = new THREE.Vector3(ax - 2, 2, az - 4);
    world.ambientVents.push(new THREE.Vector3(ax - 12, 22.2, az - 12)); // stack plume
    // BFW pumps + valve outside
    pumpUnit(g, ax + 1, 0, az - 3, Math.PI / 2);
    tagLabel('BFW PUMP P-4115', ax + 1, 2.3, az - 3);
    valveUnit(g, ax + 1, 1.1, az - 6.5, 0);
    tagLabel('FCV-4112', ax + 1, 2.7, az - 6.5);
    pipeRun(g, [[ax + 1, 1.1, az - 6.5], [ax + 1, 3.5, az - 6.5], [ax - 2, 3.5, az - 8]], 0.15, M.pipeGrn);

    // cooling tower — 2 cell box with fan rings
    const ctx2 = ax + 4, ctz = az + 12;
    g.add(box(12, 6, 7, M.wallBlue, ctx2, 3, ctz));
    for (const fx of [-3, 3]) {
      g.add(cyl(2.2, 2.2, 0.8, M.steelDk, ctx2 + fx, 6.5, ctz));
      const blades = new THREE.Group();
      for (let b = 0; b < 4; b++) {
        const bl = box(1.7, 0.06, 0.4, M.steel, 0.95, 0, 0);
        const arm = new THREE.Group(); arm.add(bl); arm.rotation.y = (b * Math.PI) / 2;
        blades.add(arm);
      }
      blades.position.set(ctx2 + fx, 6.7, ctz);
      g.add(blades);
      if (fx === -3) world.ctFan1 = blades; else world.ctFan2 = blades;
    }
    tagLabel('COOLING TOWER CT-1  M-4215', ctx2, 8.4, ctz);
    addCollider(ctx2, ctz, 12, 7);
    world.anchors.coolingTower = new THREE.Vector3(ctx2 - 3, 7, ctz);
    pumpUnit(g, ctx2 - 8, 0, ctz + 1, Math.PI / 2);
    tagLabel('CW PUMP P-4220', ctx2 - 8, 2.3, ctz + 1);

    const k = hmiKiosk(g, ax - 1, az + 4, -Math.PI / 2, 'UTILITIES');
    world.interactables.push({ type: 'hmi', screen: 'UTILITIES', pos: k.pos, label: 'Field HMI — Utilities' });
    world.beacons.utilities = beaconPole(g, ax - 4, az + 6, 6);
    const sign = makeLabel('AREA 41/42 — UTILITIES', { fs: 44, scale: 0.02, border: '#fff' });
    sign.position.set(ax, 11, az); g.add(sign);
  }

  // ======================= MEAL =======================
  {
    const ax = -55, az = 30;
    pad(ax, az, 40, 30);
    mapRect(ax, az, 40, 30, 'MEAL & LOADOUT', '#6a7a3a');

    // pellet mill
    g.add(box(3.6, 3, 2.8, M.steel, ax - 10, 1.5, az - 4));
    motorUnit(g, ax - 7.2, 0.95, az - 4, 0, M.motorRed);
    tagLabel('PELLET MILL  M-5110', ax - 10, 4.6, az - 4);
    addCollider(ax - 10, az - 4, 3.8, 3);

    // cooler — counterflow box on legs with airlock below
    const px = ax - 1, pz = az - 4;
    g.add(box(4, 4.5, 4, M.tankTan, px, 4.2, pz));
    for (const [lx, lz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) g.add(box(0.4, 2, 0.4, M.steelDk, px + lx, 1, pz + lz));
    g.add(cyl(0.7, 0.7, 1.0, M.rust, px, 1.4, pz));   // rotary airlock
    motorUnit(g, px + 1.3, 1.15, pz, 0);
    tagLabel('PELLET COOLER  TT-5120', px, 7.2, pz);
    tagLabel('RV-5118  SS-5118', px, 2.6, pz + 1.2);
    addCollider(px, pz, 4.2, 4.2);
    world.anchors.pelletCooler = new THREE.Vector3(px, 1.4, pz);

    // meal silos
    for (let i = 0; i < 4; i++) {
      g.add(cyl(3, 3, 12, M.concrete, ax + 10 + i * 7, 6, az + 6));
      addCollider(ax + 10 + i * 7, az + 6, 6.4, 6.4);
    }
    tagLabel('MEAL SILOS / LOADOUT', ax + 20, 13.4, az + 6);

    const k = hmiKiosk(g, ax + 4, az + 2, -Math.PI / 2, 'MEAL');
    world.interactables.push({ type: 'hmi', screen: 'MEAL', pos: k.pos, label: 'Field HMI — Meal' });
    world.beacons.meal = beaconPole(g, ax + 7, az - 6, 6);
    const sign = makeLabel('AREA 51 — MEAL & LOADOUT', { fs: 44, scale: 0.02, border: '#fff' });
    sign.position.set(ax, 9, az); g.add(sign);
  }

  // ======================= pipe racks between areas =======================
  const rackRun = (x1, z1, x2, z2) => {
    const a = new THREE.Vector3(x1, 0, z1), b = new THREE.Vector3(x2, 0, z2);
    const len = a.distanceTo(b), n = Math.floor(len / 8);
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      g.add(box(0.35, 4.4, 0.35, M.steelDk, p.x, 2.2, p.z));
      g.add(box(2.4, 0.2, 0.35, M.steelDk, p.x, 4.4, p.z));
    }
    for (const dy of [-0.8, 0, 0.8]) {
      pipeRun(g, [[x1 + dy * 0.9, 4.7, z1], [x2 + dy * 0.9, 4.7, z2]], 0.14, dy === 0 ? M.pipeYel : M.pipe);
    }
  };
  rackRun(-40, -25, -25, -50);
  rackRun(8, -55, 30, -55);
  rackRun(60, -25, 8, -45);
  rackRun(-45, 5, -25, -8);
  rackRun(8, 5, 0, 18);

  // light poles
  for (const [x, z] of [[-30, -10], [25, -30], [60, -30], [-30, 25], [30, 10], [-70, -40], [8, -80]]) {
    g.add(cyl(0.12, 0.16, 9, M.steelDk, x, 4.5, z));
    g.add(box(1.4, 0.25, 0.5, M.yellow, x, 9, z));
  }

  // parked forklift for flavor
  {
    const f = new THREE.Group();
    f.add(box(1.4, 0.9, 2.2, M.yellow, 0, 0.7, 0));
    f.add(box(1.2, 0.9, 1.0, M.glassDk, 0, 1.6, 0.3));
    f.add(box(0.12, 2.4, 0.5, M.steelDk, -0.4, 1.2, -1.35));
    f.add(box(0.12, 2.4, 0.5, M.steelDk, 0.4, 1.2, -1.35));
    f.add(box(0.5, 0.08, 1.1, M.steel, -0.4, 0.12, -1.95));
    f.add(box(0.5, 0.08, 1.1, M.steel, 0.4, 0.12, -1.95));
    f.position.set(14, 0, 8); f.rotation.y = 0.7;
    g.add(f);
    addCollider(14, 8, 2.5, 3);
  }

  return world;
}

// ============================================================================
// 3D plant world — Prairie Gold Processing Plant 7
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function surfaceTexture(kind, base, accent, repeat = [4, 4], seed = 1) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  if (kind === 'corrugated') {
    for (let x = 0; x < size; x += 8) {
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, 0, 2, size);
      ctx.fillStyle = 'rgba(15,24,28,.16)'; ctx.fillRect(x + 4, 0, 3, size);
    }
    for (let i = 0; i < 20; i++) {
      const x = random() * size;
      const y = random() * size * 0.6;
      const gradient = ctx.createLinearGradient(x, y, x, Math.min(size, y + 70 + random() * 90));
      gradient.addColorStop(0, 'rgba(108,63,31,0)');
      gradient.addColorStop(0.3, 'rgba(108,63,31,.2)');
      gradient.addColorStop(1, 'rgba(108,63,31,0)');
      ctx.fillStyle = gradient; ctx.fillRect(x, y, 2 + random() * 5, 150);
    }
  } else if (kind === 'concrete') {
    for (let i = 0; i < 2200; i++) {
      const shade = Math.floor(95 + random() * 110);
      ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.03 + random() * 0.08})`;
      const radius = 0.3 + random() * 1.6;
      ctx.fillRect(random() * size, random() * size, radius, radius);
    }
    ctx.strokeStyle = 'rgba(55,58,56,.16)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      let x = random() * size, y = random() * size;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += random() * 24 - 12; y += random() * 25; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  } else if (kind === 'asphalt' || kind === 'gravel' || kind === 'grass') {
    const count = kind === 'asphalt' ? 5200 : 3500;
    for (let i = 0; i < count; i++) {
      const alpha = 0.05 + random() * 0.17;
      ctx.fillStyle = random() > 0.53 ? `rgba(235,230,210,${alpha})` : `rgba(14,18,15,${alpha})`;
      const radius = 0.4 + random() * (kind === 'gravel' ? 2.2 : 1.2);
      ctx.fillRect(random() * size, random() * size, radius, radius);
    }
    if (kind === 'grass') {
      ctx.strokeStyle = 'rgba(185,173,88,.11)';
      for (let i = 0; i < 180; i++) {
        const x = random() * size, y = random() * size;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 3 - 1.5, y - 4 - random() * 6); ctx.stroke();
      }
    }
  } else if (kind === 'painted') {
    for (let i = 0; i < 900; i++) {
      const alpha = 0.025 + random() * 0.08;
      ctx.fillStyle = random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(20,26,28,${alpha})`;
      ctx.fillRect(random() * size, random() * size, 0.6 + random() * 2.2, 0.6 + random() * 2.2);
    }
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.14;
    for (let y = 32; y < size; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
  } else if (kind === 'roof') {
    for (let x = 0; x < size; x += 32) {
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, 0, 2, size);
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x + 3, 0, 2, size);
    }
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = `rgba(255,255,255,${random() * 0.08})`;
      ctx.fillRect(random() * size, random() * size, 1, 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  return texture;
}

const TX = {
  galvanized: surfaceTexture('corrugated', '#a6adb0', '#77502f', [5, 3], 11),
  whiteMetal: surfaceTexture('corrugated', '#c9ceca', '#825731', [5, 3], 12),
  greenMetal: surfaceTexture('corrugated', '#35574b', '#56351f', [5, 3], 13),
  blueMetal: surfaceTexture('corrugated', '#4b6670', '#5a3c26', [5, 3], 14),
  tanMetal: surfaceTexture('corrugated', '#aaa083', '#684525', [5, 3], 15),
  concrete: surfaceTexture('concrete', '#969994', '#666963', [7, 7], 21),
  asphalt: surfaceTexture('asphalt', '#35393b', '#141719', [18, 18], 22),
  gravel: surfaceTexture('gravel', '#77766e', '#454640', [14, 14], 23),
  grass: surfaceTexture('grass', '#526444', '#2c3927', [22, 22], 24),
  roof: surfaceTexture('roof', '#4e5558', '#252a2c', [8, 5], 25),
  painted: surfaceTexture('painted', '#7b8388', '#d5d8d5', [4, 4], 26),
};

const textureLoader = new THREE.TextureLoader();
function pbrTexture(slug, suffix, repeat, color = false) {
  const texture = textureLoader.load(`assets/textures/polyhaven/${slug}_${suffix}_1k.jpg`);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 8;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function pbrSet(slug, repeat, metal = false) {
  return {
    map: pbrTexture(slug, 'diff', repeat, true),
    normalMap: pbrTexture(slug, 'nor_gl', repeat),
    roughnessMap: pbrTexture(slug, 'rough', repeat),
    ...(metal ? { metalnessMap: pbrTexture(slug, 'metal', repeat) } : {}),
  };
}

const PBR = {
  corrugated: pbrSet('corrugated_iron', [5, 4], true),
  concrete: pbrSet('concrete_floor_worn_001', [7, 7]),
  asphalt: pbrSet('clean_asphalt', [12, 12]),
  bitumen: pbrSet('bitumen', [8, 6]),
  grass: pbrSet('leafy_grass', [18, 18]),
};

function pbrMaterial(set, options) {
  const { normalStrength = 0.7, ...materialOptions } = options;
  const material = new THREE.MeshStandardMaterial({ ...set, ...materialOptions });
  material.normalScale = new THREE.Vector2(normalStrength, normalStrength);
  return material;
}

const M = {
  steel:    new THREE.MeshStandardMaterial({ map: TX.painted, color: 0xb8bec1, roughness: 0.48, metalness: 0.68 }),
  steelDk:  new THREE.MeshStandardMaterial({ map: TX.painted, color: 0x5d6468, roughness: 0.54, metalness: 0.64 }),
  tankWhite:pbrMaterial(PBR.corrugated, { color: 0xf1f1eb, roughness: 0.64, metalness: 0.58, normalStrength: 0.82 }),
  tankTan:  pbrMaterial(PBR.corrugated, { color: 0xd7c9a8, roughness: 0.7, metalness: 0.34, normalStrength: 0.72 }),
  pipe:     new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.4, metalness: 0.7 }),
  pipeYel:  new THREE.MeshStandardMaterial({ color: 0xc8a818, roughness: 0.5, metalness: 0.4 }),
  pipeGrn:  new THREE.MeshStandardMaterial({ color: 0x2f7d4f, roughness: 0.5, metalness: 0.4 }),
  concrete: pbrMaterial(PBR.concrete, { color: 0xdad8cf, roughness: 0.96, metalness: 0, normalStrength: 0.72 }),
  asphalt:  pbrMaterial(PBR.asphalt, { color: 0x777a7a, roughness: 0.98, metalness: 0, normalStrength: 0.8 }),
  wallTan:  pbrMaterial(PBR.corrugated, { color: 0xd8cdb6, roughness: 0.78, metalness: 0.26, normalStrength: 0.8 }),
  wallBlue: pbrMaterial(PBR.corrugated, { color: 0x9eb1b5, roughness: 0.72, metalness: 0.34, normalStrength: 0.82 }),
  roof:     pbrMaterial(PBR.bitumen, { color: 0xa4a7a5, roughness: 0.94, metalness: 0, normalStrength: 0.62 }),
  motor:    new THREE.MeshStandardMaterial({ color: 0x2a5a9a, roughness: 0.45, metalness: 0.5 }),
  motorRed: new THREE.MeshStandardMaterial({ color: 0x9a2a2a, roughness: 0.45, metalness: 0.5 }),
  yellow:   new THREE.MeshStandardMaterial({ color: 0xd8b020, roughness: 0.6, metalness: 0.3 }),
  dirt:     new THREE.MeshStandardMaterial({ color: 0x6a6a55, roughness: 1 }),
  glassDk:  new THREE.MeshStandardMaterial({ color: 0x16202a, roughness: 0.2, metalness: 0.6 }),
  screenOn: new THREE.MeshStandardMaterial({ color: 0x315865, emissive: 0x1e5368, emissiveIntensity: 0.62, roughness: 0.28 }),
  screenEng:new THREE.MeshStandardMaterial({ color: 0x294f3b, emissive: 0x165b36, emissiveIntensity: 0.58, roughness: 0.28 }),
  light:    new THREE.MeshStandardMaterial({ color: 0xfff5d9, emissive: 0xffe8b5, emissiveIntensity: 2.8, roughness: 0.25 }),
  rust:     new THREE.MeshStandardMaterial({ color: 0x7a5238, roughness: 0.9, metalness: 0.2 }),
  cardboard:new THREE.MeshStandardMaterial({ color: 0xb98b4e, roughness: 0.82, metalness: 0 }),
  wallWhite:pbrMaterial(PBR.corrugated, { color: 0xe8e9e3, roughness: 0.7, metalness: 0.38, normalStrength: 0.82 }),
  wallGreen:pbrMaterial(PBR.corrugated, { color: 0x789084, roughness: 0.74, metalness: 0.3, normalStrength: 0.8 }),
  safety:   new THREE.MeshStandardMaterial({ color: 0xe6aa16, roughness: 0.48, metalness: 0.35 }),
  safetyRed:new THREE.MeshStandardMaterial({ color: 0xb32b24, roughness: 0.5, metalness: 0.25 }),
  epoxy:    new THREE.MeshStandardMaterial({ color: 0x61747a, roughness: 0.72, metalness: 0.08 }),
  gravel:   pbrMaterial(PBR.concrete, { color: 0x9d9a8e, roughness: 1, metalness: 0, normalStrength: 1 }),
  grass:    pbrMaterial(PBR.grass, { color: 0x849174, roughness: 1, metalness: 0, normalStrength: 0.58 }),
  lineWhite:new THREE.MeshBasicMaterial({ color: 0xe8e6d8 }),
  lineYel:  new THREE.MeshBasicMaterial({ color: 0xe4b526 }),
  glass:    new THREE.MeshStandardMaterial({ color: 0x42677a, roughness: 0.18, metalness: 0.35, transparent: true, opacity: 0.82 }),
  roofBlue: pbrMaterial(PBR.corrugated, { color: 0x9eafb2, roughness: 0.64, metalness: 0.48, normalStrength: 0.72 }),
  fieldA:   pbrMaterial(PBR.grass, { color: 0x718258, roughness: 1, metalness: 0, normalStrength: 0.5 }),
  fieldB:   pbrMaterial(PBR.grass, { color: 0x97915e, roughness: 1, metalness: 0, normalStrength: 0.45 }),
  soil:     new THREE.MeshStandardMaterial({ color: 0x695f48, roughness: 1, metalness: 0 }),
  water:    new THREE.MeshStandardMaterial({ color: 0x587f87, roughness: 0.3, metalness: 0.08 }),
  grime:    new THREE.MeshStandardMaterial({ color: 0x3d342c, roughness: 1, transparent: true, opacity: 0.34, depthWrite: false }),
  fadedRust:new THREE.MeshStandardMaterial({ color: 0x76503c, roughness: 0.95, transparent: true, opacity: 0.42, depthWrite: false }),
  worktop:  pbrMaterial(PBR.bitumen, { color: 0x555b5c, roughness: 0.9, metalness: 0.05, normalStrength: 0.34 }),
  keyboard: new THREE.MeshStandardMaterial({ color: 0x24292b, roughness: 0.78, metalness: 0.08 }),
};

function box(w, h, d, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = h > 1 && (w * d > 2 || w > 6 || d > 6);
  m.receiveShadow = true;
  return m;
}

function bevelBox(w, h, d, mat, x, y, z, ry = 0, bevel = 0.18) {
  const edge = Math.min(bevel, w * 0.08, h * 0.08, d * 0.08);
  const sw = Math.max(0.05, w - edge * 2), sh = Math.max(0.05, h - edge * 2);
  const shape = new THREE.Shape();
  shape.moveTo(-sw / 2, -sh / 2);
  shape.lineTo(sw / 2, -sh / 2);
  shape.lineTo(sw / 2, sh / 2);
  shape.lineTo(-sw / 2, sh / 2);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.05, d - edge * 2), bevelEnabled: true,
    bevelThickness: edge, bevelSize: edge, bevelSegments: 2, steps: 1,
  });
  geometry.center();
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z); mesh.rotation.y = ry;
  mesh.castShadow = h > 1; mesh.receiveShadow = true;
  return mesh;
}

function gablePanel(span, rise, depth, mat, x, y, z, ry = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(-span / 2, -rise / 2);
  shape.lineTo(span / 2, -rise / 2);
  shape.lineTo(0, rise / 2);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: false, steps: 1,
  });
  geometry.center();
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z); mesh.rotation.y = ry;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function preEngineeredBuilding(g, options) {
  const {
    x, z, w, d, eave, rise = Math.min(5, d * 0.18),
    wall = M.wallWhite, roof = M.roofBlue,
    bay = 6, doorBays = [], vents = true,
  } = options;
  const frameCount = Math.max(3, Math.round(w / bay));
  const frameBay = w / frameCount;
  const sideCount = Math.max(3, Math.round(d / bay));
  const sideBay = d / sideCount;
  const doorSet = new Set(doorBays);
  const doorHeight = Math.min(5.2, eave * 0.64);
  const roofAngle = Math.atan2(rise, d / 2);
  const roofSlope = Math.hypot(d / 2, rise);

  g.add(box(w + 0.8, 0.45, d + 0.8, M.concrete, x, 0.23, z));
  for (let index = 0; index < frameCount; index++) {
    const px = x - w / 2 + frameBay * (index + 0.5);
    if (doorSet.has(index)) {
      const upperHeight = eave - doorHeight;
      g.add(box(frameBay - 0.08, upperHeight, 0.16, wall, px, doorHeight + upperHeight / 2, z - d / 2));
      g.add(bevelBox(frameBay - 0.72, doorHeight - 0.24, 0.18, M.steelDk, px, doorHeight / 2, z - d / 2 - 0.11, 0, 0.08));
      g.add(box(frameBay - 1.0, doorHeight - 0.52, 0.05, M.wallBlue, px, doorHeight / 2, z - d / 2 - 0.22));
      for (let y = 0.75; y < doorHeight; y += 0.72) g.add(box(frameBay - 1.12, 0.045, 0.035, M.steelDk, px, y, z - d / 2 - 0.26));
      for (const offset of [-frameBay * 0.37, frameBay * 0.37]) g.add(box(0.34, 0.5, 0.42, M.glassDk, px + offset, 0.48, z - d / 2 - 0.45));
    } else {
      g.add(box(frameBay - 0.05, eave, 0.16, wall, px, eave / 2, z - d / 2));
    }
    g.add(box(frameBay - 0.05, eave, 0.16, wall, px, eave / 2, z + d / 2));
  }
  for (let index = 0; index < sideCount; index++) {
    const pz = z - d / 2 + sideBay * (index + 0.5);
    g.add(box(0.16, eave, sideBay - 0.05, wall, x - w / 2, eave / 2, pz));
    g.add(box(0.16, eave, sideBay - 0.05, wall, x + w / 2, eave / 2, pz));
  }
  g.add(gablePanel(d, rise, 0.16, wall, x - w / 2, eave + rise / 2, z, Math.PI / 2));
  g.add(gablePanel(d, rise, 0.16, wall, x + w / 2, eave + rise / 2, z, Math.PI / 2));

  for (let index = 0; index <= frameCount; index++) {
    const px = x - w / 2 + index * frameBay;
    for (const edgeZ of [-1, 1]) {
      g.add(box(0.46, eave, 0.24, M.steelDk, px, eave / 2, z + edgeZ * (d / 2 - 0.12)));
    }
    for (const edgeZ of [-1, 1]) {
      const rafter = box(0.32, 0.26, roofSlope + 0.18, M.steelDk, px, eave + rise / 2, z + edgeZ * d / 4);
      rafter.rotation.x = edgeZ > 0 ? roofAngle : -roofAngle; g.add(rafter);
    }
  }

  for (const edgeZ of [-1, 1]) {
    const panel = box(w + 1.2, 0.24, roofSlope + 0.9, roof, x, eave + rise / 2 + 0.18, z + edgeZ * d / 4);
    panel.rotation.x = edgeZ > 0 ? roofAngle : -roofAngle; g.add(panel);
    g.add(box(w + 1.2, 0.15, 0.18, M.steelDk, x, eave + 0.05, z + edgeZ * (d / 2 + 0.45)));
    for (const px of [x - w / 2 + 0.45, x + w / 2 - 0.45]) {
      g.add(cyl(0.08, 0.11, eave - 0.35, M.steelDk, px, (eave - 0.35) / 2, z + edgeZ * (d / 2 + 0.43), 10));
    }
  }
  g.add(box(w + 1.35, 0.18, 0.48, M.steel, x, eave + rise + 0.22, z));
  if (vents) {
    for (let px = x - w * 0.34; px <= x + w * 0.34; px += Math.max(9, w / 5)) roofVent(g, px, eave + rise + 0.32, z, 0.95);
  }
}

function processTower(g, options) {
  const { x, z, w, d, h, wall = M.wallWhite, floors = 6 } = options;
  const levelHeight = h / floors;
  g.add(box(w + 1.2, 0.7, d + 1.2, M.concrete, x, 0.35, z));

  for (const px of [x - w / 2, x, x + w / 2]) for (const pz of [z - d / 2, z + d / 2]) {
    g.add(box(0.44, h, 0.44, M.steelDk, px, h / 2, pz));
  }
  for (let level = 0; level <= floors; level++) {
    const y = level * levelHeight;
    g.add(box(w + 0.55, 0.35, 0.42, M.steelDk, x, y, z - d / 2));
    g.add(box(w + 0.55, 0.35, 0.42, M.steelDk, x, y, z + d / 2));
    g.add(box(0.42, 0.35, d + 0.55, M.steelDk, x - w / 2, y, z));
    g.add(box(0.42, 0.35, d + 0.55, M.steelDk, x + w / 2, y, z));
    if (level > 0 && level < floors) g.add(box(w - 0.65, 0.18, d - 0.65, M.concrete, x, y, z));
  }

  for (let level = 0; level < floors; level++) {
    const y = level * levelHeight + levelHeight / 2;
    const panelHeight = levelHeight - 0.44;
    for (let bayIndex = 0; bayIndex < 2; bayIndex++) {
      const px = x - w / 4 + bayIndex * w / 2;
      const openFront = (level + bayIndex) % 5 === 1;
      if (!openFront) g.add(box(w / 2 - 0.48, panelHeight, 0.16, wall, px, y, z - d / 2 - 0.02));
      g.add(box(w / 2 - 0.48, panelHeight, 0.16, wall, px, y, z + d / 2 + 0.02));
    }
    for (let bayIndex = 0; bayIndex < 2; bayIndex++) {
      const pz = z - d / 4 + bayIndex * d / 2;
      g.add(box(0.16, panelHeight, d / 2 - 0.48, wall, x - w / 2 - 0.02, y, pz));
      if ((level + bayIndex) % 4 !== 2) g.add(box(0.16, panelHeight, d / 2 - 0.48, wall, x + w / 2 + 0.02, y, pz));
    }
    if (level % 2 === 0) louverBank(g, x, y, z - d / 2 - 0.14, w * 0.42, Math.min(1.45, panelHeight * 0.52), 0, M.steelDk);
  }

  for (const level of [2, 4]) {
    const y = level * levelHeight + 0.25;
    catwalk(g, x + w / 2 + 1.1, z, d + 2.2, 1.05, y, Math.PI / 2);
  }
  g.add(box(w + 1.0, 0.5, d + 1.0, M.roofBlue, x, h + 0.25, z));
  for (const px of [x - w * 0.27, x + w * 0.27]) roofVent(g, px, h + 0.62, z, 1.05);
  ladder(g, x + w / 2 + 0.25, z + d * 0.34, h - 0.5, 0.42, Math.PI / 2, true);
}

function loadBrickFactoryOffice(root, x, z) {
  const loader = new GLTFLoader();
  const assetPath = 'assets/models/polyhaven/modular_factory_facade/modular_factory_facade_1k.gltf';
  return loader.loadAsync(assetPath).then(({ scene }) => {
    const building = new THREE.Group();
    building.name = 'RealMasonryAdministration';
    const placements = new Map();
    const queuePart = (name, px, py, pz, ry) => {
      if (!placements.has(name)) placements.set(name, []);
      placements.get(name).push({ px, py, pz, ry });
    };
    const queueModule = (kind, px, py, pz, ry) => {
      const moduleParts = {
        solid: ['wall_standard_standard_01'],
        window: ['wall_window_centered_large_01', 'window_centered_large_01'],
        door: ['wall_door_centered_small_01', 'door_centered_small_01'],
      }[kind];
      for (const part of moduleParts) queuePart(part, px, py, pz, ry);
    };
    const wallRun = (startX, startZ, dirX, dirZ, count, level, pattern) => {
      const ry = Math.atan2(-dirZ, dirX);
      for (let index = 0; index < count; index++) {
        const kind = pattern(index, level);
        queueModule(kind, startX + dirX * 3 * (index + 1), level * 3 + 0.42, startZ + dirZ * 3 * (index + 1), ry);
      }
    };

    for (let level = 0; level < 2; level++) {
      wallRun(x - 19.5, z - 9, 1, 0, 13, level, (index, floor) => floor === 0 && index === 6 ? 'door' : index % 3 === 1 ? 'solid' : 'window');
      wallRun(x + 19.5, z + 9, -1, 0, 13, level, (index) => index % 2 ? 'solid' : 'window');
      wallRun(x - 19.5, z + 9, 0, -1, 6, level, (index) => index % 2 ? 'window' : 'solid');
      wallRun(x + 19.5, z - 9, 0, 1, 6, level, (index) => index % 2 ? 'window' : 'solid');
    }

    for (const [name, transforms] of placements) {
      const source = scene.getObjectByName(name);
      if (!source?.isMesh) continue;
      const materials = Array.isArray(source.material) ? source.material : [source.material];
      for (const material of materials) {
        material.side = THREE.DoubleSide;
        material.envMapIntensity = 0.8;
      }
      const instances = new THREE.InstancedMesh(source.geometry, source.material, transforms.length);
      const matrix = new THREE.Matrix4();
      for (let index = 0; index < transforms.length; index++) {
        const transform = transforms[index];
        matrix.compose(
          new THREE.Vector3(transform.px, transform.py, transform.pz),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), transform.ry),
          new THREE.Vector3(1, 1, 1),
        );
        instances.setMatrixAt(index, matrix);
      }
      instances.castShadow = true; instances.receiveShadow = true;
      building.add(instances);
    }

    building.add(box(40.4, 0.48, 19.2, M.concrete, x, 0.24, z));
    building.add(box(40.2, 0.28, 19.2, M.roof, x, 6.52, z));
    for (const edgeZ of [-1, 1]) building.add(box(40.6, 0.65, 0.38, M.steelDk, x, 6.56, z + edgeZ * 9.25));
    for (const edgeX of [-1, 1]) building.add(box(0.38, 0.65, 19.2, M.steelDk, x + edgeX * 19.75, 6.56, z));
    building.add(box(11.8, 0.34, 4.5, M.steelDk, x, 3.6, z - 11.05));
    for (const px of [x - 5.3, x + 5.3]) building.add(box(0.32, 3.6, 0.32, M.steelDk, px, 1.8, z - 12.9));
    for (const px of [x - 11, x + 8]) {
      building.add(box(4.2, 0.65, 2.5, M.steelDk, px, 6.94, z));
      building.add(cyl(0.42, 0.52, 0.7, M.steel, px, 7.62, z, 14));
    }
    root.add(building);
    return building;
  }).catch((error) => {
    console.error('Factory architecture failed to load', error);
    preEngineeredBuilding(root, { x, z, w: 40, d: 19, eave: 7, rise: 2.6, wall: M.wallWhite, doorBays: [3] });
    return null;
  });
}

function weatherSilo(g, x, z, radius, h) {
  const streakAngles = [-2.75, -2.35, -1.95, -1.55, -1.15, -0.75, -0.35, 0.2, 0.7, 1.15];
  for (let i = 0; i < streakAngles.length; i++) {
    const angle = streakAngles[i];
    const strip = box(0.16 + (i % 3) * 0.08, h * (0.32 + (i % 4) * 0.08), 0.025, i % 4 === 0 ? M.fadedRust : M.grime, 0, h * 0.7, 0);
    strip.position.x = x + Math.sin(angle) * (radius + 0.025);
    strip.position.z = z + Math.cos(angle) * (radius + 0.025);
    strip.rotation.y = angle;
    g.add(strip);
  }
  const doorZ = z - radius - 0.08;
  g.add(bevelBox(1.8, 2.8, 0.18, M.steelDk, x, 1.4, doorZ, 0, 0.08));
  g.add(box(1.35, 2.3, 0.05, M.wallBlue, x, 1.4, doorZ - 0.11));
  g.add(cyl(0.07, 0.07, 0.35, M.safety, x + 0.52, 1.35, doorZ - 0.18, 10));
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
    const rimX = x + Math.sin(angle) * (radius - 0.2);
    const rimZ = z + Math.cos(angle) * (radius - 0.2);
    pipeRun(g, [[x, h + 4.55, z], [rimX, h + 0.35, rimZ]], 0.035, M.steelDk);
  }
  for (const side of [-1, 1]) {
    pipeRun(g, [[x + side * 3.2, 0.8, z - radius], [x + side * 3.2, 0.8, z - radius - 3.4]], 0.16, M.pipe);
    valveUnit(g, x + side * 3.2, 0.8, z - radius - 2.1, Math.PI / 2);
  }
}

function mergeStaticWorldGeometry(group, dynamicRoots = []) {
  const dynamic = new Set(dynamicRoots.filter(Boolean));
  const isDynamic = (object) => {
    for (let current = object; current; current = current.parent) {
      if (dynamic.has(current)) return true;
      if (current === group) break;
    }
    return false;
  };

  group.updateWorldMatrix(true, true);
  const buckets = new Map();
  const originals = [];
  group.traverse((object) => {
    if (!object.isMesh || isDynamic(object) || Array.isArray(object.material)) return;
    const material = object.material;
    if (material.transparent && material !== M.grime && material !== M.fadedRust) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.clearGroups();
    if (!buckets.has(material)) buckets.set(material, new Map());
    const topology = geometry.index ? 'indexed' : 'non-indexed';
    const materialBuckets = buckets.get(material);
    if (!materialBuckets.has(topology)) materialBuckets.set(topology, { geometries: [], castShadow: false, receiveShadow: false });
    const bucket = materialBuckets.get(topology);
    bucket.geometries.push(geometry);
    bucket.castShadow ||= object.castShadow;
    bucket.receiveShadow ||= object.receiveShadow;
    originals.push(object);
  });

  for (const object of originals) {
    object.parent?.remove(object);
    object.geometry.dispose();
  }

  let mergedCount = 0;
  for (const [material, materialBuckets] of buckets) {
    for (const bucket of materialBuckets.values()) {
      const chunkSize = 256;
      for (let offset = 0; offset < bucket.geometries.length; offset += chunkSize) {
        const sources = bucket.geometries.slice(offset, offset + chunkSize);
        const geometry = mergeGeometries(sources, false);
        for (const source of sources) source.dispose();
        if (!geometry) continue;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `Static batch ${mergedCount + 1}`;
        mesh.castShadow = bucket.castShadow;
        mesh.receiveShadow = bucket.receiveShadow;
        group.add(mesh);
        mergedCount += 1;
      }
    }
  }
  return mergedCount;
}
function cyl(rt, rb, h, mat, x, y, z, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = h > 2 && Math.max(rt, rb) > 0.5;
  m.receiveShadow = true;
  return m;
}
function hcyl(r, len, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 18), mat);
  m.rotation.z = Math.PI / 2; m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = r > 0.5 && len > 2;
  m.receiveShadow = true;
  return m;
}

function roadSegment(g, x1, z1, x2, z2, width = 9, y = 0.012) {
  const dx = x2 - x1, dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  g.add(box(length, 0.035, width, M.asphalt, (x1 + x2) / 2, y, (z1 + z2) / 2, -Math.atan2(dz, dx)));
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
  const scale = opts.scale || 0.009;
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

function conveyorGallery(g, x1, z1, x2, z2, y = 10) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const ry = -Math.atan2(dz, dx);
  const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
  g.add(box(len, 1.35, 2.1, M.wallWhite, mx, y, mz, ry));
  g.add(box(len + 0.3, 0.16, 2.45, M.roofBlue, mx, y + 0.78, mz, ry));
  g.add(box(len, 0.16, 2.35, M.steelDk, mx, y - 0.78, mz, ry));
  const count = Math.max(1, Math.floor(len / 11));
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = x1 + dx * t, z = z1 + dz * t;
    g.add(box(0.35, y - 0.7, 0.35, M.steelDk, x, (y - 0.7) / 2, z));
  }
}

function catwalk(g, x, z, w, d, y, ry = 0, opts = {}) {
  const u = new THREE.Group();
  const deckMat = opts.deckMat || M.steelDk;
  u.add(box(w, 0.16, d, deckMat, 0, y, 0));
  for (const side of [-1, 1]) {
    if (opts.openSide === side) continue;
    for (const railY of [y + 0.48, y + 0.96]) u.add(box(w, 0.06, 0.07, M.safety, 0, railY, side * (d / 2 - 0.04)));
    const posts = Math.max(2, Math.ceil(w / 2.6));
    for (let i = 0; i <= posts; i++) {
      const px = -w / 2 + (w * i) / posts;
      u.add(box(0.07, 1.02, 0.07, M.safety, px, y + 0.5, side * (d / 2 - 0.04)));
    }
  }
  for (let px = -w / 2 + 1; px < w / 2; px += 2) u.add(box(0.09, 0.12, d + 0.4, M.steel, px, y - 0.12, 0));
  u.position.set(x, 0, z); u.rotation.y = ry; g.add(u);
  return u;
}

function ladder(g, x, z, h, baseY = 0, ry = 0, cage = false) {
  const u = new THREE.Group();
  for (const lx of [-0.34, 0.34]) u.add(box(0.07, h, 0.07, M.steel, lx, baseY + h / 2, 0));
  for (let y = baseY + 0.35; y < baseY + h; y += 0.34) u.add(box(0.75, 0.045, 0.07, M.steel, 0, y, 0));
  if (cage) {
    for (let y = baseY + 2.4; y < baseY + h; y += 0.75) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 5, 12, Math.PI), M.steel);
      ring.rotation.x = Math.PI / 2; ring.position.set(0, y, 0.06); u.add(ring);
    }
  }
  u.position.set(x, 0, z); u.rotation.y = ry; g.add(u);
  return u;
}

function structuralFrame(g, x, z, w, d, h, levels = [4, 8, 12]) {
  const u = new THREE.Group();
  for (const px of [-w / 2, w / 2]) for (const pz of [-d / 2, d / 2]) u.add(box(0.34, h, 0.34, M.steelDk, px, h / 2, pz));
  for (const y of levels.filter((level) => level <= h)) {
    for (const pz of [-d / 2, d / 2]) u.add(box(w + 0.4, 0.28, 0.28, M.steelDk, 0, y, pz));
    for (const px of [-w / 2, w / 2]) u.add(box(0.28, 0.28, d + 0.4, M.steelDk, px, y, 0));
  }
  u.position.set(x, 0, z); g.add(u);
  return u;
}

function louverBank(g, x, y, z, w, h, ry = 0, mat = M.steelDk) {
  const u = new THREE.Group();
  u.add(box(w + 0.2, h + 0.2, 0.12, M.steelDk, 0, 0, 0));
  for (let sy = -h / 2 + 0.18; sy < h / 2; sy += 0.3) {
    const slat = box(w, 0.08, 0.25, mat, 0, sy, -0.08);
    slat.rotation.x = -0.45; u.add(slat);
  }
  u.position.set(x, y, z); u.rotation.y = ry; g.add(u);
  return u;
}

function tankDetails(g, x, z, radius, h, opts = {}) {
  for (let y = opts.baseY || 1.2; y < h; y += opts.bandSpacing || 2.4) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.035, 0.045, 6, 28), M.steelDk);
    ring.rotation.x = Math.PI / 2; ring.position.set(x, y, z); g.add(ring);
  }
  ladder(g, x + radius + 0.08, z, h - 0.4, 0.2, Math.PI / 2, h > 10);
  if (opts.railing !== false) {
    const topRing = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.18, 0.055, 6, 28), M.safety);
    topRing.rotation.x = Math.PI / 2; topRing.position.set(x, h + 0.72, z); g.add(topRing);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      g.add(box(0.055, 0.75, 0.055, M.safety, x + Math.cos(a) * (radius + 0.18), h + 0.36, z + Math.sin(a) * (radius + 0.18)));
    }
  }
}

function roofVent(g, x, y, z, scale = 1) {
  g.add(cyl(0.36 * scale, 0.5 * scale, 0.65 * scale, M.steelDk, x, y + 0.32 * scale, z, 12));
  g.add(cyl(0.62 * scale, 0.18 * scale, 0.24 * scale, M.steel, x, y + 0.76 * scale, z, 12));
}

function cyclone(g, x, z, y = 7, scale = 1) {
  g.add(cyl(1.0 * scale, 1.0 * scale, 2.4 * scale, M.tankWhite, x, y, z, 18));
  g.add(cyl(1.0 * scale, 0.18 * scale, 2.2 * scale, M.tankWhite, x, y - 2.3 * scale, z, 18));
  pipeRun(g, [[x + 1.0 * scale, y + 0.45 * scale, z], [x + 2.1 * scale, y + 0.45 * scale, z]], 0.24 * scale, M.pipe);
  for (const px of [-0.7, 0.7]) g.add(box(0.16, 4.1 * scale, 0.16, M.steelDk, x + px * scale, y - 2.2 * scale, z));
}

function dustCollector(g, x, z, ry = 0, scale = 1) {
  const u = new THREE.Group();
  u.add(box(5.4 * scale, 4.3 * scale, 3.4 * scale, M.wallWhite, 0, 7.2 * scale, 0));
  for (const px of [-2, 0, 2]) u.add(cyl(0.68 * scale, 0.16 * scale, 2.2 * scale, M.tankTan, px * scale, 4.0 * scale, 0, 14));
  for (const px of [-2.35, 2.35]) for (const pz of [-1.35, 1.35]) u.add(box(0.22, 5.2 * scale, 0.22, M.steelDk, px * scale, 2.6 * scale, pz * scale));
  u.add(hcyl(0.55 * scale, 5.5 * scale, M.pipe, 0, 8.8 * scale, -2.0 * scale));
  u.add(cyl(0.45 * scale, 0.55 * scale, 4.0 * scale, M.steelDk, 2.0 * scale, 11.0 * scale, 0, 14));
  louverBank(u, 0, 7.2 * scale, -1.72 * scale, 3.8 * scale, 2.4 * scale, 0, M.steel);
  u.position.set(x, 0, z); u.rotation.y = ry; g.add(u);
  return u;
}

function stairFlight(g, x, z, width, rise, run, baseY = 0, ry = 0) {
  const u = new THREE.Group();
  const steps = Math.max(4, Math.ceil(rise / 0.22));
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    u.add(box(width, 0.12, run / steps + 0.12, M.steelDk, 0, baseY + t * rise, -run / 2 + t * run));
  }
  for (const side of [-1, 1]) {
    const rail = box(0.06, 0.06, Math.hypot(run, rise), M.safety, side * (width / 2), baseY + rise / 2 + 0.85, 0);
    rail.rotation.x = Math.atan2(rise, run); u.add(rail);
  }
  u.position.set(x, 0, z); u.rotation.y = ry; g.add(u);
}

function drumCluster(g, x, z, count = 4, mat = M.wallBlue) {
  for (let i = 0; i < count; i++) {
    const dx = (i % 2) * 0.75, dz = Math.floor(i / 2) * 0.75;
    g.add(cyl(0.28, 0.28, 0.9, i === count - 1 ? M.safetyRed : mat, x + dx, 0.45, z + dz, 14));
    for (const y of [0.12, 0.78]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.018, 5, 14), M.steelDk);
      ring.rotation.x = Math.PI / 2; ring.position.set(x + dx, y, z + dz); g.add(ring);
    }
  }
}

function ibcTote(g, x, z, ry = 0) {
  const u = new THREE.Group();
  u.add(box(1.15, 0.16, 1.15, M.rust, 0, 0.08, 0));
  u.add(box(1, 1.05, 1, M.wallWhite, 0, 0.67, 0));
  for (const px of [-0.54, 0.54]) for (const pz of [-0.54, 0.54]) u.add(box(0.04, 1.25, 0.04, M.steelDk, px, 0.68, pz));
  for (const y of [0.25, 0.65, 1.05]) {
    u.add(box(1.12, 0.04, 0.04, M.steelDk, 0, y, -0.54));
    u.add(box(1.12, 0.04, 0.04, M.steelDk, 0, y, 0.54));
  }
  u.position.set(x, 0, z); u.rotation.y = ry; g.add(u);
}

// ============================================================================
export function buildWorld(scene) {
  const world = {
    anchors: {}, interactables: [], colliders: [], beacons: {},
    navAnchors: {}, ambientVents: [], mapRects: [], labelAnchors: [], cv101Boxes: [],
  };
  const addCollider = (cx, cz, w, d) => {
    world.colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - w / 2, 0, cz - d / 2), new THREE.Vector3(cx + w / 2, 4, cz + d / 2)));
  };
  const mapRect = (x, z, w, d, label, color) => world.mapRects.push({ x, z, w, d, label, color });

  // ---------- sky / light / ground ----------
  scene.background = new THREE.Color(0xb9c9cf);
  scene.fog = new THREE.Fog(0xb9c9cf, 170, 620);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(700, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        zenith: { value: new THREE.Color(0x6e94ab) },
        horizon: { value: new THREE.Color(0xe4ded0) },
        lower: { value: new THREE.Color(0xaab5ad) },
      },
      vertexShader: 'varying float skyHeight; void main(){ skyHeight = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 zenith; uniform vec3 horizon; uniform vec3 lower; varying float skyHeight; void main(){ float up = smoothstep(-0.05, 0.72, skyHeight); float ground = smoothstep(-0.35, 0.02, skyHeight); vec3 base = mix(lower, horizon, ground); gl_FragColor = vec4(mix(base, zenith, up), 1.0); }',
    }),
  );
  sky.frustumCulled = false; scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xd8e6ec, 0x4f5145, 1.35));
  const sun = new THREE.DirectionalLight(0xffe4bb, 2.6);
  sun.position.set(95, 145, 55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -190; sun.shadow.camera.right = 190;
  sun.shadow.camera.top = 190; sun.shadow.camera.bottom = -190;
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 360;
  sun.shadow.bias = -0.00025;
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(680, 560), M.grass);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // The playable plant sits inside a wider agricultural landscape, matching the
  // scale and isolation of a real Midwest processing campus.
  for (const [x, z, w, d, mat] of [
    [-275, 0, 118, 500, M.fieldA], [275, 0, 118, 500, M.fieldB],
    [0, 235, 440, 86, M.fieldB], [0, -235, 440, 86, M.soil],
  ]) {
    const field = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    field.rotation.x = -Math.PI / 2; field.position.set(x, -0.008, z); field.receiveShadow = true;
    scene.add(field);
  }
  for (let x = -214; x <= 214; x += 7) {
    scene.add(box(0.09, 0.012, 82, M.fieldA, x, 0.005, 235));
    scene.add(box(0.09, 0.012, 82, M.fieldB, x + 2.2, 0.005, -235));
  }
  const pond = new THREE.Mesh(new THREE.CircleGeometry(23, 48), M.water);
  pond.rotation.x = -Math.PI / 2; pond.position.set(252, 0.008, 126); scene.add(pond);
  const pondBank = new THREE.Mesh(new THREE.RingGeometry(23, 26, 48), M.grass);
  pondBank.rotation.x = -Math.PI / 2; pondBank.position.set(252, 0.004, 126); scene.add(pondBank);

  // Real scanned vegetation billboards replace the former cone placeholders.
  const treeCount = 112;
  const treeTexture = textureLoader.load('assets/vegetation/polyhaven/jacaranda_tree_billboard.png');
  treeTexture.colorSpace = THREE.SRGBColorSpace;
  treeTexture.anisotropy = 8;
  const treeGeometry = new THREE.PlaneGeometry(7.0, 5.5);
  treeGeometry.translate(0, 2.75, 0);
  const treeMaterial = new THREE.MeshStandardMaterial({
    map: treeTexture, alphaTest: 0.32, side: THREE.DoubleSide,
    roughness: 0.96, metalness: 0,
  });
  const treePositions = [];
  const treeRandom = seededRandom(97);
  for (let i = 0; i < treeCount; i++) {
    const edge = i % 4;
    const along = -265 + treeRandom() * 530;
    const x = edge < 2 ? along : (edge === 2 ? -222 - treeRandom() * 18 : 222 + treeRandom() * 18);
    const z = edge === 0 ? 202 + treeRandom() * 24 : (edge === 1 ? -202 - treeRandom() * 24 : along);
    treePositions.push([x, z, 0.72 + treeRandom() * 0.72, treeRandom() * Math.PI]);
  }
  for (const [x, z] of [[16, -172], [27, -172], [48, -172], [60, -172], [82, -163], [82, -145], [82, -128]]) {
    treePositions.push([x, z, 0.72 + treeRandom() * 0.2, treeRandom() * Math.PI]);
  }
  const treeBillboards = new THREE.InstancedMesh(treeGeometry, treeMaterial, treePositions.length * 2);
  const treeMatrix = new THREE.Matrix4();
  const treeQuaternion = new THREE.Quaternion();
  const treeAxis = new THREE.Vector3(0, 1, 0);
  let treeIndex = 0;
  for (const [x, z, scale, angle] of treePositions) {
    for (const rotation of [angle, angle + Math.PI / 2]) {
      treeQuaternion.setFromAxisAngle(treeAxis, rotation);
      treeMatrix.compose(new THREE.Vector3(x, 0, z), treeQuaternion, new THREE.Vector3(scale, scale, scale));
      treeBillboards.setMatrixAt(treeIndex++, treeMatrix);
    }
  }
  treeBillboards.name = 'Scanned perimeter vegetation';
  scene.add(treeBillboards);

  // roads
  const roadNS = new THREE.Mesh(new THREE.PlaneGeometry(11, 370), M.asphalt);
  roadNS.rotation.x = -Math.PI / 2; roadNS.position.set(8, 0, 0); scene.add(roadNS);
  const roadEW = new THREE.Mesh(new THREE.PlaneGeometry(370, 11), M.asphalt);
  roadEW.rotation.x = -Math.PI / 2; roadEW.position.set(0, 0.001, -2); scene.add(roadEW);
  const roadNorth = new THREE.Mesh(new THREE.PlaneGeometry(300, 11), M.asphalt);
  roadNorth.rotation.x = -Math.PI / 2; roadNorth.position.set(20, 0.002, 120); scene.add(roadNorth);

  // perimeter fence (visual only)
  const fenceMat = new THREE.MeshBasicMaterial({ color: 0x666c70, wireframe: true });
  for (const [w, d, x, z] of [[376, 0.1, 0, -188], [376, 0.1, 0, 188], [0.1, 376, -188, 0], [0.1, 376, 188, 0]]) {
    scene.add(box(w, 2.4, Math.max(d, 0.1), fenceMat, x, 1.2, z));
  }

  const g = new THREE.Group(); scene.add(g);

  // Road centerlines and pedestrian crossings make the site readable at speed.
  for (let z = -176; z <= 176; z += 9) g.add(box(0.16, 0.015, 4.5, M.lineWhite, 8, 0.025, z));
  for (let x = -176; x <= 176; x += 9) g.add(box(4.5, 0.015, 0.16, M.lineWhite, x, 0.026, -2));
  for (let x = -120; x <= 160; x += 9) g.add(box(4.5, 0.015, 0.16, M.lineYel, x, 0.027, 120));
  for (let x = 29; x <= 59; x += 2.2) g.add(box(1.2, 0.018, 0.26, M.lineWhite, x, 0.03, 35.5));

  // Raised curbs, storm drains, and patched pavement establish human scale at grade.
  for (const [x, z, w, d] of [
    [2.35, -94, 0.32, 166], [13.65, -94, 0.32, 166], [2.35, 58, 0.32, 104], [13.65, 58, 0.32, 104],
    [-89, -7.65, 172, 0.32], [101, -7.65, 174, 0.32], [-89, 3.65, 172, 0.32], [101, 3.65, 174, 0.32],
    [-63, 114.35, 114, 0.32], [91, 114.35, 140, 0.32], [-63, 125.65, 114, 0.32], [91, 125.65, 140, 0.32],
  ]) g.add(box(w, 0.2, d, M.concrete, x, 0.1, z));
  for (const [x, z, ry] of [[2.8, 42, 0], [13.2, 83, 0], [30, 3.1, Math.PI / 2], [-72, -7.1, Math.PI / 2], [88, 114.8, Math.PI / 2], [-108, 125.2, Math.PI / 2]]) {
    const grate = box(1.8, 0.035, 0.45, M.steelDk, x, 0.045, z, ry); g.add(grate);
    for (let offset = -0.65; offset <= 0.65; offset += 0.22) g.add(box(0.035, 0.045, 0.42, M.steel, x + Math.cos(ry) * offset, 0.067, z - Math.sin(ry) * offset, ry));
  }

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
    world.anchors.controlRoom = new THREE.Vector3(cx, 1.4, cz - 4.2);
    world.navAnchors.controlRoom = world.anchors.controlRoom;
    pad(cx, cz, 26, 16);
    mapRect(cx, cz, 20, 11, 'CONTROL', '#3a6a8a');
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
    for (const x of [cx - 6, cx, cx + 6]) {
      const controlLight = new THREE.PointLight(0xffedca, 115, 15, 1.6);
      controlLight.position.set(x, 3.05, cz); g.add(controlLight);
      g.add(box(3.2, 0.07, 0.42, M.light, x, 3.25, cz));
    }
    // ESCO engineering workstation — powder-coated industrial console.
    const deskX = cx + 7.6, deskZ = cz - 3.4;
    g.add(bevelBox(2.7, 0.12, 1.24, M.worktop, deskX, 0.94, deskZ, 0, 0.04));
    for (const offset of [-0.93, 0.93]) {
      g.add(bevelBox(0.62, 0.84, 1.02, M.steelDk, deskX + offset, 0.48, deskZ, 0, 0.06));
      for (const drawerY of [0.32, 0.55, 0.78]) {
        g.add(box(0.48, 0.025, 0.035, M.grime, deskX + offset, drawerY, deskZ - 0.53));
      }
    }
    g.add(box(1.35, 0.52, 0.06, M.steelDk, deskX, 0.46, deskZ + 0.52));
    g.add(bevelBox(1.12, 0.055, 0.36, M.keyboard, deskX, 1.03, deskZ - 0.17, 0, 0.025));
    for (let keyX = -0.45; keyX <= 0.45; keyX += 0.15) {
      g.add(box(0.09, 0.016, 0.035, M.steel, deskX + keyX, 1.07, deskZ - 0.29));
      g.add(box(0.09, 0.016, 0.035, M.steel, deskX + keyX, 1.07, deskZ - 0.16));
    }
    g.add(cyl(0.055, 0.055, 0.48, M.steelDk, deskX, 1.22, deskZ + 0.28, 12));
    g.add(bevelBox(0.72, 0.06, 0.42, M.steelDk, deskX, 0.99, deskZ + 0.28, 0, 0.03));
    g.add(bevelBox(1.68, 1.06, 0.14, M.glassDk, deskX, 1.65, deskZ + 0.4, 0, 0.07));
    g.add(box(1.45, 0.83, 0.025, M.screenEng, deskX, 1.65, deskZ + 0.32));
    g.add(cyl(0.09, 0.09, 0.08, M.safetyRed, deskX + 1.06, 1.02, deskZ - 0.18, 16));
    const engLbl = makeLabel('ESCO ENGINEERING WORKSTATION', { border: '#3aff6a', fg: '#aaffcc', fs: 24, scale: 0.011 });
    engLbl.position.set(cx + 7.6, 2.4, cz - 3.2); g.add(engLbl);
    world.interactables.push({ type: 'eng', pos: new THREE.Vector3(cx + 7.6, 1.4, cz - 3.2), label: 'Open ESCO Live Controller Project' });
    addCollider(cx + 7.6, cz - 3.4, 2.6, 1.2);

    const crLbl = makeLabel('CONTROL ROOM', { fs: 40, scale: 0.018 });
    crLbl.position.set(cx, 4.6, cz - 5.5); g.add(crLbl);
    // Exterior canopy, glazing rhythm, and rooftop mechanical equipment.
    g.add(box(8.5, 0.22, 2.2, M.steelDk, cx, 3.25, cz - 6.5));
    for (const px of [-8.5, -4.2, 4.2, 8.5]) g.add(box(2.6, 1.2, 0.08, M.glass, cx + px, 2.0, cz - 5.69));
    for (const px of [-6.5, 0, 6.5]) roofVent(g, cx + px, 3.65, cz + 0.5, 0.75);
    g.add(box(5.2, 0.7, 2.4, M.steel, cx - 5, 3.95, cz + 1));
    louverBank(g, cx - 5, 3.95, cz - 0.25, 4.2, 0.5, 0, M.steelDk);
  }

  // ======================= CV-101 TRAINING CELL =======================
  // The course starts here before the learner is released into Plant 7.
  {
    const ax = 44, az = 24;
    pad(ax, az, 28, 18);
    mapRect(ax, az, 28, 18, 'CV-101', '#b06b28');
    world.anchors.cv101 = new THREE.Vector3(ax, 1.4, az);

    // Roller conveyor and structural frame.
    for (let x = ax - 9; x <= ax + 9; x += 0.45) {
      const roller = cyl(0.09, 0.09, 2.2, M.steelDk, x, 1.22, az, 12);
      roller.rotation.x = Math.PI / 2;
      g.add(roller);
    }
    for (const z of [az - 1.18, az + 1.18]) {
      g.add(box(18.6, 0.28, 0.16, M.rust, ax, 1.16, z));
      g.add(box(18.2, 0.16, 0.16, M.steelDk, ax, 0.9, z));
    }
    for (const x of [ax - 7.5, ax - 2.5, ax + 2.5, ax + 7.5]) {
      for (const z of [az - 1.08, az + 1.08]) g.add(box(0.16, 1.05, 0.16, M.steelDk, x, 0.53, z));
    }
    motorUnit(g, ax - 8.2, 0.15, az + 1.75, 0, M.motor);
    tagLabel('MTR-101  CV-101 DRIVE', ax - 7.2, 2.4, az + 1.8);

    // Photoeye across the belt.
    for (const z of [az - 1.55, az + 1.55]) g.add(box(0.12, 1.5, 0.12, M.steelDk, ax + 1.5, 0.75, z));
    g.add(box(0.26, 0.22, 0.24, M.glassDk, ax + 1.5, 1.46, az - 1.48));
    const eyeBeam = box(0.025, 0.025, 2.7, M.screenOn, ax + 1.5, 1.46, az);
    g.add(eyeBeam);
    tagLabel('PE-101', ax + 1.5, 2.25, az - 1.55);

    // Stack light and operator panel.
    g.add(cyl(0.07, 0.08, 2.4, M.steelDk, ax + 8.4, 1.2, az - 2.7));
    const lampColors = [0x2fbf63, 0xe8a020, 0xd63d32];
    lampColors.forEach((color, index) => {
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.42, roughness: 0.35 });
      g.add(cyl(0.17, 0.17, 0.28, material, ax + 8.4, 2.2 + index * 0.31, az - 2.7));
    });
    tagLabel('TL-101', ax + 8.4, 3.55, az - 2.7);
    g.add(box(1.8, 2.2, 0.7, M.steelDk, ax + 10.5, 1.1, az + 3.1));
    g.add(box(1.35, 0.85, 0.04, M.glassDk, ax + 10.5, 1.45, az + 2.72));
    g.add(box(1.2, 0.7, 0.03, M.screenEng, ax + 10.5, 1.45, az + 2.69));
    tagLabel('ESCO WORKSTATION  CP-101', ax + 10.5, 2.7, az + 3.1);
    world.anchors.cv101Workstation = new THREE.Vector3(ax + 10.5, 1.3, az + 2.6);
    world.navAnchors.cv101Workstation = world.anchors.cv101Workstation;
    world.interactables.push({ id: 'cv101Workstation', type: 'esco', pos: world.anchors.cv101Workstation, label: 'Open assigned CV-101 ESCO project' });
    addCollider(ax + 10.5, az + 3.1, 2, 0.9);

    // Moving training cartons. Motion is updated by main.js.
    for (let index = 0; index < 6; index++) {
      const carton = box(1.05, 0.72, 0.86, M.cardboard, ax - 9 + index * 3.1, 1.67, az);
      g.add(carton);
      world.cv101Boxes.push(carton);
    }
    tagLabel('CV-101 AUTOMATION TRAINING CELL', ax, 4.3, az);
  }

  // ======================= RELIABILITY CENTER =======================
  // The apprenticeship begins here and returns here after every assignment.
  {
    const ax = 44, az = 45;
    pad(ax, az, 34, 18);
    mapRect(ax, az, 34, 18, 'RELIABILITY', '#d28a2a');
    world.anchors.academySpawn = new THREE.Vector3(ax, 1.7, az - 10.5);

    // Low industrial office with a wide lobby door facing the training cell.
    g.add(box(34, 4.6, 0.35, M.wallGreen, ax, 2.3, az + 8.5));
    g.add(box(14, 4.6, 0.35, M.wallGreen, ax - 10, 2.3, az - 8.5));
    g.add(box(14, 4.6, 0.35, M.wallGreen, ax + 10, 2.3, az - 8.5));
    g.add(box(0.35, 4.6, 17, M.wallGreen, ax - 17, 2.3, az));
    g.add(box(0.35, 4.6, 17, M.wallGreen, ax + 17, 2.3, az));
    g.add(box(34.6, 0.35, 17.6, M.roofBlue, ax, 4.75, az));
    g.add(box(5.4, 2.1, 0.12, M.glass, ax, 2.85, az - 8.66));
    addCollider(ax, az + 8.5, 34, 0.5);
    addCollider(ax - 10, az - 8.5, 14, 0.5);
    addCollider(ax + 10, az - 8.5, 14, 0.5);
    addCollider(ax - 17, az, 0.5, 17);
    addCollider(ax + 17, az, 0.5, 17);

    // Dispatch desk and active job board.
    g.add(box(5.6, 1.05, 1.25, M.steelDk, ax - 6, 0.53, az + 2));
    g.add(box(2.6, 1.35, 0.12, M.glassDk, ax - 6, 1.75, az + 2.56));
    g.add(box(2.42, 1.18, 0.04, M.screenOn, ax - 6, 1.75, az + 2.49));
    g.add(box(4.8, 1.6, 0.12, M.glassDk, ax - 6, 2.4, az + 7.9));
    g.add(box(4.55, 1.38, 0.04, M.screenEng, ax - 6, 2.4, az + 7.82));
    const dispatchLabel = makeLabel('DISPATCH / FRANK HOLLIS', { fs: 27, scale: 0.01, border: '#f0b52e', fg: '#fff0be' });
    dispatchLabel.position.set(ax - 6, 3.25, az + 2.5); g.add(dispatchLabel);
    world.anchors.dispatch = new THREE.Vector3(ax - 6, 1.4, az + 0.9);
    world.navAnchors.dispatch = world.anchors.dispatch;
    world.interactables.push({ id: 'dispatch', type: 'dispatch', pos: world.anchors.dispatch, label: 'Report to dispatch' });
    addCollider(ax - 6, az + 2, 5.8, 1.35);

    // Dedicated HMI design bay for Week 4.
    g.add(box(5.8, 2.2, 0.5, M.steelDk, ax + 8.5, 1.1, az + 4.7));
    for (const offset of [-1.75, 0, 1.75]) {
      g.add(box(1.45, 1.05, 0.1, M.glassDk, ax + 8.5 + offset, 1.75, az + 4.38));
      g.add(box(1.3, 0.9, 0.03, M.screenEng, ax + 8.5 + offset, 1.75, az + 4.31));
    }
    const studioLabel = makeLabel('ESCO HMI DESIGN STUDIO', { fs: 27, scale: 0.01, border: '#54bf79', fg: '#c8ffda' });
    studioLabel.position.set(ax + 8.5, 3.15, az + 4.3); g.add(studioLabel);
    world.anchors.academyStudio = new THREE.Vector3(ax + 8.5, 1.4, az + 3.5);
    world.navAnchors.academyStudio = world.anchors.academyStudio;
    world.interactables.push({ id: 'academyStudio', type: 'esco', pos: world.anchors.academyStudio, label: 'Open assigned HMI design project' });
    addCollider(ax + 8.5, az + 4.7, 6, 0.7);

    // Lockers, safety board, and a clear aisle to the production yard.
    for (let i = 0; i < 6; i++) g.add(box(0.9, 2.4, 0.55, i % 2 ? M.steel : M.steelDk, ax - 13 + i, 1.2, az + 6.3));
    g.add(box(5.4, 2.5, 0.18, M.wallWhite, ax + 7.5, 1.4, az + 8.25));
    g.add(box(0.9, 1.25, 0.05, M.safetyRed, ax + 5.6, 1.55, az + 8.14));
    const centerLabel = makeLabel('PLANT 7 RELIABILITY CENTER', { fs: 38, scale: 0.014, border: '#ffffff', fg: '#ffffff', bg: 'rgba(25,48,42,.96)' });
    centerLabel.position.set(ax, 5.8, az - 8.5); g.add(centerLabel);
    for (const x of [ax - 10, ax, ax + 10]) {
      const light = new THREE.PointLight(0xfff0ce, 145, 18, 1.6);
      light.position.set(x, 3.9, az); g.add(light);
      g.add(box(3.5, 0.08, 0.5, M.light, x, 4.2, az));
    }

    // High-bay steel canopy turns CV-101 into a believable training cell.
    for (const x of [27.5, 60.5]) for (const z of [13.5, 34.5]) g.add(box(0.5, 8, 0.5, M.steelDk, x, 4, z));
    g.add(box(34, 0.42, 22, M.roofBlue, 44, 8.15, 24));
    for (const z of [13.8, 34.2]) {
      g.add(box(34, 0.3, 0.3, M.steel, 44, 7.4, z));
      for (let x = 29; x <= 59; x += 5) g.add(box(0.16, 1.3, 0.16, M.safety, x, 0.65, z));
    }
    const bayLabel = makeLabel('BAY 01 / CONVEYOR COMMISSIONING', { fs: 30, scale: 0.011, border: '#f0b52e' });
    bayLabel.position.set(44, 7.25, 13.5); g.add(bayLabel);
    // Portal braces, service tray, and guarded maintenance access make the bay read as permanent plant equipment.
    for (const x of [27.5, 60.5]) {
      g.add(box(0.24, 0.24, 22, M.steel, x, 7.35, 24));
      ladder(g, x + (x < 44 ? 0.45 : -0.45), 34.3, 7.3, 0.15, x < 44 ? Math.PI / 2 : -Math.PI / 2, true);
    }
    catwalk(g, 44, 33.4, 24, 1.15, 5.5, 0);
    pipeRun(g, [[31, 6.6, 14.5], [57, 6.6, 14.5]], 0.11, M.pipeYel);
    for (const x of [31, 38, 45, 52, 59]) g.add(box(0.12, 0.12, 3.2, M.steelDk, x, 6.6, 16));
    drumCluster(g, 28.8, 31.2, 4, M.wallBlue);
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
    structuralFrame(g, ax, az, 38, 30, 9.1, [4.5, 9]);
    // Weather side is enclosed; the north face remains open for gameplay and equipment access.
    g.add(box(38.5, 8.2, 0.24, M.wallGreen, ax, 4.3, az - 15));
    g.add(box(0.24, 8.2, 22, M.wallGreen, ax - 19, 4.3, az - 4));
    for (const x of [ax - 14, ax - 7, ax, ax + 7, ax + 14]) louverBank(g, x, 6.5, az - 15.16, 4.5, 1.25, 0, M.steelDk);
    catwalk(g, ax - 5, az - 10.7, 27, 1.25, 6.2);
    stairFlight(g, ax + 17.5, az - 9, 1.15, 6.2, 8.2, 0, Math.PI / 2);
    ladder(g, ax - 18.6, az + 8, 8.8, 0.2, Math.PI / 2, true);
    roofVent(g, ax - 12, 9.45, az - 2, 1.1);
    roofVent(g, ax + 5, 9.45, az + 7, 1.0);

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
    pipeRun(g, [[ax - 15, 7.1, az - 9], [ax - 15, 10.8, az - 9], [ax - 5.5, 10.8, az - 9]], 0.42, M.pipe);
    cyclone(g, ax - 3.5, az - 9, 12.2, 0.82);

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
    tankDetails(g, ax + 12, az + 8, 2.2, 8, { bandSpacing: 1.8 });
    ibcTote(g, ax + 15, az + 12, 0.3);
    drumCluster(g, ax + 12.8, az + 13, 3, M.wallGreen);

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
    structuralFrame(g, ax - 1, az - 1, 47, 35, 16, [4, 8, 12, 16]);
    // Solvent building: enclosed on the prevailing-weather side with open process access to the north.
    g.add(box(47, 11.5, 0.24, M.wallTan, ax - 1, 5.75, az - 18.5));
    g.add(box(0.24, 11.5, 25, M.wallTan, ax - 24.5, 5.75, az - 5.5));
    for (const x of [ax - 18, ax - 8, ax + 2, ax + 12, ax + 20]) louverBank(g, x, 8.2, az - 18.66, 6.2, 1.55, 0, M.steelDk);
    catwalk(g, ax - 12, az - 9.35, 18, 1.15, 7.55);
    catwalk(g, ax - 12, az - 2.65, 18, 1.15, 7.55);
    stairFlight(g, ax - 22, az - 2, 1.2, 7.55, 10, 0, 0);

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
    structuralFrame(g, dtx, dtz, 7.6, 7.6, 15.2, [4.5, 8.5, 12.5, 15.2]);
    for (const y of [8.6, 12.6]) {
      catwalk(g, dtx, dtz - 3.25, 8.1, 1.05, y);
      catwalk(g, dtx, dtz + 3.25, 8.1, 1.05, y);
    }
    ladder(g, dtx + 3.65, dtz + 3.9, 14.8, 0.2, Math.PI / 2, true);

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
    pipeRun(g, [[ax + 13.5, 5.2, az + 2], [ax + 11, 5.2, az + 2], [ax + 11, 10.5, az + 8], [ax + 20, 10.5, az + 8]], 0.28, M.pipeYel);
    g.add(cyl(0.42, 0.55, 10.5, M.steelDk, ax + 20, 5.25, az + 8, 16));
    g.add(cyl(0.68, 0.16, 0.8, M.pipeYel, ax + 20, 10.9, az + 8, 16));
    world.ambientVents.push(new THREE.Vector3(ax + 20, 11.5, az + 8));

    // hexane storage w/ dike
    g.add(cyl(3, 3, 4.2, M.tankWhite, ax + 20, 2.1, az - 12));
    g.add(box(9, 0.9, 9, M.concrete, ax + 20, 0.45, az - 12));
    tagLabel('HEXANE STORAGE TK-230', ax + 20, 5.4, az - 12);
    addCollider(ax + 20, az - 12, 9, 9);
    tankDetails(g, ax + 20, az - 12, 3, 4.2, { bandSpacing: 1.4, railing: false });
    for (const side of [-1, 1]) g.add(box(8.4, 1.0, 0.18, M.concrete, ax + 20, 0.5, az - 12 + side * 4.2));
    for (const side of [-1, 1]) g.add(box(0.18, 1.0, 8.4, M.concrete, ax + 20 + side * 4.2, 0.5, az - 12));
    const hazard = makeLabel('CLASS I / DIV 2 - NO IGNITION SOURCES', { fs: 24, scale: 0.009, bg: 'rgba(78,19,15,.95)', border: '#ffca3d', fg: '#fff0bd' });
    hazard.position.set(ax + 1, 3.1, az + 17.2); g.add(hazard);

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
    structuralFrame(g, ax - 2, az, 31, 31, 18, [4.5, 9, 13.5, 18]);
    // Open steel refinery rack with weather cladding only on the south elevation.
    g.add(box(31, 8.4, 0.24, M.wallBlue, ax - 2, 4.2, az - 15.5));
    for (const x of [ax - 13, ax - 5, ax + 3, ax + 11]) louverBank(g, x, 6.0, az - 15.66, 5.4, 1.3, 0, M.steelDk);
    catwalk(g, ax - 2, az - 13.7, 30, 1.15, 9.1);
    stairFlight(g, ax - 18, az - 10, 1.15, 9.1, 11.5, 0, Math.PI / 2);

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
    tankDetails(g, bx, bz, 2.2, 6, { bandSpacing: 1.7 });
    // elevated ejector platform
    g.add(box(5, 0.3, 3.4, M.steelDk, bx + 5, 6.0, bz));
    for (const [lx, lz] of [[3, -1.4], [7, -1.4], [3, 1.4], [7, 1.4]]) g.add(box(0.4, 6, 0.4, M.steelDk, bx + lx, 3, bz + lz));
    g.add(hcyl(0.5, 3.2, M.steel, bx + 5, 6.8, bz));
    valveUnit(g, bx + 5, 6.45, bz + 1.2, 0);
    tagLabel('EJECTOR J-3410  PCV-3412', bx + 5, 8.4, bz);
    addCollider(bx + 5, bz, 5, 3.6);
    world.anchors.bleacher = new THREE.Vector3(bx + 5, 6.8, bz);
    pipeRun(g, [[bx + 9, 0.5, bz], [bx + 9, 6.6, bz], [bx + 6.8, 6.8, bz]], 0.16, M.pipe);
    pipeRun(g, [[bx - 2.2, 5.4, bz], [bx - 2.2, 10.8, bz], [bx + 14, 10.8, bz], [bx + 14, 8.5, bz + 12]], 0.24, M.pipeGrn);

    // deodorizer — tall column
    const dx = ax + 8, dz = az + 4;
    g.add(cyl(2.4, 2.4, 14, M.tankWhite, dx, 7, dz));
    g.add(cyl(2.5, 2.5, 0.7, M.steelDk, dx, 1.0, dz));
    tagLabel('DEODORIZER C-3220  LT-3220', dx, 15, dz);
    addCollider(dx, dz, 5.2, 5.2);
    tankDetails(g, dx, dz, 2.4, 14, { bandSpacing: 2.2 });
    catwalk(g, dx, dz - 3.25, 7.8, 1.05, 9.1);
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
      if (i === 0 || i === 2) tankDetails(g, ax + 22, az - 12 + i * 10, 4, 6, { bandSpacing: 2.0, railing: false });
    }
    tagLabel('RBD OIL STORAGE', ax + 22, 8, az - 2);
    for (const z of [az - 17, az + 13]) g.add(box(12, 1.05, 0.22, M.concrete, ax + 22, 0.53, z));
    for (const x of [ax + 16, ax + 28]) g.add(box(0.22, 1.05, 30, M.concrete, x, 0.53, az - 2));
    pipeRun(g, [[ax + 16.5, 1.25, az + 11], [ax + 28, 1.25, az + 11], [ax + 28, 1.25, az - 15]], 0.16, M.pipeGrn);
    ibcTote(g, ax - 16, az + 13, -0.2);
    drumCluster(g, ax - 14, az + 13, 4, M.wallBlue);
  }

  // ======================= UTILITIES =======================
  {
    const ax = 78, az = -8;
    pad(ax, az, 40, 44);
    mapRect(ax, az, 40, 44, 'UTILITIES', '#5a5a7a');

    // boiler house
    g.add(box(14, 8, 12, M.wallTan, ax - 8, 4, az - 8));
    g.add(cyl(0.9, 0.9, 16, M.steelDk, ax - 12, 14, az - 12));  // stack
    g.add(box(15, 0.45, 13, M.roofBlue, ax - 8, 8.25, az - 8));
    for (const z of [az - 11, az - 7, az - 3]) louverBank(g, ax - 15.08, 4.3, z, 2.4, 2.4, Math.PI / 2, M.steelDk);
    for (const y of [8.5, 13, 17.5, 22]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.94, 0.06, 6, 20), M.safetyRed);
      ring.rotation.x = Math.PI / 2; ring.position.set(ax - 12, y, az - 12); g.add(ring);
    }
    ladder(g, ax - 11.05, az - 12, 21.5, 0.2, Math.PI / 2, true);
    catwalk(g, ax - 8, az - 14.4, 13.5, 1.0, 8.7);
    roofVent(g, ax - 4.5, 8.5, az - 5, 1.2);
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
    pipeRun(g, [[ax - 15, 6.4, az - 1], [ax - 1, 6.4, az - 1], [ax - 1, 4.2, az + 8]], 0.3, M.pipe);
    // Gas metering skid feeding the boiler.
    g.add(box(6.5, 0.22, 3.2, M.concrete, ax - 13, 0.11, az + 2));
    for (const px of [ax - 15, ax - 12.7, ax - 10.4]) valveUnit(g, px, 1.0, az + 2, Math.PI / 2);
    pipeRun(g, [[ax - 17, 1.0, az + 2], [ax - 9, 1.0, az + 2], [ax - 9, 3.0, az - 2]], 0.18, M.pipeYel);

    // cooling tower — 2 cell box with fan rings
    const ctx2 = ax + 4, ctz = az + 12;
    g.add(box(12, 6, 7, M.wallBlue, ctx2, 3, ctz));
    for (const fx of [-4.2, 0, 4.2]) louverBank(g, ctx2 + fx, 3.1, ctz - 3.56, 3.2, 4.7, 0, M.steelDk);
    louverBank(g, ctx2 - 6.06, 3.1, ctz, 5.6, 4.7, Math.PI / 2, M.steelDk);
    louverBank(g, ctx2 + 6.06, 3.1, ctz, 5.6, 4.7, Math.PI / 2, M.steelDk);
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
      world.ambientVents.push(new THREE.Vector3(ctx2 + fx, 7.6, ctz));
    }
    tagLabel('COOLING TOWER CT-1  M-4215', ctx2, 8.4, ctz);
    addCollider(ctx2, ctz, 12, 7);
    world.anchors.coolingTower = new THREE.Vector3(ctx2 - 3, 7, ctz);
    pumpUnit(g, ctx2 - 8, 0, ctz + 1, Math.PI / 2);
    tagLabel('CW PUMP P-4220', ctx2 - 8, 2.3, ctz + 1);
    catwalk(g, ctx2, ctz + 3.9, 11.5, 1.05, 6.6);
    ladder(g, ctx2 + 5.7, ctz + 3.45, 6.4, 0.2, Math.PI / 2, true);

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
    structuralFrame(g, ax - 5, az - 3, 24, 20, 11, [4, 8, 11]);
    g.add(box(24, 7.8, 0.24, M.wallTan, ax - 5, 3.9, az - 13));
    g.add(box(0.24, 7.8, 13, M.wallTan, ax - 17, 3.9, az - 6.5));
    catwalk(g, ax - 5, az - 11.2, 23, 1.1, 7.9);
    stairFlight(g, ax + 7.5, az - 8, 1.1, 7.9, 10, 0, Math.PI / 2);

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
    pipeRun(g, [[px, 6.5, pz], [px, 10.8, pz], [px + 7, 10.8, pz]], 0.38, M.pipe);
    cyclone(g, px + 8.3, pz, 10.4, 0.72);

    // meal silos
    for (let i = 0; i < 4; i++) {
      g.add(cyl(3, 3, 12, M.concrete, ax + 10 + i * 7, 6, az + 6));
      addCollider(ax + 10 + i * 7, az + 6, 6.4, 6.4);
      if (i === 0 || i === 3) tankDetails(g, ax + 10 + i * 7, az + 6, 3, 12, { bandSpacing: 3.0 });
    }
    tagLabel('MEAL SILOS / LOADOUT', ax + 20, 13.4, az + 6);
    conveyorGallery(g, px + 8, pz, ax + 10, az + 6, 11.5);
    catwalk(g, ax + 20.5, az + 6, 27, 1.0, 12.5);
    // Rail/truck meal loadout spout below the silo gallery.
    g.add(box(12, 0.35, 8, M.roofBlue, ax + 22, 8.2, az + 15));
    for (const x of [ax + 16.5, ax + 27.5]) for (const z of [az + 11.5, az + 18.5]) g.add(box(0.3, 8.2, 0.3, M.steelDk, x, 4.1, z));
    g.add(cyl(0.34, 0.64, 5.5, M.steelDk, ax + 22, 7.1, az + 15, 12));
    dustCollector(g, ax + 32, az + 13, Math.PI / 2, 0.72);

    const k = hmiKiosk(g, ax + 4, az + 2, -Math.PI / 2, 'MEAL');
    world.interactables.push({ type: 'hmi', screen: 'MEAL', pos: k.pos, label: 'Field HMI — Meal' });
    world.beacons.meal = beaconPole(g, ax + 7, az - 6, 6);
    const sign = makeLabel('AREA 51 — MEAL & LOADOUT', { fs: 44, scale: 0.02, border: '#fff' });
    sign.position.set(ax, 9, az); g.add(sign);
  }

  // ======================= RECEIVING, STORAGE, AND LOGISTICS =======================
  // These systems make the existing process units part of one end-to-end plant.
  {
    const ax = -105, az = 88;
    pad(ax, az, 72, 58);
    mapRect(ax, az, 72, 58, 'GRAIN RECEIVING', '#8d7c43');

    // Truck dump and enclosed receiving pit use a three-bay portal-frame structure.
    preEngineeredBuilding(g, { x: ax - 3, z: az + 18, w: 30, d: 16, eave: 7.2, rise: 2.6, wall: M.wallTan, bay: 10, doorBays: [0, 1, 2] });
    addCollider(ax - 3, az + 18, 30, 16);
    dustCollector(g, ax - 23, az + 18, 0, 0.9);
    pipeRun(g, [[ax - 18.2, 8.0, az + 18], [ax - 15, 8.0, az + 18], [ax - 15, 8.0, az + 12]], 0.46, M.pipe);
    g.add(box(34, 0.3, 7.5, M.roofBlue, ax - 3, 6.5, az + 8));
    for (const x of [ax - 18, ax + 12]) for (const z of [az + 5, az + 11]) g.add(box(0.28, 6.5, 0.28, M.steelDk, x, 3.25, z));
    const dumpLabel = makeLabel('SOYBEAN RECEIVING / DUST CONTROL ACTIVE', { fs: 30, scale: 0.011, border: '#f0c34a', fg: '#fff3c5' });
    dumpLabel.position.set(ax - 3, 8.8, az + 9.5); g.add(dumpLabel);

    // Bucket elevator and distributor tower are a serviceable multi-floor headhouse.
    const ex = ax + 24, ez = az + 3;
    processTower(g, { x: ex, z: ez, w: 11, d: 11, h: 40, wall: M.wallWhite, floors: 6 });
    addCollider(ex, ez, 11.5, 11.5);
    world.ambientVents.push(new THREE.Vector3(ex + 2, 35.5, ez));
    catwalk(g, ex, ez - 6.2, 13.0, 1.05, 31.0);

    // Six storage silos with roof vents and transfer headers.
    const siloPositions = [];
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const sx = ax - 25 + col * 14, sz = az - 16 + row * 14;
      siloPositions.push([sx, sz]);
      g.add(cyl(5.1, 5.1, 20, M.tankWhite, sx, 10, sz, 28));
      g.add(cyl(0.35, 5.1, 2.3, M.roof, sx, 21.15, sz, 28));
      g.add(cyl(0.45, 0.45, 2.0, M.steelDk, sx, 23.1, sz, 14));
      addCollider(sx, sz, 10.6, 10.6);
    }
    tankDetails(g, siloPositions[0][0], siloPositions[0][1], 5.1, 20, { bandSpacing: 3.4 });
    tankDetails(g, siloPositions[5][0], siloPositions[5][1], 5.1, 20, { bandSpacing: 3.4 });
    conveyorGallery(g, ex, ez, ax - 11, az - 16, 26);
    conveyorGallery(g, ax - 25, az - 16, ax + 3, az - 16, 24.5);
    conveyorGallery(g, ax - 25, az - 2, ax + 3, az - 2, 24.5);
    const receivingLabel = makeLabel('AREA 01 / RECEIVING + STORAGE', { fs: 40, scale: 0.013, border: '#ffffff', fg: '#ffffff' });
    receivingLabel.position.set(ax, 28, az - 29); g.add(receivingLabel);
    const brandLabel = makeLabel('PRAIRIE GOLD / PLANT 7', { fs: 58, scale: 0.018, bg: 'rgba(34,58,47,.96)', border: '#e9bd43', fg: '#fff1bd' });
    brandLabel.position.set(ex, 28, ez - 5.75); g.add(brandLabel);

    // Receiving connects directly to Bean Prep through enclosed drag conveyors.
    conveyorGallery(g, ex, ez - 1, -75, 42, 15);
    conveyorGallery(g, -75, 42, -62, -5, 12);

    const spur = new THREE.Mesh(new THREE.PlaneGeometry(10, 54), M.asphalt);
    spur.rotation.x = -Math.PI / 2; spur.position.set(-102, 0.012, 143); g.add(spur);
    // Scale house and probe station establish a believable inbound workflow.
    preEngineeredBuilding(g, { x: ax + 19, z: az + 29, w: 6.5, d: 4.2, eave: 3.2, rise: 0.9, wall: M.wallGreen, bay: 2.2, vents: false });
    g.add(box(5.2, 1.3, 0.08, M.glass, ax + 19, 2.1, az + 26.86));
    g.add(box(15, 0.14, 3.3, M.steelDk, ax - 3, 0.1, az + 37));
    g.add(cyl(0.09, 0.12, 5.5, M.steelDk, ax + 9, 2.75, az + 33));
    pipeRun(g, [[ax + 9, 5.3, az + 33], [ax + 2, 5.3, az + 33], [ax + 2, 2.4, az + 33]], 0.08, M.steelDk);
  }

  // ======================= MAINTENANCE AND ELECTRICAL =======================
  {
    const ax = -20, az = 82;
    pad(ax, az, 35, 30);
    mapRect(ax, az, 35, 30, 'MAINTENANCE', '#4f7180');
    preEngineeredBuilding(g, { x: ax, z: az, w: 34, d: 25, eave: 7.8, rise: 3.3, wall: M.wallBlue, bay: 8.5, doorBays: [0, 1, 2, 3] });
    louverBank(g, ax - 17.12, 5.1, az + 4, 8, 2.2, Math.PI / 2, M.steelDk);
    addCollider(ax, az, 34, 25);
    const shopLabel = makeLabel('MAINTENANCE / INSTRUMENT SHOP', { fs: 34, scale: 0.012, border: '#ffffff', fg: '#ffffff' });
    shopLabel.position.set(ax, 9.4, az - 12.8); g.add(shopLabel);
    preEngineeredBuilding(g, { x: ax + 12, z: az + 16, w: 8, d: 5, eave: 3.6, rise: 1.1, wall: M.wallWhite, bay: 2.7, vents: false });
    g.add(box(6.6, 2.3, 0.12, M.glassDk, ax + 12, 2.1, az + 13.42));
    const mccLabel = makeLabel('MCC-01 / CONTROL POWER', { fs: 26, scale: 0.01, border: '#ffdf58' });
    mccLabel.position.set(ax + 12, 4.7, az + 13.2); g.add(mccLabel);
    addCollider(ax + 12, az + 16, 8, 5);
    drumCluster(g, ax - 15.5, az + 14, 6, M.wallBlue);
    ibcTote(g, ax - 12.5, az + 14, 0.4);
    // Cable reels and a small fabrication stock rack.
    for (let i = 0; i < 3; i++) {
      const reel = hcyl(0.7, 0.5, i === 0 ? M.rust : M.steelDk, ax - 15 + i * 1.8, 0.78, az - 17, Math.PI / 2);
      g.add(reel);
    }
    for (const y of [0.6, 1.5, 2.4]) g.add(box(8, 0.14, 0.8, M.rust, ax + 8, y, az - 16.5));
  }

  // ======================= PACKAGING WAREHOUSE =======================
  {
    const ax = 70, az = 88;
    pad(ax, az, 76, 48);
    mapRect(ax, az, 76, 48, 'PACKAGING / SHIPPING', '#6d586d');
    preEngineeredBuilding(g, { x: ax, z: az, w: 70, d: 34, eave: 11.5, rise: 4.8, wall: M.wallWhite, bay: 10, doorBays: [0, 1, 2, 3, 4, 5] });
    addCollider(ax, az, 70, 34);
    const warehouseLabel = makeLabel('PACKAGING + FINISHED GOODS', { fs: 42, scale: 0.014, border: '#ffffff', fg: '#ffffff' });
    warehouseLabel.position.set(ax, 13.2, az - 17.6); g.add(warehouseLabel);

    // Product gallery from Meal to packaging.
    conveyorGallery(g, -35, 42, 20, 64, 13);
    conveyorGallery(g, 20, 64, 38, 78, 13);

    const drive = new THREE.Mesh(new THREE.PlaneGeometry(72, 13), M.asphalt);
    drive.rotation.x = -Math.PI / 2; drive.position.set(ax, 0.013, az - 29); g.add(drive);
    for (const x of [ax - 32, ax + 32]) {
      for (let i = 0; i < 4; i++) {
        g.add(box(1.2, 0.18, 1.0, M.rust, x, 0.09 + i * 0.6, az + 19));
        g.add(box(1.0, 0.48, 0.82, M.cardboard, x, 0.39 + i * 0.6, az + 19));
      }
    }
    // Dedicated fire-water tank and pump house for the warehouse sprinkler system.
    g.add(cyl(4.2, 4.2, 8, M.safetyRed, ax + 43, 4, az + 6, 28));
    tankDetails(g, ax + 43, az + 6, 4.2, 8, { bandSpacing: 2.2, railing: false });
    preEngineeredBuilding(g, { x: ax + 44, z: az - 5, w: 9, d: 6, eave: 4, rise: 1.4, wall: M.wallGreen, bay: 3, vents: false });
    pipeRun(g, [[ax + 43, 0.8, az + 1.8], [ax + 43, 0.8, az - 5], [ax + 39, 0.8, az - 5]], 0.22, M.safetyRed);
  }

  // ======================= SUBSTATION, GATE, AND RAIL =======================
  {
    const sx = 118, sz = 45;
    pad(sx, sz, 32, 28);
    mapRect(sx, sz, 32, 28, 'SUBSTATION', '#806343');
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const x = sx - 9 + col * 9, z = sz - 6 + row * 12;
      g.add(box(4.8, 3.2, 3.8, M.steelDk, x, 1.6, z));
      g.add(cyl(0.22, 0.28, 4.5, M.rust, x - 1.2, 5.2, z));
      g.add(cyl(0.22, 0.28, 4.5, M.rust, x + 1.2, 5.2, z));
      for (const side of [-1, 1]) for (let fin = -1.5; fin <= 1.5; fin += 0.38) g.add(box(0.5, 2.3, 0.06, M.steel, x + side * 2.65, 1.7, z + fin));
    }
    for (const z of [sz - 6, sz + 6]) pipeRun(g, [[sx - 13, 7.1, z], [sx + 13, 7.1, z]], 0.08, M.steel);
    for (const x of [sx - 9, sx, sx + 9]) {
      g.add(cyl(0.12, 0.16, 5.5, M.steelDk, x, 2.75, sz - 11, 10));
      g.add(box(1.3, 0.12, 0.16, M.steel, x, 5.45, sz - 11));
    }
    for (const z of [sz - 13, sz + 13]) g.add(box(32, 2.5, 0.08, M.steelDk, sx, 1.25, z));
    for (const x of [sx - 16, sx + 16]) g.add(box(0.08, 2.5, 26, M.steelDk, x, 1.25, sz));
    addCollider(sx, sz, 32, 28);

    // Rail spur on the west perimeter with two covered hopper cars.
    for (let z = -174; z <= 168; z += 2.1) g.add(box(5, 0.12, 0.28, M.rust, -160, 0.08, z));
    g.add(box(0.16, 0.18, 350, M.steelDk, -158.65, 0.17, -3));
    g.add(box(0.16, 0.18, 350, M.steelDk, -161.35, 0.17, -3));
    for (const z of [60, 78]) {
      g.add(box(3.1, 3.5, 15, M.tankWhite, -160, 2.4, z));
      g.add(cyl(0.65, 1.5, 1.1, M.steelDk, -160, 0.7, z - 4));
      g.add(cyl(0.65, 1.5, 1.1, M.steelDk, -160, 0.7, z + 4));
      for (const wz of [z - 5.5, z + 5.5]) for (const wx of [-161.3, -158.7]) {
        const wheel = cyl(0.42, 0.42, 0.24, M.glassDk, wx, 0.52, wz, 12);
        wheel.rotation.z = Math.PI / 2; g.add(wheel);
      }
      for (const hz of [z - 4, z, z + 4]) g.add(cyl(0.45, 0.45, 0.2, M.steelDk, -160, 4.25, hz, 16));
      ladder(g, -158.38, z + 5.2, 3.7, 0.45, Math.PI / 2, false);
    }

    // Main gate and parking create a believable arrival point in the distance.
    const gx = 150, gz = 120;
    g.add(box(8, 4, 6, M.wallGreen, gx - 8, 2, gz + 7));
    g.add(box(7, 1.4, 0.12, M.glass, gx - 8, 2.4, gz + 3.92));
    g.add(box(10, 0.24, 3.0, M.roofBlue, gx - 8, 3.8, gz + 2.8));
    roofVent(g, gx - 10, 4.2, gz + 7, 0.7);
    g.add(box(18, 0.22, 0.22, M.safety, gx - 2, 1.25, gz));
    const gateLabel = makeLabel('PRAIRIE GOLD PROCESSING / PLANT 7', { fs: 38, scale: 0.013, border: '#ffffff', fg: '#ffffff', bg: 'rgba(24,46,39,.95)' });
    gateLabel.position.set(gx - 18, 6.2, gz); g.add(gateLabel);
    const parking = new THREE.Mesh(new THREE.PlaneGeometry(58, 40), M.asphalt);
    parking.rotation.x = -Math.PI / 2; parking.position.set(120, 0.014, 150); g.add(parking);
    mapRect(120, 150, 58, 40, 'EMPLOYEE PARKING', '#56636b');
    for (let x = 96; x <= 143; x += 5.5) {
      g.add(box(0.12, 0.015, 16, M.lineWhite, x, 0.03, 150));
    }
    // Windsock gives the solvent area a visible safety-oriented scale cue.
    g.add(cyl(0.08, 0.12, 11, M.steelDk, 103, 5.5, 111));
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 12, 1, true), M.safetyRed);
    sock.rotation.z = -Math.PI / 2; sock.position.set(104.5, 10.7, 111); g.add(sock);
  }

  // ======================= INTEGRATED CAMPUS LANDMARKS =======================
  // This exterior master plan turns the individual training areas into one
  // believable agricultural-processing campus. The layout is intentionally
  // generic and carries no third-party logos or trade dress.
  {
    // Heavy-vehicle loop around the main bulk-storage court.
    const loop = [
      [96, -166], [164, -166], [174, -156], [174, -104],
      [164, -94], [104, -94], [94, -104], [94, -156], [96, -166],
    ];
    for (let i = 0; i < loop.length - 1; i++) roadSegment(g, ...loop[i], ...loop[i + 1], 8.5);
    roadSegment(g, 8, -166, 96, -166, 9.5);
    roadSegment(g, 174, -104, 174, 28, 8.5);
    for (const [x1, z1, x2, z2] of [[100, -162, 160, -162], [170, -151, 170, -109], [160, -98, 108, -98]]) {
      roadSegment(g, x1, z1, x2, z2, 0.16, 0.041);
    }

    // Two landmark bulk silos dominate the campus frontage like a real oilseed plant.
    const bulkSilos = [[119, -132, 'SILO 701'], [151, -132, 'SILO 702']];
    pad(135, -132, 76, 62);
    mapRect(135, -132, 76, 62, 'BULK STORAGE', '#8f928f');
    for (const [sx, sz, id] of bulkSilos) {
      g.add(cyl(14, 14, 20.5, M.concrete, sx, 10.25, sz, 48));
      g.add(cyl(0.65, 14.1, 4.2, M.roof, sx, 22.6, sz, 48));
      g.add(cyl(0.48, 0.6, 2.0, M.steelDk, sx, 25.7, sz, 14));
      g.add(cyl(15, 15, 0.55, M.concrete, sx, 0.27, sz, 48));
      tankDetails(g, sx, sz, 14, 20.5, { bandSpacing: 4.1 });
      weatherSilo(g, sx, sz, 14, 20.5);
      const siloLabel = makeLabel(id, { fs: 34, scale: 0.013, border: '#747a79', fg: '#eef1ed', bg: 'rgba(41,49,48,.9)' });
      siloLabel.position.set(sx, 10.5, sz - 14.15); g.add(siloLabel);
      addCollider(sx, sz, 29, 29);
    }
    catwalk(g, 135, -132, 32, 1.25, 25.2);
    conveyorGallery(g, 119, -118, 113, -86, 24.5);

    // Working bins and transfer galleries form the dense process silhouette behind the big silos.
    const dayBins = [105, 118, 131, 144, 157];
    for (const sx of dayBins) {
      g.add(cyl(5.3, 5.3, 18, M.tankWhite, sx, 9, -80, 30));
      g.add(cyl(0.35, 5.35, 2.8, M.roof, sx, 19.4, -80, 30));
      g.add(cyl(0.35, 0.45, 1.4, M.steelDk, sx, 21.4, -80, 12));
      addCollider(sx, -80, 11, 11);
    }
    tankDetails(g, dayBins[0], -80, 5.3, 18, { bandSpacing: 3.0 });
    tankDetails(g, dayBins.at(-1), -80, 5.3, 18, { bandSpacing: 3.0 });
    conveyorGallery(g, 105, -80, 157, -80, 22.5);

    // Primary mill / headhouse: framed preparation tower, concrete grain leg, and press hall.
    pad(133, -48, 75, 48);
    mapRect(133, -48, 75, 48, 'PRIMARY MILL', '#596970');
    processTower(g, { x: 119, z: -48, w: 27, d: 28, h: 34, wall: M.wallWhite, floors: 5 });
    processTower(g, { x: 140, z: -50, w: 13, d: 14, h: 46, wall: M.wallGreen, floors: 7 });
    preEngineeredBuilding(g, { x: 158, z: -44, w: 20, d: 24, eave: 13, rise: 4, wall: M.wallTan, bay: 5, doorBays: [1, 2] });
    structuralFrame(g, 132, -64, 17, 6, 25, [6, 12, 18, 24]);
    dustCollector(g, 151, -66, Math.PI / 2, 0.95);
    cyclone(g, 163, -64, 15, 1.05);
    g.add(cyl(1.35, 1.65, 42, M.steelDk, 148, 21, -34, 24));
    g.add(cyl(1.55, 1.35, 1.8, M.rust, 148, 42.9, -34, 24));
    catwalk(g, 129.5, -62.5, 22, 1.2, 27.5);
    conveyorGallery(g, 140, -57, 145, -80, 25.5);
    pipeRun(g, [[99, -0.2, -22], [99, 7.5, -22], [105, 7.5, -35], [105, 7.5, -48]], 0.28, M.pipe);
    pipeRun(g, [[99.8, -0.2, -20], [99.8, 6.6, -20], [107, 6.6, -33], [107, 6.6, -48]], 0.17, M.pipeYel);
    addCollider(119, -48, 27, 28);
    addCollider(140, -50, 13, 14);
    addCollider(157, -44, 20, 24);
    const millLabel = makeLabel('PRIMARY MILL / BULK TRANSFER', { fs: 38, scale: 0.012, border: '#ffffff', fg: '#ffffff', bg: 'rgba(32,45,48,.94)' });
    millLabel.position.set(119, 27, -62.2); g.add(millLabel);

    // East-side rail main and loadout duplicate the reference campus boundary condition.
    for (let z = -176; z <= 176; z += 2.4) g.add(box(5.2, 0.12, 0.3, M.rust, 183, 0.08, z));
    g.add(box(0.17, 0.18, 354, M.steelDk, 181.65, 0.17, 0));
    g.add(box(0.17, 0.18, 354, M.steelDk, 184.35, 0.17, 0));
    for (const z of [-72, -51, -30]) {
      g.add(bevelBox(3.2, 3.7, 17, M.tankWhite, 183, 2.7, z, 0, 0.32));
      for (const hz of [z - 4.8, z, z + 4.8]) g.add(cyl(0.24, 1.18, 1.5, M.tankWhite, 183, 0.95, hz, 16));
      for (const hz of [z - 5.2, z, z + 5.2]) g.add(cyl(0.5, 0.5, 0.22, M.steelDk, 183, 4.55, hz, 16));
      for (const wz of [z - 6, z + 6]) for (const wx of [181.7, 184.3]) {
        const wheel = cyl(0.44, 0.44, 0.25, M.glassDk, wx, 0.54, wz, 12);
        wheel.rotation.z = Math.PI / 2; g.add(wheel);
      }
      ladder(g, 181.35, z + 6.5, 3.9, 0.5, -Math.PI / 2);
    }
    g.add(box(12, 0.4, 30, M.roofBlue, 176, 9.2, -64));
    for (const x of [170.5, 181.5]) for (const z of [-77.5, -50.5]) g.add(box(0.35, 9.2, 0.35, M.steelDk, x, 4.6, z));
    conveyorGallery(g, 157, -80, 176, -67, 13.5);
    g.add(cyl(0.38, 0.7, 6.2, M.steelDk, 176, 8.5, -64, 14));

    // Northern high-bay warehouse and southern distribution hall use real portal-frame construction.
    pad(-45, 150, 104, 42);
    mapRect(-45, 150, 104, 42, 'MAIN WAREHOUSE', '#6b7376');
    preEngineeredBuilding(g, { x: -45, z: 151, w: 98, d: 34, eave: 14.5, rise: 5.4, wall: M.wallWhite, bay: 7, doorBays: [1, 3, 5, 7, 9, 11] });
    addCollider(-45, 151, 98, 34);
    conveyorGallery(g, -81, 91, -81, 133, 19);
    const northLabel = makeLabel('RAW MATERIAL / MAIN WAREHOUSE', { fs: 38, scale: 0.012, border: '#ffffff', fg: '#ffffff' });
    northLabel.position.set(-45, 17.2, 133.6); g.add(northLabel);

    pad(-120, -137, 74, 40);
    mapRect(-120, -137, 74, 40, 'DISTRIBUTION', '#66727a');
    preEngineeredBuilding(g, { x: -120, z: -137, w: 70, d: 34, eave: 10.5, rise: 4.4, wall: M.wallBlue, bay: 7, doorBays: [1, 3, 5, 7] });
    addCollider(-120, -137, 70, 34);
    roadSegment(g, -82, -166, -82, -102, 9);
    roadSegment(g, -82, -102, -18, -102, 9);

    // Administration uses a real modular masonry and steel facade asset.
    pad(36, -149, 52, 34);
    world.architectureReady = loadBrickFactoryOffice(g, 36, -149);
    addCollider(36, -149, 40, 19);
    const adminLabel = makeLabel('PRAIRIE GOLD PROCESSING / PLANT 7', { fs: 36, scale: 0.011, border: '#d5ac3c', fg: '#fff2bf', bg: 'rgba(31,54,45,.96)' });
    adminLabel.position.set(36, 7.8, -158.8); g.add(adminLabel);
    const visitorParking = new THREE.Mesh(new THREE.PlaneGeometry(38, 22), M.asphalt);
    visitorParking.rotation.x = -Math.PI / 2; visitorParking.position.set(67, 0.014, -149); g.add(visitorParking);
    for (let z = -157; z <= -141; z += 4) g.add(box(36, 0.014, 0.12, M.lineWhite, 67, 0.032, z));
  }

  // ======================= pipe racks between areas =======================
  const rackRun = (x1, z1, x2, z2) => {
    const a = new THREE.Vector3(x1, 0, z1), b = new THREE.Vector3(x2, 0, z2);
    const len = a.distanceTo(b), n = Math.max(1, Math.floor(len / 8));
    const dx = (x2 - x1) / len, dz = (z2 - z1) / len;
    const nx = -dz, nz = dx;
    const runAngle = -Math.atan2(z2 - z1, x2 - x1);
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      for (const side of [-1, 1]) g.add(box(0.28, 4.4, 0.28, M.steelDk, p.x + nx * side, 2.2, p.z + nz * side));
      g.add(box(2.4, 0.2, 0.28, M.steelDk, p.x, 4.4, p.z, runAngle + Math.PI / 2));
    }
    for (const offset of [-0.72, 0, 0.72]) {
      pipeRun(g, [[x1 + nx * offset, 4.7, z1 + nz * offset], [x2 + nx * offset, 4.7, z2 + nz * offset]], 0.14, offset === 0 ? M.pipeYel : M.pipe);
    }
    g.add(box(len, 0.12, 0.42, M.steelDk, (x1 + x2) / 2 + nx * 1.25, 5.25, (z1 + z2) / 2 + nz * 1.25, runAngle));
  };
  rackRun(-40, -25, -25, -50);
  rackRun(8, -55, 30, -55);
  rackRun(60, -25, 8, -45);
  rackRun(-45, 5, -25, -8);
  rackRun(8, 5, 0, 18);

  // light poles
  for (const [x, z] of [[-30, -10], [25, -30], [60, -30], [-30, 25], [30, 10], [-70, -40], [8, -80], [-100, 125], [-45, 112], [45, 115], [105, 118], [145, 120], [8, 145]]) {
    g.add(cyl(0.12, 0.16, 9, M.steelDk, x, 4.5, z));
    g.add(box(1.4, 0.25, 0.5, M.yellow, x, 9, z));
    g.add(box(0.32, 0.62, 0.22, M.steelDk, x, 0.45, z));
  }

  // Safety bollards protect doors, panels, and traffic crossings.
  for (const [x, z] of [[34, 36], [54, 36], [27, 36], [61, 36], [-37, 68], [-3, 68], [38, 67], [102, 67], [136, 119], [158, 119]]) {
    g.add(cyl(0.14, 0.18, 1.15, M.safety, x, 0.58, z, 12));
  }

  // Emergency showers and eyewash stations are placed at the solvent, refinery, and chemical handling exits.
  for (const [x, z] of [[10, -43], [25, -40], [61, -38]]) {
    g.add(cyl(0.07, 0.08, 2.5, M.pipeGrn, x, 1.25, z, 10));
    g.add(hcyl(0.06, 0.72, M.pipeGrn, x + 0.34, 2.35, z));
    g.add(cyl(0.34, 0.09, 0.2, M.pipeGrn, x + 0.67, 2.18, z, 12));
    g.add(box(0.52, 0.38, 0.06, M.wallGreen, x, 1.55, z - 0.08));
    g.add(box(1.5, 0.06, 1.5, M.lineYel, x, 0.035, z));
  }

  // Ground-level navigation points are separate from visual/effect anchors,
  // which may sit high on vessels or inside machinery.
  Object.assign(world.navAnchors, {
    conditioner: new THREE.Vector3(-45.5, 1.4, -31),
    crackingA: new THREE.Vector3(-62.5, 1.4, -29),
    extractor: new THREE.Vector3(-19, 1.4, -68),
    dt: new THREE.Vector3(0.3, 1.4, -69),
    pumpAlley: new THREE.Vector3(-8, 1.4, -51),
    bleacher: new THREE.Vector3(43, 1.4, -62.5),
    deodorizer: new THREE.Vector3(54, 1.4, -50.5),
    boiler: new THREE.Vector3(77, 1.4, -11),
    coolingTower: new THREE.Vector3(73, 1.4, 5),
    pelletCooler: new THREE.Vector3(-50.5, 1.4, 26),
  });

  // One restrained 3D route marker is reused for the current assignment.
  const waypoint = new THREE.Group();
  const waypointMat = new THREE.MeshStandardMaterial({
    color: 0xffbd38, emissive: 0xc56a05, emissiveIntensity: 1.25,
    roughness: 0.35, transparent: true, opacity: 0.92, depthTest: false,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.09, 10, 34), waypointMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.16; waypoint.add(ring);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 5), waypointMat);
  arrow.rotation.z = Math.PI; arrow.position.y = 2.5; waypoint.add(arrow);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.18, 7.5, 10),
    new THREE.MeshBasicMaterial({ color: 0xffb52b, transparent: true, opacity: 0.24, depthWrite: false }),
  );
  beam.position.y = 4; waypoint.add(beam);
  waypoint.visible = false; waypoint.renderOrder = 20; scene.add(waypoint);
  world.setWaypoint = (pos, visible = true) => {
    waypoint.visible = !!pos && visible;
    if (pos) waypoint.position.set(pos.x, 0.04, pos.z);
  };
  world.updateWaypoint = (dt) => {
    if (!waypoint.visible) return;
    ring.rotation.z += dt * 1.6;
    arrow.position.y = 2.5 + Math.sin(performance.now() / 260) * 0.18;
  };

  world.staticBatchCount = mergeStaticWorldGeometry(g, [
    world.ctFan1, world.ctFan2, ...world.cv101Boxes,
  ]);

  return world;
}

// ============================================================================
// Effects — steam plumes, leaks, beacon flashing, fan spin, positional hiss
// ============================================================================
import * as THREE from 'three';
import { audio } from './audio.js?v=20260715d';

function makePuffTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d');
  const grad = cx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = grad; cx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}
const PUFF_TEX = { tex: null };

class SteamPlume {
  constructor(scene, pos, opts = {}) {
    this.pos = pos.clone();
    this.count = opts.count || 60;
    this.size = opts.size || 2.2;
    this.rate = opts.rate || 1.0;       // intensity 0..1
    this.spread = opts.spread || 0.5;
    this.rise = opts.rise || 2.4;
    this.life = opts.life || 2.4;
    this.tint = opts.tint || 0xffffff;

    if (!PUFF_TEX.tex) PUFF_TEX.tex = makePuffTexture();
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.count * 3);
    this.ages = new Float32Array(this.count);
    this.seeds = new Float32Array(this.count * 2);
    for (let i = 0; i < this.count; i++) {
      this.ages[i] = Math.random() * this.life;
      this.seeds[i * 2] = (Math.random() - 0.5);
      this.seeds[i * 2 + 1] = (Math.random() - 0.5);
      this._place(i);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.mat = new THREE.PointsMaterial({
      size: this.size, map: PUFF_TEX.tex, transparent: true, opacity: 0.5,
      depthWrite: false, color: this.tint,
    });
    this.points = new THREE.Points(geo, this.mat);
    scene.add(this.points);
    this.scene = scene;
    this.dead = false;
  }
  _place(i) {
    const f = this.ages[i] / this.life;
    this.positions[i * 3] = this.pos.x + this.seeds[i * 2] * this.spread * (1 + f * 3);
    this.positions[i * 3 + 1] = this.pos.y + f * this.rise * this.life;
    this.positions[i * 3 + 2] = this.pos.z + this.seeds[i * 2 + 1] * this.spread * (1 + f * 3);
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      this.ages[i] += dt * this.rate;
      if (this.ages[i] > this.life) {
        this.ages[i] = 0;
        this.seeds[i * 2] = (Math.random() - 0.5);
        this.seeds[i * 2 + 1] = (Math.random() - 0.5);
      }
      this._place(i);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.mat.opacity = 0.18 + 0.35 * this.rate;
  }
  dispose() {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.dead = true;
  }
}

export class EffectsManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.plumes = [];          // {plume, hiss, pos, baseVol}
    this.ambient = [];
    this.beaconState = { area: null, tier: 0 };
    this.flashClock = 0;
    this.fanSpeed = 1;
    this.leakPool = null;

    // permanent cosmetic stack plumes
    for (const v of world.ambientVents) {
      const p = new SteamPlume(scene, v, { count: 40, size: 4.5, rate: 0.45, spread: 0.7, rise: 2.6, life: 4, tint: 0xeeeeee });
      this.ambient.push(p);
    }
  }

  // scenario effect at a named anchor
  startScenarioEffects(effects) {
    this.stopScenarioEffects();
    for (const e of effects || []) {
      const pos = this.world.anchors[e.anchor];
      if (!pos) continue;
      if (e.type === 'steam') {
        const plume = new SteamPlume(this.scene, pos, { count: 110, size: 3.4, rate: 1.0, spread: 0.7, rise: 4.5, life: 2.6 });
        const hiss = audio.addHiss(7500);
        this.plumes.push({ plume, hiss, pos, baseVol: e.vol ?? 0.6 });
      } else if (e.type === 'hiss') {
        const plume = new SteamPlume(this.scene, pos, { count: 30, size: 1.4, rate: 0.9, spread: 0.25, rise: 1.6, life: 1.6 });
        const hiss = audio.addHiss(9000);
        this.plumes.push({ plume, hiss, pos, baseVol: e.vol ?? 0.3 });
      } else if (e.type === 'leak') {
        // dark liquid pool spreading + faint shimmer plume
        const poolMat = new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.85 });
        this.leakPool = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), poolMat);
        this.leakPool.rotation.x = -Math.PI / 2;
        this.leakPool.position.set(pos.x, 0.04, pos.z);
        this.scene.add(this.leakPool);
        const plume = new SteamPlume(this.scene, new THREE.Vector3(pos.x, 0.3, pos.z),
          { count: 24, size: 1.6, rate: 0.5, spread: 0.5, rise: 0.7, life: 2.2, tint: 0xccccdd });
        const hiss = audio.addHiss(4000);
        this.plumes.push({ plume, hiss, pos, baseVol: e.vol ?? 0.25 });
      } else if (e.type === 'rumble') {
        const hiss = audio.addHiss(180);
        this.plumes.push({ plume: null, hiss, pos, baseVol: e.vol ?? 0.4 });
      } else if (e.type === 'grind') {
        const hiss = audio.addHiss(420);
        this.plumes.push({ plume: null, hiss, pos, baseVol: e.vol ?? 0.35 });
      }
      // 'quiet' = no effect (the clue is the absence of sound)
    }
  }

  stopScenarioEffects() {
    for (const p of this.plumes) { p.plume?.dispose(); p.hiss?.stop(); }
    this.plumes = [];
    if (this.leakPool) { this.scene.remove(this.leakPool); this.leakPool = null; }
  }

  setBeacon(areaKey, tier) {
    this.beaconState = { area: areaKey, tier };
  }

  update(dt, playerPos, escalation) {
    for (const p of this.ambient) p.update(dt);
    for (const p of this.plumes) {
      p.plume?.update(dt);
      if (p.hiss && playerPos) {
        const d = playerPos.distanceTo(p.pos);
        const vol = p.baseVol * Math.min(1, 14 / Math.max(2, d)) * (0.6 + 0.4 * (escalation || 0));
        p.hiss.setVol(vol);
      }
    }
    if (this.leakPool) {
      const r = Math.min(2.6, this.leakPool.scale.x + dt * 0.05);
      this.leakPool.scale.set(r, r, 1);
    }

    // beacons
    this.flashClock += dt;
    const mapAreaToBeacon = { PREP: 'prep', EXTRACTION: 'extraction', REFINERY: 'refinery', UTILITIES: 'utilities', MEAL: 'meal' };
    for (const [key, b] of Object.entries(this.world.beacons)) {
      const active = this.beaconState.tier > 0 && mapAreaToBeacon[this.beaconState.area] === key;
      if (!active) {
        b.lampMat.emissive.setHex(0x000000); b.light.intensity = 0;
        continue;
      }
      const speed = this.beaconState.tier >= 2 ? 6 : 2.5;
      const on = Math.sin(this.flashClock * speed * Math.PI) > 0;
      const color = this.beaconState.tier === 1 ? 0xff9500 : 0xff1500;
      b.lampMat.emissive.setHex(on ? color : 0x000000);
      b.lampMat.emissiveIntensity = 2.2;
      b.light.color.setHex(color);
      b.light.intensity = on ? 30 : 0;
    }

    // cooling tower fans
    const fanRate = this.fanSpeed * dt * 6;
    if (this.world.ctFan1 && this.fan1On !== false) this.world.ctFan1.rotation.y += fanRate;
    if (this.world.ctFan2) this.world.ctFan2.rotation.y += fanRate;
  }

  setFan1(on) { this.fan1On = on; }
  setPlantRunning(run) { this.fanSpeed = run ? 1 : 0.05; }
}

// ============================================================================
// First-person player controller (pointer lock, WASD, sprint, head bob)
// ============================================================================
import * as THREE from 'three';

const EYE = 1.7;

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.yaw = 0;
    this.pitch = 0;
    this.pos = new THREE.Vector3(0, EYE, 18);
    this.vel = new THREE.Vector3();
    this.keys = {};
    this.locked = false;
    this.enabled = false;
    this.bobT = 0;
    this.colliders = [];   // THREE.Box3 list

    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
    document.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() {
    try {
      const p = this.dom.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch { /* headless / unsupported — keyboard still works */ }
  }
  unlock() { if (this.locked) document.exitPointerLock?.(); }

  setColliders(boxes) { this.colliders = boxes; }

  update(dt) {
    if (!this.enabled) return;
    const sprint = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const speed = sprint ? 9.5 : 4.6;
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const wish = new THREE.Vector3();
    if (this.locked) {
      if (this.keys['KeyW']) wish.add(f);
      if (this.keys['KeyS']) wish.sub(f);
      if (this.keys['KeyD']) wish.add(r);
      if (this.keys['KeyA']) wish.sub(r);
    }
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    // accelerate / decelerate
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, dt * 10);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, dt * 10);

    const step = this.vel.clone().multiplyScalar(dt);
    // axis-separated collision so we slide along walls
    this._tryMove(step.x, 0);
    this._tryMove(0, step.z);

    // plant boundary
    this.pos.x = Math.max(-150, Math.min(150, this.pos.x));
    this.pos.z = Math.max(-150, Math.min(150, this.pos.z));

    // head bob
    const moving = this.vel.length() > 0.5;
    if (moving) this.bobT += dt * (sprint ? 11 : 7.5);
    const bob = moving ? Math.sin(this.bobT) * 0.045 : 0;

    this.camera.position.set(this.pos.x, EYE + bob, this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
  }

  _tryMove(dx, dz) {
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    const R = 0.45;
    for (const b of this.colliders) {
      if (nx + R > b.min.x && nx - R < b.max.x && nz + R > b.min.z && nz - R < b.max.z) {
        return; // blocked
      }
    }
    this.pos.x = nx; this.pos.z = nz;
  }

  headingDeg() {
    let d = (-this.yaw * 180 / Math.PI) % 360;
    if (d < 0) d += 360;
    return d;
  }
}

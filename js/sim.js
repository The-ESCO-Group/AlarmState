// ============================================================================
// Process simulator — live values for every tag, with scenario fault overrides
// ============================================================================
import { TAGS, TAGMAP } from './data/tags.js';

export class ProcessSim {
  constructor() {
    this.values = {};
    this.history = {};       // tag -> [{t, v}]
    this.overrides = [];     // active scenario overrides
    this.roundT = 0;         // seconds since scenario start (-1 = no scenario)
    this.running = true;     // plant running (false after shutdown)
    this.histClock = 0;
    for (const t of TAGS) {
      this.values[t.tag] = t.base;
      this.history[t.tag] = [];
    }
  }

  get(tag) { return this.values[tag]; }
  meta(tag) { return TAGMAP[tag]; }

  fmt(tag) {
    const m = TAGMAP[tag];
    if (!m) return '???';
    const v = this.values[tag];
    if (m.kind === 'mtr' || m.kind === 'di') return v >= 0.5 ? '1' : '0';
    const dec = m.dec !== undefined ? m.dec : (Math.abs(m.base) < 10 ? 1 : (Math.abs(m.base) > 999 ? 0 : 1));
    return Number(v).toFixed(dec);
  }

  startScenario(overrides) {
    this.overrides = overrides.map(o => ({ ...o, fromVal: null }));
    this.roundT = 0;
  }

  clearScenario() {
    this.overrides = [];
    this.roundT = -1;
  }

  // Plant trip: motors stop, flows/pressures decay toward shutdown states
  shutdown() {
    this.running = false;
    for (const t of TAGS) {
      if (t.kind === 'mtr') this.values[t.tag] = 0;
    }
  }

  restart() {
    this.running = true;
    for (const t of TAGS) this.values[t.tag] = t.base;
    this.clearScenario();
  }

  tick(dt) {
    if (this.roundT >= 0) this.roundT += dt;

    for (const t of TAGS) {
      let v = this.values[t.tag];
      if (t.kind === 'mtr' || t.kind === 'di') {
        // discretes hold their value unless overridden below
      } else if (this.running) {
        // mean-reverting random walk around base
        const n = (t.noise || 0);
        v += (Math.random() - 0.5) * n * dt * 2.2;
        v += (t.base - v) * 0.02 * dt;
      } else {
        // plant down: analogs decay toward ambient/zero
        const rest = /^TT/.test(t.tag) ? Math.min(t.base, 80) : 0;
        v += (rest - v) * 0.05 * dt;
      }
      this.values[t.tag] = v;
    }

    // Apply scenario overrides (they win over the random walk)
    if (this.roundT >= 0 && this.running) {
      for (const o of this.overrides) {
        const m = TAGMAP[o.tag]; if (!m) continue;
        if (o.set !== undefined) {
          if (this.roundT >= (o.at || 0)) this.values[o.tag] = o.set;
          continue;
        }
        const start = o.start || 0;
        if (this.roundT < start) continue;
        if (o.fromVal === null) o.fromVal = this.values[o.tag];
        const f = Math.min(1, (this.roundT - start) / Math.max(1, o.dur || 60));
        // smoothstep ramp + optional jitter (for erratic instrument failures)
        const s = f * f * (3 - 2 * f);
        let target = o.fromVal + (o.to - o.fromVal) * s;
        if (o.jitter) target += (Math.random() - 0.5) * o.jitter * 2;
        this.values[o.tag] = target;
      }
    }

    // History @ 1 Hz, keep 10 min
    this.histClock += dt;
    if (this.histClock >= 1) {
      this.histClock = 0;
      const now = performance.now() / 1000;
      for (const t of TAGS) {
        const h = this.history[t.tag];
        h.push({ t: now, v: this.values[t.tag] });
        if (h.length > 600) h.shift();
      }
    }
  }
}

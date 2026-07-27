// ============================================================================
// Audio engine — synthesized plant ambience, alarm horns, steam, radio, voices
// ============================================================================

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.alarmGain = null;
    this.ambGain = null;
    this.fxGain = null;
    this.alarmTier = 0;       // 0 none, 1 warn, 2 crit, 3 shutdown
    this.alarmTimer = null;
    this.voicesOn = true;
    this.speaking = [];
    this.hissNodes = [];      // positional steam sources {gain, setVol}
    this.plantRunning = true;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);
      this.alarmGain = this.ctx.createGain(); this.alarmGain.gain.value = 0.0;
      this.alarmGain.connect(this.master);
      this.ambGain = this.ctx.createGain(); this.ambGain.gain.value = 0.0;
      this.ambGain.connect(this.master);
      this.fxGain = this.ctx.createGain(); this.fxGain.gain.value = 1.0;
      this.fxGain.connect(this.master);
      this._buildAmbient();
    } catch {
      this.ctx = null;
      this.master = null;
      this.alarmGain = null;
      this.ambGain = null;
      this.fxGain = null;
    }
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _noiseBuffer(seconds = 2) {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;   // brown-ish
      d[i] = last * 3.5;
    }
    return buf;
  }

  _buildAmbient() {
    // plant hum: filtered brown noise + 60Hz hum + 120Hz harmonic
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(4); noise.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    const ng = this.ctx.createGain(); ng.gain.value = 0.5;
    noise.connect(lp); lp.connect(ng); ng.connect(this.ambGain);
    noise.start();
    this.ambNoiseGain = ng;

    const hum = this.ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 60;
    const humF = this.ctx.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 130;
    const hg = this.ctx.createGain(); hg.gain.value = 0.045;
    hum.connect(humF); humF.connect(hg); hg.connect(this.ambGain);
    hum.start();
    this.ambHumGain = hg;

    this.ambGain.gain.setTargetAtTime(0.55, this.ctx.currentTime, 1.5);
  }

  setPlantRunning(run) {
    this.plantRunning = run;
    if (!this.ctx) return;
    const target = run ? 0.55 : 0.06;
    this.ambGain.gain.setTargetAtTime(target, this.ctx.currentTime, run ? 2.5 : 4.0);
  }

  // ---------- positional steam/leak hiss; caller updates volume by distance ----------
  addHiss(color = 8000) {
    if (!this.ctx) return { setVol() {}, stop() {} };
    const src = this.ctx.createBufferSource();
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    src.buffer = buf; src.loop = true;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = color; bp.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(bp); bp.connect(g); g.connect(this.fxGain);
    src.start();
    const node = {
      setVol: (v) => g.gain.setTargetAtTime(Math.min(0.9, v), this.ctx.currentTime, 0.15),
      stop: () => { try { g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); setTimeout(() => src.stop(), 1200); } catch {} },
    };
    this.hissNodes.push(node);
    return node;
  }

  stopAllHiss() { for (const n of this.hissNodes) n.stop(); this.hissNodes = []; }

  // ---------- alarm horns ----------
  setAlarmTier(tier) {
    if (!this.ctx) return;
    if (tier === this.alarmTier) return;
    this.alarmTier = tier;
    if (this.alarmTimer) { clearInterval(this.alarmTimer); this.alarmTimer = null; }
    if (tier === 0) { this.alarmGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); return; }
    this.alarmGain.gain.setTargetAtTime(0.32, this.ctx.currentTime, 0.1);

    const beep = (freq, dur, type = 'square', vol = 1) => {
      const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5 * vol, t + 0.015);
      g.gain.setValueAtTime(0.5 * vol, t + dur - 0.03);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(this.alarmGain);
      o.start(t); o.stop(t + dur + 0.05);
    };

    if (tier === 1) {
      // slow warning chirp
      const fire = () => beep(880, 0.22);
      fire();
      this.alarmTimer = setInterval(fire, 1600);
    } else if (tier === 2) {
      // fast two-tone critical
      let hi = true;
      const fire = () => { beep(hi ? 950 : 700, 0.18); hi = !hi; };
      fire();
      this.alarmTimer = setInterval(fire, 380);
    } else if (tier === 3) {
      // shutdown klaxon: long descending blasts
      const fire = () => {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        const t = this.ctx.currentTime;
        o.frequency.setValueAtTime(420, t);
        o.frequency.linearRampToValueAtTime(260, t + 1.4);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5, t + 0.05);
        g.gain.setValueAtTime(0.5, t + 1.2);
        g.gain.linearRampToValueAtTime(0, t + 1.5);
        o.connect(g); g.connect(this.alarmGain);
        o.start(t); o.stop(t + 1.6);
      };
      fire();
      this.alarmTimer = setInterval(fire, 2100);
    }
  }

  // ---------- one-shots ----------
  uiClick() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1400;
    const g = this.ctx.createGain(); const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(this.fxGain); o.start(t); o.stop(t + 0.08);
  }

  radioSquelch(open = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    const len = this.ctx.sampleRate * 0.12;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.2;
    const g = this.ctx.createGain(); g.gain.value = open ? 0.22 : 0.16;
    src.connect(bp); bp.connect(g); g.connect(this.fxGain);
    src.start(t);
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = open ? 1800 : 1200;
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.1, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(og); og.connect(this.fxGain); o.start(t); o.stop(t + 0.09);
  }

  good() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.09);
      g.gain.linearRampToValueAtTime(0.22, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.35);
      o.connect(g); g.connect(this.fxGain); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.4);
    });
  }

  bad() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [330, 262].forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.16);
      g.gain.linearRampToValueAtTime(0.2, t + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.16 + 0.3);
      o.connect(g); g.connect(this.fxGain); o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.35);
    });
  }

  // ---------- NPC voice via speech synthesis ----------
  speak(text, voiceCfg) {
    if (!this.voicesOn || !('speechSynthesis' in window)) return;
    // strip stage directions and tame ALL CAPS yelling for the synth
    const clean = text.replace(/\*[^*]*\*/g, '');
    const u = new SpeechSynthesisUtterance(clean);
    u.pitch = voiceCfg?.pitch ?? 1;
    u.rate = (voiceCfg?.rate ?? 1) * 1.06;
    u.volume = 0.9;
    const vs = speechSynthesis.getVoices();
    if (vs.length) {
      // deterministic-ish voice pick per pitch so NPCs sound distinct
      const idx = Math.floor(((voiceCfg?.pitch ?? 1) * 7 + (voiceCfg?.rate ?? 1) * 13) * 10) % vs.length;
      u.voice = vs[idx];
    }
    speechSynthesis.speak(u);
  }

  stopSpeech() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
}

export const audio = new AudioEngine();

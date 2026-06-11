// ============================================================================
// Radio — channels, contextual questions, NPC responses with attitude
// ============================================================================
import { NPCS, CHANNELS, FIELD_NPC_BY_AREA, QUESTIONS, FALLBACKS } from './data/scenarios.js';
import { audio } from './audio.js';

export class Radio {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('radio');
    this.logEl = document.getElementById('radio-log');
    this.chanEl = document.getElementById('radio-channels');
    this.qEl = document.getElementById('radio-questions');
    this.subEl = document.getElementById('hud-subtitles');
    this.open = false;
    this.selectedChan = 'ctrl';
    this.asked = new Set();      // `${scenarioId}:${chan}:${q}` — one ask per round
    this.pendingTimeouts = [];
    this.subTimeout = null;
  }

  openOverlay() {
    this.open = true;
    this.el.classList.remove('hidden');
    this.renderAsk();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
  closeOverlay() { this.open = false; this.el.classList.add('hidden'); }

  fieldNpcId() {
    const sc = this.game.activeScenario;
    return FIELD_NPC_BY_AREA[sc ? sc.area : 'EXTRACTION'] || 'dale';
  }

  resolveNpc(chanId) {
    const ch = CHANNELS.find(c => c.id === chanId);
    return chanId === 'field' ? this.fieldNpcId() : ch.npc;
  }

  renderAsk() {
    this.chanEl.innerHTML = '';
    for (const ch of CHANNELS) {
      const npcId = this.resolveNpc(ch.id);
      const npc = NPCS[npcId];
      const b = document.createElement('button');
      b.className = 'radio-chan' + (this.selectedChan === ch.id ? ' sel' : '');
      b.textContent = `${ch.label} — ${npc.name}`;
      b.addEventListener('click', () => { this.selectedChan = ch.id; audio.uiClick(); this.renderAsk(); });
      this.chanEl.appendChild(b);
    }
    this.qEl.innerHTML = '';
    const sc = this.game.activeScenario;
    for (const q of QUESTIONS) {
      const key = `${sc ? sc.id : 'idle'}:${this.selectedChan}:${q.id}`;
      const b = document.createElement('button');
      b.className = 'radio-q';
      b.textContent = q.text;
      b.disabled = this.asked.has(key);
      b.addEventListener('click', () => this.ask(q, key));
      this.qEl.appendChild(b);
    }
  }

  ask(q, key) {
    this.asked.add(key);
    this.renderAsk();
    audio.radioSquelch(true);
    this.addLog('me', 'You', q.text);

    const chanId = this.selectedChan;
    const npcId = this.resolveNpc(chanId);
    const npc = NPCS[npcId];
    const sc = this.game.activeScenario;
    const diff = this.game.difficulty;

    // find the scenario's scripted answer for this channel+question
    let entry = sc ? sc.radio.qa?.[chanId]?.[q.id] : null;
    let text;
    if (!sc) {
      text = chanId === 'sup'
        ? 'There is NO alarm right now. Which means you have time to do those calibration sheets you owe me. Get off the radio.'
        : FALLBACKS[npcId];
    } else if (entry) {
      text = entry.text;
      // on hard, the field op may sandbag a gauge-check once instead of answering
      if (diff === 'hard' && chanId === 'field' && q.id === 'q_gauge' && !this._sandbagged) {
        this._sandbagged = true;
        text = npcId === 'dale'
          ? 'You want ME to climb out there and read a gauge so YOU can take credit? ...Fine. Gimme a minute. Ask me again.'
          : 'Hold on, I gotta find my flashlight... ask me again in a minute, sorry!';
        this.asked.delete(key);   // let them re-ask
        setTimeout(() => this.renderAsk(), 400);
      }
    } else {
      text = FALLBACKS[npcId];
    }

    // response after a realistic radio delay
    const delay = 1200 + Math.random() * 1800;
    const to = setTimeout(() => {
      audio.radioSquelch(false);
      this.say(npcId, text);
    }, delay);
    this.pendingTimeouts.push(to);
  }

  // any inbound transmission (scripted chatter or Q&A answer)
  say(npcId, text) {
    const npc = NPCS[npcId];
    audio.radioSquelch(false);
    this.addLog('them', `${npc.name} (${npc.role})`, text, npc.color);
    this.subtitle(npc, text);
    audio.speak(text, npc.voice);
  }

  addLog(side, who, text, color) {
    const d = document.createElement('div');
    d.className = `rl-line rl-${side}`;
    d.innerHTML = `<span class="rl-who" ${color ? `style="color:${color}"` : ''}>${who}:</span> ${text}`;
    this.logEl.appendChild(d);
    while (this.logEl.children.length > 80) this.logEl.removeChild(this.logEl.firstChild);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  sysLog(text) {
    const d = document.createElement('div');
    d.className = 'rl-line rl-sys';
    d.textContent = `— ${text} —`;
    this.logEl.appendChild(d);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  subtitle(npc, text) {
    const line = document.createElement('div');
    line.className = 'sub-line sub-radio';
    line.innerHTML = `<span class="sub-name">📻 ${npc.name}:</span> ${text}`;
    this.subEl.appendChild(line);
    while (this.subEl.children.length > 3) this.subEl.removeChild(this.subEl.firstChild);
    clearTimeout(this.subTimeout);
    this.subTimeout = setTimeout(() => { this.subEl.innerHTML = ''; }, Math.max(5000, text.length * 65));
  }

  resetRound() {
    this._sandbagged = false;
    for (const t of this.pendingTimeouts) clearTimeout(t);
    this.pendingTimeouts = [];
  }
}

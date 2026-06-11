// ============================================================================
// Game director — round state machine, alarm tiers, scoring, radio scripting
// ============================================================================
import { SCENARIOS, NPCS, WRONG_GUESS_LINES, SHUTDOWN_LINES, WIN_LINES } from './data/scenarios.js';
import { normTag } from './data/tags.js';
import { audio } from './audio.js';

const TIER_SECONDS = 120;          // per spec: each tier lasts 2 minutes
const DIFF_MULT = { easy: 1, normal: 1.5, hard: 2 };
const IDLE_LINES = [
  ['marcy', 'Quiet shift so far. I don’t trust it.'],
  ['pete',  'Anybody want anything from the vending machine? It took my dollar again but I believe in second chances.'],
  ['goose', 'You ever notice they never let US pick the radio station in the control room? Think about it.'],
  ['dale',  'Whoever keeps parkin’ the scissor lift in front of my lockers is gonna find it in the dike.'],
  ['rhonda','Deodorizer smells like french fries again. I will not be taking questions.'],
];

export class Game {
  constructor(sim, effects, radio) {
    this.sim = sim;
    this.effects = effects;
    this.radio = radio;

    this.state = 'menu';        // menu | idle | active | resolved | gameover
    this.difficulty = 'normal';
    this.score = 0;
    this.streak = 0;
    this.strikes = 0;
    this.roundsSolved = 0;
    this.shiftT = 0;
    this.roundT = 0;
    this.tier = 0;              // 0 none, 1 warn, 2 crit, 3 shutdown
    this.activeScenario = null;
    this.alarmAcked = false;
    this.wrongGuesses = 0;
    this.alarmStartWall = null;
    this.pool = [];
    this.idleTimer = 0;
    this.nextIdleChatter = 20 + Math.random() * 30;
    this.chatterQueue = [];     // [{at, who, text}]
    this.onRoundEnd = null;     // callback(resultHTML, isGameOver)
    this.onToast = null;
  }

  startShift(difficulty) {
    this.difficulty = difficulty;
    this.state = 'idle';
    this.score = 0; this.streak = 0; this.strikes = 0; this.roundsSolved = 0;
    this.shiftT = 0;
    this.pool = [];
    this.idleTimer = 0;
    this.scheduleNextRound(8 + Math.random() * 10);
    this.radio.sysLog(`Shift start — ${difficulty.toUpperCase()} — radio check OK`);
    this.radio.say('frank', this.difficulty === 'easy'
      ? 'Alright tech, day shift. Crew’s in a good mood, plant’s humming. Don’t ruin it.'
      : this.difficulty === 'hard'
        ? 'Graveyard shift. Skeleton crew, half of ’em useless, the other half asleep. Anything breaks, it’s on YOU. No pressure.'
        : 'Swing shift. I want quick answers and quiet radios. Don’t make me come find you.');
  }

  scheduleNextRound(delay) {
    this.nextRoundIn = delay;
  }

  pickScenario() {
    if (this.pool.length === 0) this.pool = [...SCENARIOS].sort(() => Math.random() - 0.5);
    return this.pool.pop();
  }

  startRound() {
    const sc = this.pickScenario();
    this.activeScenario = sc;
    this.state = 'active';
    this.roundT = 0;
    this.tier = 1;
    this.alarmAcked = false;
    this.wrongGuesses = 0;
    this.alarmStartWall = new Date();
    this.radio.resetRound();

    this.sim.startScenario(sc.overrides);
    this.effects.startScenarioEffects(sc.effects);
    this.effects.setBeacon(sc.area, 1);
    audio.setAlarmTier(1);

    // queue scripted chatter, filtered by difficulty
    this.chatterQueue = (sc.radio.auto || []).filter(c => {
      if (this.difficulty === 'easy' && (c.lie || c.notEasy)) return false;
      return true;
    }).map(c => ({ ...c }));

    this.radio.sysLog(`⚠ ALARM ${sc.alarm.name} — ${sc.alarm.text}`);
    this.toast(`⚠ WARNING — ${sc.alarm.name}: ${sc.alarm.text}`);
    document.getElementById('hud-objective').innerHTML =
      `<b>ACTIVE ALARM:</b> ${sc.alarm.name} ${sc.alarm.text}<br>` +
      `Find the root-cause I/O point and submit it (ENTER). HMI and ladder have auto-navigated to the affected system.`;
  }

  toast(msg) { if (this.onToast) this.onToast(msg); }

  // ------------------------------------------------------------------ tick
  tick(dt) {
    if (this.state === 'menu' || this.state === 'gameover') return;
    this.shiftT += dt;

    if (this.state === 'idle') {
      this.nextRoundIn -= dt;
      this.idleTimer += dt;
      if (this.idleTimer > this.nextIdleChatter) {
        this.idleTimer = 0;
        this.nextIdleChatter = 35 + Math.random() * 50;
        const [who, text] = IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)];
        this.radio.say(who, text);
      }
      if (this.nextRoundIn <= 0) this.startRound();
      return;
    }

    if (this.state !== 'active') return;
    this.roundT += dt;

    // scripted radio chatter
    for (const c of this.chatterQueue) {
      if (!c.sent && this.roundT >= c.at) {
        c.sent = true;
        this.radio.say(c.who, c.text);
      }
    }

    // tier escalation
    if (this.tier === 1 && this.roundT >= TIER_SECONDS) {
      this.tier = 2;
      audio.setAlarmTier(2);
      this.effects.setBeacon(this.activeScenario.area, 2);
      this.alarmAcked = false;
      this.toast(`🔴 CRITICAL — ${this.activeScenario.alarm.name} escalated. ~2 minutes to plant shutdown.`);
      this.radio.say('marcy', `Critical alarm on ${this.activeScenario.alarm.name}. Interlock timers are armed. We are minutes from a unit trip, tech.`);
    } else if (this.tier === 2 && this.roundT >= TIER_SECONDS * 2) {
      this.tier = 3;
      this.doShutdown();
    } else if (this.tier === 3 && this.roundT >= TIER_SECONDS * 3) {
      this.failRound();
    }
  }

  doShutdown() {
    audio.setAlarmTier(3);
    this.effects.setBeacon(this.activeScenario.area, 3);
    this.sim.shutdown();
    audio.setPlantRunning(false);
    this.effects.setPlantRunning(false);
    this.strikes += 1;
    this.streak = 0;
    this.alarmAcked = false;
    const line = SHUTDOWN_LINES[Math.min(this.strikes - 1, SHUTDOWN_LINES.length - 1)];
    this.radio.say('frank', line);
    this.toast('⬛ PLANT SHUTDOWN — strike ' + this.strikes + ' of 3. You can still identify the cause for partial credit.');
    if (this.strikes >= 3) {
      // shutdown #3 still gives the 2-minute grace to answer; game over happens on fail
    }
  }

  // ------------------------------------------------------------------ answers
  submitAnswer(raw) {
    if (this.state !== 'active' || !this.activeScenario) {
      return { ok: false, msg: 'No active alarm. The plant is (briefly) fine.' };
    }
    const guess = normTag(raw);
    if (!guess) return { ok: false, msg: 'Enter a tagname, e.g. TT-2210.' };
    const sc = this.activeScenario;
    const accepted = sc.accept.map(normTag);
    if (accepted.includes(guess)) {
      this.winRound();
      return { ok: true, msg: 'CONFIRMED — root cause identified!' };
    }
    this.wrongGuesses += 1;
    this.score = Math.max(0, this.score - 100);
    audio.bad();
    const line = WRONG_GUESS_LINES[Math.min(this.wrongGuesses - 1, WRONG_GUESS_LINES.length - 1)];
    this.radio.say('frank', line);
    return { ok: false, msg: `WRONG — ${raw.toUpperCase().trim()} is not the cause. −100 pts.` };
  }

  _scoreFor() {
    const remainInTier = Math.max(0, TIER_SECONDS - (this.roundT % TIER_SECONDS));
    let base = 0, label = '';
    if (this.tier === 1) { base = 1000 + Math.round(remainInTier * 5); label = 'Solved in WARNING'; }
    else if (this.tier === 2) { base = 600 + Math.round(remainInTier * 3); label = 'Solved in CRITICAL'; }
    else { base = 200; label = 'Identified after SHUTDOWN'; }
    const mult = DIFF_MULT[this.difficulty];
    const streakBonus = Math.min(0.5, this.streak * 0.1);
    const total = Math.round(base * mult * (1 + streakBonus));
    return { base, mult, streakBonus, total, label };
  }

  winRound() {
    const sc = this.activeScenario;
    const s = this._scoreFor();
    const solvedTier = this.tier;
    this.score += s.total;
    if (solvedTier < 3) { this.roundsSolved += 1; this.streak += 1; }
    else { this.roundsSolved += 1; }   // streak already reset at shutdown
    audio.good();
    const lines = WIN_LINES[solvedTier] || WIN_LINES[2];
    this.radio.say('frank', lines[Math.floor(Math.random() * lines.length)]);

    const html = `
      <div class="res-big win">ROOT CAUSE CONFIRMED</div>
      <table>
        <tr><td>Failed I/O point</td><td>${sc.answer}</td></tr>
        <tr><td>${s.label}</td><td>+${s.base}</td></tr>
        <tr><td>Difficulty ×${s.mult}</td><td></td></tr>
        <tr><td>Streak bonus +${Math.round(s.streakBonus * 100)}%</td><td></td></tr>
        <tr><td>Wrong guesses</td><td>−${this.wrongGuesses * 100}</td></tr>
        <tr><td><b>Round total</b></td><td><b>+${s.total}</b></td></tr>
        <tr><td><b>Shift score</b></td><td><b>${this.score}</b></td></tr>
      </table>
      <div class="res-debrief"><b>What happened:</b> ${sc.explain}</div>`;
    this.endRound(html, false, solvedTier === 3);
  }

  failRound() {
    const sc = this.activeScenario;
    const gameOver = this.strikes >= 3;
    const html = `
      <div class="res-big fail">ROUND LOST — CAUSE NOT FOUND</div>
      <table>
        <tr><td>The failed I/O point was</td><td>${sc.answer}</td></tr>
        <tr><td>Strikes</td><td>${this.strikes} / 3</td></tr>
        <tr><td>Shift score</td><td>${this.score}</td></tr>
      </table>
      <div class="res-debrief"><b>What happened:</b> ${sc.explain}</div>`;
    this.endRound(html, gameOver, true);
  }

  endRound(html, gameOver, wasShutdown) {
    this.state = 'resolved';
    this.tier = 0;
    audio.setAlarmTier(0);
    this.effects.setBeacon(null, 0);
    this.effects.stopScenarioEffects();
    this.activeScenario = null;
    this.sim.clearScenario();
    document.getElementById('hud-objective').innerHTML = '';

    if (wasShutdown || !this.sim.running) {
      // restart the plant for the next round
      setTimeout(() => {
        this.sim.restart();
        audio.setPlantRunning(true);
        this.effects.setPlantRunning(true);
        this.radio.sysLog('Plant restart sequence complete — all units back online');
      }, 4000);
    }

    if (gameOver) {
      this.state = 'gameover';
      const hs = this.updateHighScore();
      const goHtml = html + `
        <div class="res-debrief"><b>SHIFT TERMINATED — 3 STRIKES.</b> Corporate pulled the plug.
        Rounds solved: ${this.roundsSolved} · Final score: <b>${this.score}</b>
        ${hs.isNew ? ' · 🏆 <b>NEW HIGH SCORE!</b>' : ` · Best (${this.difficulty}): ${hs.best}`}</div>`;
      if (this.onRoundEnd) this.onRoundEnd(goHtml, true);
      return;
    }
    this.updateHighScore();
    if (this.onRoundEnd) this.onRoundEnd(html, false);
  }

  // called by UI continue button
  continueShift() {
    if (this.state === 'gameover') return;
    this.state = 'idle';
    this.scheduleNextRound(15 + Math.random() * 25);
  }

  updateHighScore() {
    const key = `pgp_highscore_${this.difficulty}`;
    const best = Number(localStorage.getItem(key) || 0);
    const isNew = this.score > best;
    if (isNew) localStorage.setItem(key, String(this.score));
    return { best: Math.max(best, this.score), isNew };
  }

  ackAlarm() {
    this.alarmAcked = true;
    audio.uiClick();
  }

  // rows for the HMI alarm banner / summary
  alarmRows() {
    const rows = [];
    const sc = this.activeScenario;
    if (sc && this.tier > 0) {
      const t = this.alarmStartWall.toTimeString().slice(0, 8);
      const cls = this.tier === 1 ? 'warn' : (this.tier === 2 ? 'crit' : 'shut');
      const state = this.tier === 1 ? 'IN ALM' : this.tier === 2 ? 'CRITICAL' : 'SHUTDOWN';
      rows.push({
        time: t, tag: sc.alarm.tag, name: sc.alarm.name, text: sc.alarm.text,
        desc: sc.alarm.text, cls, state, acked: this.alarmAcked,
      });
      if (this.tier >= 3) {
        rows.push({ time: '—', tag: 'PLANT', name: 'TRIP', text: 'MASTER FUEL / UNIT TRIP — PLANT SHUTDOWN', desc: 'Unit interlock trip', cls: 'shut', state: 'TRIPPED', acked: true });
      }
    }
    return rows;
  }

  tierTimeLeft() {
    if (this.state !== 'active') return 0;
    return Math.max(0, TIER_SECONDS * this.tier - this.roundT);
  }
}

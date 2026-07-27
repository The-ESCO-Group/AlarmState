// ============================================================================
// Game director — round state machine, alarm tiers, scoring, radio scripting
// ============================================================================
import { SCENARIOS, NPCS, WRONG_GUESS_LINES, SHUTDOWN_LINES, WIN_LINES } from './data/scenarios.js?v=20260716a';
import { normTag } from './data/tags.js';
import { audio } from './audio.js?v=20260715d';

const TIER_SECONDS = { easy: 95, normal: 75, hard: 55 };
const DIFF_MULT = { easy: 1, normal: 1.5, hard: 2 };
const IDLE_LINES = [
  ['marcy', 'Control room is holding steady. Use the silence to get ahead. It will not last.'],
  ['dale',  'Extraction is already behind rate. If your controls add one more delay, you own the number.'],
  ['rhonda','Refinery is on specification by inches. Nobody touches a loop without evidence.'],
  ['frank', 'If you are waiting for an alarm before opening the trends, you are already late.'],
  ['voss',  'Every idle minute is paid preparation time. I expect the next response to be immediate.'],
];

const MANAGER_PRESSURE_LINES = {
  1: [
    ['frank', 'The warning clock is running. I want the failed point, the evidence, and no unsupported guess. Move.'],
    ['voss', 'Ryder, this unit is losing rate while you investigate. You have one job: isolate the first failed point before escalation.'],
    ['frank', 'Do not narrate the problem to me. Compare command, feedback, and process response, then submit the tag.'],
  ],
  2: [
    ['voss', 'Critical means your troubleshooting window is almost gone. If the interlock acts first, the shutdown belongs to your record.'],
    ['frank', 'The panel is filling and production is watching. Stop circling the symptom and find the initiating failure now.'],
    ['voss', 'I do not need another update. I need one defensible I/O point before this unit trips.'],
  ],
  3: [
    ['voss', 'The plant is down. Your remaining time is for the incident record, not redemption. Identify the failed point.'],
    ['frank', 'Production is stopped and the restart meeting has already started. Give me the cause before the grace clock expires.'],
    ['voss', 'You missed containment. Do not miss the cause. One tag, backed by evidence, now.'],
  ],
};

const CONTAINMENT_PRESSURE_LINES = [
  ['voss', 'LEL is rising. Nobody enters the hot zone. Isolate from the safe side and prove the initiating failure. One shortcut ends your qualification.'],
  ['frank', 'Do not trade personnel safety for rate. Use the HMI, containment evidence, and field reports from outside the boundary.'],
  ['voss', 'The extraction boundary stays controlled. Give me the failed containment point without exposing another person.'],
];

export class Game {
  constructor(sim, effects, radio) {
    this.sim = sim;
    this.effects = effects;
    this.radio = radio;

    this.state = 'menu';        // menu | campaign | idle | active | resolved | gameover
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
    this.onScenarioSolved = null;
    this.scenarioFilter = null;
    this.courseMissionId = null;
    this.lastRoundPassed = null;
    this.managerPressureIndex = 0;
    this.nextManagerPressure = 24;
    this.multiplayer = false;
    this.multiplayerPhase = null;
    this._multiplayerLiveScenario = null;
  }

  enterMultiplayer() {
    this.multiplayer = true;
    this.multiplayerPhase = 'lobby';
    this.state = 'multiplayer';
    this.score = 0;
    this.streak = 0;
    this.strikes = 0;
    this.roundsSolved = 0;
    this.shiftT = 0;
    this.roundT = 0;
    this.tier = 0;
    this.activeScenario = null;
    this._multiplayerLiveScenario = null;
    audio.setAlarmTier(0);
    this.effects.setBeacon(null, 0);
    this.effects.stopScenarioEffects();
    this.sim.clearScenario();
  }

  leaveMultiplayer() {
    this.multiplayer = false;
    this.multiplayerPhase = null;
    this._multiplayerLiveScenario = null;
    this.enterCampaign(false);
  }

  applyMultiplayerState(snapshot) {
    if (!this.multiplayer) this.enterMultiplayer();
    const scenario = SCENARIOS.find((entry) => entry.id === snapshot.scenarioId) || null;
    const previousTier = this.tier;
    this.multiplayerPhase = snapshot.phase;
    this.score = snapshot.score;
    this.strikes = snapshot.strikes;
    this.roundsSolved = snapshot.roundsSolved;
    this.shiftT = snapshot.shiftElapsed || 0;
    this.roundT = snapshot.elapsed || 0;
    this.tier = snapshot.tier || 0;
    this._multiplayerTierLeft = snapshot.tierLeft || 0;
    this.alarmAcked = !!snapshot.alarmAcked;
    this.activeScenario = snapshot.phase === 'active' ? scenario : null;
    this.state = snapshot.phase === 'active' ? 'active' : snapshot.phase === 'gameover' ? 'gameover' : 'multiplayer';

    if (snapshot.phase === 'active' && scenario && this._multiplayerLiveScenario !== scenario.id) {
      this._multiplayerLiveScenario = scenario.id;
      this.alarmStartWall = new Date();
      this.sim.startScenario(scenario.overrides);
      this.effects.startScenarioEffects(scenario.effects);
      this.effects.setBeacon(scenario.area, 1);
      this.radio.resetRound();
      this.radio.sysLog(`CREW ALARM ${scenario.alarm.name} - ${scenario.alarm.text}`);
    }
    if (snapshot.phase === 'active' && scenario && previousTier !== this.tier) {
      audio.setAlarmTier(this.tier);
      this.effects.setBeacon(scenario.area, this.tier);
      if (this.tier >= 3) {
        this.sim.shutdown();
        audio.setPlantRunning(false);
        this.effects.setPlantRunning(false);
      }
    }
    if (snapshot.phase !== 'active' && this._multiplayerLiveScenario) {
      audio.setAlarmTier(0);
      this.effects.setBeacon(null, 0);
      this.effects.stopScenarioEffects();
      this.sim.clearScenario();
      if (!this.sim.running) {
        this.sim.restart();
        audio.setPlantRunning(true);
        this.effects.setPlantRunning(true);
      }
      this._multiplayerLiveScenario = null;
    }
  }

  enterCampaign(resetClock = false) {
    this.state = 'campaign';
    this.tier = 0;
    this.activeScenario = null;
    this.scenarioFilter = null;
    this.courseMissionId = null;
    this.lastRoundPassed = null;
    if (resetClock) this.shiftT = 0;
    audio.setAlarmTier(0);
    this.effects.setBeacon(null, 0);
    this.effects.stopScenarioEffects();
    this.sim.clearScenario();
  }

  startShift(difficulty, options = {}) {
    this.difficulty = difficulty;
    this.scenarioFilter = Array.isArray(options.scenarioIds) ? [...options.scenarioIds] : null;
    this.courseMissionId = options.courseMissionId || null;
    this.lastRoundPassed = null;
    this.state = 'idle';
    this.score = 0; this.streak = 0; this.strikes = 0; this.roundsSolved = 0;
    this.shiftT = 0;
    this.pool = [];
    this.idleTimer = 0;
    this.scheduleNextRound(this.courseMissionId ? 2.5 : 8 + Math.random() * 10);
    this.radio.sysLog(`Shift start — ${difficulty.toUpperCase()} — radio check OK`);
    if (!this.courseMissionId) {
      this.radio.say('frank', this.difficulty === 'easy'
        ? 'Day shift. Full staffing means there is no excuse for a slow diagnosis. Keep the plant online.'
        : this.difficulty === 'hard'
          ? 'Graveyard. Skeleton crew, no senior backup, and no tolerance for a shutdown. Every failure is yours until proven otherwise.'
          : 'Swing shift. Production is behind plan. I want fast evidence, one root cause, and no wasted radio traffic.');
    }
  }

  scheduleNextRound(delay) {
    this.nextRoundIn = delay;
  }

  pickScenario() {
    if (this.pool.length === 0) {
      const allowed = this.scenarioFilter?.length
        ? SCENARIOS.filter((scenario) => this.scenarioFilter.includes(scenario.id))
        : SCENARIOS;
      this.pool = [...(allowed.length ? allowed : SCENARIOS)].sort(() => Math.random() - 0.5);
    }
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
    this.lastRoundPassed = null;
    this.managerPressureIndex = 0;
    this.nextManagerPressure = 24;
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
  }

  toast(msg) { if (this.onToast) this.onToast(msg); }

  // ------------------------------------------------------------------ tick
  tick(dt) {
    if (this.multiplayer) return;
    if (this.state === 'menu' || this.state === 'gameover') return;
    this.shiftT += dt;

    if (this.state === 'campaign') return;

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

    if (this.roundT >= this.nextManagerPressure) {
      const pressureLines = this.activeScenario?.id === 'EXT_HEXANE_LEL'
        ? CONTAINMENT_PRESSURE_LINES
        : MANAGER_PRESSURE_LINES[this.tier] || MANAGER_PRESSURE_LINES[2];
      const [who, text] = pressureLines[this.managerPressureIndex % pressureLines.length];
      this.managerPressureIndex += 1;
      this.nextManagerPressure += this.tier === 1 ? 30 : this.tier === 2 ? 23 : 20;
      this.radio.say(who, text);
    }

    // tier escalation
    const tierSeconds = this.tierSeconds();
    if (this.tier === 1 && this.roundT >= tierSeconds) {
      this.tier = 2;
      audio.setAlarmTier(2);
      this.effects.setBeacon(this.activeScenario.area, 2);
      this.alarmAcked = false;
      this.toast(`CRITICAL - ${this.activeScenario.alarm.name} escalated. ${tierSeconds} seconds to plant shutdown.`);
      this.radio.say('voss', this.activeScenario.id === 'EXT_HEXANE_LEL'
        ? `Critical combustible-gas alarm on ${this.activeScenario.alarm.name}. Keep personnel outside the boundary, isolate safely, and identify the containment failure.`
        : `Critical alarm on ${this.activeScenario.alarm.name}. The interlock clock is armed. Ryder, prevent the trip or report why you could not.`);
    } else if (this.tier === 2 && this.roundT >= tierSeconds * 2) {
      this.tier = 3;
      this.doShutdown();
    } else if (this.tier === 3 && this.roundT >= tierSeconds * 3) {
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
    this.toast('PLANT SHUTDOWN - STRIKE ' + this.strikes + ' OF 3. INCIDENT CAUSE STILL REQUIRED.');
    if (this.strikes >= 3) {
      // shutdown #3 still gives the 2-minute grace to answer; game over happens on fail
    }
  }

  // ------------------------------------------------------------------ answers
  submitAnswer(raw) {
    if (this.state !== 'active' || !this.activeScenario) {
      return { ok: false, msg: 'No active alarm. Stop guessing and wait for an assigned call.' };
    }
    const guess = normTag(raw);
    if (!guess) return { ok: false, msg: 'Enter a tagname, e.g. TT-2210.' };
    const sc = this.activeScenario;
    const accepted = sc.accept.map(normTag);
    if (accepted.includes(guess)) {
      this.winRound();
      return { ok: true, msg: 'ROOT CAUSE CONFIRMED - MINIMUM STANDARD MET.' };
    }
    this.wrongGuesses += 1;
    this.score = Math.max(0, this.score - 100);
    audio.bad();
    const line = WRONG_GUESS_LINES[Math.min(this.wrongGuesses - 1, WRONG_GUESS_LINES.length - 1)];
    this.radio.say('frank', line);
    return { ok: false, msg: `WRONG — ${raw.toUpperCase().trim()} is not the cause. −100 pts.` };
  }

  _scoreFor() {
    const tierSeconds = this.tierSeconds();
    const remainInTier = Math.max(0, tierSeconds - (this.roundT % tierSeconds));
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
    this.lastRoundPassed = true;
    if (this.onScenarioSolved) this.onScenarioSolved(sc, s.total, solvedTier);

    const html = `
      <div class="res-big win">CAUSE ACCEPTED - DELAY RECORDED</div>
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
    this.lastRoundPassed = false;
    const gameOver = this.strikes >= 3;
    const html = `
      <div class="res-big fail">RESPONSE FAILED - CAUSE NOT FOUND</div>
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
        ${hs.isNew ? ' · <b>NEW HIGH SCORE RECORDED</b>' : ` · Best (${this.difficulty}): ${hs.best}`}</div>`;
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
    this.scheduleNextRound(this.courseMissionId ? 5 : 15 + Math.random() * 25);
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
    if (this.multiplayer && Number.isFinite(this._multiplayerTierLeft)) return this._multiplayerTierLeft;
    return Math.max(0, this.tierSeconds() * this.tier - this.roundT);
  }

  tierSeconds() { return TIER_SECONDS[this.difficulty] || TIER_SECONDS.normal; }
}

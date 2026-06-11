// ============================================================================
// ALARM STATE — main bootstrap: scene, loop, UI wiring, overlay management
// ============================================================================
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { ProcessSim } from './sim.js';
import { EffectsManager } from './effects.js';
import { audio } from './audio.js';
import { Game } from './game.js';
import { HMI } from './hmi.js';
import { LadderViewer } from './ladder.js';
import { Radio } from './radio.js';

// ---------------- three.js setup ----------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 500);

const world = buildWorld(scene);
const player = new Player(camera, renderer.domElement);
player.setColliders(world.colliders);

const sim = new ProcessSim();
const effects = new EffectsManager(scene, world);

const game = new Game(sim, effects, null);
const radio = new Radio(game);
game.radio = radio;

const hmi = new HMI(sim, game);
const ladder = new LadderViewer(sim, game);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------- overlay management ----------------
const OVERLAYS = ['menu', 'howto', 'hmi', 'ladder', 'radio', 'solve', 'map', 'result', 'pause'];
let currentOverlay = 'menu';
let playing = false;

function showEl(id, show) { document.getElementById(id).classList.toggle('hidden', !show); }

function openOverlay(name) {
  if (currentOverlay && currentOverlay !== name) closeOverlay(false);
  currentOverlay = name;
  player.enabled = false;
  player.unlock();
  if (name === 'hmi') hmi.openOverlay();
  else if (name === 'ladder') ladder.openOverlay();
  else if (name === 'radio') radio.openOverlay();
  else showEl(name, true);
}

function closeOverlay(relock = true) {
  if (!currentOverlay) return;
  if (currentOverlay === 'hmi') hmi.closeOverlay();
  else if (currentOverlay === 'ladder') ladder.closeOverlay();
  else if (currentOverlay === 'radio') radio.closeOverlay();
  else showEl(currentOverlay, false);
  currentOverlay = null;
  if (playing && relock) {
    player.enabled = true;
    player.lock();
  }
}

document.querySelectorAll('[data-close]').forEach(b =>
  b.addEventListener('click', () => { audio.uiClick(); closeOverlay(); }));

player.onLockChange = (locked) => {
  if (!locked && playing && !currentOverlay) {
    // user pressed Esc in-game → pause
    openOverlay('pause');
  }
};

// ---------------- menu ----------------
let difficulty = 'normal';
document.querySelectorAll('.diff-btn').forEach(b => {
  b.addEventListener('click', () => {
    difficulty = b.dataset.diff;
    document.querySelectorAll('.diff-btn').forEach(x => x.classList.toggle('selected', x === b));
    audio.uiClick();
  });
});

function refreshHighScores() {
  const rows = ['easy', 'normal', 'hard'].map(d => {
    const v = Number(localStorage.getItem(`pgp_highscore_${d}`) || 0);
    const name = { easy: 'DAY SHIFT', normal: 'SWING SHIFT', hard: 'GRAVEYARD' }[d];
    return `<div>${name.padEnd(12, ' ')} ${String(v).padStart(7, ' ')}</div>`;
  }).join('');
  document.getElementById('hs-rows').innerHTML = rows;
}
refreshHighScores();

document.getElementById('btn-start').addEventListener('click', () => {
  audio.init(); audio.resume(); audio.uiClick();
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  showEl('menu', false);
  currentOverlay = null;
  playing = true;
  showEl('hud', true);
  player.enabled = true;
  player.lock();
  game.startShift(difficulty);
});

document.getElementById('btn-howto').addEventListener('click', () => { showEl('howto', false); openOverlay('howto'); });
document.getElementById('btn-howto2').addEventListener('click', () => { closeOverlay(false); openOverlay('howto'); });
document.getElementById('btn-resume').addEventListener('click', () => closeOverlay());
document.getElementById('btn-quit').addEventListener('click', () => location.reload());
document.getElementById('voice-toggle').addEventListener('change', (e) => { audio.voicesOn = e.target.checked; if (!e.target.checked) audio.stopSpeech(); });

// ---------------- result overlay ----------------
game.onRoundEnd = (html, isGameOver) => {
  document.getElementById('result-title').textContent = isGameOver ? 'SHIFT OVER' : 'ROUND COMPLETE';
  document.getElementById('result-body').innerHTML = html;
  document.getElementById('result-continue').textContent = isGameOver ? 'BACK TO MENU' : 'CONTINUE SHIFT';
  refreshHighScores();
  openOverlay('result');
};
document.getElementById('result-continue').addEventListener('click', () => {
  audio.uiClick();
  if (game.state === 'gameover') { location.reload(); return; }
  closeOverlay();
  game.continueShift();
});

// ---------------- toast ----------------
let toastTimer = null;
game.onToast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 6000);
};

// ---------------- solve ----------------
const solveInput = document.getElementById('solve-input');
const solveFeedback = document.getElementById('solve-feedback');
function openSolve() {
  openOverlay('solve');
  solveFeedback.textContent = '';
  solveFeedback.className = '';
  solveInput.value = '';
  setTimeout(() => solveInput.focus(), 50);
}
function submitSolve() {
  const res = game.submitAnswer(solveInput.value);
  solveFeedback.textContent = res.msg;
  solveFeedback.className = res.ok ? 'good' : 'bad';
  if (res.ok) {
    setTimeout(() => { if (currentOverlay === 'solve') closeOverlay(false); }, 700);
  } else {
    solveInput.select();
  }
}
document.getElementById('solve-submit').addEventListener('click', submitSolve);
solveInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); submitSolve(); }
  e.stopPropagation();
});
document.getElementById('hud-solve-hint').addEventListener('click', openSolve);

// ---------------- map ----------------
const mapCanvas = document.getElementById('map-canvas');
function drawMap() {
  const cx = mapCanvas.getContext('2d');
  cx.fillStyle = '#0a0e12'; cx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
  const sx = (x) => (x + 160) / 320 * mapCanvas.width;
  const sz = (z) => (z + 160) / 320 * mapCanvas.height;
  for (const r of world.mapRects) {
    cx.strokeStyle = r.color || '#456'; cx.lineWidth = 2;
    cx.strokeRect(sx(r.x - r.w / 2), sz(r.z - r.d / 2), r.w / 320 * mapCanvas.width, r.d / 320 * mapCanvas.height);
    cx.fillStyle = '#9ab'; cx.font = '11px Consolas';
    cx.textAlign = 'center';
    cx.fillText(r.label, sx(r.x), sz(r.z));
  }
  // alarm marker
  const sc = game.activeScenario;
  if (sc && game.tier > 0) {
    const anchor = world.anchors[sc.anchor];
    if (anchor && Math.floor(performance.now() / 400) % 2 === 0) {
      cx.fillStyle = game.tier >= 2 ? '#ff3020' : '#ffb000';
      cx.beginPath(); cx.arc(sx(anchor.x), sz(anchor.z), 7, 0, Math.PI * 2); cx.fill();
    }
  }
  // player
  cx.save();
  cx.translate(sx(player.pos.x), sz(player.pos.z));
  cx.rotate(-player.yaw);
  cx.fillStyle = '#7fffb0';
  cx.beginPath(); cx.moveTo(0, -8); cx.lineTo(5, 6); cx.lineTo(-5, 6); cx.closePath(); cx.fill();
  cx.restore();
  cx.fillStyle = '#7fa0b8'; cx.textAlign = 'left';
  cx.fillText('N ↑   green = you   flashing = active alarm area', 10, mapCanvas.height - 10);
}

// ---------------- interaction ----------------
let nearestInteract = null;
function findInteractable() {
  nearestInteract = null;
  if (!playing || currentOverlay) return;
  let best = 2.8;
  for (const it of world.interactables) {
    const d = Math.hypot(it.pos.x - player.pos.x, it.pos.z - player.pos.z);
    if (d < best) { best = d; nearestInteract = it; }
  }
  const ip = document.getElementById('hud-interact');
  if (nearestInteract) {
    ip.classList.remove('hidden');
    ip.textContent = `[E] ${nearestInteract.label}`;
  } else ip.classList.add('hidden');
}

document.addEventListener('keydown', (e) => {
  if (!playing) return;
  // overlay-level keys
  if (currentOverlay) {
    if (e.code === 'Escape' || (e.code === 'Tab')) { e.preventDefault(); closeOverlay(); }
    return;
  }
  if (e.code === 'KeyE' && nearestInteract) {
    audio.uiClick();
    if (nearestInteract.type === 'hmi') {
      openOverlay('hmi');   // auto-navigates to the alarm screen if one is active
      if (!game.activeScenario) hmi.show(nearestInteract.screen);
    } else if (nearestInteract.type === 'eng') {
      openOverlay('ladder');
    }
  } else if (e.code === 'KeyR') {
    openOverlay('radio');
  } else if (e.code === 'Enter') {
    e.preventDefault();
    openSolve();
  } else if (e.code === 'KeyM') {
    openOverlay('map');
  }
});

// ---------------- HUD ----------------
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function updateHUD() {
  document.getElementById('hud-shift').textContent = fmtTime(game.shiftT);
  document.getElementById('hud-score').textContent = game.score;
  document.getElementById('hud-streak').textContent = 'x' + (1 + Math.min(0.5, game.streak * 0.1)).toFixed(1);
  document.getElementById('hud-strikes').textContent =
    '●'.repeat(game.strikes) + '○'.repeat(Math.max(0, 3 - game.strikes));

  const hb = document.getElementById('hud-alarm');
  if (game.state === 'active' && game.activeScenario) {
    hb.classList.remove('hidden');
    hb.className = game.tier === 1 ? '' : game.tier === 2 ? 'crit' : 'shut';
    const sc = game.activeScenario;
    document.getElementById('hud-alarm-tier').textContent =
      game.tier === 1 ? '⚠ TIER 1 — WARNING' : game.tier === 2 ? '🔴 TIER 2 — CRITICAL' : '⬛ TIER 3 — PLANT SHUTDOWN';
    document.getElementById('hud-alarm-text').textContent = `${sc.alarm.name} — ${sc.alarm.text}`;
    const left = game.tierTimeLeft();
    document.getElementById('hud-alarm-timer').textContent =
      game.tier === 3 ? fmtTime(left) + ' TO ROUND LOST' : fmtTime(left) + (game.tier === 1 ? ' TO CRITICAL' : ' TO SHUTDOWN');
  } else {
    hb.classList.add('hidden');
    hb.className = 'hidden';
  }

  // compass
  const h = player.headingDeg();
  const idx = Math.round(h / 45) % 8;
  document.getElementById('compass-tape').textContent =
    `       ${COMPASS[(idx + 7) % 8]}        ${COMPASS[idx]} (${Math.round(h)}°)        ${COMPASS[(idx + 1) % 8]}       `;

  // screen-edge flash on critical+
  const fo = document.getElementById('flash-overlay');
  if (game.tier >= 2 && game.state === 'active') {
    fo.className = '';
    fo.style.opacity = (Math.sin(performance.now() / 180) * 0.5 + 0.5) * (game.tier === 3 ? 0.9 : 0.6);
  } else if (game.tier === 1 && game.state === 'active') {
    fo.className = 'warn';
    fo.style.opacity = (Math.sin(performance.now() / 350) * 0.5 + 0.5) * 0.5;
  } else {
    fo.style.opacity = 0;
  }
}

// ---------------- main loop ----------------
let last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  sim.tick(dt);
  game.tick(dt);
  player.update(dt);

  // fan visual follows sim state
  effects.setFan1(sim.get('M-4215') >= 0.5);
  effects.update(dt, player.pos, game.tier / 3);

  if (currentOverlay === 'hmi') hmi.refresh();
  if (currentOverlay === 'ladder') ladder.refresh();
  if (currentOverlay === 'map') drawMap();
  if (playing) { updateHUD(); findInteractable(); }

  renderer.render(scene, camera);
}
loop();

// debug/QA handle
window.__pgp = { game, sim, hmi, ladder, radio, player, openOverlay, closeOverlay };

// preload speech voices (Chrome loads them async)
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

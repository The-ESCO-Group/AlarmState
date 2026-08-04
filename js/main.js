// ============================================================================
// ALARM STATE — main bootstrap: scene, loop, UI wiring, overlay management
// ============================================================================
import * as THREE from 'three';
import { buildWorld } from './world.js?v=20260731b';
import { Player } from './player.js?v=20260715c';
import { ProcessSim } from './sim.js';
import { PlcScan } from './plc.js';
import { EffectsManager } from './effects.js?v=20260715d';
import { audio } from './audio.js?v=20260715d';
import { Game } from './game.js?v=20260716a';
import { Radio } from './radio.js?v=20260716a';
import { COURSE_WEEKS, CourseManager } from './course.js?v=20260723a';
import { EscoWorkspace, renderTagBank } from './esco.js?v=20260720c';
import { CampaignDirector } from './campaign.js?v=20260723a';
import { MultiplayerClient } from './multiplayer.js?v=20260720d';
import { MULTIPLAYER_ROLES } from './multiplayer-protocol.js?v=20260716b';

// ---------------- three.js setup ----------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const rendererContext = renderer.getContext();
const debugRendererInfo = rendererContext.getExtension('WEBGL_debug_renderer_info');
const rendererName = debugRendererInfo
  ? rendererContext.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
  : '';
const softwareRenderer = /swiftshader|llvmpipe|software/i.test(rendererName);
renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio) * (softwareRenderer ? 0.5 : 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const environmentCanvas = document.createElement('canvas');
environmentCanvas.width = 1024; environmentCanvas.height = 512;
const environmentContext = environmentCanvas.getContext('2d');
const environmentSky = environmentContext.createLinearGradient(0, 0, 0, 360);
environmentSky.addColorStop(0, '#86a4b4');
environmentSky.addColorStop(0.55, '#d8d7cd');
environmentSky.addColorStop(1, '#a5a49a');
environmentContext.fillStyle = environmentSky;
environmentContext.fillRect(0, 0, 1024, 360);
const environmentGround = environmentContext.createLinearGradient(0, 360, 0, 512);
environmentGround.addColorStop(0, '#77796d');
environmentGround.addColorStop(1, '#34382f');
environmentContext.fillStyle = environmentGround;
environmentContext.fillRect(0, 360, 1024, 152);
const sunGlow = environmentContext.createRadialGradient(760, 112, 2, 760, 112, 90);
sunGlow.addColorStop(0, 'rgba(255,241,207,.95)');
sunGlow.addColorStop(0.2, 'rgba(255,224,178,.55)');
sunGlow.addColorStop(1, 'rgba(255,224,178,0)');
environmentContext.fillStyle = sunGlow;
environmentContext.fillRect(660, 12, 200, 200);
const environmentSource = new THREE.CanvasTexture(environmentCanvas);
environmentSource.mapping = THREE.EquirectangularReflectionMapping;
environmentSource.colorSpace = THREE.SRGBColorSpace;
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const environmentTarget = pmrem.fromEquirectangular(environmentSource);
scene.environment = environmentTarget.texture;
scene.environmentIntensity = 0.82;
environmentSource.dispose();
pmrem.dispose();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1500);

const world = buildWorld(scene);
const player = new Player(camera, renderer.domElement);
player.setColliders(world.colliders);
player.teleport(98, -102, -0.9);
camera.position.set(225, 145, -240);
camera.lookAt(0, 8, 0);

const sim = new ProcessSim();
// PGP_Plant7_PLC. The controller scans the plant's real ladder against the
// process simulation every frame, so every alarm bit, interlock, and motor
// command the technician sees was solved by logic rather than authored.
const plc = new PlcScan(sim);
const effects = new EffectsManager(scene, world);

const game = new Game(sim, effects, null);
const radio = new Radio(game);
game.radio = radio;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  lastSceneRender = -Infinity;
});

// ---------------- overlay management ----------------
const OVERLAYS = ['menu', 'multiplayer', 'course', 'workorder', 'esco', 'howto', 'radio', 'solve', 'map', 'result', 'qualification', 'pause'];
let currentOverlay = 'menu';
let playing = false;
let lastSceneRender = -Infinity;

function showEl(id, show) { document.getElementById(id).classList.toggle('hidden', !show); }

function openOverlay(name) {
  if (currentOverlay && currentOverlay !== name) closeOverlay(false);
  currentOverlay = name;
  lastSceneRender = -Infinity;
  player.enabled = false;
  player.unlock();
  if (name === 'radio') radio.openOverlay();
  else showEl(name, true);
}

function closeOverlay(relock = true) {
  if (!currentOverlay) return;
  if (currentOverlay === 'radio') radio.closeOverlay();
  else showEl(currentOverlay, false);
  currentOverlay = null;
  lastSceneRender = -Infinity;
  if (playing && relock) {
    player.enabled = true;
    player.lock();
  }
}

document.querySelectorAll('[data-close]').forEach(b =>
  b.addEventListener('click', () => {
    audio.uiClick();
    const closing = b.dataset.close;
    if (closing === 'map') {
      closeMapOverlay();
      return;
    }
    closeOverlay();
    if (!playing && (closing === 'course' || closing === 'howto' || closing === 'multiplayer')) openOverlay('menu');
  }));

player.onLockChange = (locked) => {
  if (!locked && playing && !currentOverlay) {
    // user pressed Esc in-game → pause
    openOverlay('pause');
  }
};

// ---------------- continuous qualification campaign ----------------
let pendingMission = null;
let returningToEsco = false;

const course = new CourseManager({ onLaunch: (mission) => presentMission(mission), launchEnabled: false });
const campaign = new CampaignDirector(course, world);
const escoMissionTotal = COURSE_WEEKS.flatMap((week) => week.missions).filter((mission) => mission.kind === 'esco').length;
const esco = new EscoWorkspace({
  onOpen: () => openOverlay('esco'),
  onClose: () => closeOverlay(),
  onReview: (mission) => presentMission(mission, true),
  onAccepted: (mission) => {
    course.completeMission(mission.id, 100);
    refreshPortfolioButton();
    if (currentOverlay) closeOverlay();
    game.enterCampaign(false);
    campaign.finish(mission, true);
    refreshCampaignMenu();
    const portfolio = esco.portfolioStatus();
    game.toast(portfolio.count >= escoMissionTotal
      ? 'ESCO PORTFOLIO COMPLETE - ALL ACCEPTED WORK ARCHIVED.'
      : 'ACCEPTED WORK ARCHIVED - NEXT ESCO LAB WILL OPEN CLEAN.');
    radio.say('frank', 'The validator passed. That is the minimum requirement. Save the project and report to dispatch before I call again.');
  },
});
course.render();
esco.migrateExistingCourseWork(
  COURSE_WEEKS.flatMap((week) => week.missions).filter((mission) => course.progress.completed[mission.id]),
);

function refreshPortfolioButton() {
  const button = document.getElementById('course-portfolio');
  const portfolio = esco.portfolioStatus();
  button.disabled = portfolio.count === 0;
  button.textContent = portfolio.count >= escoMissionTotal
    ? 'OPEN FINAL ESCO PORTFOLIO'
    : `ESCO PORTFOLIO ${portfolio.count}/${escoMissionTotal}`;
  button.title = portfolio.count
    ? `${portfolio.routineCount} accepted ladder routines preserved with the latest accepted HMI work.`
    : 'Pass an ESCO assignment to begin the portfolio.';
}

refreshPortfolioButton();

const multiplayer = new MultiplayerClient({
  scene,
  player,
  world,
  game,
  sim,
  radio,
  onDeploy: () => {
    if (currentOverlay) closeOverlay(false);
    playing = true;
    campaign.active = false;
    showEl('hud', true);
    showEl('hud-crew', true);
    showEl('btn-crew-room', true);
    showEl('btn-course2', false);
    player.enabled = true;
    player.lock();
    audio.init();
    audio.resume();
    game.toast('CREW DEPLOYED - YOUR ROLE IS LOCKED FOR THE SHIFT');
  },
  onState: () => renderCrewHUD(),
  onEvent: (event) => {
    if (event.event === 'resolved') {
      if (currentOverlay === 'esco') esco.close();
      else if (currentOverlay === 'solve') closeOverlay();
      const message = event.ok
        ? `INCIDENT CLOSED BY ${event.submittedBy} - ${event.answer} - TEAM +${event.award}`
        : `CAUSE WINDOW LOST - FAILED POINT WAS ${event.answer}`;
      game.toast(message);
      if (event.ok) audio.good(); else audio.bad();
    } else if (event.event === 'crew_action' && event.playerId !== multiplayer.selfId) {
      const role = MULTIPLAYER_ROLES[event.role]?.short || 'CREW';
      game.toast(`${role} EVIDENCE RECEIVED FROM ${event.name}`);
    }
  },
  onLeave: () => {
    game.leaveMultiplayer();
    playing = false;
    showEl('hud', false);
    showEl('hud-crew', false);
    showEl('btn-crew-room', false);
    showEl('btn-course2', true);
    if (currentOverlay) closeOverlay(false);
    openOverlay('menu');
  },
});

function refreshCampaignMenu() {
  const progress = course.overallProgress();
  document.getElementById('campaign-progress-copy').textContent = `${progress.done} of ${progress.total} assignments complete`;
  document.getElementById('campaign-progress-bar').style.width = `${progress.percent}%`;
  document.getElementById('campaign-start-label').textContent = progress.done
    ? progress.done === progress.total ? 'ENTER PLANT 7' : 'CONTINUE QUALIFICATION'
    : 'CLOCK IN AT PLANT 7';
}

function showQualificationComplete() {
  const summary = course.completionSummary();
  const portfolio = esco.portfolioStatus();
  document.getElementById('qualification-weeks').textContent = `${summary.weeks} WEEKS`;
  document.getElementById('qualification-assignments').textContent = `${summary.done} / ${summary.total}`;
  document.getElementById('qualification-average').textContent = `${summary.average}%`;
  document.getElementById('qualification-portfolio').textContent = `${portfolio.count} / ${escoMissionTotal}`;
  const recorded = summary.completedAt ? new Date(summary.completedAt) : new Date();
  document.getElementById('qualification-date').textContent =
    `RECORDED ${recorded.toLocaleDateString()} · PERSONNEL FILE AS-P7-${String(recorded.getFullYear()).slice(-2)}-021`;
  openOverlay('qualification');
}

function presentMission(mission, fromEsco = false) {
  pendingMission = mission;
  returningToEsco = fromEsco;
  const week = COURSE_WEEKS.find((item) => item.missions.some((entry) => entry.id === mission.id));
  document.getElementById('wo-kicker').textContent = `WEEK ${week?.n || '--'} · ${mission.kind === 'esco' ? 'ESCO WORK ORDER' : 'PLANT CALL'}`;
  document.getElementById('wo-title').textContent = mission.title;
  document.getElementById('wo-story').textContent = week?.story || '';
  document.getElementById('wo-problem').textContent = mission.kind === 'esco'
    ? mission.problem
    : `${mission.problem} Start with the prebuilt ESCO HMI for the process and alarm context, then use ESCO Logic to inspect the affected routine and live controller tags.`;
  document.getElementById('wo-plant').textContent = mission.plant;
  document.getElementById('wo-why').textContent = mission.why;
  document.getElementById('wo-success').textContent = mission.success;
  const tags = mission.tagBank || [];
  showEl('wo-tag-bank', tags.length > 0);
  renderTagBank(document.getElementById('wo-tag-bank-list'), tags);
  document.getElementById('wo-hint-text').textContent = mission.hint;
  document.getElementById('wo-hint-text').classList.add('hidden');
  document.getElementById('wo-hint-button').classList.remove('hidden');
  document.getElementById('wo-back').textContent = fromEsco ? 'RETURN TO ESCO' : 'DECLINE / REPORT TO MANAGER';
  document.getElementById('wo-start').textContent = fromEsco
    ? 'RETURN TO ESCO'
    : 'TAKE THE ASSIGNMENT';
  openOverlay('workorder');
}

document.getElementById('wo-hint-button').addEventListener('click', () => {
  if (!pendingMission) return;
  audio.uiClick();
  course.useHint(pendingMission.id);
  document.getElementById('wo-hint-button').classList.add('hidden');
  document.getElementById('wo-hint-text').classList.remove('hidden');
});

document.getElementById('wo-back').addEventListener('click', () => {
  audio.uiClick();
  if (returningToEsco) openOverlay('esco');
  else closeOverlay();
});

document.getElementById('wo-start').addEventListener('click', () => {
  if (!pendingMission) return;
  audio.uiClick();
  const mission = pendingMission;
  if (returningToEsco) {
    openOverlay('esco');
    return;
  }
  campaign.accept(mission);
  const week = course.weekForMission(mission.id);
  radio.say('frank', week?.story || `Take ${mission.title}. The clock starts now and excuses are not part of the acceptance test.`);
  if (mission.kind === 'esco') {
    closeOverlay();
    game.enterCampaign(false);
    game.toast(`ASSIGNMENT CLOCK RUNNING - REPORT TO ${mission.destination === 'academyStudio' ? 'HMI DESIGN STUDIO' : 'CV-101'}.`);
    return;
  }
  course.beginDrill(mission);
  beginShift(mission.difficulty, { scenarioIds: mission.scenarioIds, courseMissionId: mission.id });
});

document.getElementById('btn-course').addEventListener('click', () => {
  audio.uiClick();
  audio.init();
  audio.resume();
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  if (currentOverlay) closeOverlay(false);
  playing = true;
  showEl('hud', true);
  player.enabled = true;
  const spawn = world.anchors.academySpawn;
  player.teleport(spawn?.x ?? 44, spawn?.z ?? 36, Math.PI);
  player.lock();
  game.enterCampaign(true);
  campaign.start();
  const progress = course.overallProgress();
  if (progress.done === progress.total) {
    radio.say('voss', 'The Plant 7 acceptance run is closed. Your qualification stands under supervision. Review the record; the plant does not care how you earned it.');
    showQualificationComplete();
  } else {
    radio.say('frank', progress.done
      ? 'Ryder, you are late and your qualification is still incomplete. Report to Reliability Center dispatch now.'
      : 'Ryder, Plant 7 failed the alarm audit and management needs a technician who does not guess. Report to dispatch. Your evaluation starts now.');
    setTimeout(() => radio.say('voss', 'I am Dana Voss, Plant Manager. A missed trip, an unsupported answer, or a slow response goes into your record. Keep up or get out of the way.'), 5200);
  }
});
document.getElementById('btn-multiplayer').addEventListener('click', () => {
  audio.uiClick();
  if (currentOverlay) closeOverlay(false);
  multiplayer.open();
  openOverlay('multiplayer');
});
document.getElementById('btn-course2').addEventListener('click', () => {
  audio.uiClick();
  if (multiplayer.active) {
    multiplayer.open();
    openOverlay('multiplayer');
  } else {
    course.render();
    openOverlay('course');
  }
});
document.getElementById('course-portfolio').addEventListener('click', () => {
  audio.uiClick();
  if (!esco.openCoursePortfolio()) game.toast('NO ACCEPTED ESCO PROJECTS HAVE BEEN ARCHIVED.');
});
document.getElementById('course-reset').addEventListener('click', () => {
  if (!window.confirm('Reset the Plant 7 qualification and return to the first assignment? Your ESCO project will be kept.')) return;
  course.reset();
  campaign.start();
  refreshCampaignMenu();
  if (playing) {
    game.enterCampaign(true);
    const spawn = world.anchors.academySpawn;
    player.teleport(spawn?.x ?? 44, spawn?.z ?? 34.5, Math.PI);
    closeOverlay();
    radio.say('frank', 'You reset the qualification because the first result was not good enough. Report to dispatch and do not repeat the same failures.');
  }
});

function beginShift(selectedDifficulty, options = null) {
  audio.init(); audio.resume(); audio.uiClick();
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  if (currentOverlay) closeOverlay(false);
  playing = true;
  showEl('hud', true);
  player.enabled = true;
  player.lock();
  game.startShift(selectedDifficulty, options || {});
}

document.getElementById('btn-howto').addEventListener('click', () => { showEl('howto', false); openOverlay('howto'); });
document.getElementById('btn-howto2').addEventListener('click', () => { closeOverlay(false); openOverlay('howto'); });
document.getElementById('btn-resume').addEventListener('click', () => closeOverlay());
document.getElementById('btn-crew-room').addEventListener('click', () => {
  audio.uiClick(); multiplayer.open(); openOverlay('multiplayer');
});
document.getElementById('btn-quit').addEventListener('click', () => location.reload());
document.getElementById('voice-toggle').addEventListener('change', (e) => { audio.voicesOn = e.target.checked; if (!e.target.checked) audio.stopSpeech(); });
document.getElementById('qualification-log').addEventListener('click', () => {
  audio.uiClick();
  course.render();
  openOverlay('course');
});
document.getElementById('qualification-continue').addEventListener('click', () => {
  audio.uiClick();
  closeOverlay();
});

// ---------------- result overlay ----------------
game.onRoundEnd = (html, isGameOver) => {
  const practicalComplete = !!course.activeDrill?.complete;
  document.getElementById('result-title').textContent = practicalComplete ? 'MINIMUM GATE MET' : isGameOver ? 'SHIFT TERMINATED' : 'PERFORMANCE REVIEW';
  document.getElementById('result-body').innerHTML = html;
  const courseDisposition = course.roundDisposition(game.lastRoundPassed);
  document.getElementById('result-continue').textContent = courseDisposition === 'course'
    ? 'REPORT TO RELIABILITY CENTER'
    : courseDisposition === 'continue' ? 'NEXT REQUIRED CALL' : 'CONTINUE UNDER REVIEW';
  refreshCampaignMenu();
  openOverlay('result');
};
document.getElementById('result-continue').addEventListener('click', () => {
  audio.uiClick();
  const courseDisposition = course.roundDisposition(game.lastRoundPassed);
  if (courseDisposition === 'course') {
    const mission = course.activeDrill?.mission;
    const complete = !!course.activeDrill?.complete;
    closeOverlay();
    game.enterCampaign(false);
    course.endDrill();
    if (mission) campaign.finish(mission, complete);
    refreshCampaignMenu();
    radio.say('frank', complete
      ? 'The call is closed. Bring the evidence and elapsed time to dispatch. Your next assignment is already waiting.'
      : 'You lost the call. Return to dispatch, account for the failure, and take it again under the same standard.');
    return;
  }
  closeOverlay();
  game.continueShift();
});

game.onScenarioSolved = (scenario, score) => course.recordScenarioSolved(scenario, score);

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
async function submitSolve() {
  const submitButton = document.getElementById('solve-submit');
  submitButton.disabled = true;
  const res = multiplayer.active
    ? await multiplayer.submitAnswer(solveInput.value)
    : game.submitAnswer(solveInput.value);
  submitButton.disabled = false;
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
let currentWaypoint = null;
let mapReturnOverlay = null;
const mapViewer = {
  mode: '2d', active: false, dragging: false, pointerId: null, pan: false,
  lastX: 0, lastY: 0, savedPosition: null, savedQuaternion: null,
  target: new THREE.Vector3(0, 10, 0), radius: 370, theta: 2.4, phi: 1.12,
  preset: 'site',
};
const mapPresets = {
  site: { target: [0, 10, 0], radius: 370, theta: 2.4, phi: 1.12 },
  north: { target: [0, 0, 0], radius: 430, theta: 0, phi: 0.08 },
  process: { target: [0, 12, -28], radius: 155, theta: 2.15, phi: 1.02 },
  storage: { target: [126, 10, -114], radius: 118, theta: 2.45, phi: 1.04 },
  warehouse: { target: [-45, 8, 150], radius: 118, theta: 2.72, phi: 1.08 },
  admin: { target: [36, 4, -149], radius: 76, theta: Math.PI, phi: 1.16 },
};

function updateMapReadout() {
  const label = mapViewer.preset ? mapViewer.preset.toUpperCase() : 'FREE';
  document.getElementById('map-view-readout').textContent = `${label} / ${Math.round(mapViewer.radius)} M`;
  document.querySelectorAll('[data-map-preset]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mapPreset === mapViewer.preset);
  });
}

function applyMapViewerCamera() {
  if (!mapViewer.active) return;
  const sinPhi = Math.sin(mapViewer.phi);
  camera.position.set(
    mapViewer.target.x + mapViewer.radius * sinPhi * Math.sin(mapViewer.theta),
    mapViewer.target.y + mapViewer.radius * Math.cos(mapViewer.phi),
    mapViewer.target.z + mapViewer.radius * sinPhi * Math.cos(mapViewer.theta),
  );
  camera.lookAt(mapViewer.target);
  camera.updateMatrixWorld(true);
  lastSceneRender = -Infinity;
  updateMapReadout();
}

function setMapPreset(name) {
  const preset = mapPresets[name];
  if (!preset) return;
  mapViewer.target.set(...preset.target);
  mapViewer.radius = preset.radius;
  mapViewer.theta = preset.theta;
  mapViewer.phi = preset.phi;
  mapViewer.preset = name;
  applyMapViewerCamera();
}

function activateMapViewer() {
  if (!mapViewer.active) {
    mapViewer.savedPosition = camera.position.clone();
    mapViewer.savedQuaternion = camera.quaternion.clone();
    mapViewer.active = true;
  }
  setMapPreset(mapViewer.preset || 'site');
}

function restoreMapCamera() {
  if (!mapViewer.active) return;
  if (mapViewer.savedPosition) camera.position.copy(mapViewer.savedPosition);
  if (mapViewer.savedQuaternion) camera.quaternion.copy(mapViewer.savedQuaternion);
  camera.updateMatrixWorld(true);
  mapViewer.active = false;
  mapViewer.dragging = false;
  mapViewer.pointerId = null;
  mapViewer.savedPosition = null;
  mapViewer.savedQuaternion = null;
  lastSceneRender = -Infinity;
}

function setMapMode(mode) {
  mapViewer.mode = mode === '3d' ? '3d' : '2d';
  const is3d = mapViewer.mode === '3d';
  document.getElementById('map').classList.toggle('viewer-3d', is3d);
  document.getElementById('map-3d-tools').classList.toggle('hidden', !is3d);
  document.getElementById('map-title').textContent = is3d ? 'PLANT 7 - 3D MAP VIEWER' : 'PLANT 7 - PLOT PLAN';
  document.querySelectorAll('[data-map-mode]').forEach((button) => {
    const active = button.dataset.mapMode === mapViewer.mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  if (is3d) activateMapViewer();
  else restoreMapCamera();
  lastSceneRender = -Infinity;
}

function openMap(mode = '2d') {
  const previousOverlay = currentOverlay;
  mapReturnOverlay = previousOverlay && previousOverlay !== 'map' ? previousOverlay : null;
  if (currentOverlay) closeOverlay(false);
  openOverlay('map');
  setMapMode(mode);
  if (mode === '2d') drawMap();
}

function closeMapOverlay() {
  restoreMapCamera();
  const returnTo = mapReturnOverlay;
  mapReturnOverlay = null;
  closeOverlay(!returnTo);
  if (returnTo) openOverlay(returnTo);
}

document.querySelectorAll('[data-map-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    audio.uiClick();
    setMapMode(button.dataset.mapMode);
  });
});
document.querySelectorAll('[data-map-preset]').forEach((button) => {
  button.addEventListener('click', () => {
    audio.uiClick();
    setMapPreset(button.dataset.mapPreset);
  });
});
document.getElementById('btn-map-viewer').addEventListener('click', () => {
  audio.uiClick();
  openMap('3d');
});
document.getElementById('btn-map-viewer-pause').addEventListener('click', () => {
  audio.uiClick();
  openMap('3d');
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (currentOverlay !== 'map' || mapViewer.mode !== '3d') return;
  mapViewer.dragging = true;
  mapViewer.pointerId = event.pointerId;
  mapViewer.pan = event.button === 2 || event.shiftKey;
  mapViewer.lastX = event.clientX;
  mapViewer.lastY = event.clientY;
  renderer.domElement.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!mapViewer.dragging || event.pointerId !== mapViewer.pointerId) return;
  const dx = event.clientX - mapViewer.lastX;
  const dy = event.clientY - mapViewer.lastY;
  mapViewer.lastX = event.clientX;
  mapViewer.lastY = event.clientY;
  mapViewer.preset = null;
  if (mapViewer.pan) {
    const forward = mapViewer.target.clone().sub(camera.position).setY(0).normalize();
    const right = forward.clone().cross(camera.up).normalize();
    const scale = mapViewer.radius * 0.0014;
    mapViewer.target.addScaledVector(right, -dx * scale);
    mapViewer.target.addScaledVector(forward, dy * scale);
  } else {
    mapViewer.theta -= dx * 0.006;
    mapViewer.phi = THREE.MathUtils.clamp(mapViewer.phi + dy * 0.005, 0.06, Math.PI / 2 - 0.025);
  }
  applyMapViewerCamera();
  event.preventDefault();
});
const finishMapDrag = (event) => {
  if (event.pointerId !== mapViewer.pointerId) return;
  mapViewer.dragging = false;
  mapViewer.pointerId = null;
  renderer.domElement.releasePointerCapture?.(event.pointerId);
};
renderer.domElement.addEventListener('pointerup', finishMapDrag);
renderer.domElement.addEventListener('pointercancel', finishMapDrag);
renderer.domElement.addEventListener('wheel', (event) => {
  if (currentOverlay !== 'map' || mapViewer.mode !== '3d') return;
  mapViewer.radius = THREE.MathUtils.clamp(mapViewer.radius * Math.exp(event.deltaY * 0.001), 28, 620);
  mapViewer.preset = null;
  applyMapViewerCamera();
  event.preventDefault();
}, { passive: false });
renderer.domElement.addEventListener('contextmenu', (event) => {
  if (currentOverlay === 'map' && mapViewer.mode === '3d') event.preventDefault();
});

function drawMap() {
  const cx = mapCanvas.getContext('2d');
  cx.fillStyle = '#0a0e12'; cx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
  const sx = (x) => (x + 200) / 400 * mapCanvas.width;
  const sz = (z) => (z + 200) / 400 * mapCanvas.height;
  for (const r of world.mapRects) {
    cx.strokeStyle = r.color || '#456'; cx.lineWidth = 2;
    cx.strokeRect(sx(r.x - r.w / 2), sz(r.z - r.d / 2), r.w / 400 * mapCanvas.width, r.d / 400 * mapCanvas.height);
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
  if (currentWaypoint?.pos) {
    cx.strokeStyle = '#e8a020';
    cx.lineWidth = 2;
    cx.setLineDash([7, 6]);
    cx.beginPath();
    cx.moveTo(sx(player.pos.x), sz(player.pos.z));
    cx.lineTo(sx(currentWaypoint.pos.x), sz(currentWaypoint.pos.z));
    cx.stroke();
    cx.setLineDash([]);
    cx.fillStyle = '#ffc64f';
    cx.beginPath();
    cx.arc(sx(currentWaypoint.pos.x), sz(currentWaypoint.pos.z), 6, 0, Math.PI * 2);
    cx.fill();
  }
  // player
  cx.save();
  cx.translate(sx(player.pos.x), sz(player.pos.z));
  cx.rotate(-player.yaw);
  cx.fillStyle = '#7fffb0';
  cx.beginPath(); cx.moveTo(0, -8); cx.lineTo(5, 6); cx.lineTo(-5, 6); cx.closePath(); cx.fill();
  cx.restore();
  if (multiplayer.active && multiplayer.state) {
    for (const remote of multiplayer.state.players) {
      if (remote.id === multiplayer.selfId || !remote.connected || !remote.role) continue;
      cx.fillStyle = MULTIPLAYER_ROLES[remote.role]?.color || '#fff';
      cx.beginPath(); cx.arc(sx(remote.x), sz(remote.z), 5, 0, Math.PI * 2); cx.fill();
      cx.fillStyle = '#cbd8de'; cx.font = '9px Consolas'; cx.textAlign = 'center';
      cx.fillText(remote.name, sx(remote.x), sz(remote.z) - 8);
    }
  }
  cx.fillStyle = '#7fa0b8'; cx.textAlign = 'left';
  cx.fillText('N ↑   green = you   flashing = active alarm area', 10, mapCanvas.height - 10);
  cx.fillStyle = '#0a0e12'; cx.fillRect(0, mapCanvas.height - 25, mapCanvas.width, 25);
  cx.fillStyle = '#7fa0b8';
  cx.fillText('N / green = technician / amber = assigned route', 10, mapCanvas.height - 10);
}

// ---------------- interaction ----------------
let nearestInteract = null;
function findInteractable() {
  nearestInteract = null;
  if (!playing || currentOverlay) return;
  let best = 2.8;
  for (const it of world.interactables) {
    if (multiplayer.active) {
      if (it.type === 'dispatch' || it.type === 'course') continue;
    } else if (it.type === 'dispatch' && campaign.stage !== 'report' && campaign.stage !== 'return') continue;
    if (!multiplayer.active && it.type === 'esco') {
      const assigned = campaign.stage === 'travel' && campaign.mission?.kind === 'esco' && it.id === campaign.mission.destination;
      if (!assigned && !game.activeScenario) continue;
    }
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
  if (currentOverlay === 'map') {
    if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyM') {
      e.preventDefault();
      closeMapOverlay();
    } else if (e.code === 'KeyV') {
      e.preventDefault();
      setMapMode(mapViewer.mode === '3d' ? '2d' : '3d');
    }
    return;
  }
  if (!playing) return;
  // overlay-level keys
  if (currentOverlay) {
    if (currentOverlay === 'esco') {
      if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyH') {
        e.preventDefault();
        if (!esco.active) esco.close();
      }
      return;
    }
    if (e.code === 'Escape' || e.code === 'Tab') { e.preventDefault(); closeOverlay(); }
    return;
  }
  if (e.code === 'KeyE' && nearestInteract) {
    audio.uiClick();
    if (nearestInteract.type === 'hmi') {
      if (multiplayer.active && !multiplayer.can('hmi')) { game.toast(multiplayer.roleDenied('hmi')); return; }
      if (multiplayer.active) multiplayer.recordAction('ack');
      esco.openPlantHmi(game.activeScenario, plc.image(), nearestInteract.screen);
    } else if (nearestInteract.type === 'eng') {
      if (multiplayer.active && !multiplayer.can('logic')) { game.toast(multiplayer.roleDenied('logic')); return; }
      if (multiplayer.active) multiplayer.recordAction(multiplayer.role === 'controls' ? 'controls_logic' : 'maintenance_report');
      esco.openDiagnostic(game.activeScenario, plc.image());
    } else if (nearestInteract.type === 'esco') {
      if (multiplayer.active) {
        if (!multiplayer.can('logic')) { game.toast(multiplayer.roleDenied('logic')); return; }
        multiplayer.recordAction(multiplayer.role === 'controls' ? 'controls_logic' : 'maintenance_report');
        esco.openDiagnostic(game.activeScenario, plc.image());
        return;
      }
      const assignedHere = campaign.stage === 'travel' && campaign.mission?.kind === 'esco' &&
        nearestInteract.id === campaign.mission.destination;
      if (assignedHere) esco.startMission(campaign.mission);
      else if (game.activeScenario) esco.openDiagnostic(game.activeScenario, plc.image());
      else game.toast('This workstation is not assigned. Follow the amber route or report to dispatch.');
    } else if (nearestInteract.type === 'dispatch') {
      if (campaign.stage !== 'report' && campaign.stage !== 'return') {
        game.toast('Your current assignment is still open. Follow the objective route.');
        return;
      }
      const mission = campaign.atDispatch();
      if (mission) presentMission(mission);
      else {
        game.toast('PLANT 7 ACCEPTANCE CLOSED - PERFORMANCE RECORD FINALIZED');
        radio.say('voss', 'Corporate closed the acceptance. You met the minimum standard for Plant 7. Tomorrow the plant will demand it again with no allowance for training.');
        showQualificationComplete();
      }
    } else if (nearestInteract.type === 'course') {
      course.render();
      openOverlay('course');
    }
  } else if (e.code === 'KeyR') {
    openOverlay('radio');
  } else if (e.code === 'Tab') {
    e.preventDefault();
    if (multiplayer.active && !multiplayer.can('logic')) game.toast(multiplayer.roleDenied('logic'));
    else if (game.activeScenario) {
      if (multiplayer.active) multiplayer.recordAction(multiplayer.role === 'controls' ? 'controls_logic' : 'maintenance_report');
      esco.openDiagnostic(game.activeScenario, plc.image());
    }
    else game.toast(campaign.mission?.kind === 'esco'
      ? 'ESCO is locked to the marked assignment workstation.'
      : 'Controller diagnostics unlock when a live plant call is active.');
  } else if (e.code === 'KeyH') {
    e.preventDefault();
    if (multiplayer.active && !multiplayer.can('hmi')) game.toast(multiplayer.roleDenied('hmi'));
    else if (game.activeScenario) {
      if (multiplayer.active) multiplayer.recordAction('ack');
      esco.openPlantHmi(game.activeScenario, plc.image(), game.activeScenario.screen);
    }
    else game.toast('No active plant call. Use a physical HMI terminal for routine monitoring.');
  } else if (e.code === 'Enter') {
    e.preventDefault();
    if (multiplayer.active && !multiplayer.can('submit')) game.toast(multiplayer.roleDenied('submit'));
    else if (game.activeScenario) openSolve();
  } else if (e.code === 'KeyM') {
    openMap('2d');
  }
});

// ---------------- HUD ----------------
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function renderCrewHUD() {
  const panel = document.getElementById('hud-crew');
  const state = multiplayer.state;
  if (!multiplayer.active || !multiplayer.deployed || !state) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  document.getElementById('hud-room').textContent = `CREW ${state.room}`;
  const selfRole = MULTIPLAYER_ROLES[multiplayer.role];
  const roleEl = document.getElementById('hud-role');
  roleEl.textContent = selfRole?.short || 'UNASSIGNED';
  roleEl.style.color = selfRole?.color || '#fff';
  const rows = document.getElementById('hud-crew-rows');
  rows.innerHTML = '';
  for (const member of state.players) {
    const role = MULTIPLAYER_ROLES[member.role];
    const complete = member.role === 'operator' ? state.alarmAcked : !!state.roleActions?.[member.role];
    const row = document.createElement('div');
    row.className = `hud-crew-row${member.connected ? '' : ' offline'}${complete ? ' done' : ''}`;
    const indicator = document.createElement('i');
    indicator.style.color = role?.color || '#fff';
    const name = document.createElement('strong');
    name.textContent = member.name;
    const status = document.createElement('span');
    status.textContent = complete ? 'EVIDENCE' : role?.short || 'NO ROLE';
    row.append(indicator, name, status);
    rows.appendChild(row);
  }
}

function updateHUD() {
  const crewMode = multiplayer.active && multiplayer.deployed;
  const progress = course.overallProgress();
  document.getElementById('hud-player').textContent = crewMode ? multiplayer.self?.name || 'CREW' : 'T. RYDER';
  document.getElementById('hud-progress-label').textContent = crewMode ? 'CLOSED' : 'QUALIFIED';
  document.getElementById('hud-shift').textContent = fmtTime(game.shiftT);
  document.getElementById('hud-progress').textContent = crewMode ? `${game.roundsSolved} CALLS` : `${progress.done} / ${progress.total}`;
  document.getElementById('hud-manager').textContent = crewMode ? 'CREW UNDER REVIEW' : campaign.managerState(game);
  document.getElementById('hud-score').textContent = game.score;
  document.getElementById('hud-streak').textContent = 'x' + (1 + Math.min(0.5, game.streak * 0.1)).toFixed(1);
  document.getElementById('hud-strikes').textContent =
    '●'.repeat(game.strikes) + '○'.repeat(Math.max(0, 3 - game.strikes));
  const fieldCall = crewMode || (!!campaign.mission && campaign.mission.kind !== 'esco');
  document.querySelectorAll('.field-stat').forEach((row) => row.classList.toggle('hidden', !fieldCall));
  document.getElementById('hud-solve-hint').classList.toggle('hidden', !game.activeScenario || (crewMode && !multiplayer.can('submit')));

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

  const guidance = crewMode ? multiplayer.guidance() : campaign.guidance(game);
  document.getElementById('objective-kicker').textContent = guidance.prefix;
  document.getElementById('objective-title').textContent = guidance.title;
  document.getElementById('objective-detail').textContent = guidance.detail;

  currentWaypoint = crewMode ? multiplayer.target() : campaign.target(game);
  const waypointEl = document.getElementById('hud-waypoint');
  if (currentWaypoint?.pos) {
    const dx = currentWaypoint.pos.x - player.pos.x;
    const dz = currentWaypoint.pos.z - player.pos.z;
    const distance = Math.hypot(dx, dz);
    const arrived = distance < 3.2;
    const desiredYaw = Math.atan2(-dx, -dz);
    let relative = desiredYaw - player.yaw;
    while (relative > Math.PI) relative -= Math.PI * 2;
    while (relative < -Math.PI) relative += Math.PI * 2;
    const direction = arrived
      ? (game.activeScenario ? 'ON SITE' : 'PRESS E')
      : Math.abs(relative) < 0.35 ? 'AHEAD' : Math.abs(relative) > 2.65 ? 'BEHIND' : relative > 0 ? 'LEFT' : 'RIGHT';
    document.getElementById('objective-destination').textContent = currentWaypoint.label;
    document.getElementById('objective-distance').textContent = arrived ? direction : `${Math.round(distance)} m`;
    document.getElementById('waypoint-direction').textContent = direction;
    waypointEl.querySelector('i').style.transform = `rotate(${relative}rad)`;
    waypointEl.classList.remove('hidden');
    world.setWaypoint?.(currentWaypoint.pos, !arrived);
  } else {
    document.getElementById('objective-destination').textContent = crewMode ? 'Hold assigned position' : 'Acceptance closed';
    document.getElementById('objective-distance').textContent = '';
    waypointEl.classList.add('hidden');
    world.setWaypoint?.(null, false);
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
document.getElementById('btn-course').disabled = false;
document.getElementById('btn-howto').disabled = false;
document.getElementById('btn-multiplayer').disabled = false;
document.getElementById('btn-map-viewer').disabled = false;
refreshCampaignMenu();

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  sim.tick(dt);
  plc.scan(dt);
  game.tick(dt);
  // Only assemble the tag image when a live controller or HMI view is watching.
  if (esco.wantsValues()) esco.syncValues(plc.image());
  player.update(dt);
  campaign.tick(dt, radio, game);
  multiplayer.update();

  // fan visual follows sim state
  effects.setFan1(sim.get('M-4215') >= 0.5);
  effects.update(dt, player.pos, game.tier / 3);
  world.updateWaypoint?.(dt);

  if (world.cv101Boxes?.length) {
    const beltTime = performance.now() / 1000;
    world.cv101Boxes.forEach((box, index) => {
      box.position.x = 35 + ((beltTime * 1.1 + index * 3.1) % 18);
    });
  }

  if (currentOverlay === 'map' && mapViewer.mode === '2d') drawMap();
  if (playing) { updateHUD(); findInteractable(); }

  const mapViewerActive = currentOverlay === 'map' && mapViewer.mode === '3d';
  const renderInterval = mapViewerActive
    ? (softwareRenderer ? 160 : 0)
    : (playing && !currentOverlay ? (softwareRenderer ? 320 : 0) : 1200);
  if (now - lastSceneRender >= renderInterval) {
    renderer.render(scene, camera);
    lastSceneRender = performance.now();
  }
}
loop();

// debug/QA handle
window.__alarmstate = {
  game, sim, radio, player, course, campaign, esco, multiplayer, world,
  renderer, scene, camera, openOverlay, closeOverlay,
};

// preload speech voices (Chrome loads them async)
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

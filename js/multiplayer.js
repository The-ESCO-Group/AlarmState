import * as THREE from 'three';
import { SCENARIOS } from './data/scenarios.js?v=20260716a';
import { MULTIPLAYER_ROLES, cleanCallsign, cleanRoomCode } from './multiplayer-protocol.js?v=20260716b';

const TOKEN_PREFIX = 'alarmstate:multiplayer:token:';

function readReconnectToken(room) {
  try { return sessionStorage.getItem(TOKEN_PREFIX + room) || ''; } catch { return ''; }
}

function writeReconnectToken(room, token) {
  try { sessionStorage.setItem(TOKEN_PREFIX + room, token); } catch { /* Reconnect is optional. */ }
}

function clearReconnectToken(room) {
  try { sessionStorage.removeItem(TOKEN_PREFIX + room); } catch { /* Reconnect is optional. */ }
}

function scenarioById(id) {
  return SCENARIOS.find((scenario) => scenario.id === id) || null;
}

function socketUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

export class MultiplayerClient {
  constructor({ scene, player, world, game, sim, radio, onDeploy, onState, onEvent, onLeave }) {
    this.scene = scene;
    this.player = player;
    this.world = world;
    this.game = game;
    this.sim = sim;
    this.radio = radio;
    this.onDeploy = onDeploy;
    this.onState = onState;
    this.onEvent = onEvent;
    this.onLeave = onLeave;
    this.socket = null;
    this.room = null;
    this.selfId = null;
    this.token = null;
    this.state = null;
    this.active = false;
    this.deployed = false;
    this.remotes = new Map();
    this.pendingAnswers = new Map();
    this.lastPositionAt = 0;
    this.fieldReportScenario = null;
    this.lastPhase = null;

    this.nameInput = document.getElementById('mp-name');
    this.codeInput = document.getElementById('mp-code');
    this.statusEl = document.getElementById('mp-status');
    this.connectView = document.getElementById('mp-connect-view');
    this.roomView = document.getElementById('mp-room-view');
    this.roomCodeEl = document.getElementById('mp-room-code');
    this.rosterEl = document.getElementById('mp-roster');
    this.startButton = document.getElementById('mp-start');
    this.reconnectButton = document.getElementById('mp-reconnect');
    this.inviteButton = document.getElementById('mp-invite');

    this.nameInput.value = localStorage.getItem('alarmstate:multiplayer:callsign') || 'Ryder';
    const requestedRoom = cleanRoomCode(new URLSearchParams(location.search).get('room'));
    if (requestedRoom) this.codeInput.value = requestedRoom;

    document.getElementById('mp-create').addEventListener('click', () => this.connect('create'));
    document.getElementById('mp-join').addEventListener('click', () => this.connect('join'));
    document.getElementById('mp-leave').addEventListener('click', () => this.leave());
    this.reconnectButton.addEventListener('click', () => {
      this.codeInput.value = this.room || '';
      this.connect('join');
    });
    this.startButton.addEventListener('click', () => this.send({ type: 'start' }));
    this.inviteButton.addEventListener('click', () => this.copyInvite());
    document.querySelectorAll('[data-mp-role]').forEach((button) => {
      button.addEventListener('click', () => this.send({ type: 'role', role: button.dataset.mpRole }));
    });
  }

  get self() {
    return this.state?.players.find((entry) => entry.id === this.selfId) || null;
  }

  get role() { return this.self?.role || null; }
  get isHost() { return this.state?.hostId === this.selfId; }

  open() {
    this.setStatus(this.room ? 'ROOM CONNECTED' : 'CREATE A CREW OR JOIN WITH A ROOM CODE', '');
    this.renderLobby();
  }

  connect(mode) {
    const name = cleanCallsign(this.nameInput.value);
    const room = cleanRoomCode(this.codeInput.value);
    if (mode === 'join' && room.length !== 5) {
      this.setStatus('ENTER THE 5-CHARACTER ROOM CODE', 'error');
      return;
    }
    localStorage.setItem('alarmstate:multiplayer:callsign', name);
    this.setStatus('CONNECTING TO PLANT 7 CREW SERVER...', 'busy');
    if (this.socket) this.socket.close();
    const ws = new WebSocket(socketUrl());
    this.socket = ws;
    ws.addEventListener('open', () => {
      const token = mode === 'join' ? readReconnectToken(room) : '';
      this.send(mode === 'create' ? { type: 'create', name } : { type: 'join', room, name, token });
    });
    ws.addEventListener('message', (event) => this.handleMessage(event.data));
    ws.addEventListener('close', () => this.handleClose());
    ws.addEventListener('error', () => this.setStatus('CREW SERVER UNREACHABLE - START WITH npm.cmd run start:multi', 'error'));
  }

  handleMessage(raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (message.type === 'welcome') {
      this.room = message.room;
      this.selfId = message.playerId;
      this.token = message.token;
      this.active = true;
      writeReconnectToken(this.room, this.token);
      this.setStatus('CONNECTED - SELECT YOUR PLANT ROLE', 'good');
      this.renderLobby();
      return;
    }
    if (message.type === 'state') {
      const previousPhase = this.state?.phase;
      this.state = message;
      this.room = message.room;
      this.active = true;
      this.syncAvatars(message.players);
      this.game.applyMultiplayerState(message);
      this.renderLobby();
      if (previousPhase === 'lobby' && message.phase !== 'lobby') {
        this.deployed = true;
        this.teleportToRole();
        this.onDeploy?.(message);
      } else if (!this.deployed && message.phase !== 'lobby') {
        this.deployed = true;
        this.teleportToRole();
        this.onDeploy?.(message);
      }
      this.onState?.(message);
      this.lastPhase = message.phase;
      return;
    }
    if (message.type === 'answer_result') {
      const pending = this.pendingAnswers.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingAnswers.delete(message.requestId);
        pending.resolve({ ok: message.ok, msg: message.msg });
      }
      return;
    }
    if (message.type === 'event') {
      if (message.event === 'radio' && message.who && message.text) this.radio.say(message.who, message.text);
      this.onEvent?.(message);
      return;
    }
    if (message.type === 'error') this.setStatus(message.message || 'SERVER REJECTED THE COMMAND', 'error');
  }

  handleClose() {
    const wasActive = this.active;
    this.socket = null;
    if (!wasActive) {
      this.active = false;
      this.deployed = false;
    }
    for (const pending of this.pendingAnswers.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, msg: 'CONNECTION LOST - ANSWER NOT SUBMITTED' });
    }
    this.pendingAnswers.clear();
    this.setStatus(wasActive ? 'CONNECTION LOST - REJOIN THE SAME ROOM TO RECLAIM YOUR ROLE' : 'CREW SERVER DISCONNECTED', 'error');
    this.clearAvatars();
    this.renderLobby();
    this.setStatus(wasActive ? 'CONNECTION LOST - RECONNECT TO RECLAIM YOUR ROLE' : 'CREW SERVER DISCONNECTED', 'error');
  }

  leave() {
    const room = this.room;
    this.send({ type: 'leave' });
    this.socket?.close();
    if (room) clearReconnectToken(room);
    this.room = null;
    this.selfId = null;
    this.token = null;
    this.state = null;
    this.active = false;
    this.deployed = false;
    this.clearAvatars();
    this.renderLobby();
    this.onLeave?.();
  }

  send(payload) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  submitAnswer(tag) {
    if (!this.active) return Promise.resolve({ ok: false, msg: 'NOT CONNECTED TO A CREW ROOM' });
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingAnswers.delete(requestId);
        resolve({ ok: false, msg: 'SERVER DID NOT CONFIRM THE SUBMISSION' });
      }, 6000);
      this.pendingAnswers.set(requestId, { resolve, timer });
      this.send({ type: 'submit', tag, requestId });
    });
  }

  recordAction(kind) {
    if (this.active && this.state?.phase === 'active') this.send({ type: 'action', kind });
  }

  can(capability) {
    const allowed = {
      hmi: ['operator'],
      ack: ['operator'],
      logic: ['controls', 'maintenance'],
      submit: ['controls'],
      field: ['field'],
    }[capability] || [];
    return allowed.includes(this.role);
  }

  roleDenied(capability) {
    const owner = { hmi: 'CONTROL ROOM OPERATOR', ack: 'CONTROL ROOM OPERATOR', logic: 'CONTROLS OR MAINTENANCE', submit: 'CONTROLS TECHNICIAN', field: 'FIELD OPERATOR' }[capability];
    return `${owner} OWNS THIS ACTION. DO YOUR ASSIGNED JOB.`;
  }

  guidance() {
    const scenario = scenarioById(this.state?.scenarioId);
    if (!this.state || this.state.phase === 'lobby') return null;
    if (this.state.phase === 'briefing') return {
      prefix: `CREW ${this.room} - INCIDENT ${this.state.scenarioNumber}`,
      title: 'Take your assigned position',
      detail: `${MULTIPLAYER_ROLES[this.role]?.duty || 'Stand by.'} Alarm release in ${Math.ceil(this.state.phaseLeft)} seconds.`,
    };
    if (this.state.phase === 'active') return {
      prefix: `${MULTIPLAYER_ROLES[this.role]?.short || 'CREW'} - LIVE INCIDENT`,
      title: scenario ? `${scenario.alarm.name}: ${scenario.alarm.text}` : 'Incident active',
      detail: MULTIPLAYER_ROLES[this.role]?.duty || 'Support the crew response.',
    };
    if (this.state.phase === 'gameover') return {
      prefix: `CREW ${this.room} - SHIFT TERMINATED`,
      title: 'Three shutdowns. Qualification failed.',
      detail: 'Dana Voss ended the shift. Leave the room and form a new crew to restart.',
    };
    return {
      prefix: `CREW ${this.room} - INCIDENT REVIEW`,
      title: 'Cause closed. Hold your role.',
      detail: `Next assignment releases in ${Math.ceil(this.state.phaseLeft)} seconds. Review what the crew missed and stay in position.`,
    };
  }

  target() {
    const scenario = scenarioById(this.state?.scenarioId);
    if (!scenario) return null;
    if (this.role === 'operator' || this.role === 'controls') {
      const station = this.role === 'operator'
        ? this.world.interactables.find((entry) => entry.type === 'hmi')?.pos
        : this.world.interactables.find((entry) => entry.type === 'eng')?.pos;
      return { key: 'controlRoom', label: this.role === 'operator' ? 'Control Room HMI' : 'ESCO Engineering Station', pos: station || this.world.navAnchors.controlRoom || this.world.anchors.controlRoom };
    }
    const key = scenario.anchor;
    return { key, label: this.role === 'maintenance' ? `Maintenance check - ${scenario.area}` : `Field check - ${scenario.area}`, pos: this.world.navAnchors[key] || this.world.anchors[key] };
  }

  update() {
    if (!this.active || !this.deployed || !this.state) return;
    const now = performance.now();
    if (now - this.lastPositionAt >= 100) {
      this.lastPositionAt = now;
      this.send({ type: 'position', x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw });
    }
    for (const [id, avatar] of this.remotes) {
      const remote = this.state.players.find((entry) => entry.id === id);
      if (!remote) continue;
      avatar.group.position.lerp(new THREE.Vector3(remote.x, 0, remote.z), 0.18);
      avatar.group.rotation.y += (remote.yaw - avatar.group.rotation.y) * 0.18;
    }
    const scenario = scenarioById(this.state.scenarioId);
    if (this.role === 'field' && this.state.phase === 'active' && scenario && this.fieldReportScenario !== scenario.id) {
      const anchor = this.world.navAnchors[scenario.anchor] || this.world.anchors[scenario.anchor];
      if (anchor && Math.hypot(anchor.x - this.player.pos.x, anchor.z - this.player.pos.z) < 6) {
        this.fieldReportScenario = scenario.id;
        this.recordAction('field_report');
        this.game.toast('FIELD CONDITION REPORTED TO THE CREW');
      }
    }
  }

  teleportToRole() {
    const spawn = {
      controls: { x: 7.6, z: 25, yaw: 0 },
      operator: { x: -5, z: 25.3, yaw: 3.14 },
      field: { x: 44, z: 34.5, yaw: 3.14 },
      maintenance: { x: 38, z: 34.5, yaw: 3.14 },
    }[this.role] || { x: 44, z: 34.5, yaw: 3.14 };
    this.player.teleport(spawn.x, spawn.z, spawn.yaw);
  }

  renderLobby() {
    const joined = !!this.room;
    this.connectView.classList.toggle('hidden', joined);
    this.roomView.classList.toggle('hidden', !joined);
    if (!joined || !this.state) return;
    this.roomCodeEl.textContent = this.room;
    const occupied = new Map(this.state.players.filter((entry) => entry.role).map((entry) => [entry.role, entry]));
    document.querySelectorAll('[data-mp-role]').forEach((button) => {
      const role = button.dataset.mpRole;
      const holder = occupied.get(role);
      button.classList.toggle('selected', holder?.id === this.selfId);
      button.disabled = this.state.phase !== 'lobby' || (!!holder && holder.id !== this.selfId);
      const assignment = button.querySelector('small');
      if (assignment) assignment.textContent = holder ? `${holder.name}${holder.connected ? '' : ' - RECONNECTING'}` : 'OPEN';
    });
    this.rosterEl.innerHTML = '';
    for (const player of this.state.players) {
      const row = document.createElement('div');
      row.className = `mp-roster-row${player.connected ? '' : ' offline'}`;
      const role = MULTIPLAYER_ROLES[player.role];
      const name = document.createElement('b');
      name.textContent = `${player.name}${player.id === this.state.hostId ? ' - CREW LEAD' : ''}`;
      const assignment = document.createElement('span');
      assignment.textContent = role?.name || 'ROLE NOT SELECTED';
      if (role) assignment.style.color = role.color;
      row.append(name, assignment);
      this.rosterEl.appendChild(row);
    }
    this.startButton.classList.toggle('hidden', !this.isHost || this.state.phase !== 'lobby');
    this.startButton.disabled = this.state.players.some((entry) => entry.connected && !entry.role);
    this.startButton.textContent = this.state.players.length < 2 ? 'DEPLOY SOLO TEST' : 'DEPLOY CREW';
    this.reconnectButton.classList.toggle('hidden', !!this.socket && this.socket.readyState <= WebSocket.OPEN);
    this.setStatus(this.state.phase === 'lobby'
      ? `${this.state.players.filter((entry) => entry.connected).length}/4 TECHS CONNECTED - SELECT UNIQUE ROLES`
      : `SHIFT LIVE - ${this.state.players.filter((entry) => entry.connected).length} TECHS CONNECTED`, 'good');
  }

  copyInvite() {
    const url = `${location.origin}${location.pathname}?room=${this.room}`;
    navigator.clipboard?.writeText(url).then(
      () => this.setStatus('INVITE LINK COPIED', 'good'),
      () => this.setStatus(`ROOM CODE ${this.room} - SEND IT TO YOUR CREW`, 'good'),
    );
  }

  setStatus(text, kind = '') {
    this.statusEl.textContent = text;
    this.statusEl.className = kind;
  }

  syncAvatars(players) {
    const activeIds = new Set();
    for (const remote of players) {
      if (remote.id === this.selfId || !remote.connected || !remote.role) continue;
      activeIds.add(remote.id);
      let avatar = this.remotes.get(remote.id);
      if (!avatar) {
        avatar = this.makeAvatar(remote);
        this.remotes.set(remote.id, avatar);
        this.scene.add(avatar.group);
      }
      avatar.group.visible = this.deployed || this.state?.phase !== 'lobby';
      avatar.group.position.set(remote.x, 0, remote.z);
    }
    for (const [id, avatar] of this.remotes) {
      if (!activeIds.has(id)) {
        this.scene.remove(avatar.group);
        this.remotes.delete(id);
      }
    }
  }

  makeAvatar(remote) {
    const color = MULTIPLAYER_ROLES[remote.role]?.color || '#ffffff';
    const group = new THREE.Group();
    const uniform = new THREE.MeshStandardMaterial({ color: '#28333b', roughness: 0.9 });
    const vest = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
    const skin = new THREE.MeshStandardMaterial({ color: '#c99372', roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.9, 8), uniform);
    body.position.y = 1.12;
    const vestMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.42, 0.48, 8), vest);
    vestMesh.position.y = 1.23;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), skin);
    head.position.y = 1.78;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.265, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), vest);
    helmet.position.y = 1.86;
    const legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.24);
    const left = new THREE.Mesh(legGeo, uniform); left.position.set(-0.16, 0.38, 0);
    const right = new THREE.Mesh(legGeo, uniform); right.position.set(0.16, 0.38, 0);
    group.add(body, vestMesh, head, helmet, left, right, this.makeLabel(`${remote.name}\n${MULTIPLAYER_ROLES[remote.role]?.short || ''}`, color));
    group.position.set(remote.x, 0, remote.z);
    group.rotation.y = remote.yaw;
    group.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    return { group };
  }

  makeLabel(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 384; canvas.height = 96;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgba(5,10,13,.88)'; context.fillRect(0, 0, 384, 96);
    context.strokeStyle = color; context.lineWidth = 4; context.strokeRect(2, 2, 380, 92);
    context.textAlign = 'center'; context.fillStyle = '#fff'; context.font = '700 28px Segoe UI';
    const [name, role] = text.split('\n'); context.fillText(name, 192, 38);
    context.fillStyle = color; context.font = '700 20px Consolas'; context.fillText(role, 192, 70);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
    sprite.position.y = 2.45; sprite.scale.set(2.8, 0.7, 1); sprite.renderOrder = 20;
    return sprite;
  }

  clearAvatars() {
    for (const avatar of this.remotes.values()) this.scene.remove(avatar.group);
    this.remotes.clear();
  }
}

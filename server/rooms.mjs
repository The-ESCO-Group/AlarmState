import crypto from 'node:crypto';
import { SCENARIOS } from '../js/data/scenarios.js';
import {
  MULTIPLAYER_LIMIT,
  MULTIPLAYER_ROLES,
  cleanCallsign,
  cleanRoomCode,
  normalizeTag,
} from '../js/multiplayer-protocol.js';

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TIER_SECONDS = { easy: 95, normal: 75, hard: 55 };
const ROLE_SPAWNS = {
  controls: { x: 7.6, z: 25, yaw: 0 },
  operator: { x: -5, z: 25.3, yaw: 3.14 },
  field: { x: 44, z: 34.5, yaw: 3.14 },
  maintenance: { x: 38, z: 34.5, yaw: 3.14 },
};

const MANAGER_LINES = {
  start: [
    ['voss', 'Crew, the alarm is live. Divide the work, use the evidence, and give me one defensible failed point before production trips.'],
    ['frank', 'Controls owns the cause. HMI owns the process picture. Field and maintenance prove what the screen cannot. Move.'],
  ],
  pressure: [
    ['voss', 'This unit is losing rate while four people investigate. I expect four useful reports, not four spectators.'],
    ['frank', 'Stop repeating the alarm text. Compare command, feedback, and physical response, then close the call.'],
    ['voss', 'The escalation clock does not care who is still walking. Get the evidence onto the radio now.'],
  ],
  critical: [
    ['voss', 'Critical alarm. The next delay becomes a shutdown on the entire crew record.'],
    ['frank', 'You burned the warning window. Controls, use what the crew found and identify the initiating failure.'],
  ],
  shutdown: [
    ['voss', 'The plant is down. That strike belongs to every name in this room. Finish the cause before you lose the call too.'],
  ],
};

function randomId(bytes = 12) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function shuffledScenarioIds() {
  const ids = SCENARIOS.map((scenario) => scenario.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

function scenarioById(id) {
  return SCENARIOS.find((scenario) => scenario.id === id) || null;
}

function scoreFor(tier, elapsed, tierSeconds) {
  const withinTier = elapsed % tierSeconds;
  const remain = Math.max(0, tierSeconds - withinTier);
  if (tier === 1) return 1000 + Math.round(remain * 5);
  if (tier === 2) return 600 + Math.round(remain * 3);
  return 200;
}

export class RoomManager {
  constructor({ now = () => Date.now(), reconnectMs = 60000 } = {}) {
    this.now = now;
    this.reconnectMs = reconnectMs;
    this.rooms = new Map();
  }

  createRoom(socket, rawName) {
    let code;
    do {
      code = Array.from({ length: 5 }, () => ROOM_CHARS[crypto.randomInt(ROOM_CHARS.length)]).join('');
    } while (this.rooms.has(code));

    const room = {
      code,
      hostId: null,
      phase: 'lobby',
      difficulty: 'normal',
      players: new Map(),
      scenarioOrder: shuffledScenarioIds(),
      scenarioIndex: -1,
      currentScenarioId: null,
      phaseStartedAt: this.now(),
      incidentStartedAt: null,
      nextScenarioAt: null,
      tier: 0,
      score: 0,
      strikes: 0,
      roundsSolved: 0,
      alarmAcked: false,
      shutdownRecorded: false,
      roleActions: {},
      sentEvents: new Set(),
      shiftStartedAt: null,
    };
    this.rooms.set(code, room);
    const player = this.addPlayer(room, socket, rawName);
    room.hostId = player.id;
    return { room, player };
  }

  joinRoom(socket, rawCode, rawName, token = '') {
    const code = cleanRoomCode(rawCode);
    const room = this.rooms.get(code);
    if (!room) throw new Error('ROOM NOT FOUND');

    if (token) {
      const prior = [...room.players.values()].find((player) => player.token === token);
      if (prior && !prior.connected) {
        prior.socket = socket;
        prior.connected = true;
        prior.disconnectedAt = null;
        prior.name = cleanCallsign(rawName || prior.name);
        return { room, player: prior, reconnected: true };
      }
    }

    if (room.phase !== 'lobby') throw new Error('ROOM ALREADY DEPLOYED - ONLY RECONNECTING TECHS MAY RETURN');
    if (room.players.size >= MULTIPLAYER_LIMIT) throw new Error('ROOM FULL');
    return { room, player: this.addPlayer(room, socket, rawName), reconnected: false };
  }

  addPlayer(room, socket, rawName) {
    const player = {
      id: randomId(8),
      token: randomId(18),
      name: cleanCallsign(rawName),
      role: null,
      connected: true,
      socket,
      disconnectedAt: null,
      x: 44,
      z: 25,
      yaw: 0,
      mistakes: 0,
    };
    room.players.set(player.id, player);
    return player;
  }

  setRole(room, player, role) {
    if (room.phase !== 'lobby') throw new Error('ROLES LOCKED AFTER DEPLOYMENT');
    if (!MULTIPLAYER_ROLES[role]) throw new Error('UNKNOWN ROLE');
    const occupied = [...room.players.values()].find((other) => other.id !== player.id && other.role === role && other.connected);
    if (occupied) throw new Error(`${MULTIPLAYER_ROLES[role].name.toUpperCase()} ALREADY ASSIGNED`);
    player.role = role;
    Object.assign(player, ROLE_SPAWNS[role]);
  }

  startRoom(room, player) {
    if (room.hostId !== player.id) throw new Error('ONLY THE CREW LEAD CAN DEPLOY THE TEAM');
    if (room.phase !== 'lobby') throw new Error('SHIFT ALREADY STARTED');
    const connected = [...room.players.values()].filter((entry) => entry.connected);
    if (!connected.length || connected.some((entry) => !entry.role)) throw new Error('EVERY CONNECTED TECH NEEDS A ROLE');
    const uniqueRoles = new Set(connected.map((entry) => entry.role));
    if (uniqueRoles.size !== connected.length) throw new Error('ROLE ASSIGNMENTS MUST BE UNIQUE');
    room.shiftStartedAt = this.now();
    this.beginBriefing(room);
  }

  beginBriefing(room) {
    room.scenarioIndex = (room.scenarioIndex + 1) % room.scenarioOrder.length;
    room.currentScenarioId = room.scenarioOrder[room.scenarioIndex];
    room.phase = 'briefing';
    room.phaseStartedAt = this.now();
    room.incidentStartedAt = null;
    room.nextScenarioAt = null;
    room.tier = 0;
    room.alarmAcked = false;
    room.shutdownRecorded = false;
    room.roleActions = {};
    room.sentEvents = new Set();
    this.emit(room, 'radio', {
      who: 'voss',
      text: `Incident ${room.scenarioIndex + 1} is assigned. Get into position. The alarm releases in six seconds.`,
    });
  }

  beginIncident(room) {
    room.phase = 'active';
    room.phaseStartedAt = this.now();
    room.incidentStartedAt = this.now();
    room.tier = 1;
    room.sentEvents.clear();
    const scenario = scenarioById(room.currentScenarioId);
    this.emit(room, 'incident', { scenarioId: scenario.id });
    for (const [who, line] of MANAGER_LINES.start) this.emit(room, 'radio', { who, text: line });
  }

  submit(room, player, rawTag, requestId) {
    if (room.phase !== 'active') return this.answerResult(player, requestId, false, 'NO ACTIVE INCIDENT');
    if (player.role !== 'controls') return this.answerResult(player, requestId, false, 'ONLY THE CONTROLS TECHNICIAN CAN SUBMIT THE FINAL I/O CAUSE');
    const scenario = scenarioById(room.currentScenarioId);
    const guess = normalizeTag(rawTag);
    if (!guess) return this.answerResult(player, requestId, false, 'ENTER A FAILED I/O TAG');
    const accepted = scenario.accept.map(normalizeTag);
    if (!accepted.includes(guess)) {
      player.mistakes += 1;
      room.score = Math.max(0, room.score - 100);
      this.answerResult(player, requestId, false, `WRONG - ${String(rawTag).toUpperCase().trim()} IS NOT THE INITIATING FAILURE. TEAM -100.`);
      this.emit(room, 'radio', { who: 'frank', text: `${player.name}, that tag is not the cause. The entire crew just paid for your guess. Recheck the evidence.` });
      return;
    }

    const seconds = Math.max(0, (this.now() - room.incidentStartedAt) / 1000);
    const award = scoreFor(room.tier, seconds, TIER_SECONDS[room.difficulty]);
    room.score += award;
    room.roundsSolved += 1;
    room.phase = 'resolved';
    room.phaseStartedAt = this.now();
    room.nextScenarioAt = this.now() + 10000;
    this.answerResult(player, requestId, true, `CAUSE CONFIRMED - ${scenario.answer}. TEAM +${award}.`);
    this.emit(room, 'resolved', {
      ok: true,
      answer: scenario.answer,
      explain: scenario.explain,
      award,
      submittedBy: player.name,
    });
    this.emit(room, 'radio', { who: 'voss', text: `Cause accepted. ${player.name} closed the call. Ten seconds to the next assignment; nobody leaves position.` });
  }

  answerResult(player, requestId, ok, msg) {
    this.send(player.socket, { type: 'answer_result', requestId, ok, msg });
  }

  recordAction(room, player, kind) {
    if (room.phase !== 'active') throw new Error('NO ACTIVE INCIDENT');
    const expected = {
      ack: 'operator',
      controls_logic: 'controls',
      field_report: 'field',
      maintenance_report: 'maintenance',
    }[kind];
    if (!expected || player.role !== expected) throw new Error('ACTION NOT AUTHORIZED FOR YOUR ROLE');
    if (kind === 'ack') room.alarmAcked = true;
    room.roleActions[player.role] = true;
    this.emit(room, 'crew_action', { playerId: player.id, role: player.role, kind, name: player.name });
  }

  updatePosition(player, payload) {
    const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    player.x = Math.max(-185, Math.min(185, finite(payload.x, player.x)));
    player.z = Math.max(-185, Math.min(185, finite(payload.z, player.z)));
    player.yaw = finite(payload.yaw, player.yaw);
  }

  disconnect(room, player) {
    player.connected = false;
    player.socket = null;
    player.disconnectedAt = this.now();
    if (room.hostId === player.id) {
      const next = [...room.players.values()].find((entry) => entry.connected);
      if (next) room.hostId = next.id;
    }
  }

  tick() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        if (!player.connected && player.disconnectedAt && now - player.disconnectedAt > this.reconnectMs) {
          room.players.delete(player.id);
        }
      }
      if (!room.players.size) {
        this.rooms.delete(room.code);
        continue;
      }
      if (![...room.players.values()].some((entry) => entry.connected)) continue;

      if (room.phase === 'briefing' && now - room.phaseStartedAt >= 6000) this.beginIncident(room);
      if (room.phase === 'resolved' && room.nextScenarioAt && now >= room.nextScenarioAt) this.beginBriefing(room);
      if (room.phase !== 'active') continue;

      const scenario = scenarioById(room.currentScenarioId);
      const elapsed = (now - room.incidentStartedAt) / 1000;
      const tierSeconds = TIER_SECONDS[room.difficulty];
      const scripted = scenario.radio?.auto || [];
      for (let index = 0; index < scripted.length; index += 1) {
        const line = scripted[index];
        const key = `scenario-${index}`;
        if (elapsed >= line.at && !room.sentEvents.has(key)) {
          room.sentEvents.add(key);
          this.emit(room, 'radio', { who: line.who, text: line.text });
        }
      }
      for (const at of [22, 48, 68]) {
        const key = `pressure-${at}`;
        if (elapsed >= at && !room.sentEvents.has(key)) {
          room.sentEvents.add(key);
          const line = MANAGER_LINES.pressure[(at / 2) % MANAGER_LINES.pressure.length | 0];
          this.emit(room, 'radio', { who: line[0], text: line[1] });
        }
      }

      if (room.tier === 1 && elapsed >= tierSeconds) {
        room.tier = 2;
        const line = MANAGER_LINES.critical[room.strikes % MANAGER_LINES.critical.length];
        this.emit(room, 'radio', { who: line[0], text: line[1] });
        this.emit(room, 'tier', { tier: 2 });
      } else if (room.tier === 2 && elapsed >= tierSeconds * 2) {
        room.tier = 3;
        if (!room.shutdownRecorded) {
          room.shutdownRecorded = true;
          room.strikes += 1;
          const line = MANAGER_LINES.shutdown[0];
          this.emit(room, 'radio', { who: line[0], text: line[1] });
          this.emit(room, 'tier', { tier: 3 });
        }
      } else if (room.tier === 3 && elapsed >= tierSeconds * 3) {
        room.phase = room.strikes >= 3 ? 'gameover' : 'resolved';
        room.phaseStartedAt = now;
        room.nextScenarioAt = room.phase === 'resolved' ? now + 10000 : null;
        this.emit(room, 'resolved', {
          ok: false,
          answer: scenario.answer,
          explain: scenario.explain,
          award: 0,
          submittedBy: null,
        });
        this.emit(room, 'radio', {
          who: 'voss',
          text: room.phase === 'gameover'
            ? 'Three shutdowns. Shift terminated. Every crew member failed this response block.'
            : 'Cause window expired. The correct point goes into the incident record as a crew failure. Prepare for the next call.',
        });
      }
    }
  }

  snapshot(room) {
    const now = this.now();
    const tierSeconds = TIER_SECONDS[room.difficulty];
    const elapsed = room.incidentStartedAt ? Math.max(0, (now - room.incidentStartedAt) / 1000) : 0;
    const phaseLeft = room.phase === 'briefing'
      ? Math.max(0, 6 - (now - room.phaseStartedAt) / 1000)
      : room.phase === 'resolved' && room.nextScenarioAt
        ? Math.max(0, (room.nextScenarioAt - now) / 1000)
        : 0;
    const tierLeft = room.phase === 'active' ? Math.max(0, tierSeconds * room.tier - elapsed) : 0;
    return {
      type: 'state',
      room: room.code,
      hostId: room.hostId,
      phase: room.phase,
      difficulty: room.difficulty,
      scenarioId: room.currentScenarioId,
      scenarioNumber: room.scenarioIndex + 1,
      elapsed,
      shiftElapsed: room.shiftStartedAt ? Math.max(0, (now - room.shiftStartedAt) / 1000) : 0,
      phaseLeft,
      tier: room.tier,
      tierLeft,
      tierSeconds,
      score: room.score,
      strikes: room.strikes,
      roundsSolved: room.roundsSolved,
      alarmAcked: room.alarmAcked,
      roleActions: room.roleActions,
      players: [...room.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        role: player.role,
        connected: player.connected,
        x: player.x,
        z: player.z,
        yaw: player.yaw,
        mistakes: player.mistakes,
      })),
    };
  }

  broadcastState(room) {
    const payload = this.snapshot(room);
    for (const player of room.players.values()) this.send(player.socket, payload);
  }

  emit(room, event, payload) {
    for (const player of room.players.values()) this.send(player.socket, { type: 'event', event, ...payload });
  }

  send(socket, payload) {
    if (socket?.readyState === 1) socket.send(JSON.stringify(payload));
  }
}

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { SCENARIOS } from '../js/data/scenarios.js';
import { createMultiplayerServer } from '../server/multiplayer-server.mjs';

class TestClient {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.messages = [];
    this.waiters = [];
    this.ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      this.messages.push(message);
      for (const waiter of [...this.waiters]) {
        if (!waiter.predicate(message)) continue;
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    });
  }

  async open() { await once(this.ws, 'open'); }
  send(payload) { this.ws.send(JSON.stringify(payload)); }

  next(predicate, timeoutMs = 9000) {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error('Timed out waiting for multiplayer message'));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  close() { this.ws.close(); }
}

const { server } = createMultiplayerServer();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = server.address().port;
const root = `http://127.0.0.1:${port}`;
const wsUrl = `ws://127.0.0.1:${port}/ws`;

try {
  const health = await fetch(`${root}/health`).then((response) => response.json());
  assert.equal(health.ok, true, 'multiplayer health endpoint responds');
  const index = await fetch(root).then((response) => response.text());
  assert.match(index, /CREW RESPONSE/, 'server hosts the playable client');

  const controls = new TestClient(wsUrl);
  const operator = new TestClient(wsUrl);
  await Promise.all([controls.open(), operator.open()]);

  controls.send({ type: 'create', name: 'Ryder' });
  const controlsWelcome = await controls.next((message) => message.type === 'welcome');
  assert.match(controlsWelcome.room, /^[A-Z0-9]{5}$/);

  operator.send({ type: 'join', room: controlsWelcome.room, name: 'Marcy' });
  const operatorWelcome = await operator.next((message) => message.type === 'welcome');
  assert.equal(operatorWelcome.room, controlsWelcome.room);

  controls.send({ type: 'role', role: 'controls' });
  operator.send({ type: 'role', role: 'operator' });
  const readyState = await controls.next((message) => message.type === 'state' &&
    message.players.filter((player) => player.role).length === 2);
  assert.equal(readyState.players.length, 2, 'both crew members share one roster');

  controls.send({ type: 'start' });
  const activeState = await controls.next((message) => message.type === 'state' && message.phase === 'active', 10000);
  assert.equal(activeState.tier, 1, 'server owns the live warning tier');
  assert.ok(activeState.scenarioId, 'server assigned a shared incident');

  operator.send({ type: 'submit', tag: 'NOT-A-TAG', requestId: 'operator-submit' });
  const denied = await operator.next((message) => message.type === 'answer_result' && message.requestId === 'operator-submit');
  assert.equal(denied.ok, false);
  assert.match(denied.msg, /CONTROLS TECHNICIAN/);

  operator.send({ type: 'action', kind: 'ack' });
  const ackedState = await controls.next((message) => message.type === 'state' && message.alarmAcked === true);
  assert.equal(ackedState.roleActions.operator, true, 'operator HMI evidence is synchronized');

  const scenario = SCENARIOS.find((entry) => entry.id === activeState.scenarioId);
  controls.send({ type: 'submit', tag: scenario.answer, requestId: 'correct-submit' });
  const accepted = await controls.next((message) => message.type === 'answer_result' && message.requestId === 'correct-submit');
  assert.equal(accepted.ok, true);
  const resolved = await operator.next((message) => message.type === 'event' && message.event === 'resolved' && message.ok === true);
  assert.equal(resolved.answer, scenario.answer);
  const resolvedState = await controls.next((message) => message.type === 'state' && message.phase === 'resolved');
  assert.ok(resolvedState.score > 0, 'crew score is authoritative and shared');
  assert.equal(resolvedState.roundsSolved, 1);

  operator.close();
  await controls.next((message) => message.type === 'state' &&
    message.players.some((player) => player.id === operatorWelcome.playerId && player.connected === false));
  const reconnectedOperator = new TestClient(wsUrl);
  await reconnectedOperator.open();
  reconnectedOperator.send({
    type: 'join', room: controlsWelcome.room, name: 'Marcy', token: operatorWelcome.token,
  });
  const reconnectWelcome = await reconnectedOperator.next((message) => message.type === 'welcome');
  assert.equal(reconnectWelcome.playerId, operatorWelcome.playerId, 'reconnect token reclaims the same crew member');
  const reconnectState = await reconnectedOperator.next((message) => message.type === 'state' &&
    message.players.some((player) => player.id === operatorWelcome.playerId && player.connected));
  assert.equal(reconnectState.players.find((player) => player.id === operatorWelcome.playerId).role, 'operator');

  controls.close();
  reconnectedOperator.close();

  const originalTab = new TestClient(wsUrl);
  const secondTab = new TestClient(wsUrl);
  const thirdTab = new TestClient(wsUrl);
  await Promise.all([originalTab.open(), secondTab.open(), thirdTab.open()]);
  originalTab.send({ type: 'create', name: 'Ryder' });
  const originalWelcome = await originalTab.next((message) => message.type === 'welcome');

  secondTab.send({
    type: 'join', room: originalWelcome.room, name: 'Ryder', token: originalWelcome.token,
  });
  const secondWelcome = await secondTab.next((message) => message.type === 'welcome');
  thirdTab.send({
    type: 'join', room: originalWelcome.room, name: 'Ryder', token: originalWelcome.token,
  });
  const thirdWelcome = await thirdTab.next((message) => message.type === 'welcome');
  const threeTabState = await originalTab.next((message) => message.type === 'state' && message.players.length === 3);

  assert.equal(new Set([originalWelcome.playerId, secondWelcome.playerId, thirdWelcome.playerId]).size, 3,
    'an active reconnect token cannot collapse multiple tabs into one identity');
  assert.equal(threeTabState.players.filter((entry) => entry.id === threeTabState.hostId).length, 1,
    'only one crew member is the crew lead');

  originalTab.close();
  secondTab.close();
  thirdTab.close();
  console.log('Multiplayer protocol: rooms, roles, reconnects, tab isolation, evidence, and scoring passed.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}

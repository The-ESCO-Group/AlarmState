const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = process.env.ALARMSTATE_URL || 'http://127.0.0.1:5191';
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  const errors = [];
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  pageA.setDefaultNavigationTimeout(90000);
  pageB.setDefaultNavigationTimeout(90000);
  for (const page of [pageA, pageB]) {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  }

  try {
    await pageA.goto(root, { waitUntil: 'domcontentloaded' });
    await pageA.waitForSelector('#btn-multiplayer:not([disabled])');
    await pageA.screenshot({ path: path.join(artifacts, 'multiplayer-menu.png'), timeout: 90000 });
    await pageA.click('#btn-multiplayer');
    await pageA.waitForSelector('#multiplayer:not(.hidden)');
    await pageA.screenshot({ path: path.join(artifacts, 'multiplayer-entry.png'), timeout: 90000 });
    await pageA.fill('#mp-name', 'Ryder');
    await pageA.click('#mp-create');
    await pageA.waitForFunction(() => document.querySelector('#mp-room-code')?.textContent.length === 5);
    const room = await pageA.textContent('#mp-room-code');

    await pageB.goto(`${root}/?room=${room}`, { waitUntil: 'domcontentloaded' });
    await pageB.waitForSelector('#btn-multiplayer:not([disabled])', { timeout: 60000 });
    await pageB.click('#btn-multiplayer');
    await pageB.fill('#mp-name', 'Marcy');
    await pageB.click('#mp-join');
    await pageB.locator('.mp-roster-row').nth(1).waitFor({ timeout: 60000 });
    await pageA.locator('.mp-roster-row').nth(1).waitFor({ timeout: 60000 });
    await pageA.click('[data-mp-role="controls"]');
    await pageB.click('[data-mp-role="operator"]');
    await pageA.waitForFunction(() => !document.querySelector('#mp-start').disabled);
    await pageA.screenshot({ path: path.join(artifacts, 'multiplayer-lobby.png'), timeout: 90000 });
    await pageA.click('#mp-start');

    await pageA.waitForSelector('#hud:not(.hidden)');
    await pageB.waitForSelector('#hud:not(.hidden)');
    await pageA.waitForFunction(() => window.__alarmstate?.game?.state === 'active', null, { timeout: 10000 });
    await pageB.waitForFunction(() => window.__alarmstate?.game?.state === 'active', null, { timeout: 10000 });
    assert.equal(await pageA.evaluate(() => window.__alarmstate.multiplayer.state.players.length), 2);
    assert.equal(await pageA.evaluate(() => window.__alarmstate.multiplayer.remotes.size), 1);

    await pageB.evaluate(() => window.__alarmstate.player.teleport(5, 23.8, 0));
    await pageB.waitForTimeout(700);
    await pageA.screenshot({ path: path.join(artifacts, 'multiplayer-plant.png'), timeout: 90000 });

    await pageB.keyboard.press('h');
    await pageB.waitForSelector('#esco:not(.hidden)');
    await pageB.waitForTimeout(900);
    await pageB.screenshot({ path: path.join(artifacts, 'multiplayer-operator-hmi.png'), timeout: 90000 });
    await pageA.waitForFunction(() => window.__alarmstate.multiplayer.state.alarmAcked === true);
    await pageB.keyboard.press('Escape');

    await pageA.keyboard.press('Tab');
    await pageA.waitForSelector('#esco:not(.hidden)');
    await pageA.waitForFunction(() => window.__alarmstate.multiplayer.state.roleActions.controls === true);
    await pageA.keyboard.press('Escape');
    await pageA.keyboard.press('Enter');
    await pageA.waitForSelector('#solve:not(.hidden)');
    const answer = await pageA.evaluate(() => window.__alarmstate.game.activeScenario.answer);
    await pageA.fill('#solve-input', answer);
    await pageA.press('#solve-input', 'Enter');
    await pageA.waitForFunction(() => window.__alarmstate.multiplayer.state.phase === 'resolved');
    assert.ok(await pageA.evaluate(() => window.__alarmstate.multiplayer.state.score > 0));

    const canvas = await pageA.locator('#app canvas').boundingBox();
    assert.ok(canvas && canvas.width >= 1000 && canvas.height >= 700, '3D canvas fills the viewport');
    assert.deepEqual(errors, [], `browser console errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ room, score: await pageA.evaluate(() => window.__alarmstate.multiplayer.state.score), screenshots: 4 }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

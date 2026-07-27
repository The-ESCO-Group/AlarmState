const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = 'http://127.0.0.1:5191';
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });

async function openMultiplayer(page, room = '') {
  page.setDefaultNavigationTimeout(90000);
  await page.goto(`${root}/${room ? `?room=${room}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btn-multiplayer:not([disabled])', { timeout: 90000 });
  await page.click('#btn-multiplayer');
  await page.waitForSelector('#multiplayer:not(.hidden)');
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pages = await Promise.all([context.newPage(), context.newPage(), context.newPage()]);
  const errors = [];
  for (const page of pages) {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  }

  try {
    const [lead, techTwo, techThree] = pages;
    await openMultiplayer(lead);
    await lead.fill('#mp-name', 'Ryder');
    await lead.click('#mp-create');
    await lead.waitForFunction(() => document.querySelector('#mp-room-code')?.textContent.length === 5);
    const room = await lead.textContent('#mp-room-code');

    await openMultiplayer(techTwo, room);
    await techTwo.fill('#mp-name', 'Marcy');
    await techTwo.click('#mp-join');
    await techTwo.waitForFunction(
      () => window.__alarmstate?.multiplayer?.selfId,
      null,
      { timeout: 90000 },
    );

    await openMultiplayer(techThree, room);
    await techThree.fill('#mp-name', 'Eli');
    await techThree.click('#mp-join');
    await techThree.waitForFunction(
      () => window.__alarmstate?.multiplayer?.selfId,
      null,
      { timeout: 90000 },
    );
    await lead.waitForFunction(
      () => window.__alarmstate?.multiplayer?.state?.players.length === 3,
      null,
      { timeout: 90000 },
    );

    const clients = await Promise.all(pages.map((page) => page.evaluate(() => ({
      selfId: window.__alarmstate.multiplayer.selfId,
      hostId: window.__alarmstate.multiplayer.state.hostId,
      isHost: window.__alarmstate.multiplayer.isHost,
      connected: window.__alarmstate.multiplayer.state.players.filter((player) => player.connected).length,
    }))));
    assert.equal(new Set(clients.map((client) => client.selfId)).size, 3, 'each tab has a unique player identity');
    assert.equal(clients.filter((client) => client.isHost).length, 1, 'only one tab is the crew lead');
    assert.equal(clients[0].selfId, clients[0].hostId, 'the room creator remains crew lead');
    assert.ok(clients.every((client) => client.connected === 3), 'all tabs see 3/4 crew connected');

    const leadLabels = await lead.locator('.mp-roster-row b').allTextContents();
    assert.equal(leadLabels.filter((label) => label.includes('CREW LEAD')).length, 1);
    await lead.screenshot({ path: path.join(artifacts, 'multitab-lobby.png') });
    assert.deepEqual(errors, [], `browser console errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ room, players: clients.length, crewLeads: 1, screenshot: 'multitab-lobby.png' }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

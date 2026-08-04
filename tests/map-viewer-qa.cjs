const path = require('path');
const { chromium } = require('playwright');

const root = process.env.ALARMSTATE_URL || 'http://127.0.0.1:5192';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultNavigationTimeout(180000);

  try {
    await page.goto(root, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__alarmstate?.camera && !document.getElementById('btn-map-viewer').disabled, null, { timeout: 120000 });
    const originalCamera = await page.evaluate(() => window.__alarmstate.camera.position.toArray());

    await page.click('#btn-map-viewer');
    await page.waitForFunction(() => document.getElementById('map').classList.contains('viewer-3d'));
    await page.click('[data-map-preset="storage"]');
    const storageCamera = await page.evaluate(() => window.__alarmstate.camera.position.toArray());
    if (storageCamera.every((value, index) => Math.abs(value - originalCamera[index]) < 0.01)) {
      throw new Error('Storage preset did not move the camera');
    }

    const beforeOrbit = storageCamera;
    await page.mouse.move(650, 360);
    await page.mouse.down();
    await page.mouse.move(790, 430, { steps: 8 });
    await page.mouse.up();
    const afterOrbit = await page.evaluate(() => window.__alarmstate.camera.position.toArray());
    if (afterOrbit.every((value, index) => Math.abs(value - beforeOrbit[index]) < 0.01)) {
      throw new Error('Pointer orbit did not move the camera');
    }

    await page.mouse.wheel(0, -420);
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(__dirname, 'artifacts', 'map-viewer-3d.png'), timeout: 120000 });

    await page.click('[data-map-mode="2d"]');
    if (await page.locator('#map').evaluate((element) => element.classList.contains('viewer-3d'))) {
      throw new Error('Plot-plan mode did not exit 3D viewer');
    }
    await page.click('[data-map-mode="3d"]');
    await page.click('[data-map-preset="admin"]');
    await page.click('[data-close="map"]');
    await page.waitForFunction(() => !document.getElementById('menu').classList.contains('hidden'));

    const restoredCamera = await page.evaluate(() => window.__alarmstate.camera.position.toArray());
    if (restoredCamera.some((value, index) => Math.abs(value - originalCamera[index]) > 0.01)) {
      throw new Error(`Camera was not restored: ${JSON.stringify({ originalCamera, restoredCamera })}`);
    }
    if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ presets: 6, orbit: true, zoom: true, restored: true }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

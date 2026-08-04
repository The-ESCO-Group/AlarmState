const path = require('path');
const { chromium } = require('playwright');

const root = process.env.ALARMSTATE_URL || 'http://127.0.0.1:5192';
const artifacts = path.join(__dirname, 'artifacts');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.setDefaultNavigationTimeout(180000);

  try {
    await page.goto(root, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__alarmstate?.world, null, { timeout: 120000 });
    await page.evaluate(async () => {
      await window.__alarmstate.world.architectureReady;
      await document.fonts.ready;
      document.getElementById('menu').classList.add('hidden');
    });

    const capture = async (name, position, target) => {
      await page.evaluate(({ position, target }) => {
        const { camera, renderer, scene } = window.__alarmstate;
        camera.position.set(...position);
        camera.lookAt(...target);
        camera.updateMatrixWorld(true);
        renderer.render(scene, camera);
      }, { position, target });
      await page.screenshot({ path: path.join(artifacts, name), timeout: 120000 });
    };

    await capture('architecture-aerial.png', [235, 150, -235], [15, 10, -5]);
    await capture('architecture-mill.png', [188, 24, -10], [132, 18, -49]);
    await capture('architecture-warehouse.png', [-6, 17, 116], [-45, 9, 151]);
    await capture('architecture-admin.png', [36, 8, -181], [36, 3.2, -149]);

    if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join(' | ')}`);
    console.log(JSON.stringify({ screenshots: 4, architectureReady: true }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

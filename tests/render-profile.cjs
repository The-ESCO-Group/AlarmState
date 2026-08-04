const { chromium } = require('playwright');

const root = process.env.ALARMSTATE_URL || 'http://127.0.0.1:5191';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.setDefaultNavigationTimeout(120000);

  try {
    await page.goto(root, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__alarmstate?.renderer, null, { timeout: 60000 });
    await page.waitForTimeout(8000);
    const fps = await page.evaluate(() => new Promise((resolve) => {
      let frames = 0;
      const started = performance.now();
      const sample = () => {
        frames += 1;
        const elapsed = performance.now() - started;
        if (elapsed >= 2500) resolve((frames * 1000) / elapsed);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    const info = await page.evaluate(() => {
      const { render, memory } = window.__alarmstate.renderer.info;
      return {
        calls: render.calls,
        triangles: render.triangles,
        lines: render.lines,
        geometries: memory.geometries,
        textures: memory.textures,
      };
    });
    console.log(JSON.stringify({ fps: Number(fps.toFixed(1)), ...info }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

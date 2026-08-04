// ============================================================================
// Browser QA: the real Plant 7 controller, rendered by the real ESCO studio.
//
// The conformance suite proves the ladder is structurally correct as data. This
// proves the studio actually draws it: the seal-in branch renders as a parallel
// branch, the terminal coil lands on the right rail, the timer/.DN pair reads
// as two rungs, and the live tag image reaches the controller through the same
// message channel the game uses.
//
// Requires the LAN server: npm.cmd run start:multi
// ============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = 'http://127.0.0.1:5191';
const projectKey = 'plant7-ladder-qa';
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });

const importJs = (name) => import(pathToFileURL(path.join(__dirname, '..', 'js', name)));

(async () => {
  const { buildPlant7Project } = await importJs('plant7-esco.js');
  const { PlcScan } = await importJs('plc.js');
  const { ProcessSim } = await importJs('sim.js');
  const { SCENARIOS } = await importJs('data/scenarios.js');

  // Solve the mill vibration incident, exactly as the running game would.
  const scenario = SCENARIOS.find((entry) => entry.id === 'PREP_MILL_VIB');
  const sim = new ProcessSim();
  const plc = new PlcScan(sim);
  for (let step = 0; step < 100; step += 1) { sim.tick(0.05); plc.scan(0.05); }
  sim.startScenario(scenario.overrides);
  for (let step = 0; step < 200 * 20; step += 1) { sim.tick(0.05); plc.scan(0.05); }
  assert.equal(plc.isSet('VAH_1120'), true, 'the incident must be alarming before the studio opens');

  const image = plc.image();
  const project = buildPlant7Project(scenario, image);
  const millRungs = project.controllers[0].programs
    .find((program) => program.name === 'Prep').routines
    .find((routine) => routine.name === 'P11_Mills').ladder.rungs;
  const sealInRung = millRungs.find((rung) => rung.sourceText.includes('OTE(M1110_Run_Cmd)'));
  assert.ok(sealInRung, 'the mill A starter rung must exist');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  try {
    await page.goto(root, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ key, value }) => {
      localStorage.setItem(`alarmstate:esco:project:${key}`, JSON.stringify(value));
      localStorage.removeItem(`esco:autosave:alarmstate:${key}:v1`);
    }, { key: projectKey, value: project });

    await page.goto(
      `${root}/esco/index.html?factoryforge=1&alarmstate=1&alarmstateProject=${projectKey}&view=routine&routine=P11_Mills`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.waitForSelector('.esco-lad__rung');

    const renderedRungs = await page.locator('.esco-lad__rung').count();
    assert.equal(renderedRungs, millRungs.length,
      `the studio must render all ${millRungs.length} rungs of P11_Mills, drew ${renderedRungs}`);

    // The seal-in must render as an actual parallel branch, not a flat series.
    const parallelGroups = await page.locator('.esco-lad__parallel').count();
    assert.ok(parallelGroups >= 1, 'the 3-wire starter seal-in must draw as a parallel branch');

    // No empty branch legs: an empty leg permanently passes power.
    assert.equal(await page.locator('.esco-lad__branch-empty').count(), 0,
      'no rung may render an empty branch leg');

    // The terminal coil sits against the right rail, as a Logix output does.
    const starterIndex = millRungs.indexOf(sealInRung);
    const starterRung = page.locator('.esco-lad__rung').nth(starterIndex);
    const coil = starterRung.locator('.esco-lad__node--ote').last();
    const railBox = await starterRung.locator('.esco-lad__rail--right').boundingBox();
    const coilBox = await coil.boundingBox();
    assert.ok(coilBox && railBox, 'the starter coil and the right rail must both render');
    const gap = railBox.x - (coilBox.x + coilBox.width);
    assert.ok(gap >= -2 && gap < 180, `the terminal coil must sit on the right rail; gap was ${gap}px`);

    // The operands on the rungs are the real controller tags. Contacts render
    // their tag in an editable operand field, so read those rather than text.
    const operands = new Set(await page.locator('.esco-lad__diagram input').evaluateAll(
      (inputs) => inputs.map((input) => input.value),
    ));
    for (const expected of [
      'M1110_Start_PB', 'M1110_Run_Cmd', 'M1110_Stop_PB', 'Prep_Permissive',
      'M1110_OL_OK', 'VSH_1120_Trip', 'M_1110', 'VT_1120', 'T_VAH_1120.DN',
    ]) {
      assert.ok(operands.has(expected), `P11_Mills must show operand ${expected}`);
    }
    // The seal-in reads its own coil back — that is what makes it a seal-in.
    const starterOperands = await page.locator('.esco-lad__rung').nth(starterIndex)
      .locator('input').evaluateAll((inputs) => inputs.map((input) => input.value));
    assert.equal(starterOperands.filter((value) => value === 'M1110_Run_Cmd').length, 2,
      'the starter rung must reference the run coil twice: once as the seal-in contact, once as the output');

    // Push the solved tag image in the way the game does, and confirm the
    // controller accepts it without error.
    await page.evaluate((values) => {
      window.postMessage({ type: 'alarmstate-tag-values', values }, window.location.origin);
    }, image);
    await page.waitForTimeout(400);

    await page.screenshot({ path: path.join(artifacts, 'plant7-mills-ladder.png'), fullPage: true });

    assert.deepEqual(errors, [], `browser console errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({
      routine: 'Prep/P11_Mills',
      rungs: renderedRungs,
      parallelBranches: parallelGroups,
      emptyLegs: 0,
      coilToRailPx: Math.round(gap),
      screenshot: 'tests/artifacts/plant7-mills-ladder.png',
    }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

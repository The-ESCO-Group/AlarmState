const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = 'http://127.0.0.1:5191';
const projectKey = 'ladder-qa';
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });

const operand = (name, value) => ({ name, kind: 'tag', value });
const node = (id, instructionType, ...values) => ({
  id,
  instructionType,
  operands: values.map((value, index) => operand(index ? `operand${index}` : 'tag', value)),
});
const branch = (id, nodes, parallelBranches = [], next = undefined) => ({
  id,
  nodes,
  ...(parallelBranches.length ? { parallelBranches } : {}),
  ...(next ? { next } : {}),
});

(async () => {
  const { buildPlant7Project } = await import(
    pathToFileURL(path.join(__dirname, '..', 'js', 'plant7-esco.js'))
  );
  const project = buildPlant7Project(null);
  const controller = project.controllers[0];
  const program = controller.programs[0];
  const routine = program.routines[0];
  const boolTags = [
    'Start_PB', 'Stop_PB', 'EStop_OK', 'Motor_Run', 'Stack_Green',
  ];
  for (const name of boolTags) {
    if (!controller.controllerTags.some((tag) => tag.name === name)) {
      controller.controllerTags.push({
        id: `qa-tag-${name}`,
        scopeId: controller.id,
        name,
        dataType: 'BOOL',
        value: false,
      });
    }
  }
  controller.controllerTags.push({
    id: 'qa-tag-runtime',
    scopeId: controller.id,
    name: 'Runtime',
    dataType: 'TIMER',
  });
  routine.name = 'MainRoutine';
  routine.ladder.rungs = [
    {
      id: 'qa-rung-0',
      routineId: routine.id,
      number: 0,
      comment: 'QA: Logix output instructions pass rung condition through in series.',
      root: branch('qa-rung-0-root', [
        node('qa-green-input', 'XIC', 'Motor_Run'),
        node('qa-green-output', 'OTE', 'Stack_Green'),
        node('qa-runtime', 'RTO', 'Runtime', '1000'),
      ]),
    },
    {
      id: 'qa-rung-1',
      routineId: routine.id,
      number: 1,
      comment: 'QA: seal-in branch must merge before the terminal output.',
      root: branch(
        'qa-rung-1-root',
        [node('qa-start', 'XIC', 'Start_PB')],
        [branch('qa-rung-1-hold', [node('qa-hold', 'XIC', 'Motor_Run')])],
        branch('qa-rung-1-next', [
          node('qa-stop', 'XIO', 'Stop_PB'),
          node('qa-estop', 'XIC', 'EStop_OK'),
          node('qa-motor-output', 'OTE', 'Motor_Run'),
        ]),
      ),
    },
  ];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  try {
    await page.goto(root, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ key, value }) => {
      localStorage.setItem(`alarmstate:esco:project:${key}`, JSON.stringify(value));
      localStorage.removeItem(`esco:autosave:alarmstate:${key}:v1`);
    }, { key: projectKey, value: project });

    await page.goto(
      `${root}/esco/index.html?factoryforge=1&alarmstate=1&alarmstateProject=${projectKey}&view=routine&routine=MainRoutine`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.waitForSelector('.esco-lad__rung');
    assert.equal(await page.locator('.esco-lad__rung').count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('alarmstate-embed')), true);

    const motorRung = page.locator('.esco-lad__rung').nth(1);
    const coil = motorRung.locator('.esco-lad__node--ote').last();
    const rail = motorRung.locator('.esco-lad__rail--right');
    const coilBox = await coil.boundingBox();
    const railBox = await rail.boundingBox();
    assert.ok(coilBox && railBox, 'motor output and right rail must render');
    const outputGap = railBox.x - (coilBox.x + coilBox.width);
    assert.ok(outputGap >= -2 && outputGap < 180, `terminal OTE must align near the right rail; gap was ${outputGap}px`);

    const rtoCount = await page.locator('.esco-lad__box-name', { hasText: 'RTO' }).count();
    await motorRung.click();
    await page.locator('button:visible').filter({ hasText: /^RTO$/ }).first().click();
    await page.waitForTimeout(150);
    assert.equal(
      await page.locator('.esco-lad__box-name', { hasText: 'RTO' }).count(),
      rtoCount + 1,
      'embedded editor must allow legal Logix output instructions in series',
    );

    await page.locator('input[value="Stack_Green"]').fill('Stack_Green_QA');
    await page.waitForFunction((key) =>
      localStorage.getItem(`esco:autosave:alarmstate:${key}:v1`)?.includes('Stack_Green_QA'),
    projectKey);

    await page.screenshot({ path: path.join(artifacts, 'ladder-structure.png'), fullPage: true });
    assert.deepEqual(errors, [], `browser console errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({
      rungs: 2,
      outputGap: Math.round(outputGap),
      scopedAutosave: true,
      screenshot: 'tests/artifacts/ladder-structure.png',
    }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

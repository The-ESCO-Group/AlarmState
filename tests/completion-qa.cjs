const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = 'http://127.0.0.1:5191';
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });

(async () => {
  const { COURSE_WEEKS } = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'course.js')));
  const missions = COURSE_WEEKS.flatMap((week) => week.missions);
  const escoMissionIds = missions.filter((mission) => mission.kind === 'esco').map((mission) => mission.id);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  try {
    await page.goto(root, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__alarmstate?.course);
    await page.evaluate(() => window.__alarmstate.course.reset());

    for (let index = 0; index < missions.length; index += 1) {
      const mission = missions[index];
      const result = await page.evaluate(({ missionId, scenarioIds, target, kind }) => {
        const { course } = window.__alarmstate;
        const liveMission = course.mission(missionId);
        if (kind === 'esco') {
          course.completeMission(missionId, 100);
        } else {
          course.beginDrill(liveMission);
          for (const id of scenarioIds.slice(0, target || 1)) {
            course.recordScenarioSolved({ id }, 9000);
          }
          course.endDrill();
        }
        return {
          completed: !!course.progress.completed[missionId],
          done: course.overallProgress().done,
          next: course.nextMission()?.id || null,
          week: course.progress.selectedWeek,
        };
      }, {
        missionId: mission.id,
        scenarioIds: mission.scenarioIds || [],
        target: mission.target || 1,
        kind: mission.kind,
      });
      assert.equal(result.completed, true, `${mission.id} must record completion`);
      assert.equal(result.done, index + 1, `${mission.id} must advance overall progress exactly once`);
      assert.equal(result.next, missions[index + 1]?.id || null, `${mission.id} must unlock the correct next assignment`);
    }

    const finalTransition = await page.evaluate(() => {
      const { campaign, course } = window.__alarmstate;
      const final = course.mission('w12-capstone');
      campaign.start();
      campaign.finish(final, true);
      const next = campaign.atDispatch();
      return {
        next: next?.id || null,
        stage: campaign.stage,
        manager: campaign.managerState({ state: 'campaign' }),
        summary: course.completionSummary(),
      };
    });
    assert.equal(finalTransition.next, null);
    assert.equal(finalTransition.stage, 'qualified');
    assert.equal(finalTransition.manager, 'ACCEPTANCE CLOSED');
    assert.equal(finalTransition.summary.done, 21);
    assert.equal(finalTransition.summary.percent, 100);
    assert.equal(finalTransition.summary.average, 100);
    assert.ok(finalTransition.summary.completedAt, 'completion timestamp must be persisted');

    await page.evaluate((ids) => {
      const acceptedAt = new Date().toISOString();
      const archive = {
        version: 1,
        createdAt: acceptedAt,
        updatedAt: acceptedAt,
        order: ids,
        missions: Object.fromEntries(ids.map((id) => [id, {
          missionId: id,
          title: id,
          acceptedAt,
          creditedMissionIds: [id],
          project: {},
        }])),
      };
      localStorage.setItem('alarmstate:esco:course-archive:v1', JSON.stringify(archive));
    }, escoMissionIds);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#btn-course:not([disabled])', { timeout: 120000 });
    await page.click('#btn-course');
    await page.waitForSelector('#qualification:not(.hidden)');
    assert.equal(await page.textContent('#qualification-assignments'), '21 / 21');
    assert.equal(await page.textContent('#qualification-average'), '100%');
    assert.equal(await page.textContent('#qualification-portfolio'), '8 / 8');
    assert.equal(await page.evaluate(() => window.__alarmstate.campaign.stage), 'qualified');
    await page.screenshot({ path: path.join(artifacts, 'qualification-complete.png') });

    const qualificationHitTest = await page.evaluate(() => {
      const button = document.getElementById('qualification-log');
      const panel = document.getElementById('qualification-panel');
      const overlay = document.getElementById('qualification');
      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        point: { x, y },
        hit: { id: hit?.id || '', tag: hit?.tagName || '', className: hit?.className || '' },
        button: { pointerEvents: getComputedStyle(button).pointerEvents, zIndex: getComputedStyle(button).zIndex },
        panel: { pointerEvents: getComputedStyle(panel).pointerEvents, zIndex: getComputedStyle(panel).zIndex },
        overlay: { pointerEvents: getComputedStyle(overlay).pointerEvents, zIndex: getComputedStyle(overlay).zIndex },
      };
    });
    console.log(`Qualification hit test: ${JSON.stringify(qualificationHitTest)}`);
    assert.equal(qualificationHitTest.hit.id, 'qualification-log',
      'the final record button must own its visible hit-test area');
    await page.evaluate(() => document.getElementById('qualification-log').click());
    await page.waitForSelector('#course:not(.hidden)');
    assert.equal(await page.locator('.course-week.complete').count(), 12);
    assert.match(await page.textContent('.course-progress'), /100%/);
    assert.match(await page.textContent('.course-progress'), /21\/21 practicals/);
    await page.screenshot({ path: path.join(artifacts, 'qualification-log-complete.png') });

    assert.deepEqual(errors, [], `browser console errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({
      weeks: 12,
      assignments: missions.length,
      average: finalTransition.summary.average,
      finalStage: finalTransition.stage,
      screenshots: ['qualification-complete.png', 'qualification-log-complete.png'],
    }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

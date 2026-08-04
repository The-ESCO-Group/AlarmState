import assert from 'node:assert/strict';
import { COURSE_WEEKS, CV101_TAGS } from '../js/course.js';
import { ESCO_VALIDATORS, buildCoursePortfolioProject, clearCourseProjectRungs } from '../js/esco.js';
import { SCENARIOS } from '../js/data/scenarios.js';
import { Game } from '../js/game.js';
import { buildPlant7Project, escoTagName } from '../js/plant7-esco.js';
import { ALARM_DEFS, PROGRAMS } from '../js/data/plant-logic.js';
import { CampaignDirector } from '../js/campaign.js';

assert.equal(COURSE_WEEKS.length, 12, 'course must contain twelve weeks');
const missions = COURSE_WEEKS.flatMap((week) => week.missions);
assert.equal(new Set(missions.map((mission) => mission.id)).size, missions.length, 'mission ids must be unique');
assert.ok(missions.every((mission) => mission.studioMode), 'every practical must declare an ESCO workflow');
assert.ok(COURSE_WEEKS.every((week) => week.story), 'every week must advance the Plant 7 story');
assert.ok(missions.every((mission) => mission.destination), 'every assignment must have a physical plant destination');
assert.ok(missions.filter((mission) => mission.kind !== 'esco').every((mission) => mission.studioMode === 'plant-hmi-and-logic'),
  'every plant practical must use both the prebuilt ESCO HMI and controller diagnostics');
assert.ok(missions.filter((mission) => mission.view === 'hmi').every((mission) => mission.studioMode === 'hmi-designer'),
  'learner HMI assignments must open the editable ESCO HMI Designer');
const escoMissions = missions.filter((mission) => mission.kind === 'esco');
assert.ok(escoMissions.every((mission) => mission.tagBank?.length >= 5),
  'every ESCO practical must provide a useful mission-specific tag bank');
for (const mission of escoMissions) {
  assert.equal(new Set(mission.tagBank.map((tag) => tag.name)).size, mission.tagBank.length,
    `${mission.id} tag bank must not repeat tags`);
  assert.ok(mission.tagBank.every((tag) => tag.name && tag.type && tag.role && tag.purpose),
    `${mission.id} tag bank entries must explain name, type, role, and purpose`);
}
assert.ok(Object.values(CV101_TAGS).every((tag) => tag.name && tag.type && tag.role && tag.purpose),
  'CV-101 tag catalog must contain complete reference metadata');
assert.deepEqual(escoMissions[0].tagBank.slice(0, 2).map((tag) => tag.name), ['Motor_Run', 'Stack_Green'],
  'run indication brief must lead with the relevant state and lamp tags');
assert.match(CV101_TAGS.VFD_SpeedRef.role, /^CREATE/, 'the unseeded VFD output must be identified as a tag learners create');
const scenarioIds = new Set(SCENARIOS.map((scenario) => scenario.id));
for (const mission of missions.filter((item) => item.scenarioIds)) {
  for (const id of mission.scenarioIds) assert.ok(scenarioIds.has(id), `${mission.id} references missing scenario ${id}`);
  assert.ok(mission.target <= mission.scenarioIds.length, `${mission.id} target exceeds its unique scenario pool`);
}

const node = (instructionType, ...values) => ({
  instructionType,
  operands: values.map((value) => ({ value })),
});
const branch = (nodes, parallelBranches = [], next = null) => ({ nodes, parallelBranches, next });
const rung = (root) => ({ root });
const project = (rungs, hmi = undefined) => ({
  controllers: [{ programs: [{ routines: [{ ladder: { rungs } }] }] }],
  ...(hmi ? { hmi } : {}),
});

assert.ok(ESCO_VALIDATORS.green(project([
  rung(branch([node('XIC', 'Motor_Run'), node('OTE', 'Stack_Green')])),
])), 'green indication solution should pass');
assert.equal(ESCO_VALIDATORS.green(project([
  rung(branch([node('XIC', 'Motor_Run'), node('OTE', 'Stack_Green'), node('RTO', 'Runtime', '1000')])),
])), false, 'green indication must reject an unrelated action chained after the OTE');

assert.ok(ESCO_VALIDATORS.motor(project([
  rung(branch(
    [node('XIC', 'Start_PB')],
    [branch([node('XIC', 'Motor_Run')])],
    branch([node('XIO', 'Stop_PB'), node('XIC', 'EStop_OK'), node('OTE', 'Motor_Run')]),
  )),
])), 'safe motor seal-in should pass');
assert.equal(ESCO_VALIDATORS.motor(project([
  rung(branch([
    node('XIC', 'Start_PB'), node('XIC', 'Motor_Run'), node('XIO', 'Stop_PB'),
    node('XIC', 'EStop_OK'), node('OTE', 'Motor_Run'),
  ])),
])), false, 'motor seal-in must reject contacts placed in series instead of a start/hold branch');

assert.ok(ESCO_VALIDATORS.debounce(project([
  rung(branch([node('XIC', 'PE101_PhotoEye'), node('TON', 'T_Debounce', '50')])),
  rung(branch([node('XIC', 'T_Debounce.DN'), node('OTE', 'Part_Detected')])),
])), 'debounce timer should pass');
assert.equal(ESCO_VALIDATORS.debounce(project([
  rung(branch([node('XIC', 'PE101_PhotoEye'), node('TON', 'T_Debounce', '500')])),
  rung(branch([node('XIC', 'T_Debounce.DN'), node('OTE', 'Part_Detected')])),
])), false, 'debounce must reject the wrong stability preset');
assert.equal(ESCO_VALIDATORS.debounce(project([
  rung(branch([node('XIC', 'PE101_PhotoEye'), node('TON', 'T_Debounce', '50')])),
])), false, 'debounce must require a separate stable Part_Detected result');

assert.ok(ESCO_VALIDATORS.count(project([
  rung(branch([node('XIC', 'T_Debounce.DN'), node('CTU', 'Part_Counter', '24')])),
  rung(branch([node('XIC', 'Reset_PB'), node('RES', 'Part_Counter')])),
])), 'debounced counter should pass');
assert.equal(ESCO_VALIDATORS.count(project([
  rung(branch([node('XIC', 'Part_Detected'), node('CTU', 'Part_Counter', '100')])),
  rung(branch([node('XIC', 'Reset_PB'), node('RES', 'Part_Counter')])),
])), false, 'counter must reject the wrong batch preset');
assert.equal(ESCO_VALIDATORS.count(project([
  rung(branch([node('XIC', 'Part_Detected'), node('CTU', 'Part_Counter', '24')])),
])), false, 'counter must include a deliberate reset rung');

assert.ok(ESCO_VALIDATORS.jam(project([
  rung(branch([node('XIC', 'PE101_PhotoEye'), node('XIC', 'Motor_Run'), node('TON', 'T_Jam', '5000')])),
  rung(branch([node('XIC', 'T_Jam.DN'), node('OTL', 'Jam_Fault')])),
  rung(branch([node('XIC', 'Reset_PB'), node('XIO', 'PE101_PhotoEye'), node('OTU', 'Jam_Fault')])),
  rung(branch(
    [node('XIC', 'Start_PB')],
    [branch([node('XIC', 'Motor_Run')])],
    branch([
      node('XIO', 'Stop_PB'), node('XIC', 'EStop_OK'),
      node('XIO', 'Jam_Fault'), node('OTE', 'Motor_Run'),
    ]),
  )),
])), 'latched jam interlock should pass');
assert.equal(ESCO_VALIDATORS.jam(project([
  rung(branch([node('XIC', 'PE101_PhotoEye'), node('XIC', 'Motor_Run'), node('RTO', 'T_Jam', '5000')])),
  rung(branch([node('XIC', 'T_Jam.DN'), node('OTL', 'Jam_Fault')])),
  rung(branch([node('XIC', 'Reset_PB'), node('OTU', 'Jam_Fault')])),
  rung(branch([node('XIO', 'Jam_Fault'), node('OTE', 'Motor_Run')])),
])), false, 'jam logic must reject a retained detector, unsafe reset, and incomplete motor circuit');

assert.ok(ESCO_VALIDATORS.speed(project([
  rung(branch([node('XIC', 'Motor_Run'), node('MUL', 'Speed_SP', '4', 'VFD_SpeedRef')])),
  rung(branch([node('XIO', 'Motor_Run'), node('MOV', '0', 'VFD_SpeedRef')])),
])), 'scaled VFD reference should pass');
assert.equal(ESCO_VALIDATORS.speed(project([
  rung(branch([node('XIC', 'Motor_Run'), node('MUL', 'Speed_SP', '10', 'VFD_SpeedRef')])),
  rung(branch([node('XIO', 'Motor_Run'), node('MOV', '0', 'VFD_SpeedRef')])),
])), false, 'VFD scaling must reject an incorrect range factor');

const overviewHmi = {
  screens: [{ elements: [
    { bindings: [{ source: { path: 'Motor_Run' } }] },
    { bindings: [{ source: { path: 'Jam_Fault' } }] },
    { bindings: [{ source: { path: 'Part_Counter.ACC' } }] },
  ] }],
  alarms: [{ tagPath: 'Jam_Fault' }],
};
assert.ok(ESCO_VALIDATORS['hmi-overview'](project([], overviewHmi)), 'complete HMI overview should pass');
assert.ok(ESCO_VALIDATORS['hmi-alarm'](project([], overviewHmi)), 'latched jam alarm should pass');

const acceptedProject = (id, rungNodes, hmiMarker = id) => ({
  id: `project_${id}`,
  name: 'CV-101 Conveyor Cell',
  hmi: { screens: [{ id: `hmi_${hmiMarker}`, name: hmiMarker, elements: [] }], alarms: [] },
  controllers: [{
    id: 'cv101_controller',
    tasks: [{ id: 'main_task', scheduledProgramIds: ['main_program'] }],
    controllerTags: [],
    programs: [{
      id: 'main_program', controllerId: 'cv101_controller', name: 'MainProgram', programTags: [],
      routines: [{
        id: `routine_${id}`, programId: 'main_program', name: 'MainRoutine', language: 'ladder',
        ladder: {
          id: `ladder_${id}`,
          rungs: [{ id: `rung_${id}`, routineId: `routine_${id}`, number: 0, comment: '', root: branch(rungNodes) }],
        },
      }],
    }],
  }],
});

const firstAccepted = acceptedProject('w1_run', [node('XIC', 'Motor_Run'), node('OTE', 'Stack_Green')]);
const cleanWorking = clearCourseProjectRungs(firstAccepted);
assert.equal(cleanWorking.controllers[0].programs[0].routines[0].ladder.rungs.length, 1,
  'the next ESCO workspace must retain one blank rung');
assert.equal(cleanWorking.controllers[0].programs[0].routines[0].ladder.rungs[0].root.nodes.length, 0,
  'the next ESCO workspace must not retain accepted instructions');
assert.equal(firstAccepted.controllers[0].programs[0].routines[0].ladder.rungs[0].root.nodes.length, 2,
  'clearing the next workspace must not mutate the archived project');

const secondAccepted = acceptedProject('w1_motor', [node('XIC', 'Start_PB'), node('OTE', 'Motor_Run')], 'LATEST_HMI');
const portfolioProject = buildCoursePortfolioProject({
  order: ['w1-run-indication', 'w1-safe-motor'],
  missions: {
    'w1-run-indication': { missionId: 'w1-run-indication', title: 'Prove the RUN indication', project: firstAccepted },
    'w1-safe-motor': { missionId: 'w1-safe-motor', title: 'Commission safe start and stop', project: secondAccepted },
  },
});
const portfolioProgram = portfolioProject.controllers[0].programs.find((program) => program.name === 'CoursePortfolio');
assert.equal(portfolioProgram.routines.length, 2, 'the portfolio must preserve one review routine per accepted ladder assignment');
assert.equal(new Set(portfolioProgram.routines.map((routine) => routine.id)).size, 2,
  'portfolio routines must receive unique ids');
assert.ok(portfolioProgram.routines.every((routine) => routine.ladder.rungs[0].root.nodes.length === 2),
  'portfolio routines must retain accepted rung instructions');
assert.ok(!portfolioProject.controllers[0].tasks[0].scheduledProgramIds.includes(portfolioProgram.id),
  'the review-only portfolio program must remain unscheduled');
assert.equal(portfolioProject.hmi.screens[0].name, 'LATEST_HMI', 'the portfolio must retain the latest accepted HMI work');

const filteredGame = new Game({}, {}, { sysLog() {}, say() {} });
filteredGame.startShift('easy', { scenarioIds: ['UTL_CW_TEMP'], courseMissionId: 'test-mission' });
assert.equal(filteredGame.pickScenario().id, 'UTL_CW_TEMP', 'course drills must restrict the live scenario pool');
assert.equal(filteredGame.nextRoundIn, 2.5, 'course drills should start promptly');
assert.equal(filteredGame.tierSeconds(), 95, 'early calls must escalate after 95 seconds');
filteredGame.difficulty = 'normal';
assert.equal(filteredGame.tierSeconds(), 75, 'normal calls must escalate after 75 seconds');
filteredGame.difficulty = 'hard';
assert.equal(filteredGame.tierSeconds(), 55, 'hard calls must escalate after 55 seconds');

const campaignCourse = {
  nextMission: () => missions[0],
};
const campaignWorld = {
  anchors: {},
  navAnchors: {
    dispatch: { x: 1, z: 2 },
    cv101Workstation: { x: 3, z: 4 },
    controlRoom: { x: 5, z: 6 },
  },
};
const campaign = new CampaignDirector(campaignCourse, campaignWorld);
campaign.start();
assert.equal(campaign.stage, 'report', 'campaign must begin at physical dispatch');
assert.equal(campaign.target({ activeScenario: null }).key, 'dispatch', 'dispatch must own assignment progression');
campaign.accept(missions[0]);
assert.equal(campaign.target({ activeScenario: null }).key, 'cv101Workstation', 'first practical must route to CV-101');
const managerCalls = [];
campaign.tick(19, { say: (who, text) => managerCalls.push({ who, text }) }, { state: 'campaign' });
assert.equal(managerCalls.length, 1, 'management must pressure slow campaign work');
assert.ok(['frank', 'voss'].includes(managerCalls[0].who), 'pressure calls must come from plant management');
assert.equal(campaign.managerState({ state: 'campaign' }), 'CLOCK RUNNING', 'HUD must expose active management pressure');

let finalMission = missions.at(-1);
const completedCourse = { nextMission: () => finalMission };
const finalCampaign = new CampaignDirector(completedCourse, campaignWorld);
finalCampaign.start();
finalCampaign.finish(finalMission, true);
finalMission = null;
assert.equal(finalCampaign.atDispatch(), null, 'final dispatch must not issue another assignment');
assert.equal(finalCampaign.stage, 'qualified', 'final dispatch must enter the qualified campaign state');
assert.equal(finalCampaign.managerState({ state: 'campaign' }), 'ACCEPTANCE CLOSED',
  'qualified campaign must expose the closed acceptance state');

for (const scenario of SCENARIOS) {
  const diagnostic = buildPlant7Project(scenario, { [scenario.alarm.tag]: 123.4 });
  assert.equal(diagnostic.controllers[0].name, 'PGP_Plant7_PLC', `${scenario.id} must open the Plant 7 controller`);
  const routines = diagnostic.controllers[0].programs.flatMap((program) => program.routines);
  // A controller carries the whole plant program whatever is alarming; only the
  // routine the technician is sent to changes.
  assert.equal(routines.length, PROGRAMS.flatMap((program) => program.routines).length,
    `${scenario.id} must load the complete Plant 7 controller program`);
  const owning = diagnostic.controllers[0].programs.find((program) => program.name === scenario.program);
  assert.ok(owning, `${scenario.id} must name a real Plant 7 program`);
  assert.ok(owning.routines.some((routine) => routine.name === scenario.routine),
    `${scenario.id} must name a real routine inside ${scenario.program}`);
  assert.ok(diagnostic.controllers[0].controllerTags.length >= 75, `${scenario.id} must include the live plant tag database`);
  assert.equal(
    diagnostic.controllers[0].controllerTags.find((tag) => tag.name === escoTagName(scenario.alarm.tag))?.value,
    123.4,
    `${scenario.id} must seed current live values`,
  );
  const hmi = diagnostic.hmi;
  const screenNames = new Set(hmi.screens.map((screen) => screen.name));
  for (const name of ['Overview', 'PREP', 'EXTRACTION', 'REFINERY', 'UTILITIES', 'MEAL', 'Alarms', 'Trends', 'I/O']) {
    assert.ok(screenNames.has(name), `${scenario.id} prebuilt HMI is missing ${name}`);
  }
  assert.equal(hmi.screens.find((screen) => screen.id === hmi.homeScreenId)?.name, scenario.screen,
    `${scenario.id} HMI must open on the affected process area`);
  assert.equal(hmi.alarms.length, ALARM_DEFS.length, `${scenario.id} HMI must include the full Plant 7 alarm database`);
  // Every operator alarm points at a bit a coil in the controller actually
  // drives — no display-only alarm flags that nothing in the logic sets.
  const controllerTagsByName = new Map(diagnostic.controllers[0].controllerTags.map((tag) => [tag.name, tag]));
  for (const alarm of hmi.alarms) {
    assert.ok(controllerTagsByName.get(alarm.tagPath)?.dataType === 'BOOL',
      `${scenario.id} HMI alarm ${alarm.name} must resolve to a BOOL controller tag`);
  }
  const alarmBit = scenario.alarm.name.replace('-', '_');
  assert.ok(hmi.alarms.some((alarm) => alarm.tagPath === alarmBit),
    `${scenario.id} alarm ${scenario.alarm.name} must exist in the controller-derived alarm database`);
  const controllerTagNames = new Set(diagnostic.controllers[0].controllerTags.map((tag) => tag.name));
  const bindingPaths = hmi.screens.flatMap((screen) => screen.elements)
    .flatMap((element) => element.bindings || [])
    .filter((binding) => binding.source?.kind === 'tag')
    .map((binding) => binding.source.path);
  assert.ok(bindingPaths.length >= 20, `${scenario.id} HMI must contain substantial live tag binding coverage`);
  assert.ok(bindingPaths.every((path) => controllerTagNames.has(path)), `${scenario.id} HMI bindings must resolve to Plant 7 tags`);
}

const alarmConsole = buildPlant7Project(null, {}, 'ALARMS');
assert.equal(alarmConsole.hmi.screens.find((screen) => screen.id === alarmConsole.hmi.homeScreenId)?.name, 'Alarms',
  'an idle control-room alarm console must open the prebuilt ESCO alarm screen');

console.log(`AlarmState checks passed: ${COURSE_WEEKS.length} weeks, ${missions.length} practicals, ${SCENARIOS.length} fault scenarios.`);

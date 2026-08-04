// ============================================================================
// Plant 7 controller conformance checks.
//
// This suite exists to stop the plant's ladder logic from quietly becoming
// decorative again. `auditController` applies the rules a controls engineer
// would apply at a code review, to the project the ESCO studio actually opens.
//
// The audit is then run against deliberately broken copies of the controller,
// so the suite proves it can fail. A check that has never rejected anything is
// not evidence of correctness.
//
// Finally the controller is scanned against the process simulation to show that
// every alarm in the game is produced by logic rather than authored.
// ============================================================================

import assert from 'node:assert/strict';
import { ProcessSim } from '../js/sim.js';
import { PlcScan } from '../js/plc.js';
import { SCENARIOS } from '../js/data/scenarios.js';
import { buildPlant7Project } from '../js/plant7-esco.js';
import { ALARM_DEFS, FIELD_TAGS, ALL_CONTROLLER_TAGS } from '../js/data/plant-logic.js';

// ---------------------------------------------------------------------------
// Instruction signatures. Operand names and arity are taken from the real Logix
// instruction set (and match the ESCO instruction registry the studio renders
// with), so a typo in an operand list fails here instead of silently producing
// a rung that reads plausibly and does nothing.
// ---------------------------------------------------------------------------

const SIGNATURES = {
  XIC: ['tag'], XIO: ['tag'], OTE: ['tag'], OTL: ['tag'], OTU: ['tag'], ONS: ['tag'],
  TON: ['timer', 'preset'], TOF: ['timer', 'preset'], RTO: ['timer', 'preset'],
  CTU: ['counter', 'preset'], RES: ['structure'],
  GRT: ['sourceA', 'sourceB'], LES: ['sourceA', 'sourceB'], GEQ: ['sourceA', 'sourceB'],
  LEQ: ['sourceA', 'sourceB'], EQU: ['sourceA', 'sourceB'], NEQ: ['sourceA', 'sourceB'],
  ADD: ['sourceA', 'sourceB', 'dest'], SUB: ['sourceA', 'sourceB', 'dest'],
  MUL: ['sourceA', 'sourceB', 'dest'], DIV: ['sourceA', 'sourceB', 'dest'],
  ABS: ['source', 'dest'], MOV: ['source', 'dest'],
  JSR: ['routine'],
  PID: ['loop', 'pv', 'tieback', 'cv', 'masterLoop', 'inholdBit', 'inholdValue'],
};

const OUTPUT_BITS = new Set(['OTE', 'OTL', 'OTU']);
const TIMERS = new Set(['TON', 'TOF', 'RTO']);
/** Operand index each instruction writes to, for the write-target checks. */
const WRITE_OPERAND = {
  OTE: 0, OTL: 0, OTU: 0, ONS: 0, TON: 0, TOF: 0, RTO: 0, CTU: 0, RES: 0,
  ADD: 2, SUB: 2, MUL: 2, DIV: 2, ABS: 1, MOV: 1,
};

const TIMER_MEMBERS = new Set(['PRE', 'ACC', 'EN', 'TT', 'DN']);
const COUNTER_MEMBERS = new Set(['PRE', 'ACC', 'CU', 'CD', 'DN', 'OV', 'UN']);

function* eachBranch(branch) {
  if (!branch) return;
  yield branch;
  for (const leg of branch.parallelBranches || []) yield* eachBranch(leg);
  yield* eachBranch(branch.next);
}

function* eachNode(branch) {
  if (!branch) return;
  for (const node of branch.nodes || []) yield node;
  for (const leg of branch.parallelBranches || []) yield* eachNode(leg);
  yield* eachNode(branch.next);
}

const tagBase = (value) => String(value).split('.')[0];

/**
 * Review one controller project and return every standards finding. Empty means
 * the program is clean.
 */
export function auditController(project, {
  declaredTypes = new Map(ALL_CONTROLLER_TAGS.map((tag) => [tag.name, tag.dataType])),
  fieldNames = new Set(FIELD_TAGS.map((tag) => tag.name)),
} = {}) {
  const findings = [];
  const controller = project.controllers[0];
  const rungs = [];
  for (const program of controller.programs) {
    for (const routine of program.routines) {
      for (const rung of routine.ladder.rungs) rungs.push({ program, routine, rung });
    }
  }
  const at = ({ program, routine, rung }) => `${program.name}/${routine.name} rung ${rung.number}`;

  // -- instructions and operands --
  for (const entry of rungs) {
    for (const node of eachNode(entry.rung.root)) {
      const signature = SIGNATURES[node.instructionType];
      if (!signature) {
        findings.push(`${at(entry)}: unknown instruction ${node.instructionType}`);
        continue;
      }
      if (node.operands.length !== signature.length) {
        findings.push(`${at(entry)}: ${node.instructionType} takes ${signature.length} operands, found ${node.operands.length}`);
        continue;
      }
      node.operands.forEach((operand, index) => {
        if (operand.name !== signature[index]) {
          findings.push(`${at(entry)}: ${node.instructionType} operand ${index} must be "${signature[index]}", found "${operand.name}"`);
        }
      });
    }
  }

  // -- tag references resolve, member paths are real --
  for (const entry of rungs) {
    for (const node of eachNode(entry.rung.root)) {
      for (const operand of node.operands) {
        if (operand.kind !== 'tag') continue;
        const base = tagBase(operand.value);
        const dataType = declaredTypes.get(base);
        if (!dataType) {
          findings.push(`${at(entry)}: ${node.instructionType} references undeclared tag "${operand.value}"`);
          continue;
        }
        const member = String(operand.value).split('.')[1];
        if (!member) continue;
        if (!['TIMER', 'COUNTER'].includes(dataType)) {
          findings.push(`${at(entry)}: "${operand.value}" takes a member of a ${dataType} tag`);
          continue;
        }
        const members = dataType === 'COUNTER' ? COUNTER_MEMBERS : TIMER_MEMBERS;
        if (!members.has(member)) findings.push(`${at(entry)}: "${operand.value}" is not a ${dataType} member`);
      }
    }
  }

  // -- a coil never writes a wired field input --
  for (const entry of rungs) {
    for (const node of eachNode(entry.rung.root)) {
      const index = WRITE_OPERAND[node.instructionType];
      if (index === undefined) continue;
      const target = tagBase(node.operands[index]?.value ?? '');
      if (fieldNames.has(target)) {
        findings.push(`${at(entry)}: ${node.instructionType} writes field input "${target}" — a controller cannot drive its own input`);
      }
    }
  }

  // -- no double coils --
  const coils = new Map();
  for (const entry of rungs) {
    for (const node of eachNode(entry.rung.root)) {
      if (node.instructionType !== 'OTE') continue;
      const target = tagBase(node.operands[0].value);
      coils.set(target, [...(coils.get(target) || []), at(entry)]);
    }
  }
  for (const [tag, places] of coils) {
    if (places.length > 1) findings.push(`"${tag}" is driven by ${places.length} OTE coils: ${places.join(', ')}`);
  }

  // -- timer delays are real --
  // An output placed after a timer on the same rung follows the rung condition,
  // not the timer, so the delay does nothing at all.
  const timersUsed = new Map();
  for (const entry of rungs) {
    const nodes = [...eachNode(entry.rung.root)];
    const timerIndex = nodes.findIndex((node) => TIMERS.has(node.instructionType));
    if (timerIndex < 0) continue;
    const timerNode = nodes[timerIndex];
    timersUsed.set(tagBase(timerNode.operands[0].value), at(entry));
    const trailing = nodes.slice(timerIndex + 1).find((node) => OUTPUT_BITS.has(node.instructionType));
    if (trailing) {
      findings.push(`${at(entry)}: ${trailing.instructionType} follows ${timerNode.instructionType} on the same rung, so it energises on the rung condition and the delay is cosmetic. Drive it from ${timerNode.operands[0].value}.DN on its own rung.`);
    }
  }

  const dnReferences = new Set();
  for (const entry of rungs) {
    for (const node of eachNode(entry.rung.root)) {
      for (const operand of node.operands) {
        if (operand.kind === 'tag' && /\.DN$/.test(operand.value)) dnReferences.add(tagBase(operand.value));
      }
    }
  }
  for (const [timer, place] of timersUsed) {
    if (!dnReferences.has(timer)) {
      findings.push(`timer "${timer}" at ${place} is never examined through its .DN bit — the delay has no effect on anything`);
    }
  }

  // -- every latched trip can be reset --
  const latched = new Map();
  const unlatched = new Set();
  for (const entry of rungs) {
    for (const node of eachNode(entry.rung.root)) {
      const target = tagBase(node.operands[0]?.value ?? '');
      if (node.instructionType === 'OTL') latched.set(target, at(entry));
      if (node.instructionType === 'OTU') unlatched.add(target);
    }
  }
  for (const [tag, place] of latched) {
    if (!unlatched.has(tag)) findings.push(`latched bit "${tag}" set at ${place} has no OTU reset rung — it can never be cleared`);
  }

  // -- branch topology is legal --
  // An empty parallel leg permanently passes power and bypasses everything it
  // is branched around, which is how an interlock silently stops interlocking.
  for (const entry of rungs) {
    for (const branch of eachBranch(entry.rung.root)) {
      if (!branch.parallelBranches?.length) continue;
      if (branch.nodes.length === 0) {
        findings.push(`${at(entry)}: parallel group has an empty primary leg, which permanently passes power`);
      }
      for (const leg of branch.parallelBranches) {
        if (!leg.nodes.length && !leg.parallelBranches?.length && !leg.next) {
          findings.push(`${at(entry)}: empty parallel leg bypasses the branch group`);
        }
      }
    }
  }

  // -- every routine executes --
  for (const program of controller.programs) {
    const main = program.routines.find((routine) => routine.id === program.mainRoutineId);
    if (!main) {
      findings.push(`program ${program.name} has no main routine`);
      continue;
    }
    if (main.name !== 'MainRoutine') findings.push(`program ${program.name} must enter at MainRoutine`);

    const called = new Set();
    for (const routine of program.routines) {
      for (const rung of routine.ladder.rungs) {
        for (const node of eachNode(rung.root)) {
          if (node.instructionType === 'JSR') called.add(node.operands[0].value);
        }
      }
    }
    const names = new Set(program.routines.map((routine) => routine.name));
    for (const target of called) {
      if (!names.has(target)) findings.push(`program ${program.name} calls missing routine "${target}"`);
    }
    for (const routine of program.routines) {
      if (routine.id === program.mainRoutineId) continue;
      if (!called.has(routine.name)) {
        findings.push(`routine ${program.name}/${routine.name} is not called by any JSR and will never execute`);
      }
    }
  }

  // -- every operator alarm is driven by a coil --
  const driven = new Set([...coils.keys(), ...latched.keys()]);
  for (const alarm of project.hmi?.alarms || []) {
    if (!driven.has(alarm.tagPath)) {
      findings.push(`HMI alarm ${alarm.name} is bound to "${alarm.tagPath}", which no coil in the controller drives`);
    } else if (declaredTypes.get(alarm.tagPath) !== 'BOOL') {
      findings.push(`HMI alarm ${alarm.name} must be bound to a BOOL`);
    }
  }

  // -- neutral rung text matches the structure, so the studio can export it --
  for (const entry of rungs) {
    const text = entry.rung.sourceText || '';
    if (!text.endsWith(';')) findings.push(`${at(entry)}: neutral rung text must be terminated`);
    const instructions = [...eachNode(entry.rung.root)].length;
    const rendered = (text.match(/[A-Z]{2,4}\(/g) || []).length;
    if (rendered !== instructions) {
      findings.push(`${at(entry)}: neutral text carries ${rendered} instructions but the rung holds ${instructions}`);
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// The real controller must be clean.
// ---------------------------------------------------------------------------

const project = buildPlant7Project(null);
const controller = project.controllers[0];
const allRungs = controller.programs.flatMap((program) =>
  program.routines.flatMap((routine) => routine.ladder.rungs));

assert.ok(allRungs.length > 100, 'the Plant 7 controller must carry a substantial program');
assert.deepEqual(auditController(project), [],
  'the Plant 7 controller must pass every ladder standards check');

// ---------------------------------------------------------------------------
// The audit must have teeth. Each mutation below breaks exactly one rule a real
// code review would catch, and the audit has to reject it.
// ---------------------------------------------------------------------------

const clone = () => structuredClone(project);
const routineIn = (copy, programName, routineName) => copy.controllers[0].programs
  .find((program) => program.name === programName).routines
  .find((routine) => routine.name === routineName);

const mutations = [
  ['a duplicated output coil', /driven by 2 OTE coils/, (copy) => {
    const routine = routineIn(copy, 'Prep', 'P11_Conveyors') || routineIn(copy, 'Prep', 'P11_Conveyors');
    routine.ladder.rungs.push(structuredClone(
      routineIn(copy, 'Prep', 'P11_Mills').ladder.rungs.find((rung) => rung.sourceText.includes('OTE(VAH_1120)'))));
  }],
  ['an output placed after its timer', /the delay is cosmetic/, (copy) => {
    const rung = routineIn(copy, 'Prep', 'P11_Conditioner').ladder.rungs
      .find((entry) => entry.sourceText.includes('TON(T_TAL_1115'));
    rung.root.nodes.push({ id: 'mutant', instructionType: 'OTE', operands: [{ name: 'tag', kind: 'tag', value: 'TAL_1115' }] });
    rung.sourceText = rung.sourceText.replace(';', 'OTE(TAL_1115);');
  }],
  ['a coil driving a field input', /cannot drive its own input/, (copy) => {
    const rung = routineIn(copy, 'Prep', 'P11_Mills').ladder.rungs
      .find((entry) => entry.sourceText.includes('OTE(M1110_Run_Cmd)'));
    for (const node of eachNode(rung.root)) {
      if (node.instructionType === 'OTE') node.operands[0].value = 'M_1110';
    }
  }],
  ['a reference to a tag that does not exist', /undeclared tag/, (copy) => {
    routineIn(copy, 'Meal', 'M51_Cooler').ladder.rungs[0].root.nodes[0]
      .operands[0].value = 'Not_A_Real_Tag';
  }],
  ['a subroutine nothing calls', /is not called by any JSR/, (copy) => {
    const main = routineIn(copy, 'Refinery', 'MainRoutine');
    main.ladder.rungs = main.ladder.rungs.slice(0, 1);
  }],
  ['an empty parallel branch leg', /empty parallel leg/, (copy) => {
    const rung = routineIn(copy, 'Prep', 'P11_Mills').ladder.rungs
      .find((entry) => entry.sourceText.includes('OTE(M1110_Run_Cmd)'));
    for (const branch of eachBranch(rung.root)) {
      if (branch.parallelBranches?.length) branch.parallelBranches.push({ id: 'mutant-leg', nodes: [] });
    }
  }],
  ['a latched trip with no reset', /has no OTU reset rung/, (copy) => {
    const routine = routineIn(copy, 'Prep', 'P11_Mills');
    routine.ladder.rungs = routine.ladder.rungs.filter((rung) => !rung.sourceText.includes('OTU('));
  }],
  ['a mislabelled instruction operand', /operand 1 must be "preset"/, (copy) => {
    const rung = routineIn(copy, 'Meal', 'M51_Cooler').ladder.rungs
      .find((entry) => entry.sourceText.includes('TON(T_SPA_5118'));
    for (const node of eachNode(rung.root)) {
      if (node.instructionType === 'TON') node.operands[1].name = 'delay';
    }
  }],
  ['an HMI alarm bound to nothing', /no coil in the controller drives/, (copy) => {
    copy.hmi.alarms.push({ id: 'mutant', name: 'GHOST_ALARM', tagPath: 'Prep_Permissive', severity: 'major' });
  }],
];

for (const [description, expected, mutate] of mutations) {
  const copy = clone();
  mutate(copy);
  const findings = auditController(copy);
  assert.ok(findings.some((finding) => expected.test(finding)),
    `the audit failed to reject ${description}; findings were: ${findings.join(' | ') || '(none)'}`);
}

// ---------------------------------------------------------------------------
// The logic actually runs: a healthy plant is quiet.
//
// If any alarm bit were authored rather than solved, it would show up here.
// ---------------------------------------------------------------------------

const alarmBits = ALARM_DEFS.map((alarm) => alarm.tag);

const healthySim = new ProcessSim();
const healthyPlc = new PlcScan(healthySim);
for (let step = 0; step < 400; step += 1) {
  healthySim.tick(0.05);
  healthyPlc.scan(0.05);
}
assert.deepEqual(healthyPlc.violations, [], 'a healthy plant scan must report no controller violations');
assert.deepEqual(healthyPlc.activeBits(alarmBits), [],
  'a healthy Plant 7 must raise no alarms — every alarm bit has to be earned by the process');
for (const motor of ['M1110_Run_Cmd', 'M2105_Run_Cmd', 'M3225_Run_Cmd', 'M4215_Run_Cmd', 'M5118_Run_Cmd']) {
  assert.equal(healthyPlc.isSet(motor), true, `${motor} must be held in by its own seal-in rung on a healthy plant`);
}

// A stop pushbutton must break the seal-in, or the branch is decorative.
const stopSim = new ProcessSim();
const stopPlc = new PlcScan(stopSim);
for (let step = 0; step < 100; step += 1) { stopSim.tick(0.05); stopPlc.scan(0.05); }
stopPlc.tagValues.set('M1110_Stop_PB', true);
stopPlc.scan(0.05);
assert.equal(stopPlc.isSet('M1110_Run_Cmd'), false, 'the stop pushbutton must drop the mill A seal-in');
stopPlc.tagValues.set('M1110_Stop_PB', false);
stopPlc.scan(0.05);
assert.equal(stopPlc.isSet('M1110_Run_Cmd'), false,
  'releasing stop must not restart the motor — a 3-wire starter needs the start pushbutton again');
stopPlc.tagValues.set('M1110_Start_PB', true);
stopPlc.scan(0.05);
stopPlc.tagValues.set('M1110_Start_PB', false);
stopPlc.scan(0.05);
assert.equal(stopPlc.isSet('M1110_Run_Cmd'), true, 'the seal-in must hold the motor in after the start pushbutton is released');

// ---------------------------------------------------------------------------
// Every scenario alarm is produced by the ladder from live process values.
// ---------------------------------------------------------------------------

for (const scenario of SCENARIOS) {
  const sim = new ProcessSim();
  const plc = new PlcScan(sim);
  for (let step = 0; step < 100; step += 1) { sim.tick(0.05); plc.scan(0.05); }

  const expected = scenario.alarm.name.replace('-', '_');
  assert.equal(plc.isSet(expected), false,
    `${scenario.id}: ${expected} must be clear before the fault is introduced`);

  sim.startScenario(scenario.overrides);
  for (let step = 0; step < 300 * 20; step += 1) { sim.tick(0.05); plc.scan(0.05); }

  assert.deepEqual(plc.violations, [], `${scenario.id}: controller violations during the incident`);
  assert.equal(plc.isSet(expected), true,
    `${scenario.id}: the plant's ladder must raise ${scenario.alarm.name} from the live process values`);
  assert.ok(ALARM_DEFS.some((alarm) => alarm.tag === expected),
    `${scenario.id}: ${expected} must appear in the controller-derived alarm database`);
}

// ---------------------------------------------------------------------------
// The evidence chain each debrief promises is actually in the logic — the
// supporting alarm the technician is expected to find on the way to the answer.
// ---------------------------------------------------------------------------

const EVIDENCE = {
  PREP_COND_TEMP: 'ZDA_1116',
  EXT_EXTRACTOR_AMPS: 'LSH_2130_Discrepancy',
  EXT_DT_TEMP: 'ZDA_2208',
  EXT_HEXANE_LEL: 'LAL_2303',
  REF_BLEACH_VAC: 'ZDA_3412',
  REF_DEOD_LEVEL: 'OLA_3225',
  UTL_DRUM_LEVEL: 'ZDA_4112',
  UTL_CW_TEMP: 'VFA_4215',
  MEAL_COOLER_TEMP: 'SPA_5118',
};

for (const [scenarioId, bit] of Object.entries(EVIDENCE)) {
  const scenario = SCENARIOS.find((entry) => entry.id === scenarioId);
  const sim = new ProcessSim();
  const plc = new PlcScan(sim);
  for (let step = 0; step < 100; step += 1) { sim.tick(0.05); plc.scan(0.05); }
  sim.startScenario(scenario.overrides);
  for (let step = 0; step < 300 * 20; step += 1) { sim.tick(0.05); plc.scan(0.05); }
  assert.equal(plc.isSet(bit), true,
    `${scenarioId}: the supporting evidence bit ${bit} must be set by the logic, not just described in the debrief`);
}

const routineCount = controller.programs.flatMap((program) => program.routines).length;
console.log(`Plant 7 controller conformance passed: ${controller.programs.length} programs, ${routineCount} routines, ${allRungs.length} rungs, ${controller.controllerTags.length} tags, ${ALARM_DEFS.length} alarms, ${mutations.length} injected defects rejected, ${SCENARIOS.length} incidents solved from live process values.`);

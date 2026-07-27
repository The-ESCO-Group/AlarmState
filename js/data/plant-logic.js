// ============================================================================
// Prairie Gold Processing — Plant 7 controller program (PGP_Plant7_PLC)
//
// This is the plant's ACTUAL ladder logic, authored once. It does not change
// when a fault scenario changes — a real controller runs the same code whether
// the plant is healthy or on fire; only the process values move. Every rung is
// solved at scan time by js/plc.js from live field values. Nothing here carries
// a pre-baked "this contact is true" flag.
//
// Conventions used throughout (ISA-5.1 loop numbers, Logix tag rules):
//   TT_1115         field analog input (transmitter)
//   M_1110          motor run feedback — starter auxiliary contact, an INPUT
//   M1110_Run_Cmd   motor run output coil — the thing logic is allowed to write
//   TCV_1116        analog output to a control valve
//   ZT_1116         valve position feedback transmitter
//   T_TAL_1115      TIMER structure; the alarm is driven from its .DN bit
//   TAL_1115        ISA alarm bit (T=temperature, A=alarm, L=low)
//   *_Trip          latched shutdown bit — set with OTL, cleared only by a
//                   deliberate reset rung that also proves the cause is gone
//
// Rules every rung in this file obeys, because real plant code does:
//   1. A coil never writes a physical input. Feedback is compared, not driven.
//   2. A TON never shares a rung with the output it is supposed to delay. The
//      timer gets its own rung; the output is driven from XIC(timer.DN).
//   3. Motor starters are 3-wire: a start/seal-in parallel branch, then the
//      stop button and every interlock in series ahead of the coil.
//   4. Deviation is computed with real math boxes (SUB then ABS), then
//      compared — there is no "deviation instruction" in a Logix controller.
//   5. Exactly one OTE per BOOL in the whole controller. No double coils.
//   6. Latched trips have a matching reset rung with a cause-clear condition.
// ============================================================================

import { TAGS } from './tags.js';

// ---------------------------------------------------------------------------
// Ladder authoring DSL. These build the same semantic AST the ESCO ladder model
// uses (@esco/ladder LadderBranch/LadderNode), so what the scan engine solves
// and what the studio renders are the same structure, not two descriptions of
// it.
// ---------------------------------------------------------------------------

const isLiteral = (value) => value !== '' && Number.isFinite(Number(value));

/** One operand. Numeric text is a literal; anything else is a tag reference. */
const op = (name, value, kind) => ({
  name,
  kind: kind || (isLiteral(value) ? 'literal' : 'tag'),
  value: String(value),
});

const instr = (type, operands) => ({ instructionType: type, operands });

// --- bit instructions ---
export const XIC = (tag) => instr('XIC', [op('tag', tag, 'tag')]);
export const XIO = (tag) => instr('XIO', [op('tag', tag, 'tag')]);
export const OTE = (tag) => instr('OTE', [op('tag', tag, 'tag')]);
export const OTL = (tag) => instr('OTL', [op('tag', tag, 'tag')]);
export const OTU = (tag) => instr('OTU', [op('tag', tag, 'tag')]);
export const ONS = (bit) => instr('ONS', [op('tag', bit, 'tag')]);

// --- timers / counters ---
export const TON = (timer, presetMs) =>
  instr('TON', [op('timer', timer, 'tag'), op('preset', presetMs, 'literal')]);
export const TOF = (timer, presetMs) =>
  instr('TOF', [op('timer', timer, 'tag'), op('preset', presetMs, 'literal')]);
export const RTO = (timer, presetMs) =>
  instr('RTO', [op('timer', timer, 'tag'), op('preset', presetMs, 'literal')]);
export const CTU = (counter, preset) =>
  instr('CTU', [op('counter', counter, 'tag'), op('preset', preset, 'literal')]);
export const RES = (structure) => instr('RES', [op('structure', structure, 'tag')]);

// --- compare boxes ---
const compare = (type) => (a, b) =>
  instr(type, [op('sourceA', a), op('sourceB', b)]);
export const GRT = compare('GRT');
export const LES = compare('LES');
export const GEQ = compare('GEQ');
export const LEQ = compare('LEQ');
export const EQU = compare('EQU');
export const NEQ = compare('NEQ');

// --- math / move boxes ---
export const SUB = (a, b, dest) =>
  instr('SUB', [op('sourceA', a), op('sourceB', b), op('dest', dest, 'tag')]);
export const MUL = (a, b, dest) =>
  instr('MUL', [op('sourceA', a), op('sourceB', b), op('dest', dest, 'tag')]);
export const ABS = (source, dest) =>
  instr('ABS', [op('source', source), op('dest', dest, 'tag')]);
export const MOV = (source, dest) =>
  instr('MOV', [op('source', source), op('dest', dest, 'tag')]);

// --- program / process control ---
export const JSR = (routine) => instr('JSR', [op('routine', routine, 'routine')]);

/**
 * PID(loop, PV, tieback, CV, master loop, inhold bit, inhold value) — the real
 * Logix operand order. The loop is deliberately NOT executed offline: closed
 * loop control has no faithful offline algorithm, so the scan engine passes
 * rung condition through and the control valve is moved by the process
 * simulation instead. Faking a PID would be exactly the kind of lie this file
 * exists to avoid.
 */
export const PID = (loop, pv, cv) => instr('PID', [
  op('loop', loop, 'tag'),
  op('pv', pv, 'tag'),
  op('tieback', '0', 'literal'),
  op('cv', cv, 'tag'),
  op('masterLoop', '0', 'literal'),
  op('inholdBit', '0', 'literal'),
  op('inholdValue', '0', 'literal'),
]);

/**
 * A parallel (OR) group. Each leg is an array of instructions wired in series
 * within that leg; the legs are OR-ed together, and the rung continues after
 * the group merges. This is a real ladder branch, e.g. the start/seal-in
 * branch of a motor starter.
 */
export const OR = (...legs) => ({ parallel: legs });

/**
 * Compile an authored rung into the branch AST. A run of plain instructions
 * becomes one series segment; an OR group becomes a segment whose first leg is
 * the segment's own series and whose remaining legs hang off it as parallel
 * branches; segments are chained through `next`.
 */
function compileBranch(items) {
  const segments = [];
  let series = [];
  for (const item of items) {
    if (item && item.parallel) {
      if (series.length) segments.push({ nodes: series });
      series = [];
      const [first, ...rest] = item.parallel;
      segments.push({
        nodes: [...first],
        parallelBranches: rest.map((leg) => ({ nodes: [...leg] })),
      });
    } else {
      series.push(item);
    }
  }
  if (series.length || !segments.length) segments.push({ nodes: series });

  // Chain the segments back to front so each carries the rest as `next`.
  let branch = null;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    branch = branch ? { ...segments[index], next: branch } : segments[index];
  }
  return branch;
}

/** One rung: an engineer's comment plus the compiled branch tree. */
export const rung = (comment, ...items) => ({ comment, root: compileBranch(items) });

/** A program's main routine: one unconditional JSR rung per subroutine. */
function mainRoutine(programName, subroutines) {
  return {
    name: 'MainRoutine',
    description: `${programName} program entry point. Scheduled by the Plant7_Continuous task; every subroutine below executes once per scan.`,
    rungs: subroutines.map((name, index) =>
      rung(`Scan ${name}.${index === 0 ? ' Interlocks and trips are solved before the starters that use them.' : ''}`, JSR(name))),
  };
}

// ---------------------------------------------------------------------------
// Controller tags that are not field I/O.
//
// `input: true` marks a genuine input to the logic that the ladder does not
// compute — an operator pushbutton, a hardwired healthy contact, a remote
// permissive, an auto/manual selection. Its value is given, exactly as a real
// input is given by the wire. Everything without `input` is SOLVED by the scan.
// `init` is the power-up state of the tag image; the plant is already running
// at shift start, so the run coils and their seals come up made.
// ---------------------------------------------------------------------------

const bool = (name, description, extra = {}) => ({ name, dataType: 'BOOL', description, ...extra });
const real = (name, description) => ({ name, dataType: 'REAL', description, init: 0 });
const timerTag = (name, description) => ({ name, dataType: 'TIMER', description });
const pidTag = (name, description) => ({ name, dataType: 'PID', description });

/**
 * Start / stop / overload / run-command tag set for one across-the-line motor.
 * `feedback` adds the run-confirmation pair, declared only for the motors whose
 * starter auxiliary contact is actually wired back to the controller.
 */
function starterTags(prefix, equipment, { feedback = false } = {}) {
  return [
    bool(`${prefix}_Start_PB`, `${equipment} start pushbutton (momentary field input).`, { input: true, init: false }),
    bool(`${prefix}_Stop_PB`, `${equipment} stop pushbutton (momentary field input, wired normally closed).`, { input: true, init: false }),
    bool(`${prefix}_OL_OK`, `${equipment} motor overload relay healthy contact (1 = not tripped).`, { input: true, init: true }),
    bool(`${prefix}_Run_Cmd`, `${equipment} run command to the starter — controller output.`, { init: true }),
    ...(feedback ? [
      bool(`${prefix}_Fdbk_Fail`, `${equipment} commanded to run but the starter auxiliary contact never made.`),
      timerTag(`T_${prefix}_Fdbk`, `${equipment} run-feedback confirmation timer.`),
    ] : []),
  ];
}

export const CONTROLLER_TAGS = [
  // ---- plant-wide ----
  bool('Plant7_Running', 'Plant 7 master run status from central control.', { input: true, init: true }),

  // ---- PREP ----
  bool('Prep_Permissive', 'Bean Prep area master permissive from central control.', { input: true, init: true }),
  bool('Prep_Reset_PB', 'Bean Prep alarm and trip reset pushbutton.', { input: true, init: false }),
  bool('TIC_1115_Auto', 'Conditioner temperature loop in AUTO (operator selection).', { input: true, init: true }),
  pidTag('TIC_1115', 'Bean conditioner outlet temperature loop. SP 145 degF.'),
  real('TCV_1116_Dev', 'TCV-1116 command minus position feedback (signed, percent).'),
  real('TCV_1116_DevAbs', 'TCV-1116 command-to-feedback deviation, absolute value (percent).'),
  timerTag('T_ZDA_1116', 'TCV-1116 valve deviation persistence timer.'),
  bool('ZDA_1116', 'TCV-1116 VALVE DEVIATION — command and position feedback disagree.'),
  timerTag('T_TAL_1115', 'Conditioner outlet temperature low persistence timer.'),
  bool('TAL_1115', 'Bean conditioner outlet temperature LOW.'),
  timerTag('T_PAL_1117', 'Conditioner steam supply pressure low persistence timer.'),
  bool('PAL_1117', 'Conditioner steam supply pressure LOW.'),
  ...starterTags('M1105', 'Bean receiving conveyor CV-1105', { feedback: true }),
  ...starterTags('M1110', 'Cracking mill A', { feedback: true }),
  ...starterTags('M1112', 'Cracking mill B', { feedback: true }),
  ...starterTags('M1125', 'Flaking mill'),
  ...starterTags('M1135', 'Flake conveyor to extraction'),
  timerTag('T_VAH_1120', 'Cracking mill A vibration high on-delay timer.'),
  timerTag('T_VAH_1120_Off', 'Cracking mill A vibration high off-delay — ISA-18.2 chatter suppression.'),
  bool('VAH_1120', 'Cracking mill A bearing vibration HIGH.'),
  timerTag('T_VSH_1120', 'Cracking mill A vibration shutdown persistence timer.'),
  bool('VSH_1120_Trip', 'Cracking mill A vibration SHUTDOWN — latched, requires reset.'),
  timerTag('T_IAH_1110', 'Cracking mill A motor current high persistence timer.'),
  bool('IAH_1110', 'Cracking mill A motor current HIGH.'),
  timerTag('T_IAH_1112', 'Cracking mill B motor current high persistence timer.'),
  bool('IAH_1112', 'Cracking mill B motor current HIGH.'),
  timerTag('T_IAH_1125', 'Flaking mill motor current high persistence timer.'),
  bool('IAH_1125', 'Flaking mill motor current HIGH.'),
  timerTag('T_LAH_1130', 'Flake surge bin level high persistence timer.'),
  bool('LAH_1130', 'Flake surge bin level HIGH.'),
  timerTag('T_LAL_1130', 'Flake surge bin level low persistence timer.'),
  bool('LAL_1130', 'Flake surge bin level LOW — extraction feed starving.'),

  // ---- EXTRACTION ----
  bool('Ext_Permissive', 'Extraction area master permissive from central control.', { input: true, init: true }),
  bool('Ext_Reset_PB', 'Extraction alarm and trip reset pushbutton.', { input: true, init: false }),
  bool('TIC_2210_Auto', 'DT tray 4 temperature loop in AUTO (operator selection).', { input: true, init: true }),
  pidTag('TIC_2210', 'Desolventizer-toaster tray 4 temperature loop. SP 215 degF.'),
  ...starterTags('M2105', 'Extractor main drive', { feedback: true }),
  ...starterTags('M2120', 'Hexane recycle pump P-2120'),
  ...starterTags('M2135', 'Spent flake drag conveyor to DT'),
  ...starterTags('M2220', 'DT discharge airlock'),
  ...starterTags('M2302', 'Miscella transfer pump P-2302', { feedback: true }),
  timerTag('T_IAH_2105', 'Extractor drive current high persistence timer.'),
  bool('IAH_2105', 'Extractor main drive current HIGH.'),
  timerTag('T_ISH_2105', 'Extractor drive current shutdown persistence timer.'),
  bool('ISH_2105_Trip', 'Extractor main drive overcurrent SHUTDOWN — latched, requires reset.'),
  bool('LAH_2130', 'Spent flake discharge hopper level HIGH.'),
  timerTag('T_CV2135_Fast', 'Drag conveyor fast-speed call debounce timer.'),
  bool('CV2135_Fast_Cmd', 'Spent flake drag conveyor FAST speed call to the drive.'),
  timerTag('T_LSH2130_Disc', 'LSH-2130 versus LT-2110 disagreement persistence timer.'),
  bool('LSH_2130_Discrepancy', 'LSH-2130 hopper switch disagrees with extractor bed level — switch suspect.'),
  bool('Feed_Cutback', 'Extractor feed cutback command — bed level high.'),
  real('TCV_2208_Dev', 'TCV-2208 command minus position feedback (signed, percent).'),
  real('TCV_2208_DevAbs', 'TCV-2208 command-to-feedback deviation, absolute value (percent).'),
  timerTag('T_ZDA_2208', 'TCV-2208 valve deviation persistence timer.'),
  bool('ZDA_2208', 'TCV-2208 VALVE DEVIATION — command and position feedback disagree.'),
  timerTag('T_TAH_2210', 'DT tray 4 temperature high persistence timer.'),
  bool('TAH_2210', 'DT tray 4 temperature HIGH.'),
  timerTag('T_TSH_2210', 'DT tray 4 temperature high-high persistence timer.'),
  bool('DT_Steam_Trip', 'DT sparge steam SHUTDOWN — latched, requires reset.'),
  timerTag('T_PAL_2206', 'DT sparge steam supply pressure low persistence timer.'),
  bool('PAL_2206', 'DT sparge steam supply pressure LOW.'),
  bool('LAL_2303', 'P-2302 seal pot barrier fluid level LOW.'),
  timerTag('T_Seal_2303', 'P-2302 seal pot low level trip delay.'),
  bool('Seal_Trip_2303', 'P-2302 seal pot SHUTDOWN — latched, requires reset.'),
  timerTag('T_FAL_2304', 'P-2302 seal flush low flow persistence timer.'),
  bool('FAL_2304', 'P-2302 seal flush flow LOW.'),
  timerTag('T_AAH_2301', 'Pump alley hexane high persistence timer.'),
  bool('AAH_2301', 'Pump alley hexane vapour HIGH (%LEL).'),
  timerTag('T_ASH_2301', 'Pump alley hexane high-high persistence timer.'),
  bool('Ext_Gas_Trip', 'Extraction train GAS SHUTDOWN — latched, requires reset.'),
  timerTag('T_PAL_2305', 'P-2302 discharge pressure low persistence timer.'),
  bool('PAL_2305', 'P-2302 discharge pressure LOW.'),

  // ---- REFINERY ----
  bool('Ref_Permissive', 'Refinery area master permissive from central control.', { input: true, init: true }),
  bool('Ref_Reset_PB', 'Refinery alarm and trip reset pushbutton.', { input: true, init: false }),
  bool('PIC_3410_Auto', 'Ejector motive steam loop in AUTO (operator selection).', { input: true, init: true }),
  pidTag('PIC_3410', 'Vacuum ejector motive steam pressure loop. SP 150 psi.'),
  ...starterTags('M3148', 'Bleach slurry pump P-3148'),
  ...starterTags('M3225', 'Deodorizer discharge pump P-3225', { feedback: true }),
  real('PCV_3412_Dev', 'PCV-3412 command minus position feedback (signed, percent).'),
  real('PCV_3412_DevAbs', 'PCV-3412 command-to-feedback deviation, absolute value (percent).'),
  timerTag('T_ZDA_3412', 'PCV-3412 valve deviation persistence timer.'),
  bool('ZDA_3412', 'PCV-3412 VALVE DEVIATION — command and position feedback disagree.'),
  timerTag('T_PAL_3140', 'Bleacher vacuum low persistence timer.'),
  bool('PAL_3140', 'Bleacher vacuum LOW.'),
  timerTag('T_PAL_3410', 'Ejector motive steam pressure low persistence timer.'),
  bool('PAL_3410', 'Ejector motive steam pressure LOW.'),
  bool('OLA_3225', 'P-3225 motor overload relay TRIPPED.'),
  bool('LT3220_LoLo', 'Deodorizer level LOW-LOW — discharge pump loss-of-suction protection.'),
  timerTag('T_LAH_3220', 'Deodorizer level high persistence timer.'),
  bool('LAH_3220', 'Deodorizer level HIGH.'),
  timerTag('T_LSH_3220', 'Deodorizer level high-high persistence timer.'),
  bool('Deod_Feed_Trip', 'Deodorizer feed SHUTDOWN — latched, requires reset.'),
  timerTag('T_FAL_3250', 'RBD oil to storage flow low persistence timer.'),
  bool('FAL_3250', 'RBD oil to storage flow LOW.'),

  // ---- UTILITIES ----
  bool('Utl_Permissive', 'Utilities area master permissive from central control.', { input: true, init: true }),
  bool('Utl_Reset_PB', 'Utilities alarm and trip reset pushbutton.', { input: true, init: false }),
  bool('Blr1_Master', 'Boiler No.1 master run permissive.', { input: true, init: true }),
  bool('LIC_4110_Auto', 'Boiler drum level loop in AUTO (operator selection).', { input: true, init: true }),
  pidTag('LIC_4110', 'Boiler No.1 three-element drum level loop. SP 50 percent.'),
  ...starterTags('M4115', 'Boiler feedwater pump P-4115', { feedback: true }),
  ...starterTags('M4215', 'Cooling tower fan CT-1', { feedback: true }),
  ...starterTags('M4220', 'Cooling water circulation pump P-4220', { feedback: true }),
  real('FCV_4112_Dev', 'FCV-4112 command minus position feedback (signed, percent).'),
  real('FCV_4112_DevAbs', 'FCV-4112 command-to-feedback deviation, absolute value (percent).'),
  timerTag('T_ZDA_4112', 'FCV-4112 valve deviation persistence timer.'),
  bool('ZDA_4112', 'FCV-4112 VALVE DEVIATION — command and position feedback disagree.'),
  timerTag('T_LAL_4110', 'Boiler drum level low persistence timer.'),
  bool('LAL_4110', 'Boiler No.1 drum level LOW.'),
  timerTag('T_LAH_4110', 'Boiler drum level high persistence timer.'),
  bool('LAH_4110', 'Boiler No.1 drum level HIGH.'),
  timerTag('T_LSL_4110', 'Boiler drum level low-low persistence timer.'),
  bool('Blr1_MFT', 'Boiler No.1 MASTER FUEL TRIP — latched low-water trip, requires reset.'),
  timerTag('T_PAL_4105', 'Main steam header pressure low persistence timer.'),
  bool('PAL_4105', 'Main steam header pressure LOW.'),
  bool('VFA_4215', 'Cooling tower fan CT-1 VFD FAULTED.'),
  timerTag('T_TAH_4210', 'Cooling water supply temperature high persistence timer.'),
  bool('TAH_4210', 'Cooling water supply temperature HIGH.'),
  bool('Makeup_Vlv_Cmd', 'Cooling tower basin makeup valve open command.'),

  // ---- MEAL ----
  bool('Meal_Permissive', 'Meal and loadout area master permissive from central control.', { input: true, init: true }),
  bool('Meal_Reset_PB', 'Meal alarm and trip reset pushbutton.', { input: true, init: false }),
  ...starterTags('M5110', 'Pellet mill main drive'),
  ...starterTags('M5115', 'Pellet cooler exhaust fan'),
  ...starterTags('M5118', 'Cooler discharge rotary airlock RV-5118'),
  timerTag('T_IAH_5110', 'Pellet mill motor current high persistence timer.'),
  bool('IAH_5110', 'Pellet mill motor current HIGH.'),
  timerTag('T_SPA_5118', 'RV-5118 zero-speed disagreement persistence timer.'),
  bool('SPA_5118', 'RV-5118 SPEED DEVIATION — motor running, rotor not turning.'),
  timerTag('T_TAH_5120', 'Pellet cooler discharge temperature high persistence timer.'),
  bool('TAH_5120', 'Pellet cooler discharge temperature HIGH.'),
  bool('Bed_Cutback', 'Pellet cooler feed gate cutback command — bed level high.'),
  timerTag('T_LAH_5125', 'Pellet cooler bed level high persistence timer.'),
  bool('LAH_5125', 'Pellet cooler bed level HIGH.'),
];

// ---------------------------------------------------------------------------
// Reusable rung patterns. Written once so every starter and every alarm in the
// plant has identical, reviewable structure — which is how a real site standard
// works.
// ---------------------------------------------------------------------------

/**
 * Standard 3-wire motor starter. Start pushbutton parallel with the run coil
 * (the seal-in), then the stop button and every interlock in series ahead of
 * the coil, so any interlock opening drops the seal and the motor stops.
 */
function starter(prefix, equipment, permissive, interlocks = []) {
  return rung(
    `${equipment} starter — 3-wire start/stop with seal-in. Stop, the area permissive, the motor overload${interlocks.length ? ', and every process interlock' : ''} break the seal and drop the motor.`,
    OR([XIC(`${prefix}_Start_PB`)], [XIC(`${prefix}_Run_Cmd`)]),
    XIO(`${prefix}_Stop_PB`),
    XIC(permissive),
    XIC(`${prefix}_OL_OK`),
    ...interlocks,
    OTE(`${prefix}_Run_Cmd`),
  );
}

/**
 * Run-feedback supervision: commanded to run but the starter auxiliary contact
 * never made. Two rungs, because the confirmation delay belongs to the timer
 * and the alarm belongs to the timer's done bit.
 */
function runFeedback(prefix, equipment, feedbackTag, delayMs = 3000) {
  return [
    rung(
      `${equipment} run feedback supervision — run commanded but the starter auxiliary contact has not made within ${delayMs / 1000} s.`,
      XIC(`${prefix}_Run_Cmd`), XIO(feedbackTag), TON(`T_${prefix}_Fdbk`, delayMs),
    ),
    rung(
      `${equipment} RUN FEEDBACK FAIL. Check the starter, the auxiliary contact, and the field wiring.`,
      XIC(`T_${prefix}_Fdbk.DN`), OTE(`${prefix}_Fdbk_Fail`),
    ),
  ];
}

/**
 * Delayed process alarm: a comparison drives a timer on one rung, the timer's
 * done bit drives the alarm bit on the next. Putting the coil on the timer's
 * own rung would energise it the instant the comparison went true and the
 * delay would do nothing — the single most common way ladder logic lies.
 */
function delayedAlarm({ compare, timer, delayMs, alarm, arm = [], setup, result }) {
  return [
    rung(setup, ...arm, compare, TON(timer, delayMs)),
    rung(result, XIC(`${timer}.DN`), OTE(alarm)),
  ];
}

/** Latched shutdown: sustained cause latches the trip; a separate reset rung clears it only once the cause has cleared. */
function latchedTrip({ compare, timer, delayMs, trip, arm = [], setup, latch, resetPb, clearCondition, reset }) {
  return [
    rung(setup, ...arm, compare, TON(timer, delayMs)),
    rung(latch, XIC(`${timer}.DN`), OTL(trip)),
    rung(reset, XIC(resetPb), clearCondition, OTU(trip)),
  ];
}

/**
 * Control-valve deviation monitoring, done the way a controller actually does
 * it: subtract feedback from command, take the absolute value, then compare.
 * A sustained disagreement means the positioner or actuator has failed — the
 * command is going out and the valve is not following it.
 */
function valveDeviation({ valve, feedback, dev, devAbs, timer, alarm, limit, delayMs, loopAuto, tag }) {
  return [
    rung(
      `Unconditional scan: compute the ${tag} command-to-position deviation. SUB gives the signed error, ABS makes it direction independent so one comparison covers a valve that is stuck open or stuck shut.`,
      SUB(valve, feedback, dev), ABS(dev, devAbs),
    ),
    rung(
      `${tag} valve deviation — command and position feedback apart by more than ${limit}% for ${delayMs / 1000} s while the loop is in AUTO.`,
      XIC(loopAuto), GRT(devAbs, limit), TON(timer, delayMs),
    ),
    rung(
      `${tag} VALVE DEVIATION. The controller output is not reaching the process: suspect the positioner, the actuator, or the air supply — not the loop tuning.`,
      XIC(`${timer}.DN`), OTE(alarm),
    ),
  ];
}

// ---------------------------------------------------------------------------
// PROGRAMS
// ---------------------------------------------------------------------------

const PREP_CONDITIONER = {
  name: 'P11_Conditioner',
  description: 'Bean conditioner temperature control, steam valve supervision, and conditioner alarms.',
  rungs: [
    rung(
      'Bean conditioner outlet temperature loop. PV = TT-1115, CV = TCV-1116 steam valve, SP 145 degF. The loop runs in the controller; this rung only enables it.',
      XIC('Prep_Permissive'), XIC('TIC_1115_Auto'), PID('TIC_1115', 'TT_1115', 'TCV_1116'),
    ),
    ...valveDeviation({
      tag: 'TCV-1116', valve: 'TCV_1116', feedback: 'ZT_1116',
      dev: 'TCV_1116_Dev', devAbs: 'TCV_1116_DevAbs',
      timer: 'T_ZDA_1116', alarm: 'ZDA_1116', limit: '20.0', delayMs: 30000,
      loopAuto: 'TIC_1115_Auto',
    }),
    ...delayedAlarm({
      setup: 'Conditioner outlet temperature low — below 130 degF for 15 s.',
      compare: LES('TT_1115', '130.0'), timer: 'T_TAL_1115', delayMs: 15000,
      alarm: 'TAL_1115',
      result: 'TAL-1115 CONDITIONER OUTLET TEMPERATURE LOW. Cold flakes carry oil through to the meal.',
    }),
    ...delayedAlarm({
      setup: 'Conditioner steam supply pressure low — below 30 psi for 5 s. Header side, upstream of the control valve.',
      compare: LES('PT_1117', '30.0'), timer: 'T_PAL_1117', delayMs: 5000,
      alarm: 'PAL_1117',
      result: 'PAL-1117 CONDITIONER STEAM SUPPLY PRESSURE LOW.',
    }),
  ],
};

const PREP_MILLS = {
  name: 'P11_Mills',
  description: 'Cracking mill A and B starters, vibration protection, and motor current alarms.',
  rungs: [
    // Vibration is fast-acting protection, so the on-delay is short. The
    // off-delay behind it is the site's ISA-18.2 chatter suppression: without
    // it a signal oscillating across the setpoint produces dozens of nuisance
    // alarms a minute, which is precisely how an alarm system loses its
    // operators. One sustained alarm is worth more than forty true ones.
    rung(
      'Cracking mill A bearing vibration high — above 0.30 in/s for 1 s while the mill is running.',
      XIC('M_1110'), GRT('VT_1120', '0.30'), TON('T_VAH_1120', 1000),
    ),
    rung(
      'Vibration alarm chatter suppression: hold the alarm in for 15 s after the reading falls back. An instrument swinging across the trip point reports as one alarm, not a burst of them.',
      XIC('T_VAH_1120.DN'), TOF('T_VAH_1120_Off', 15000),
    ),
    rung(
      'VAH-1120 CRACKING MILL A BEARING VIBRATION HIGH. ** 3/14: erratic readings reported after the screen change — instrument suspect. J.M. **',
      XIC('T_VAH_1120_Off.DN'), OTE('VAH_1120'),
    ),
    ...latchedTrip({
      setup: 'Cracking mill A vibration shutdown — above 0.45 in/s for 20 s while running.',
      arm: [XIC('M_1110')], compare: GRT('VT_1120', '0.45'), timer: 'T_VSH_1120', delayMs: 20000,
      trip: 'VSH_1120_Trip',
      latch: 'Latch the mill A vibration shutdown. A roll bearing failure is a quarter-million-dollar rebuild; the trip stays latched until someone looks at the machine.',
      reset: 'Reset the mill A vibration shutdown. The reset only takes effect once vibration has actually returned below the alarm threshold.',
      resetPb: 'Prep_Reset_PB', clearCondition: LES('VT_1120', '0.30'),
    }),
    starter('M1110', 'Cracking mill A', 'Prep_Permissive', [XIO('VSH_1120_Trip')]),
    ...runFeedback('M1110', 'Cracking mill A', 'M_1110'),
    ...delayedAlarm({
      setup: 'Cracking mill A motor current high — above 135 A for 5 s.',
      compare: GRT('IT_1110', '135.0'), timer: 'T_IAH_1110', delayMs: 5000,
      alarm: 'IAH_1110',
      result: 'IAH-1110 CRACKING MILL A MOTOR CURRENT HIGH.',
    }),
    starter('M1112', 'Cracking mill B', 'Prep_Permissive'),
    ...runFeedback('M1112', 'Cracking mill B', 'M_1112'),
    ...delayedAlarm({
      setup: 'Cracking mill B motor current high — above 135 A for 5 s.',
      compare: GRT('IT_1112', '135.0'), timer: 'T_IAH_1112', delayMs: 5000,
      alarm: 'IAH_1112',
      result: 'IAH-1112 CRACKING MILL B MOTOR CURRENT HIGH.',
    }),
  ],
};

const PREP_CONVEYORS = {
  name: 'P11_Conveyors',
  description: 'Receiving conveyor, flaking mill, flake conveyor, and surge bin level alarms.',
  rungs: [
    starter('M1105', 'Bean receiving conveyor CV-1105', 'Prep_Permissive'),
    ...runFeedback('M1105', 'Bean receiving conveyor CV-1105', 'M_1105'),
    starter('M1125', 'Flaking mill', 'Prep_Permissive'),
    ...delayedAlarm({
      setup: 'Flaking mill motor current high — above 230 A for 5 s.',
      compare: GRT('IT_1125', '230.0'), timer: 'T_IAH_1125', delayMs: 5000,
      alarm: 'IAH_1125',
      result: 'IAH-1125 FLAKING MILL MOTOR CURRENT HIGH.',
    }),
    starter('M1135', 'Flake conveyor to extraction', 'Prep_Permissive'),
    ...delayedAlarm({
      setup: 'Flake surge bin level high — above 92% for 10 s.',
      compare: GRT('LT_1130', '92.0'), timer: 'T_LAH_1130', delayMs: 10000,
      alarm: 'LAH_1130',
      result: 'LAH-1130 FLAKE SURGE BIN LEVEL HIGH.',
    }),
    ...delayedAlarm({
      setup: 'Flake surge bin level low — below 15% for 10 s. Extraction is being starved of feed.',
      compare: LES('LT_1130', '15.0'), timer: 'T_LAL_1130', delayMs: 10000,
      alarm: 'LAL_1130',
      result: 'LAL-1130 FLAKE SURGE BIN LEVEL LOW.',
    }),
  ],
};

const EXT_EXTRACTOR = {
  name: 'E22_Extractor',
  description: 'Extractor main drive, spent flake drag conveyor speed control, and hopper level supervision.',
  rungs: [
    ...latchedTrip({
      setup: 'Extractor main drive overcurrent shutdown — above 138 A for 3 s.',
      arm: [XIC('M_2105')], compare: GRT('IT_2105', '138.0'), timer: 'T_ISH_2105', delayMs: 3000,
      trip: 'ISH_2105_Trip',
      latch: 'Latch the extractor drive overcurrent shutdown.',
      reset: 'Reset the extractor drive overcurrent shutdown once current has fallen back below the high alarm point.',
      resetPb: 'Ext_Reset_PB', clearCondition: LES('IT_2105', '110.0'),
    }),
    starter('M2105', 'Extractor main drive', 'Ext_Permissive', [XIO('ISH_2105_Trip'), XIO('Ext_Gas_Trip')]),
    ...runFeedback('M2105', 'Extractor main drive', 'M_2105'),
    ...delayedAlarm({
      setup: 'Extractor main drive current high — above 115 A for 5 s while running. Trip point is 138 A.',
      arm: [XIC('M_2105')], compare: GRT('IT_2105', '115.0'), timer: 'T_IAH_2105', delayMs: 5000,
      alarm: 'IAH_2105',
      result: 'IAH-2105 EXTRACTOR MAIN DRIVE CURRENT HIGH. Something is loading the extractor.',
    }),
    rung(
      'Extractor bed level high — cut back the feed above 85%.',
      GRT('LT_2110', '85.0'), OTE('Feed_Cutback'),
    ),
    starter('M2135', 'Spent flake drag conveyor', 'Ext_Permissive', [XIO('Ext_Gas_Trip')]),
    rung(
      'Spent flake hopper high level calls the drag conveyor to FAST speed to pull the hopper down. LSH-2130 is the only thing that makes this rung true.',
      XIC('M2135_Run_Cmd'), XIC('LSH_2130'), TON('T_CV2135_Fast', 2000),
    ),
    rung(
      'Drag conveyor FAST speed command to the drive.',
      XIC('T_CV2135_Fast.DN'), OTE('CV2135_Fast_Cmd'),
    ),
    rung(
      'Spent flake discharge hopper level HIGH from the LSH-2130 float switch.',
      XIC('LSH_2130'), OTE('LAH_2130'),
    ),
    rung(
      'LSH-2130 cross-check: the extractor bed has been backing up above 78% for a full minute but the hopper high-level switch has never made. An analog measurement and a switch that disagree for that long means one of them is lying.',
      GRT('LT_2110', '78.0'), XIO('LSH_2130'), TON('T_LSH2130_Disc', 60000),
    ),
    rung(
      'LSH-2130 SWITCH DISCREPANCY. Verify the float switch before trusting the hopper indication.',
      XIC('T_LSH2130_Disc.DN'), OTE('LSH_2130_Discrepancy'),
    ),
    starter('M2120', 'Hexane recycle pump P-2120', 'Ext_Permissive', [XIO('Ext_Gas_Trip')]),
    starter('M2220', 'DT discharge airlock', 'Ext_Permissive'),
  ],
};

const EXT_DT = {
  name: 'E22_DT',
  description: 'Desolventizer-toaster tray temperature control, sparge steam valve supervision, and the high-high steam trip.',
  rungs: [
    rung(
      'DT tray 4 temperature loop. PV = TT-2210, CV = TCV-2208 sparge steam valve, SP 215 degF.',
      XIC('Ext_Permissive'), XIC('TIC_2210_Auto'), PID('TIC_2210', 'TT_2210', 'TCV_2208'),
    ),
    ...valveDeviation({
      tag: 'TCV-2208', valve: 'TCV_2208', feedback: 'ZT_2208',
      dev: 'TCV_2208_Dev', devAbs: 'TCV_2208_DevAbs',
      timer: 'T_ZDA_2208', alarm: 'ZDA_2208', limit: '25.0', delayMs: 20000,
      loopAuto: 'TIC_2210_Auto',
    }),
    ...delayedAlarm({
      setup: 'DT tray 4 temperature high — above 235 degF for 8 s.',
      compare: GRT('TT_2210', '235.0'), timer: 'T_TAH_2210', delayMs: 8000,
      alarm: 'TAH_2210',
      result: 'TAH-2210 DT TRAY 4 TEMPERATURE HIGH. Meal is scorching.',
    }),
    ...latchedTrip({
      setup: 'DT tray 4 temperature high-high — above 255 degF for 5 s.',
      compare: GRT('TT_2210', '255.0'), timer: 'T_TSH_2210', delayMs: 5000,
      trip: 'DT_Steam_Trip',
      latch: 'Latch the DT sparge steam shutdown: close the steam block valve and trip the feed.',
      reset: 'Reset the DT sparge steam shutdown once tray 4 is back below the high alarm point.',
      resetPb: 'Ext_Reset_PB', clearCondition: LES('TT_2210', '230.0'),
    }),
    ...delayedAlarm({
      setup: 'DT sparge steam supply pressure low — below 35 psi for 10 s.',
      compare: LES('PT_2206', '35.0'), timer: 'T_PAL_2206', delayMs: 10000,
      alarm: 'PAL_2206',
      result: 'PAL-2206 DT SPARGE STEAM SUPPLY PRESSURE LOW.',
    }),
  ],
};

const EXT_PUMPS = {
  name: 'E23_Pumps',
  description: 'Miscella transfer pump seal protection and pump alley hexane gas detection.',
  rungs: [
    rung(
      'P-2302 seal pot barrier fluid LOW. LSL-2303 reads 1 when the seal pot level is satisfactory, so the alarm is examined open.',
      XIO('LSL_2303'), OTE('LAL_2303'),
    ),
    ...latchedTrip({
      setup: 'P-2302 seal pot low level trip — 60 s grace so a transient swing does not stop the pump, then the pump comes down.',
      compare: XIO('LSL_2303'), timer: 'T_Seal_2303', delayMs: 60000,
      trip: 'Seal_Trip_2303',
      latch: 'Latch the P-2302 seal pot shutdown. Running a mechanical seal without barrier fluid pushes hexane straight into the alley.',
      reset: 'Reset the P-2302 seal pot shutdown once the seal pot level switch has been restored.',
      resetPb: 'Ext_Reset_PB', clearCondition: XIC('LSL_2303'),
    }),
    ...latchedTrip({
      setup: 'Pump alley hexane HIGH-HIGH — above 40 %LEL for 3 s.',
      compare: GRT('AT_2301', '40.0'), timer: 'T_ASH_2301', delayMs: 3000,
      trip: 'Ext_Gas_Trip',
      latch: 'Latch the extraction train gas shutdown. Every hexane-side motor drops out.',
      reset: 'Reset the extraction gas shutdown only once the alley has ventilated below the high alarm point.',
      resetPb: 'Ext_Reset_PB', clearCondition: LES('AT_2301', '10.0'),
    }),
    starter('M2302', 'Miscella transfer pump P-2302', 'Ext_Permissive', [XIO('Seal_Trip_2303'), XIO('Ext_Gas_Trip')]),
    ...runFeedback('M2302', 'Miscella transfer pump P-2302', 'M_2302'),
    ...delayedAlarm({
      setup: 'P-2302 seal flush flow low — FSL-2304 reads 1 when flush flow is satisfactory, so low flow is examined open for 10 s.',
      compare: XIO('FSL_2304'), timer: 'T_FAL_2304', delayMs: 10000,
      alarm: 'FAL_2304',
      result: 'FAL-2304 P-2302 SEAL FLUSH FLOW LOW.',
    }),
    ...delayedAlarm({
      setup: 'Pump alley hexane vapour high — above 15 %LEL for 2 s. High-high trips the train at 40 %LEL.',
      compare: GRT('AT_2301', '15.0'), timer: 'T_AAH_2301', delayMs: 2000,
      alarm: 'AAH_2301',
      result: 'AAH-2301 HEXANE VAPOUR HIGH — PUMP ALLEY. The detector reports vapour; it cannot tell you where it came from.',
    }),
    ...delayedAlarm({
      setup: 'P-2302 discharge pressure low — below 45 psi for 10 s while the pump is running.',
      arm: [XIC('M_2302')], compare: LES('PT_2305', '45.0'), timer: 'T_PAL_2305', delayMs: 10000,
      alarm: 'PAL_2305',
      result: 'PAL-2305 P-2302 DISCHARGE PRESSURE LOW.',
    }),
  ],
};

const REF_VACUUM = {
  name: 'R34_Vacuum',
  description: 'Vacuum ejector motive steam control, ejector valve supervision, and bleacher vacuum alarms.',
  rungs: [
    rung(
      'Vacuum ejector motive steam pressure loop. PV = PT-3410, CV = PCV-3412, SP 150 psi.',
      XIC('Ref_Permissive'), XIC('PIC_3410_Auto'), PID('PIC_3410', 'PT_3410', 'PCV_3412'),
    ),
    ...valveDeviation({
      tag: 'PCV-3412', valve: 'PCV_3412', feedback: 'ZT_3412',
      dev: 'PCV_3412_Dev', devAbs: 'PCV_3412_DevAbs',
      timer: 'T_ZDA_3412', alarm: 'ZDA_3412', limit: '20.0', delayMs: 30000,
      loopAuto: 'PIC_3410_Auto',
    }),
    ...delayedAlarm({
      setup: 'Bleacher vacuum low — below 22 inHg for 20 s.',
      compare: LES('PT_3140', '22.0'), timer: 'T_PAL_3140', delayMs: 20000,
      alarm: 'PAL_3140',
      result: 'PAL-3140 BLEACHER VACUUM LOW. Bleaching earth performance falls off a cliff without vacuum.',
    }),
    ...delayedAlarm({
      setup: 'Ejector motive steam pressure low — below 125 psi for 10 s. The ejector cannot pull vacuum without motive steam.',
      compare: LES('PT_3410', '125.0'), timer: 'T_PAL_3410', delayMs: 10000,
      alarm: 'PAL_3410',
      result: 'PAL-3410 EJECTOR MOTIVE STEAM PRESSURE LOW.',
    }),
    starter('M3148', 'Bleach slurry pump P-3148', 'Ref_Permissive'),
  ],
};

const REF_DEOD = {
  name: 'R32_Deod',
  description: 'Deodorizer discharge pump, level protection, and product flow alarms.',
  rungs: [
    rung(
      'Deodorizer level LOW-LOW. Solved ahead of the pump starter below so the discharge pump is protected from losing suction on the same scan, not the next one.',
      LES('LT_3220', '8.0'), OTE('LT3220_LoLo'),
    ),
    rung(
      'P-3225 motor overload TRIPPED. OL-3225 reads 1 when the thermal overload relay is healthy, so a trip is examined open.',
      XIO('OL_3225'), OTE('OLA_3225'),
    ),
    starter('M3225', 'Deodorizer discharge pump P-3225', 'Ref_Permissive', [XIO('LT3220_LoLo')]),
    ...runFeedback('M3225', 'Deodorizer discharge pump P-3225', 'M_3225'),
    ...delayedAlarm({
      setup: 'Deodorizer level high — above 65% for 15 s.',
      compare: GRT('LT_3220', '65.0'), timer: 'T_LAH_3220', delayMs: 15000,
      alarm: 'LAH_3220',
      result: 'LAH-3220 DEODORIZER LEVEL HIGH. Level rises when more comes in than goes out — check what is supposed to be pumping it out.',
    }),
    ...latchedTrip({
      setup: 'Deodorizer level high-high — above 88% for 5 s.',
      compare: GRT('LT_3220', '88.0'), timer: 'T_LSH_3220', delayMs: 5000,
      trip: 'Deod_Feed_Trip',
      latch: 'Latch the deodorizer feed shutdown: trip the feed and the sparge steam before oil carries over into the vacuum system.',
      reset: 'Reset the deodorizer feed shutdown once level is back below the high alarm point.',
      resetPb: 'Ref_Reset_PB', clearCondition: LES('LT_3220', '60.0'),
    }),
    ...delayedAlarm({
      setup: 'RBD oil to storage flow low — below 20 gpm for 20 s.',
      compare: LES('FT_3250', '20.0'), timer: 'T_FAL_3250', delayMs: 20000,
      alarm: 'FAL_3250',
      result: 'FAL-3250 RBD OIL TO STORAGE FLOW LOW.',
    }),
  ],
};

const UTL_BOILER = {
  name: 'U41_Boiler',
  description: 'Boiler No.1 three-element drum level control, feedwater valve supervision, and the low-water master fuel trip.',
  rungs: [
    rung(
      'Boiler No.1 three-element drum level loop: drum level trimmed by steam flow and feedwater flow. PV = LT-4110, CV = FCV-4112, SP 50%.',
      XIC('Blr1_Master'), XIC('LIC_4110_Auto'), PID('LIC_4110', 'LT_4110', 'FCV_4112'),
    ),
    ...valveDeviation({
      tag: 'FCV-4112', valve: 'FCV_4112', feedback: 'ZT_4112',
      dev: 'FCV_4112_Dev', devAbs: 'FCV_4112_DevAbs',
      timer: 'T_ZDA_4112', alarm: 'ZDA_4112', limit: '20.0', delayMs: 30000,
      loopAuto: 'LIC_4110_Auto',
    }),
    ...delayedAlarm({
      setup: 'Boiler drum level low — below 38% for 10 s.',
      compare: LES('LT_4110', '38.0'), timer: 'T_LAL_4110', delayMs: 10000,
      alarm: 'LAL_4110',
      result: 'LAL-4110 BOILER NO.1 DRUM LEVEL LOW. Low water is how boilers are lost.',
    }),
    ...delayedAlarm({
      setup: 'Boiler drum level high — above 70% for 10 s. Carryover risk to the steam header.',
      compare: GRT('LT_4110', '70.0'), timer: 'T_LAH_4110', delayMs: 10000,
      alarm: 'LAH_4110',
      result: 'LAH-4110 BOILER NO.1 DRUM LEVEL HIGH.',
    }),
    ...latchedTrip({
      setup: 'Boiler drum level low-low — below 20% for 3 s.',
      compare: LES('LT_4110', '20.0'), timer: 'T_LSL_4110', delayMs: 3000,
      trip: 'Blr1_MFT',
      latch: 'Latch the boiler No.1 MASTER FUEL TRIP. Burner off, plant steam gone, and nothing in Plant 7 runs for the rest of the shift.',
      reset: 'Reset the boiler master fuel trip only once drum level has been restored above the low alarm point.',
      resetPb: 'Utl_Reset_PB', clearCondition: GRT('LT_4110', '45.0'),
    }),
    starter('M4115', 'Boiler feedwater pump P-4115', 'Blr1_Master'),
    ...runFeedback('M4115', 'Boiler feedwater pump P-4115', 'M_4115'),
    ...delayedAlarm({
      setup: 'Main steam header pressure low — below 105 psi for 15 s.',
      compare: LES('PT_4105', '105.0'), timer: 'T_PAL_4105', delayMs: 15000,
      alarm: 'PAL_4105',
      result: 'PAL-4105 MAIN STEAM HEADER PRESSURE LOW.',
    }),
  ],
};

const UTL_COOLING = {
  name: 'U42_CoolingTower',
  description: 'Cooling tower fan and circulation pump control, VFD fault handling, and cooling water temperature alarms.',
  rungs: [
    rung(
      'Cooling tower fan CT-1 VFD FAULTED. VFD-4215 reads 1 when the drive is faulted, so the alarm is examined closed.',
      XIC('VFD_4215'), OTE('VFA_4215'),
    ),
    starter('M4215', 'Cooling tower fan CT-1', 'Utl_Permissive', [XIO('VFD_4215')]),
    ...runFeedback('M4215', 'Cooling tower fan CT-1', 'M_4215', 5000),
    starter('M4220', 'Cooling water circulation pump P-4220', 'Utl_Permissive'),
    ...runFeedback('M4220', 'Cooling water circulation pump P-4220', 'M_4220'),
    ...delayedAlarm({
      setup: 'Cooling water supply temperature high — above 92 degF for 30 s.',
      compare: GRT('TT_4210', '92.0'), timer: 'T_TAH_4210', delayMs: 30000,
      alarm: 'TAH_4210',
      result: 'TAH-4210 COOLING WATER SUPPLY TEMPERATURE HIGH. Everything downstream that depends on cooling water goes with it.',
    }),
    rung(
      'Cooling tower basin makeup valve — open below 55% basin level.',
      LES('LT_4225', '55.0'), OTE('Makeup_Vlv_Cmd'),
    ),
  ],
};

const MEAL_COOLER = {
  name: 'M51_Cooler',
  description: 'Pellet mill, cooler exhaust fan, discharge airlock, and the zero-speed supervision that catches a sheared drive.',
  rungs: [
    starter('M5110', 'Pellet mill main drive', 'Meal_Permissive'),
    ...delayedAlarm({
      setup: 'Pellet mill motor current high — above 200 A for 5 s.',
      compare: GRT('IT_5110', '200.0'), timer: 'T_IAH_5110', delayMs: 5000,
      alarm: 'IAH_5110',
      result: 'IAH-5110 PELLET MILL MOTOR CURRENT HIGH.',
    }),
    starter('M5115', 'Pellet cooler exhaust fan', 'Meal_Permissive'),
    starter('M5118', 'Cooler discharge rotary airlock RV-5118', 'Meal_Permissive'),
    rung(
      'RV-5118 zero-speed supervision. The motor run feedback says the motor is turning; SS-5118 reads 1 only while the rotor itself is turning. Eight seconds of disagreement means the drive train between them has parted.',
      XIC('M_5118'), XIO('SS_5118'), TON('T_SPA_5118', 8000),
    ),
    rung(
      'SPA-5118 RV-5118 SPEED DEVIATION. A running motor is not proof of a turning airlock — that is the entire reason this switch is installed.',
      XIC('T_SPA_5118.DN'), OTE('SPA_5118'),
    ),
    ...delayedAlarm({
      setup: 'Pellet cooler discharge temperature high — above 125 degF for 20 s.',
      compare: GRT('TT_5120', '125.0'), timer: 'T_TAH_5120', delayMs: 20000,
      alarm: 'TAH_5120',
      result: 'TAH-5120 PELLET COOLER DISCHARGE TEMPERATURE HIGH. Hot meal in a deep bed is how a smoulder starts.',
    }),
    rung(
      'Pellet cooler feed gate cutback above 75% bed level.',
      GRT('LT_5125', '75.0'), OTE('Bed_Cutback'),
    ),
    ...delayedAlarm({
      setup: 'Pellet cooler bed level high — above 85% for 10 s.',
      compare: GRT('LT_5125', '85.0'), timer: 'T_LAH_5125', delayMs: 10000,
      alarm: 'LAH_5125',
      result: 'LAH-5125 PELLET COOLER BED LEVEL HIGH.',
    }),
  ],
};

/** Build a program with its MainRoutine JSR table generated from the subroutines. */
function program(name, description, subroutines) {
  return {
    name,
    description,
    routines: [mainRoutine(name, subroutines.map((routine) => routine.name)), ...subroutines],
  };
}

export const PROGRAMS = [
  program('Prep', 'Prairie Gold Plant 7 bean preparation: receiving, conditioning, cracking, and flaking.',
    [PREP_CONDITIONER, PREP_MILLS, PREP_CONVEYORS]),
  program('Extraction', 'Prairie Gold Plant 7 solvent extraction and desolventizer-toaster.',
    [EXT_EXTRACTOR, EXT_DT, EXT_PUMPS]),
  program('Refinery', 'Prairie Gold Plant 7 oil refining: degumming, bleaching, and deodorizing.',
    [REF_VACUUM, REF_DEOD]),
  program('Utilities', 'Prairie Gold Plant 7 steam generation and cooling water.',
    [UTL_BOILER, UTL_COOLING]),
  program('Meal', 'Prairie Gold Plant 7 meal pelleting, cooling, and loadout.',
    [MEAL_COOLER]),
];

// ---------------------------------------------------------------------------
// Field I/O. Every tag in the plant tag database is a real wired point, so the
// controller declares them all and the logic is never allowed to write one.
// ---------------------------------------------------------------------------

/** Logix-legal name for a plant tag id, e.g. `TT-1115` -> `TT_1115`. */
export const logixName = (tag) => String(tag).replace(/[^A-Za-z0-9_]/g, '_');

/** Reverse map so the scan engine can find the plant tag behind a Logix name. */
export const FIELD_TAG_BY_LOGIX_NAME = Object.fromEntries(
  TAGS.map((tag) => [logixName(tag.tag), tag]),
);

/** Field points are inputs to the logic; only the analog outputs are written, and the process simulation owns those. */
export const FIELD_TAGS = TAGS.map((tag) => ({
  name: logixName(tag.tag),
  plantTag: tag.tag,
  dataType: tag.kind === 'di' || tag.kind === 'mtr' ? 'BOOL' : 'REAL',
  description: `${tag.desc}${tag.eu ? ` (${tag.eu})` : ''}`,
  kind: tag.kind,
}));

/** Every controller tag: field I/O first, then the logic's own tags. */
export const ALL_CONTROLLER_TAGS = [...FIELD_TAGS, ...CONTROLLER_TAGS];

// ---------------------------------------------------------------------------
// Alarm database, derived from the controller code rather than written twice.
//
// A site's alarm list and its logic drift apart the moment they are maintained
// separately, so this walks the ladder and takes every alarm-class bit from the
// coil that actually drives it. If a rung is edited, the operator alarm summary
// follows it.
// ---------------------------------------------------------------------------

const AREA_BY_PROGRAM = {
  Prep: 'PREP', Extraction: 'EXTRACTION', Refinery: 'REFINERY', Utilities: 'UTILITIES', Meal: 'MEAL',
};

/** ISA-5.1 alarm suffixes plus the site's supervision and shutdown bits. */
const ALARM_NAME = /^(TAL|TAH|PAL|PAH|LAL|LAH|FAL|FAH|VAH|IAH|AAH|ZDA|OLA|SPA|VFA)_/;
const isAlarmBit = (name) => ALARM_NAME.test(name) ||
  /(_Trip|_MFT|_Fdbk_Fail|_Discrepancy)$/.test(name);
const isShutdown = (name) => /(_Trip|_MFT)$/.test(name);

function* eachNode(branch) {
  if (!branch) return;
  for (const node of branch.nodes || []) yield node;
  for (const leg of branch.parallelBranches || []) yield* eachNode(leg);
  yield* eachNode(branch.next);
}

const TAG_DESCRIPTIONS = new Map(CONTROLLER_TAGS.map((tag) => [tag.name, tag.description]));

export const ALARM_DEFS = (() => {
  const defs = [];
  const seen = new Set();
  for (const prog of PROGRAMS) {
    for (const routine of prog.routines) {
      for (const item of routine.rungs) {
        for (const node of eachNode(item.root)) {
          if (node.instructionType !== 'OTE' && node.instructionType !== 'OTL') continue;
          const name = node.operands[0]?.value;
          if (!name || seen.has(name) || !isAlarmBit(name)) continue;
          seen.add(name);
          defs.push({
            tag: name,
            program: prog.name,
            area: AREA_BY_PROGRAM[prog.name] || 'PLANT 7',
            routine: routine.name,
            severity: isShutdown(name) ? 'critical' : 'major',
            message: TAG_DESCRIPTIONS.get(name) || item.comment || name,
            helpText: `Driven by ${prog.name}/${routine.name}. Open the routine and follow the rung that sets this bit.`,
          });
        }
      }
    }
  }
  return defs;
})();

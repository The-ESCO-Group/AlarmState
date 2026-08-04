// AlarmState twelve-week qualification program. The same plant, simulation,
// ESCO project, and fault scenarios are used for teaching and assessment.

const ALL_SCENARIOS = [
  'PREP_COND_TEMP', 'PREP_MILL_VIB', 'EXT_EXTRACTOR_AMPS', 'EXT_DT_TEMP',
  'EXT_HEXANE_LEL', 'REF_BLEACH_VAC', 'REF_DEOD_LEVEL', 'UTL_DRUM_LEVEL',
  'UTL_CW_TEMP', 'MEAL_COOLER_TEMP',
];

export const CV101_TAGS = Object.freeze({
  Start_PB: { name: 'Start_PB', type: 'BOOL', role: 'INPUT', purpose: 'Momentary operator START pushbutton. True only while the button is pressed.' },
  Stop_PB: { name: 'Stop_PB', type: 'BOOL', role: 'INPUT', purpose: 'Momentary operator STOP pushbutton. True only while the button is pressed.' },
  Reset_PB: { name: 'Reset_PB', type: 'BOOL', role: 'INPUT', purpose: 'Momentary operator RESET pushbutton used to acknowledge a cleared condition.' },
  EStop_OK: { name: 'EStop_OK', type: 'BOOL', role: 'SAFETY INPUT', purpose: 'E-stop circuit permissive. True only while the safety string is healthy.' },
  PE101_PhotoEye: { name: 'PE101_PhotoEye', type: 'BOOL', role: 'INPUT', purpose: 'Raw PE-101 blocked-beam signal. Carton edges may make this input chatter.' },
  Motor_Run: { name: 'Motor_Run', type: 'BOOL', role: 'OUTPUT / STATE', purpose: 'CV-101 run command. True while the controller is commanding the motor to run.' },
  Stack_Green: { name: 'Stack_Green', type: 'BOOL', role: 'OUTPUT', purpose: 'Green stack-light lamp command.' },
  Stack_Amber: { name: 'Stack_Amber', type: 'BOOL', role: 'OUTPUT', purpose: 'Amber stack-light lamp command.' },
  Stack_Red: { name: 'Stack_Red', type: 'BOOL', role: 'OUTPUT', purpose: 'Red stack-light lamp command.' },
  T_Debounce: { name: 'T_Debounce', type: 'TIMER', role: 'INTERNAL', purpose: 'Timer structure reserved for qualifying the PE-101 signal.' },
  'T_Debounce.DN': { name: 'T_Debounce.DN', type: 'BOOL', role: 'TIMER MEMBER', purpose: 'Done bit exposed after the debounce timer reaches its preset.' },
  Part_Detected: { name: 'Part_Detected', type: 'BOOL', role: 'INTERNAL', purpose: 'Conditioned one-carton detection state.' },
  Part_Counter: { name: 'Part_Counter', type: 'COUNTER', role: 'INTERNAL', purpose: 'Counter structure reserved for accepted cartons.' },
  'Part_Counter.ACC': { name: 'Part_Counter.ACC', type: 'DINT', role: 'COUNTER MEMBER', purpose: 'Current accumulated carton count for logic and HMI display.' },
  T_Jam: { name: 'T_Jam', type: 'TIMER', role: 'INTERNAL', purpose: 'Timer structure reserved for a sustained blocked-beam condition.' },
  'T_Jam.DN': { name: 'T_Jam.DN', type: 'BOOL', role: 'TIMER MEMBER', purpose: 'Done bit exposed after the jam timer reaches its preset.' },
  Jam_Fault: { name: 'Jam_Fault', type: 'BOOL', role: 'INTERNAL FAULT', purpose: 'Retained CV-101 jam-fault state used by controller logic and the HMI.' },
  Speed_SP: { name: 'Speed_SP', type: 'REAL', role: 'HMI INPUT', purpose: 'Operator conveyor speed request in percent, from 0 to 100.' },
  VFD_SpeedRef: { name: 'VFD_SpeedRef', type: 'REAL', role: 'CREATE / OUTPUT', purpose: 'Create this controller tag for the CV-101 drive reference, from 0 to 400.' },
});

const MISSION_TAG_NAMES = Object.freeze({
  'w1-run-indication': ['Motor_Run', 'Stack_Green', 'Stack_Amber', 'Stack_Red', 'EStop_OK'],
  'w1-safe-motor': ['Start_PB', 'Stop_PB', 'EStop_OK', 'Motor_Run', 'Reset_PB', 'Jam_Fault'],
  'w2-photoeye': ['PE101_PhotoEye', 'T_Debounce', 'T_Debounce.DN', 'Part_Detected', 'Motor_Run'],
  'w2-counting': ['PE101_PhotoEye', 'T_Debounce.DN', 'Part_Detected', 'Part_Counter', 'Part_Counter.ACC', 'Reset_PB'],
  'w3-jam': ['Start_PB', 'Stop_PB', 'EStop_OK', 'PE101_PhotoEye', 'Motor_Run', 'T_Jam', 'T_Jam.DN', 'Jam_Fault', 'Reset_PB'],
  'w3-speed': ['Speed_SP', 'VFD_SpeedRef', 'Motor_Run', 'EStop_OK', 'Jam_Fault'],
  'w4-overview': ['Motor_Run', 'Jam_Fault', 'Part_Counter.ACC', 'PE101_PhotoEye', 'Speed_SP'],
  'w4-alarm': ['Jam_Fault', 'PE101_PhotoEye', 'T_Jam.DN', 'T_Debounce.DN', 'Motor_Run', 'Reset_PB'],
});

const tagBankFor = (missionId) => (MISSION_TAG_NAMES[missionId] || []).map((name) => CV101_TAGS[name]);

const escoMission = (id, title, validator, view, plant, problem, why, success, hint) => ({
  id, title, kind: 'esco', validator, view,
  studioMode: view === 'hmi' ? 'hmi-designer' : 'logic-editor',
  destination: view === 'hmi' ? 'academyStudio' : 'cv101Workstation',
  plant, problem, why, success, hint, tagBank: tagBankFor(id),
});

const fieldMission = (id, title, scenarioIds, difficulty, plant, problem, why, success, hint, target = 1) => ({
  id, title, kind: target > 1 ? 'shift' : 'scenario', scenarioIds, difficulty, target,
  studioMode: 'plant-hmi-and-logic',
  destination: 'controlRoom',
  plant, problem, why, success, hint,
});

export const COURSE_WEEKS = [
  {
    n: 1, id: 'w1', title: 'CONTROL FOUNDATIONS', area: 'CV-101 Training Cell',
    story: 'Plant 7 failed its alarm audit. Frank will not let an unproven technician near production. Make CV-101 tell the truth or the qualification stops here.',
    summary: 'Learn the scan-cycle mindset and commission indication before enabling motion.',
    skills: ['PLC scan cycle', 'Inputs and outputs', 'Fail-safe thinking', 'Motor control'],
    missions: [
      escoMission('w1-run-indication', 'Prove the RUN indication', 'green', 'routine',
        'CV-101 is stopped. The tower light has no trustworthy indication that the conveyor is actually running.',
        'Create a green RUN indication that follows the conveyor run state. Do not move the belt during this assignment.',
        'Operators must be able to trust status indication before anyone is allowed to command motion.',
        'The green lamp follows the true run state and remains off while CV-101 is stopped.',
        'Start from the two physical facts involved: one status says the conveyor is running, and one output controls the green lamp.'),
      escoMission('w1-safe-motor', 'Commission safe start and stop', 'motor', 'routine',
        'The indication circuit is ready, but the momentary START control cannot hold MTR-101 on safely.',
        'Make CV-101 start, remain running after START is released, and stop for STOP or an unhealthy E-stop circuit.',
        'A production motor must remember a valid start request without defeating any stop or safety condition.',
        'START runs the conveyor; STOP and the E-stop permissive always remove the run command.',
        'Separate the condition that remembers a start from the conditions that must always be able to break it.'),
    ],
  },
  {
    n: 2, id: 'w2', title: 'SENSORS, TIMERS AND COUNTERS', area: 'CV-101 Training Cell',
    story: 'Production rejected the CV-101 totals because PE-101 chatters. Management wants a defensible count, not another explanation.',
    summary: 'Turn a noisy photoeye into trustworthy production information.',
    skills: ['Photoeyes', 'Signal conditioning', 'Timers', 'One-shots', 'Counters'],
    missions: [
      escoMission('w2-photoeye', 'Reject photoeye chatter', 'debounce', 'routine',
        'PE-101 changes rapidly at carton edges. Electrical chatter can look like several products arriving at once.',
        'Accept a carton only after the sensor has remained stable for the required 50 ms window.',
        'Unfiltered field signals create false events and make every downstream total untrustworthy.',
        'Brief sensor flickers are ignored and a real blocked beam becomes a stable detection.',
        'Use time to qualify the input; a change shorter than the stability window should never become valid.'),
      escoMission('w2-counting', 'Count each carton once', 'count', 'routine',
        'The line can detect a stable carton, but production has no reliable completed-part total.',
        'Count each accepted carton exactly once, even if it remains in the beam.',
        'A level is not an event. Production totals require one increment per physical arrival.',
        'Each real carton adds one count with no duplicates from a held or chattering sensor.',
        'Focus on the transition into a detected state, not how long the detected state remains true.'),
    ],
  },
  {
    n: 3, id: 'w3', title: 'INTERLOCKS AND DRIVE CONTROL', area: 'CV-101 Training Cell',
    story: 'The staged jam exposed an unacceptable control gap. Close it before release or Frank records a failed safety assignment.',
    summary: 'Protect the conveyor from jams and give production a safe speed command.',
    skills: ['Fault latching', 'Reset discipline', 'Interlocks', 'VFD scaling', 'Safe states'],
    missions: [
      escoMission('w3-jam', 'Stop a sustained jam', 'jam', 'routine',
        'A carton can remain over PE-101 while CV-101 runs without recording a fault or stopping the motor.',
        'Detect a five-second blocked condition, retain the fault, stop the conveyor, and require a deliberate reset.',
        'A transient sensor condition and a recorded machine fault are different responsibilities.',
        'A sustained blockage latches a jam, drops MTR-101, and stays recorded until reset.',
        'Think in four stages: detect, remember, interlock, and reset. Clearing the beam alone must not erase the event.'),
      escoMission('w3-speed', 'Scale the VFD speed reference', 'speed', 'routine',
        'The operator enters speed as 0–100 percent, while the VFD accepts a 0–400 engineering reference.',
        'Scale the running command into the drive range and force a defined zero command whenever CV-101 is stopped.',
        'Analog commands need both correct scaling and an explicit safe state.',
        'The belt follows the operator percentage while running and receives zero reference while stopped.',
        'Compare the span of the operator range with the span of the drive range, then handle the stopped state separately.'),
    ],
  },
  {
    n: 4, id: 'w4', title: 'HMI AND ALARM DESIGN', area: 'ESCO HMI Studio',
    story: 'The operator interface is not fit for production. Build one screen management can audit without excuses, clutter, or nuisance alarms.',
    summary: 'Build an operator screen that reports what the controller actually knows.',
    skills: ['HMI binding', 'Command paths', 'Alarm quality', 'Operator usability'],
    missions: [
      escoMission('w4-overview', 'Build the conveyor overview', 'hmi-overview', 'hmi',
        'The operator has no single screen showing whether CV-101 is running, faulted, or meeting production count.',
        'Create one overview screen that communicates run state, jam state, and carton total from live controller tags.',
        'Operators diagnose faster when the essential state is visible without navigating between unrelated pages.',
        'One screen presents live run, jam, and count information with clear visual hierarchy.',
        'Choose one trustworthy controller value for each question: Is it running? Is it faulted? How many passed?'),
      escoMission('w4-alarm', 'Create an honest jam alarm', 'hmi-alarm', 'hmi',
        'A raw photoeye condition can appear during every normal carton and must not become a nuisance alarm.',
        'Create an operator alarm from the retained machine fault rather than the raw detection signal.',
        'Alarm floods train operators to ignore the system exactly when it matters most.',
        'Normal cartons remain quiet; a real latched jam appears in the alarm system until handled.',
        'Alarm the controller decision that maintenance must act on, not the raw input used to make that decision.'),
    ],
  },
  {
    n: 5, id: 'w5', title: 'ANALOG INSTRUMENTS AND VALVES', area: 'Bean Prep and Refinery',
    story: 'Frank issued a conditional field permit. One unsupported diagnosis sends you back to the training cell. Separate controller command from physical truth.',
    summary: 'Use command, feedback, and process response to separate a bad instrument from a real process problem.',
    skills: ['Analog signals', 'Valve feedback', 'Trend reading', 'Root-cause tags'],
    missions: [
      fieldMission('w5-conditioner', 'Conditioner temperature investigation', ['PREP_COND_TEMP'], 'easy',
        'Bean conditioner temperature is drifting outside its operating window while the steam loop remains in automatic.',
        'Use the HMI, field equipment, radio, and diagnostic workstation to identify the failed I/O point.',
        'A command value alone cannot prove that a final control element physically moved.',
        'Submit the root-cause tag before the alarm reaches plant shutdown.',
        'Compare the valve command with its independent position feedback and the resulting process temperature.'),
      fieldMission('w5-deodorizer', 'Deodorizer level investigation', ['REF_DEOD_LEVEL'], 'easy',
        'Deodorizer level is rising while the discharge system reports that it is available.',
        'Determine whether the level measurement, motor circuit, or process equipment is responsible.',
        'Analog symptoms often come from a discrete equipment failure elsewhere in the process path.',
        'Identify the single failed I/O point and preserve production before shutdown.',
        'Follow material flow: if level rises, compare what is entering with what should be leaving.'),
    ],
  },
  {
    n: 6, id: 'w6', title: 'PROCESS CONTROL AND PERMISSIVES', area: 'Extraction and Utilities',
    story: 'A utility upset is spreading into production. Trace the loop before the interlocks act or carry the shutdown on your record.',
    summary: 'Trace process alarms through loops, permissives, and final elements.',
    skills: ['Process response', 'Permissives', 'Loop diagnosis', 'Trip prevention'],
    missions: [
      fieldMission('w6-boiler', 'Boiler drum level response', ['UTL_DRUM_LEVEL'], 'easy',
        'Boiler drum level is leaving its safe band while feedwater equipment reports conflicting states.',
        'Find the failed point before the master trip sequence activates.',
        'Boiler level is a system result; the cause may be a valve, pump, feedback, or measurement point.',
        'Correctly identify the root cause while the plant remains online.',
        'Work from the process requirement backward through flow, command, feedback, and permissives.'),
      fieldMission('w6-dt', 'DT temperature response', ['EXT_DT_TEMP'], 'normal',
        'The desolventizer-toaster is losing temperature control and product quality is at risk.',
        'Use loop evidence and field confirmation to isolate the I/O failure.',
        'A controller can calculate the right command while the physical process moves the wrong direction.',
        'Identify the failed point before the extraction area trips.',
        'Compare process variable, final-element command, position feedback, and available utility pressure.'),
    ],
  },
  {
    n: 7, id: 'w7', title: 'MOTOR AND MECHANICAL DIAGNOSIS', area: 'Bean Prep and Extraction',
    story: 'Operations is blaming controls for every stopped machine. Prove what RUN feedback means before management authorizes unnecessary electrical work.',
    summary: 'Learn when electrical RUN does not mean the machine is doing useful work.',
    skills: ['Motor current', 'Vibration', 'Overloads', 'Mechanical feedback'],
    missions: [
      fieldMission('w7-mill', 'Cracking mill vibration', ['PREP_MILL_VIB'], 'normal',
        'A cracking mill remains in RUN while bearing vibration climbs toward a damaging level.',
        'Determine which field point provides the earliest trustworthy evidence of the failure.',
        'Run status proves contactor state, not mechanical health.',
        'Identify the root-cause I/O point before equipment damage forces shutdown.',
        'Compare the motor electrical load with the independent measurement of mechanical condition.'),
      fieldMission('w7-extractor', 'Extractor loading problem', ['EXT_EXTRACTOR_AMPS'], 'normal',
        'Extractor drive current is rising as material backs up through the discharge path.',
        'Find the instrument or equipment state that prevented the conveyor system from responding.',
        'The highest alarm value is often a downstream symptom rather than the initiating failure.',
        'Trace the material-flow chain and identify the first failed point.',
        'Look for a field observation that disagrees with the PLC input used to select conveyor behavior.'),
    ],
  },
  {
    n: 8, id: 'w8', title: 'VFDS, SPEED AND EQUIPMENT FEEDBACK', area: 'Utilities and Meal',
    story: 'Management raised rate and the equipment states no longer agree. Produce a defensible answer before the lost-throughput report names controls.',
    summary: 'Separate drive faults, motor feedback, and true machine motion.',
    skills: ['VFD status', 'Zero-speed switches', 'Couplings', 'Fault recovery'],
    missions: [
      fieldMission('w8-cooling', 'Cooling tower drive fault', ['UTL_CW_TEMP'], 'normal',
        'Cooling-water temperature is climbing while one cooling-tower cell loses effective airflow.',
        'Use drive state and process response to identify why the fan is unavailable.',
        'A temperature alarm may be several causal steps downstream from a drive failure.',
        'Identify the failed drive-related point before utilities trip the plant.',
        'Trace from hot water back to airflow, fan rotation, motor command, and drive status.'),
      fieldMission('w8-airlock', 'Airlock speed disagreement', ['MEAL_COOLER_TEMP'], 'normal',
        'The cooler discharge motor reports RUN, but product is accumulating and temperature is rising.',
        'Determine whether the motor circuit or the driven equipment stopped moving.',
        'A rotating motor can be disconnected from its load by a failed coupling or shear device.',
        'Identify the feedback point that proves actual machine motion.',
        'Find the independent signal that can disagree with motor run feedback when the drivetrain fails.'),
    ],
  },
  {
    n: 9, id: 'w9', title: 'SAFETY AND HIGH-CONSEQUENCE ALARMS', area: 'Extraction and Refinery',
    story: 'A containment alarm has management on the incident bridge. Protect people first, isolate the initiating failure, and do not guess under any condition.',
    summary: 'Respond to hazardous-material and process-containment alarms without guessing.',
    skills: ['Gas detection', 'Vacuum systems', 'Safety priorities', 'Evidence discipline'],
    missions: [
      fieldMission('w9-hexane', 'Hexane LEL response', ['EXT_HEXANE_LEL'], 'normal',
        'A combustible-gas alarm is increasing in the extraction pump alley.',
        'Identify the initiating field failure while treating the area as a real hazardous release.',
        'High-consequence alarms demand fast action without sacrificing root-cause discipline.',
        'Identify the failed point before the extraction unit shutdown.',
        'Use process containment clues and protective-device states; do not assume the gas detector itself is wrong.'),
      fieldMission('w9-vacuum', 'Bleacher vacuum loss', ['REF_BLEACH_VAC'], 'normal',
        'Bleacher vacuum is collapsing and product quality is degrading.',
        'Trace the vacuum system from process measurement through motive utility and final element.',
        'Loss of a process condition can originate in the supporting utility that creates it.',
        'Identify the failed point before the refinery interlock acts.',
        'Compare the measured vacuum with steam supply, valve command, and position feedback.'),
    ],
  },
  {
    n: 10, id: 'w10', title: 'SYSTEMATIC TROUBLESHOOTING', area: 'Plant 7',
    story: 'Recurring faults crossed department lines. Frank expects one repeatable method across the site and will reject any answer built on confidence instead of evidence.',
    summary: 'Solve three unrelated faults using the same evidence-first method.',
    skills: ['Fault isolation', 'Cross-reference', 'Radio verification', 'Time management'],
    missions: [
      fieldMission('w10-diagnostic-shift', 'Three-system diagnostic shift',
        ['PREP_COND_TEMP', 'EXT_EXTRACTOR_AMPS', 'UTL_CW_TEMP', 'REF_DEOD_LEVEL'], 'normal',
        'Operations has reported recurring faults across unrelated process areas.',
        'Resolve three alarms without relying on the loudest symptom or the first radio opinion.',
        'A repeatable troubleshooting method must work across motors, instruments, and process loops.',
        'Confirm three root causes with fewer than three plant shutdowns.',
        'For every alarm, write a short cause chain: process symptom, controller evidence, field evidence, failed point.', 3),
    ],
  },
  {
    n: 11, id: 'w11', title: 'NIGHT-SHIFT GAUNTLET', area: 'Plant 7',
    story: 'The senior technician called off on graveyard. You are the only controls resource on site, and Dana Voss will hold you personally accountable for every trip.',
    summary: 'Work under bad information, limited time, and escalating consequences.',
    skills: ['Alarm prioritization', 'Conflicting evidence', 'Stress recovery', 'Independent judgment'],
    missions: [
      fieldMission('w11-gauntlet', 'Graveyard alarm gauntlet',
        ['PREP_MILL_VIB', 'EXT_DT_TEMP', 'EXT_HEXANE_LEL', 'MEAL_COOLER_TEMP', 'UTL_DRUM_LEVEL'], 'hard',
        'The graveyard crew is thin, radio reports conflict, and five high-risk systems are in the fault pool.',
        'Confirm four root causes before three shutdown strikes end the shift.',
        'Senior technicians separate evidence from confidence, especially when people disagree.',
        'Resolve four alarms on hard difficulty while maintaining control of the plant.',
        'Use the HMI and PLC as evidence, then use radio and field observations to test that evidence rather than replace it.', 4),
    ],
  },
  {
    n: 12, id: 'w12', title: 'CAPSTONE: ALARMSTATE', area: 'Prairie Gold Plant 7',
    story: 'Corporate is watching the acceptance run live. Keep Plant 7 online. Five root causes are required; one excuse is too many.',
    summary: 'Commission, diagnose, and defend the entire plant during the final qualification shift.',
    skills: ['Integrated systems', 'Root-cause leadership', 'Production protection', 'Technical handoff'],
    missions: [
      fieldMission('w12-capstone', 'Plant 7 qualification shift', ALL_SCENARIOS, 'hard',
        'Corporate acceptance begins with the full plant online and every major area available to fail.',
        'Resolve five unique alarms, protect production, and finish with fewer than three shutdown strikes.',
        'The capstone proves that controller knowledge, HMI use, field awareness, and judgment work as one system.',
        'Five confirmed root causes complete the AlarmState twelve-week qualification.',
        'Slow down at the start of each alarm: identify the process symptom first, then find the earliest point where expected and actual behavior diverge.', 5),
    ],
  },
];

const KEY = 'alarmstate.course.v1';

function blankProgress() {
  return {
    startedAt: new Date().toISOString(),
    completedAt: null,
    completed: {},
    scores: {},
    hinted: {},
    selectedWeek: 0,
  };
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved?.completed) return { ...blankProgress(), ...saved };
  } catch { /* start fresh */ }
  return blankProgress();
}

const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

export class CourseManager {
  constructor({ onLaunch, launchEnabled = true }) {
    this.onLaunch = onLaunch;
    this.launchEnabled = launchEnabled;
    this.progress = loadProgress();
    this.activeDrill = null;
    this.el = document.getElementById('course-body');
  }

  save() {
    localStorage.setItem(KEY, JSON.stringify(this.progress));
  }

  mission(id) {
    return COURSE_WEEKS.flatMap((week) => week.missions).find((mission) => mission.id === id) || null;
  }

  nextMission() {
    return COURSE_WEEKS.flatMap((week) => week.missions)
      .find((mission) => !this.progress.completed[mission.id]) || null;
  }

  weekForMission(id) {
    return COURSE_WEEKS.find((week) => week.missions.some((mission) => mission.id === id)) || null;
  }

  weekComplete(index) {
    return COURSE_WEEKS[index].missions.every((mission) => this.progress.completed[mission.id]);
  }

  weekUnlocked(index) {
    return index === 0 || this.weekComplete(index - 1);
  }

  completeMission(id, score = 100) {
    this.progress.completed[id] = true;
    this.progress.scores[id] = Math.max(score, this.progress.scores[id] || 0);
    const weekIndex = COURSE_WEEKS.findIndex((week) => week.missions.some((mission) => mission.id === id));
    if (weekIndex >= 0 && this.weekComplete(weekIndex) && weekIndex < COURSE_WEEKS.length - 1) {
      this.progress.selectedWeek = weekIndex + 1;
    }
    const overall = this.overallProgress();
    if (overall.done === overall.total && !this.progress.completedAt) {
      this.progress.completedAt = new Date().toISOString();
      this.progress.selectedWeek = COURSE_WEEKS.length - 1;
    }
    this.save();
    this.render();
  }

  useHint(id) {
    if (this.progress.hinted[id]) return;
    this.progress.hinted[id] = true;
    this.save();
  }

  beginDrill(mission) {
    this.activeDrill = { mission, solved: new Set(), complete: false };
  }

  recordScenarioSolved(scenario, score) {
    if (!this.activeDrill || !this.activeDrill.mission.scenarioIds.includes(scenario.id)) return;
    this.activeDrill.solved.add(scenario.id);
    if (this.activeDrill.solved.size >= (this.activeDrill.mission.target || 1)) {
      this.activeDrill.complete = true;
      this.completeMission(this.activeDrill.mission.id, Math.min(100, 82 + Math.round(score / 500)));
    }
  }

  roundDisposition(passed) {
    if (!this.activeDrill) return 'free';
    if (this.activeDrill.complete || !passed || this.activeDrill.mission.kind === 'scenario') return 'course';
    return 'continue';
  }

  endDrill() {
    this.activeDrill = null;
    this.render();
  }

  overallProgress() {
    const all = COURSE_WEEKS.flatMap((week) => week.missions);
    const done = all.filter((mission) => this.progress.completed[mission.id]).length;
    return { done, total: all.length, percent: Math.round((done / all.length) * 100) };
  }

  completionSummary() {
    const all = COURSE_WEEKS.flatMap((week) => week.missions);
    const scores = all
      .filter((mission) => this.progress.completed[mission.id])
      .map((mission) => Number(this.progress.scores[mission.id]) || 0);
    const average = scores.length
      ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
      : 0;
    return {
      ...this.overallProgress(),
      weeks: COURSE_WEEKS.length,
      average,
      completedAt: this.progress.completedAt,
    };
  }

  render() {
    const maxUnlocked = COURSE_WEEKS.reduce((max, _week, index) => this.weekUnlocked(index) ? index : max, 0);
    this.progress.selectedWeek = Math.min(this.progress.selectedWeek || 0, maxUnlocked);
    const selected = COURSE_WEEKS[this.progress.selectedWeek];
    const overall = this.overallProgress();

    const rail = COURSE_WEEKS.map((week, index) => {
      const unlocked = this.weekUnlocked(index);
      const complete = unlocked && this.weekComplete(index);
      const current = index === this.progress.selectedWeek;
      return `<button class="course-week ${current ? 'current' : ''} ${complete ? 'complete' : ''}" data-week="${index}" ${unlocked ? '' : 'disabled'}>
        <span>W${String(week.n).padStart(2, '0')}</span><b>${esc(week.title)}</b><i>${complete ? 'COMPLETE' : unlocked ? `${week.missions.filter((m) => this.progress.completed[m.id]).length}/${week.missions.length}` : 'LOCKED'}</i>
      </button>`;
    }).join('');

    const missions = selected.missions.map((mission) => {
      const done = !!this.progress.completed[mission.id];
      const type = mission.kind === 'esco' ? 'ESCO PRACTICAL' : mission.kind === 'shift' ? 'ESCO LIVE SHIFT' : 'ESCO FAULT CALL';
      return `<article class="course-mission ${done ? 'complete' : ''}">
        <div class="cm-state">${done ? '✓' : '○'}</div>
        <div class="cm-copy"><span>${type}</span><h3>${esc(mission.title)}</h3><p>${esc(mission.problem)}</p></div>
        <button data-mission="${mission.id}" ${this.launchEnabled ? '' : 'disabled'}>${done ? 'COMPLETE' : this.launchEnabled ? 'START' : 'DISPATCH'}</button>
      </article>`;
    }).join('');

    this.el.innerHTML = `
      <aside class="course-rail">
        <div class="course-progress"><span>QUALIFICATION</span><b>${overall.percent}%</b><div><i style="width:${overall.percent}%"></i></div><small>${overall.done}/${overall.total} practicals</small></div>
        ${rail}
      </aside>
      <section class="course-detail">
        <header><span>WEEK ${selected.n} · ${esc(selected.area)}</span><h2>${esc(selected.title)}</h2><p>${esc(selected.summary)}</p></header>
        <div class="course-skills">${selected.skills.map((skill) => `<span>${esc(skill)}</span>`).join('')}</div>
        <div class="course-missions">${missions}</div>
      </section>`;

    this.el.querySelectorAll('[data-week]').forEach((button) => button.addEventListener('click', () => {
      this.progress.selectedWeek = Number(button.dataset.week);
      this.save();
      this.render();
    }));
    this.el.querySelectorAll('[data-mission]:not(:disabled)').forEach((button) => button.addEventListener('click', () => {
      const mission = this.mission(button.dataset.mission);
      if (mission) this.onLaunch(mission);
    }));
  }

  reset() {
    localStorage.removeItem(KEY);
    this.progress = blankProgress();
    this.activeDrill = null;
    this.render();
  }
}

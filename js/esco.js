// ESCO Automation Studio integration and internal acceptance checks.
// Work-order UI describes the plant problem; these checks never expose a rung
// recipe, so any reasonable solution that produces the required behavior passes.

import { escoTagName, storePlant7Project } from './plant7-esco.js';

const AUTOSAVE_KEY = 'esco:autosave:v1';
const PROJECT_PREFIX = 'alarmstate:esco:project:';
const COURSE_ARCHIVE_KEY = 'alarmstate:esco:course-archive:v1';
const COURSE_WORKING_PROJECT = 'alarmstate-course-working';
const COURSE_PORTFOLIO_PROJECT = 'alarmstate-course-portfolio';
const ALIASES = new Map([
  ['di_cp101_startpb', 'start_pb'], ['di_cp101_stoppb', 'stop_pb'],
  ['di_cp101_resetpb', 'reset_pb'], ['di_cp101_estopok', 'estop_ok'],
  ['di_pe101_cartonpresent', 'pe101_photoeye'], ['do_mtr101_runstarter', 'motor_run'],
  ['do_tl101_red', 'stack_red'], ['do_tl101_yellow', 'stack_amber'],
  ['do_tl101_green', 'stack_green'], ['flt_mtr101_jam', 'jam_fault'],
]);

const norm = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  const dot = raw.indexOf('.');
  const base = dot < 0 ? raw : raw.slice(0, dot);
  return (ALIASES.get(base) || base) + (dot < 0 ? '' : raw.slice(dot));
};

function parseAutosaveProject(raw) {
  try {
    if (!raw) return null;
    const outer = JSON.parse(raw);
    const file = JSON.parse(outer.text);
    return file?.project || file || null;
  } catch {
    return null;
  }
}

function scopedAutosaveKey(projectKey) {
  const safeProject = String(projectKey || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);
  return `esco:autosave:alarmstate:${safeProject}:v1`;
}

function readProject(frame) {
  try {
    const workspace = frame?.contentWindow;
    const projectKey = new URL(workspace?.location?.href || '', window.location.href)
      .searchParams.get('alarmstateProject');
    const storage = workspace?.localStorage;
    return (projectKey ? parseAutosaveProject(storage?.getItem(scopedAutosaveKey(projectKey))) : null) ||
      parseAutosaveProject(storage?.getItem(AUTOSAVE_KEY));
  } catch {
    return null;
  }
}

function readStoredProject() {
  return parseAutosaveProject(localStorage.getItem(scopedAutosaveKey(COURSE_WORKING_PROJECT))) ||
    parseAutosaveProject(localStorage.getItem(AUTOSAVE_KEY));
}

const copy = (value) => JSON.parse(JSON.stringify(value));
const safeId = (value) => String(value || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase();

function ladderRoutines(project) {
  return (project?.controllers || []).flatMap((controller) => (controller.programs || [])
    .flatMap((program) => (program.routines || []).filter((routine) => routine?.ladder?.rungs)
      .map((routine) => ({ controller, program, routine }))));
}

function branchHasLogic(branch) {
  if (!branch) return false;
  if ((branch.nodes || []).some((node) => node?.instructionType)) return true;
  if ((branch.parallelBranches || []).some(branchHasLogic)) return true;
  return branchHasLogic(branch.next);
}

function rungHasLogic(rung) {
  return branchHasLogic(rung?.root);
}

function blankRung(routine) {
  const id = `${routine.id}_course_blank`;
  return {
    id,
    routineId: routine.id,
    number: 0,
    comment: '',
    sourceText: '',
    root: { id: `${id}_branch`, nodes: [] },
  };
}

export function clearCourseProjectRungs(project) {
  const clean = copy(project);
  for (const { routine } of ladderRoutines(clean)) routine.ladder.rungs = [blankRung(routine)];
  clean.updatedAt = new Date().toISOString();
  return clean;
}

function rekeyTree(value, prefix, state) {
  if (Array.isArray(value)) return value.map((item) => rekeyTree(item, prefix, state));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = key === 'id' && typeof child === 'string'
      ? `${prefix}_${state.next++}`
      : rekeyTree(child, prefix, state);
  }
  return result;
}

function archiveEntries(archive) {
  return (archive?.order || []).map((id) => archive.missions?.[id]).filter((entry) => entry?.project);
}

function representedMissionIds(archive) {
  const ids = new Set();
  for (const entry of archiveEntries(archive)) {
    const credited = entry.creditedMissionIds?.length ? entry.creditedMissionIds : [entry.missionId];
    for (const id of credited) if (id && !String(id).startsWith('imported-')) ids.add(id);
  }
  return ids;
}

function isCourseProject(project) {
  return (project?.controllers || []).some((controller) => {
    const names = new Set((controller.controllerTags || []).map((tag) => tag.name));
    return /cv101/i.test(controller.name || '') || (names.has('Motor_Run') && names.has('Start_PB'));
  });
}

export function buildCoursePortfolioProject(archive) {
  const entries = archiveEntries(archive);
  if (!entries.length) return null;

  const project = clearCourseProjectRungs(entries.at(-1).project);
  const controller = project.controllers?.[0];
  if (!controller) return null;
  const programId = `${controller.id}_course_portfolio`;
  const routines = [];

  for (const entry of entries) {
    const sources = ladderRoutines(entry.project).filter(({ routine }) => routine.ladder.rungs.some(rungHasLogic));
    sources.forEach(({ routine }, sourceIndex) => {
      const missionKey = safeId(entry.missionId || entry.title || `mission_${routines.length + 1}`);
      const routineId = `${programId}_${missionKey}_${sourceIndex}`;
      const prefix = `${routineId}_item`;
      const state = { next: 1 };
      const acceptedRungs = routine.ladder.rungs.filter(rungHasLogic).map((sourceRung, rungIndex) => {
        const rung = rekeyTree(sourceRung, prefix, state);
        rung.routineId = routineId;
        rung.number = rungIndex;
        rung.comment = `${entry.title || entry.missionId}${rung.comment ? ` | ${rung.comment}` : ''}`;
        return rung;
      });
      routines.push({
        ...copy(routine),
        id: routineId,
        programId,
        name: `${String(entry.missionId || 'mission').replace(/[^a-z0-9]+/gi, '_')}${sourceIndex ? `_${sourceIndex + 1}` : ''}`,
        description: `Accepted ESCO work: ${entry.title || entry.missionId}. Portfolio review routine; not scheduled for execution.`,
        ladder: { ...copy(routine.ladder), id: `${routineId}_ladder`, rungs: acceptedRungs },
      });
    });
  }

  const portfolioProgram = {
    id: programId,
    controllerId: controller.id,
    name: 'CoursePortfolio',
    description: 'Accepted AlarmState ESCO assignments. Review-only routines are intentionally unscheduled.',
    mainRoutineId: routines[0]?.id,
    routines,
    programTags: [],
    order: (controller.programs || []).length,
  };
  controller.programs = [...(controller.programs || []).filter((program) => program.id !== programId), portfolioProgram];
  project.name = `${project.name || 'CV-101'} - Course Portfolio`;
  project.description = 'AlarmState learner portfolio containing accepted ESCO assignment routines and the latest accepted HMI work.';
  project.updatedAt = new Date().toISOString();
  return project;
}

function loadCourseArchive() {
  try {
    const archive = JSON.parse(localStorage.getItem(COURSE_ARCHIVE_KEY) || 'null');
    if (archive?.missions && Array.isArray(archive.order)) return archive;
  } catch { /* create a new archive */ }
  return { version: 1, createdAt: new Date().toISOString(), updatedAt: null, order: [], missions: {} };
}

function operands(node) {
  return (Array.isArray(node?.operands) ? node.operands : [])
    .map((operand) => String(operand?.value ?? '').trim());
}

function instruction(node) {
  const ops = operands(node);
  return {
    node,
    type: String(node?.instructionType || '').trim().toUpperCase(),
    tag: ops[0] || '',
    operands: ops,
  };
}

const MAX_LADDER_PATHS = 128;

// Expand the ESCO branch AST into every left-rail-to-right-rail execution path.
// Mission checks use these paths so instructions merely present on the same
// rung do not pass unless they are connected in the required topology.
function branchPaths(branch, stack = new Set()) {
  if (!branch || stack.has(branch)) return [[]];
  stack.add(branch);

  const alternatives = [(branch.nodes || []).map(instruction)];
  for (const leg of branch.parallelBranches || []) {
    alternatives.push(...branchPaths(leg, stack));
    if (alternatives.length >= MAX_LADDER_PATHS) break;
  }
  const continuation = branch.next ? branchPaths(branch.next, stack) : [[]];
  stack.delete(branch);

  const paths = [];
  for (const alternative of alternatives) {
    for (const suffix of continuation) {
      paths.push([...alternative, ...suffix]);
      if (paths.length >= MAX_LADDER_PATHS) return paths;
    }
  }
  return paths;
}

function hasEmptyBypass(branch) {
  if (!branch) return false;
  if ((branch.parallelBranches || []).length && (branch.nodes || []).length === 0) return true;
  if ((branch.parallelBranches || []).some((leg) =>
    (!(leg.nodes || []).length && !(leg.parallelBranches || []).length && !leg.next) || hasEmptyBypass(leg))) {
    return true;
  }
  return hasEmptyBypass(branch.next);
}

function logicRungs(project) {
  const rungs = [];
  for (const controller of project?.controllers || []) {
    for (const program of controller.programs || []) {
      for (const routine of program.routines || []) {
        for (const raw of routine?.ladder?.rungs || []) {
          rungs.push({
            raw,
            paths: branchPaths(raw.root),
            emptyBypass: hasEmptyBypass(raw.root),
          });
        }
      }
    }
  }
  return rungs;
}

const sameTag = (actual, expected) => norm(actual) === norm(expected);
const sameNumber = (actual, expected) => Number(actual) === expected;

function isInstruction(item, type, tag = null) {
  return item?.type === type && (tag === null || sameTag(item.tag, tag));
}

function onePath(rung) {
  return !rung.emptyBypass && rung.paths.length === 1 ? rung.paths[0] : null;
}

function exactSimpleRung(rung, matchers) {
  const path = onePath(rung);
  return !!path && path.length === matchers.length && matchers.every((matcher, index) => matcher(path[index]));
}

function findExactRung(rungs, matchers) {
  return rungs.find((rung) => exactSimpleRung(rung, matchers));
}

function commonInstruction(paths, matcher) {
  if (!paths.length) return false;
  const candidates = paths[0].filter(matcher).map((item) => item.node);
  return candidates.some((candidate) => paths.every((path) =>
    path.some((item) => item.node === candidate && matcher(item))));
}

function motorSealInRung(rung, requireJamInterlock = false) {
  if (rung.emptyBypass || rung.paths.length !== 2) return false;
  const expectedLength = requireJamInterlock ? 5 : 4;
  if (!rung.paths.every((path) => path.length === expectedLength)) return false;

  const output = (item) => isInstruction(item, 'OTE', 'Motor_Run');
  const stop = (item) => isInstruction(item, 'XIO', 'Stop_PB');
  const estop = (item) => isInstruction(item, 'XIC', 'EStop_OK');
  const jam = (item) => isInstruction(item, 'XIO', 'Jam_Fault');
  if (!commonInstruction(rung.paths, output) ||
      !commonInstruction(rung.paths, stop) ||
      !commonInstruction(rung.paths, estop) ||
      (requireJamInterlock && !commonInstruction(rung.paths, jam))) return false;
  if (!rung.paths.every((path) => output(path.at(-1)))) return false;

  const starts = rung.paths.map((path) =>
    path.filter((item) => isInstruction(item, 'XIC', 'Start_PB') ||
      isInstruction(item, 'XIC', 'Motor_Run')));
  return starts.every((items) => items.length === 1) &&
    starts.some((items) => isInstruction(items[0], 'XIC', 'Start_PB')) &&
    starts.some((items) => isInstruction(items[0], 'XIC', 'Motor_Run'));
}

const xic = (tag) => (item) => isInstruction(item, 'XIC', tag);
const xio = (tag) => (item) => isInstruction(item, 'XIO', tag);
const action = (type, tag) => (item) => isInstruction(item, type, tag);
const timer = (type, tag, preset) => (item) =>
  isInstruction(item, type, tag) && sameNumber(item.operands[1], preset);
const counter = (tag, preset) => (item) =>
  isInstruction(item, 'CTU', tag) && sameNumber(item.operands[1], preset);

function exactConditionsThenAction(rung, conditionMatchers, actionMatcher) {
  const path = onePath(rung);
  if (!path || path.length !== conditionMatchers.length + 1 || !actionMatcher(path.at(-1))) return false;
  const unmatched = [...conditionMatchers];
  for (const item of path.slice(0, -1)) {
    const index = unmatched.findIndex((matcher) => matcher(item));
    if (index < 0) return false;
    unmatched.splice(index, 1);
  }
  return unmatched.length === 0;
}

function stringsIn(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

function hmiRefs(project) {
  const hmi = project?.hmi;
  const surfaces = [
    ...(Array.isArray(hmi?.screens) ? hmi.screens : []),
    ...(Array.isArray(hmi?.popups) ? hmi.popups : []),
    ...(hmi?.systemBanner ? [hmi.systemBanner] : []),
  ];
  return surfaces.flatMap((surface) => (surface.elements || []).flatMap((element) => stringsIn({
    bindings: element.bindings || [], events: element.events || [],
  }))).map((value) => String(value).toLowerCase());
}

const hasRef = (refs, tag) => refs.some((ref) => ref.includes(tag.toLowerCase()));

export function renderTagBank(container, tags = []) {
  if (!container) return;
  container.replaceChildren();
  for (const tag of tags) {
    const row = document.createElement('div');
    row.className = 'tag-bank-row';

    const name = document.createElement('code');
    name.textContent = tag.name;
    const type = document.createElement('span');
    type.className = 'tag-bank-type';
    type.textContent = tag.type;
    const role = document.createElement('span');
    role.className = 'tag-bank-role';
    role.textContent = tag.role;
    const purpose = document.createElement('span');
    purpose.className = 'tag-bank-purpose';
    purpose.textContent = tag.purpose;

    row.append(name, type, role, purpose);
    container.append(row);
  }
}

export const ESCO_VALIDATORS = {
  green(project) {
    return !!findExactRung(logicRungs(project), [
      xic('Motor_Run'),
      action('OTE', 'Stack_Green'),
    ]);
  },
  motor(project) {
    return logicRungs(project).some((rung) => motorSealInRung(rung));
  },
  debounce(project) {
    const rungs = logicRungs(project);
    const timerRung = findExactRung(rungs, [
      xic('PE101_PhotoEye'),
      timer('TON', 'T_Debounce', 50),
    ]);
    const detectedRung = findExactRung(rungs, [
      xic('T_Debounce.DN'),
      action('OTE', 'Part_Detected'),
    ]);
    return !!timerRung && !!detectedRung && timerRung !== detectedRung;
  },
  count(project) {
    const rungs = logicRungs(project);
    const countRung = rungs.find((rung) => {
      const path = onePath(rung);
      return !!path && path.length === 2 &&
        (xic('Part_Detected')(path[0]) || xic('T_Debounce.DN')(path[0])) &&
        counter('Part_Counter', 24)(path[1]);
    });
    const resetRung = findExactRung(rungs, [
      xic('Reset_PB'),
      action('RES', 'Part_Counter'),
    ]);
    return !!countRung && !!resetRung && countRung !== resetRung;
  },
  jam(project) {
    const rungs = logicRungs(project);
    const detectRung = rungs.find((rung) => exactConditionsThenAction(
      rung,
      [xic('PE101_PhotoEye'), xic('Motor_Run')],
      timer('TON', 'T_Jam', 5000),
    ));
    const latchRung = findExactRung(rungs, [
      xic('T_Jam.DN'),
      action('OTL', 'Jam_Fault'),
    ]);
    const resetRung = rungs.find((rung) => exactConditionsThenAction(
      rung,
      [xic('Reset_PB'), xio('PE101_PhotoEye')],
      action('OTU', 'Jam_Fault'),
    ));
    const motorRung = rungs.find((rung) => motorSealInRung(rung, true));
    return !!detectRung && !!latchRung && !!resetRung && !!motorRung &&
      new Set([detectRung, latchRung, resetRung, motorRung]).size === 4;
  },
  speed(project) {
    const rungs = logicRungs(project);
    const scaleRung = findExactRung(rungs, [
      xic('Motor_Run'),
      (item) => isInstruction(item, 'MUL') &&
        sameTag(item.operands[0], 'Speed_SP') &&
        sameNumber(item.operands[1], 4) &&
        sameTag(item.operands[2], 'VFD_SpeedRef'),
    ]);
    const stopRung = findExactRung(rungs, [
      xio('Motor_Run'),
      (item) => isInstruction(item, 'MOV') &&
        sameNumber(item.operands[0], 0) &&
        sameTag(item.operands[1], 'VFD_SpeedRef'),
    ]);
    return !!scaleRung && !!stopRung && scaleRung !== stopRung;
  },
  'hmi-overview'(project) {
    const refs = hmiRefs(project);
    return hasRef(refs, 'motor_run') && hasRef(refs, 'jam_fault') &&
      (hasRef(refs, 'count_acc') || hasRef(refs, 'part_counter.acc'));
  },
  'hmi-alarm'(project) {
    const alarms = Array.isArray(project?.hmi?.alarms) ? project.hmi.alarms : [];
    const tags = alarms.map((alarm) => String(alarm.tagPath || '').toLowerCase());
    return tags.includes('jam_fault') && !tags.some((tag) => ['pe101_photoeye', 't_jam.dn', 't_debounce.dn'].includes(tag));
  },
};

export class EscoWorkspace {
  constructor({ onOpen, onClose, onAccepted, onReview }) {
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onAccepted = onAccepted;
    this.onReview = onReview;
    this.frame = document.getElementById('esco-frame');
    this.title = document.getElementById('esco-task-title');
    this.problem = document.getElementById('esco-task-problem');
    this.status = document.getElementById('esco-status');
    this.lock = document.getElementById('esco-lock');
    this.reviewButton = document.getElementById('esco-review');
    this.tagsButton = document.getElementById('esco-tags');
    this.tagDrawer = document.getElementById('esco-tag-drawer');
    this.tagList = document.getElementById('esco-tag-bank-list');
    this.active = null;
    this.diagnosticScenario = null;
    this.liveValues = null;
    this.lastSync = 0;
    this.accepting = false;
    this.timer = null;
    this.acceptedProject = null;
    this.portfolioOpen = false;

    this.reviewButton.addEventListener('click', () => {
      if (this.active) {
        this.showTagBank(false);
        this.onReview(this.active);
      }
    });
    this.tagsButton.addEventListener('click', () => this.showTagBank(this.tagDrawer.classList.contains('hidden')));
    document.getElementById('esco-tags-close').addEventListener('click', () => this.showTagBank(false));
    this.lock.addEventListener('click', () => {
      if (!this.active) this.close();
    });
    this.frame.addEventListener('load', () => {
      this.check();
      this.syncValues(this.liveValues, true);
    });
    this.poll = setInterval(() => this.check(), 1000);
  }

  setTagBank(tags = []) {
    renderTagBank(this.tagList, tags);
    this.tagsButton.classList.toggle('hidden', tags.length === 0);
    if (!tags.length) this.showTagBank(false);
  }

  showTagBank(show) {
    this.tagDrawer.classList.toggle('hidden', !show);
    this.tagsButton.setAttribute('aria-expanded', String(show));
  }

  leavePortfolioMode() {
    if (!this.portfolioOpen) return;
    localStorage.removeItem(AUTOSAVE_KEY);
    localStorage.removeItem(scopedAutosaveKey(COURSE_PORTFOLIO_PROJECT));
    this.portfolioOpen = false;
  }

  portfolioStatus() {
    const archive = loadCourseArchive();
    const project = buildCoursePortfolioProject(archive);
    const routineCount = project?.controllers?.[0]?.programs
      ?.find((program) => program.name === 'CoursePortfolio')?.routines.length || 0;
    return { count: representedMissionIds(archive).size, routineCount, updatedAt: archive.updatedAt };
  }

  migrateExistingCourseWork(completedMissions = []) {
    const archive = loadCourseArchive();
    const represented = representedMissionIds(archive);
    const missing = completedMissions.filter((mission) => mission?.kind === 'esco' && !represented.has(mission.id));
    if (!missing.length) return false;
    const project = readStoredProject();
    if (!isCourseProject(project)) return false;

    const entryId = 'imported-existing-course-work';
    const importedAt = new Date().toISOString();
    const existing = archive.missions[entryId];
    archive.missions[entryId] = {
      missionId: entryId,
      title: 'Imported pre-archive ESCO workspace',
      validator: 'portfolio-import',
      view: 'routine',
      acceptedAt: existing?.acceptedAt || importedAt,
      creditedMissionIds: [...new Set([...(existing?.creditedMissionIds || []), ...missing.map((mission) => mission.id)])],
      project: copy(project),
    };
    if (!archive.order.includes(entryId)) archive.order.unshift(entryId);
    archive.updatedAt = importedAt;
    const portfolioProject = buildCoursePortfolioProject(archive);
    try {
      localStorage.setItem(COURSE_ARCHIVE_KEY, JSON.stringify(archive));
      if (portfolioProject) localStorage.setItem(`${PROJECT_PREFIX}${COURSE_PORTFOLIO_PROJECT}`, JSON.stringify(portfolioProject));
      return true;
    } catch {
      return false;
    }
  }

  archiveAcceptedProject(mission, project) {
    const archive = loadCourseArchive();
    if (!archive.missions[mission.id]) archive.order.push(mission.id);
    const acceptedAt = new Date().toISOString();
    archive.missions[mission.id] = {
      missionId: mission.id,
      title: mission.title,
      validator: mission.validator,
      view: mission.view,
      acceptedAt,
      creditedMissionIds: [mission.id],
      project: copy(project),
    };
    archive.updatedAt = acceptedAt;

    const workingProject = clearCourseProjectRungs(project);
    const portfolioProject = buildCoursePortfolioProject(archive);
    try {
      localStorage.setItem(COURSE_ARCHIVE_KEY, JSON.stringify(archive));
      localStorage.setItem(`${PROJECT_PREFIX}${COURSE_WORKING_PROJECT}`, JSON.stringify(workingProject));
      if (portfolioProject) {
        localStorage.setItem(`${PROJECT_PREFIX}${COURSE_PORTFOLIO_PROJECT}`, JSON.stringify(portfolioProject));
      }
    } catch {
      this.status.textContent = 'ARCHIVE FAILED - PROJECT KEPT OPEN';
      this.status.className = 'ready';
      return false;
    }

    localStorage.removeItem(AUTOSAVE_KEY);
    localStorage.removeItem(scopedAutosaveKey(COURSE_WORKING_PROJECT));
    this.frame.src = 'about:blank';
    this.portfolioOpen = false;
    return true;
  }

  openCoursePortfolio() {
    const archive = loadCourseArchive();
    const project = buildCoursePortfolioProject(archive);
    if (!project) return false;
    localStorage.setItem(`${PROJECT_PREFIX}${COURSE_PORTFOLIO_PROJECT}`, JSON.stringify(project));
    localStorage.removeItem(AUTOSAVE_KEY);
    localStorage.removeItem(scopedAutosaveKey(COURSE_PORTFOLIO_PROJECT));
    this.active = null;
    this.diagnosticScenario = null;
    this.accepting = false;
    this.portfolioOpen = true;
    this.title.textContent = 'Accepted ESCO Course Portfolio';
    const acceptedCount = representedMissionIds(archive).size;
    this.problem.textContent = `${acceptedCount} accepted assignments are preserved as review routines. Portfolio routines are intentionally unscheduled.`;
    this.status.textContent = `${acceptedCount} ASSIGNMENTS ARCHIVED - REVIEW COPY`;
    this.status.className = 'accepted';
    this.lock.textContent = 'RETURN TO PLANT';
    this.lock.disabled = false;
    this.reviewButton.classList.add('hidden');
    this.setTagBank();
    const firstRoutine = project.controllers?.[0]?.programs
      ?.find((program) => program.name === 'CoursePortfolio')?.routines?.[0]?.name || '';
    this.frame.src = `esco/index.html?factoryforge=1&alarmstate=1&alarmstateProject=${COURSE_PORTFOLIO_PROJECT}&view=routine&routine=${encodeURIComponent(firstRoutine)}&coursePortfolio=${Date.now()}`;
    this.onOpen();
    return true;
  }

  startMission(mission) {
    this.leavePortfolioMode();
    this.active = mission;
    this.diagnosticScenario = null;
    this.accepting = false;
    this.title.textContent = mission.title;
    this.problem.textContent = `${mission.problem} Management is tracking elapsed time. The station stays locked until the live project passes.`;
    this.status.textContent = 'PROJECT CLOCK RUNNING';
    this.status.className = '';
    this.lock.textContent = 'LOCKED';
    this.lock.disabled = true;
    this.reviewButton.classList.remove('hidden');
    this.setTagBank(mission.tagBank);
    const view = mission.view === 'hmi' ? 'hmi' : 'routine';
    const hmiMode = view === 'hmi' ? '&hmiMode=designer' : '';
    const hasWorkingProject = !!localStorage.getItem(`${PROJECT_PREFIX}${COURSE_WORKING_PROJECT}`);
    const projectParam = hasWorkingProject ? `&alarmstateProject=${COURSE_WORKING_PROJECT}` : '';
    const wanted = `esco/index.html?factoryforge=1&alarmstate=1&view=${view}${hmiMode}${projectParam}&courseMission=${encodeURIComponent(mission.id)}`;
    if (!this.frame.src.endsWith(wanted)) this.frame.src = wanted;
    this.onOpen();
  }

  openFree() {
    this.leavePortfolioMode();
    this.active = null;
    this.diagnosticScenario = null;
    this.accepting = false;
    this.title.textContent = 'CV-101 Engineering Workspace';
    this.problem.textContent = 'Free engineering access. Course acceptance checks are not active.';
    this.status.textContent = 'UNASSIGNED ACCESS - NO CREDIT';
    this.status.className = 'ready';
    this.lock.textContent = 'RETURN TO PLANT';
    this.lock.disabled = false;
    this.reviewButton.classList.add('hidden');
    this.setTagBank();
    const wanted = 'esco/index.html?factoryforge=1&alarmstate=1&view=routine';
    if (!this.frame.src.endsWith(wanted)) this.frame.src = wanted;
    this.onOpen();
  }

  openDiagnostic(scenario, values = {}) {
    this.leavePortfolioMode();
    if (!scenario) {
      this.openFree();
      return;
    }
    this.active = null;
    this.diagnosticScenario = scenario;
    this.liveValues = values;
    this.accepting = false;
    const projectKey = storePlant7Project(scenario, values);
    // Navigate straight to the routine that owns the alarm. The controller
    // always carries the whole plant program; only the destination changes.
    const routine = scenario.routine || '';
    this.title.textContent = `${scenario.area} · ${scenario.title}`;
    this.problem.textContent = 'Inspect the affected controller routine and live tags. Correlate ESCO evidence with the HMI, radio reports, trends, and field equipment.';
    this.status.textContent = 'LIVE INCIDENT TAGS - CLOCK RUNNING';
    this.status.className = 'ready';
    this.lock.textContent = 'RETURN TO PLANT';
    this.lock.disabled = false;
    this.reviewButton.classList.add('hidden');
    this.setTagBank();
    const wanted = `esco/index.html?factoryforge=1&alarmstate=1&alarmstateProject=${encodeURIComponent(projectKey)}&view=routine&routine=${encodeURIComponent(routine)}`;
    if (!this.frame.src.endsWith(wanted)) this.frame.src = wanted;
    this.onOpen();
    this.syncValues(values, true);
  }

  openPlantHmi(scenario, values = {}, requestedScreen = null) {
    this.leavePortfolioMode();
    this.active = null;
    this.diagnosticScenario = scenario || { id: 'PLANT7_OPERATIONS' };
    this.liveValues = values;
    this.accepting = false;
    const screen = scenario?.screen || requestedScreen || 'OVERVIEW';
    const projectKey = storePlant7Project(scenario, values, screen);
    this.title.textContent = scenario
      ? `${scenario.area} · ESCO OPERATOR HMI`
      : 'PLANT 7 · ESCO OPERATOR HMI';
    this.problem.textContent = scenario
      ? `Use the prebuilt ${screen} screen to compare the active alarm with live process, command, feedback, and I/O evidence. Switch to ESCO Logic with TAB when controller context is needed.`
      : `Use the prebuilt ${screen} screen to monitor Plant 7. These displays, alarms, and trends are bound to the live AlarmState simulation.`;
    this.status.textContent = 'LIVE PLANT 7 HMI - INCIDENT ACTIVE';
    this.status.className = 'ready';
    this.lock.textContent = 'RETURN TO PLANT';
    this.lock.disabled = false;
    this.reviewButton.classList.add('hidden');
    this.setTagBank();
    const wanted = `esco/index.html?factoryforge=1&alarmstate=1&alarmstateProject=${encodeURIComponent(projectKey)}&view=hmi&hmiMode=runtime`;
    if (!this.frame.src.endsWith(wanted)) this.frame.src = wanted;
    this.onOpen();
    this.syncValues(values, true);
  }

  /** True while a live controller or HMI view is open and wants fresh values. */
  wantsValues() {
    return !!this.diagnosticScenario;
  }

  syncValues(values, force = false) {
    if (!values || !this.diagnosticScenario) return;
    this.liveValues = values;
    const now = performance.now();
    if (!force && now - this.lastSync < 250) return;
    this.lastSync = now;
    const controllerValues = Object.fromEntries(
      Object.entries(values).map(([name, value]) => [escoTagName(name), value]),
    );
    this.frame.contentWindow?.postMessage({ type: 'alarmstate-tag-values', values: controllerValues }, window.location.origin);
  }

  check() {
    if (!this.active || this.accepting) return;
    const project = readProject(this.frame);
    if (!project) {
      this.status.textContent = 'NO ACCEPTABLE EDIT DETECTED';
      return;
    }
    const validator = ESCO_VALIDATORS[this.active.validator];
    const passed = validator ? validator(project) : false;
    this.status.textContent = passed ? 'MINIMUM GATE MET - REPORT NOW' : 'REJECTED BY LIVE CHECK - CORRECT THE PROJECT';
    this.status.className = passed ? 'accepted' : 'ready';
    if (!passed) return;

    this.accepting = true;
    this.acceptedProject = copy(project);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const mission = this.active;
      const archived = this.archiveAcceptedProject(mission, this.acceptedProject);
      this.acceptedProject = null;
      this.accepting = false;
      if (!archived) return;
      this.active = null;
      this.onAccepted(mission);
    }, 1200);
  }

  close() {
    clearTimeout(this.timer);
    this.active = null;
    this.diagnosticScenario = null;
    this.accepting = false;
    this.acceptedProject = null;
    this.setTagBank();
    this.onClose();
  }
}

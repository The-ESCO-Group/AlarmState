// ============================================================================
// Build the live PGP_Plant7_PLC project that the embedded ESCO Automation
// Studio opens.
//
// The controller half of this file is a straight translation of the plant's
// real ladder in js/data/plant-logic.js into the ESCO semantic ladder model:
// the same branch tree, the same instructions, the same operands. Nothing is
// invented on the way through and nothing is simplified for display, so the
// rungs an operator reads in the studio are the rungs the scan engine solves.
// ============================================================================

import { TAGS } from './data/tags.js';
import { SCENARIOS } from './data/scenarios.js';
import {
  PROGRAMS, ALL_CONTROLLER_TAGS, ALARM_DEFS, FIELD_TAGS, logixName,
} from './data/plant-logic.js';

const PROJECT_PREFIX = 'alarmstate:esco:project:';
const HMI_AREAS = ['PREP', 'EXTRACTION', 'REFINERY', 'UTILITIES', 'MEAL'];
const HMI_SCREEN_NAMES = ['Overview', ...HMI_AREAS, 'Alarms', 'Trends', 'I/O'];
const HMI_DEVICE = {
  id: 'panelview-5310-10w', family: 'PanelView 5000', name: 'PanelView 5310 10-inch Wide',
  firmwareRevision: 'model-only', width: 1280, height: 800, dpi: 149, colorDepth: 24, supportsTouch: true,
  supportedFeatures: ['screens', 'bindings', 'events', 'alarms', 'trends', 'runtime-preview'],
  capacity: { maxScreens: 250, maxElementsPerScreen: 1000, maxTrends: 64, maxDataLogs: 64, maxRecipes: 64, storageMb: 512 },
};

const safeId = (value) => String(value).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase();

/** Logix-legal tag name. Identifiers may not begin with a digit. */
export const escoTagName = (value) => {
  const alias = String(value || '').replace(/[^a-z0-9_.]/gi, '_').replace(/_+/g, '_');
  return /^[a-z_]/i.test(alias) ? alias : `Tag_${alias}`;
};

// ---------------------------------------------------------------------------
// Ladder: authored branch tree -> ESCO semantic ladder model
// ---------------------------------------------------------------------------

/** One instruction in Logix neutral text: `TYPE(op1,op2,...)`. */
const nodeToText = (node) =>
  `${node.instructionType}(${node.operands.map((operand) => String(operand.value ?? '').trim()).join(',')})`;

/**
 * Neutral rung text for a branch tree. The series instructions in order, then a
 * parallel group as `[leg,leg,...]` with the segment's own series as the first
 * leg, then the continuation — the same shape @esco/ladder serializes, so a
 * rung exported from the studio round-trips back to this structure.
 */
function serializeBranch(branch) {
  if (!branch) return '';
  const series = (branch.nodes || []).map(nodeToText).join('');
  const legs = branch.parallelBranches || [];
  let text = legs.length ? `[${[series, ...legs.map(serializeBranch)].join(',')}]` : series;
  if (branch.next) text += serializeBranch(branch.next);
  return text;
}

/** Copy an authored branch tree, stamping the ids the studio's model requires. */
function branchWithIds(branch, prefix, counter) {
  const id = `${prefix}_b${counter.next++}`;
  const result = {
    id,
    nodes: (branch.nodes || []).map((node) => ({
      id: `${prefix}_n${counter.next++}`,
      instructionType: node.instructionType,
      operands: node.operands.map((operand) => ({ ...operand })),
    })),
  };
  if (branch.parallelBranches?.length) {
    result.parallelBranches = branch.parallelBranches.map((leg) => branchWithIds(leg, prefix, counter));
  }
  if (branch.next) result.next = branchWithIds(branch.next, prefix, counter);
  return result;
}

function buildRoutine(routine, programId, projectId, areaDescription) {
  const routineId = `${projectId}_routine_${safeId(programId)}_${safeId(routine.name)}`;
  return {
    id: routineId,
    programId,
    name: routine.name,
    description: routine.description || areaDescription,
    language: 'ladder',
    ladder: {
      id: `${routineId}_ladder`,
      rungs: routine.rungs.map((rung, index) => {
        const rungId = `${routineId}_rung_${index}`;
        return {
          id: rungId,
          routineId,
          number: index,
          comment: rung.comment,
          sourceText: `${serializeBranch(rung.root)};`,
          root: branchWithIds(rung.root, rungId, { next: 0 }),
        };
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Controller tags
// ---------------------------------------------------------------------------

const STRUCTURED = new Set(['TIMER', 'COUNTER', 'PID']);
const FIELD_BY_NAME = new Map(FIELD_TAGS.map((tag) => [tag.name, tag]));
const PLANT_TAG_META = new Map(TAGS.map((tag) => [tag.tag, tag]));

/** Normalise a live value map so it can be keyed by plant tag id or Logix name. */
function normaliseValues(values) {
  const result = new Map();
  for (const [name, value] of Object.entries(values || {})) result.set(escoTagName(name), value);
  return result;
}

function tagValue(tag, live) {
  if (STRUCTURED.has(tag.dataType)) return undefined;
  if (live.has(tag.name)) {
    const value = live.get(tag.name);
    return tag.dataType === 'BOOL' ? Number(value) >= 0.5 || value === true : Number(value);
  }
  const field = FIELD_BY_NAME.get(tag.name);
  if (field) {
    const base = PLANT_TAG_META.get(field.plantTag)?.base ?? 0;
    return tag.dataType === 'BOOL' ? Number(base) >= 0.5 : Number(base);
  }
  if (tag.dataType === 'BOOL') return tag.init === true;
  return Number(tag.init) || 0;
}

function buildControllerTags(controllerId, values) {
  const live = normaliseValues(values);
  return ALL_CONTROLLER_TAGS.map((tag, index) => {
    const field = FIELD_BY_NAME.get(tag.name);
    const entry = {
      id: `${controllerId}_tag_${index}_${safeId(tag.name)}`,
      controllerId,
      name: tag.name,
      dataType: tag.dataType,
      scope: 'controller',
      description: field
        ? `${field.plantTag} — ${tag.description}`
        : tag.description,
      externalAccess: 'Read/Write',
    };
    const value = tagValue(tag, live);
    if (value !== undefined) entry.value = value;
    return entry;
  });
}

// ---------------------------------------------------------------------------
// HMI
// ---------------------------------------------------------------------------

function hmiScreenId(name) {
  return `plant7_hmi_screen_${safeId(name)}`;
}

function hmiElement(typeId, key, name, geometry, properties = {}, style = {}, binding = null) {
  const defaultStyles = {
    'common.button': { fill: '#21364a', stroke: '#64809b', textColor: '#f5f8fb', fontSize: 14 },
    'common.text-display': { fill: 'transparent', textColor: '#17212b', fontSize: 18 },
    'common.numeric-display': { fill: '#f8fbfd', stroke: '#8ca0b3', textColor: '#111820', fontSize: 16 },
    'common.indicator-lamp': { fill: '#718096', stroke: '#405160', textColor: '#ffffff', fontSize: 14 },
    'alarms.alarm-summary': { fill: '#f8fbfd', stroke: '#d18a2a', textColor: '#151b22', fontSize: 13 },
    'trends.trend-chart': { fill: '#f8fbfd', stroke: '#8ca0b3', textColor: '#151b22', fontSize: 13 },
  };
  return {
    id: `plant7_hmi_element_${safeId(key)}`,
    typeId,
    name,
    geometry,
    zIndex: 1,
    visible: true,
    style: { ...(defaultStyles[typeId] || {}), ...style },
    properties,
    bindings: binding ? [{
      id: `plant7_hmi_binding_${safeId(key)}`,
      targetProperty: binding.property,
      source: { kind: 'tag', path: escoTagName(binding.tag), dataType: binding.dataType },
      mode: 'read',
    }] : [],
    events: [],
    animations: [],
  };
}

function hmiText(key, text, geometry, style = {}) {
  return hmiElement('common.text-display', key, text, geometry, { text, multiline: false }, style);
}

function screenHeader(screenName, subtitle) {
  const elements = [
    hmiText(`${screenName}_title`, `PLANT 7 · ${screenName}`, { x: 34, y: 18, width: 760, height: 44 }, {
      fill: '#203448', stroke: '#203448', fontSize: 28, textColor: '#f5f8fb',
    }),
    hmiText(`${screenName}_subtitle`, subtitle, { x: 794, y: 18, width: 446, height: 44 }, {
      fill: '#203448', stroke: '#203448', fontSize: 14, textColor: '#b9c8d6',
    }),
  ];
  const buttonWidth = 164;
  HMI_SCREEN_NAMES.slice(0, 7).forEach((target, index) => {
    const button = hmiElement('common.button', `${screenName}_nav_${target}`, target, {
      x: 34 + index * 173, y: 76, width: buttonWidth, height: 42,
    }, { label: target, enabled: true }, target === screenName ? { fill: '#0877b9', stroke: '#82cff9' } : {});
    button.events = [{
      id: `plant7_hmi_event_${safeId(screenName)}_${safeId(target)}`,
      eventType: 'press',
      commands: [{
        id: `plant7_hmi_command_${safeId(screenName)}_${safeId(target)}`,
        type: 'navigate', safety: 'runtime-preview', args: { screenId: hmiScreenId(target) },
      }],
    }];
    elements.push(button);
  });
  return elements;
}

function numericDisplay(tag, key, x, y) {
  const precision = Number.isInteger(tag.dec) ? tag.dec : 0;
  return hmiElement('common.numeric-display', key, tag.tag, { x, y, width: 365, height: 82 }, {
    label: `${tag.tag} · ${tag.eu || 'PROCESS VALUE'}`,
    precision,
  }, {}, { property: 'value', tag: tag.tag, dataType: 'REAL' });
}

function statusLamp(tag, key, x, y) {
  return hmiElement('common.indicator-lamp', key, tag.tag, { x, y, width: 270, height: 66 }, {
    label: `${tag.tag} · ${tag.kind === 'mtr' ? 'MOTOR RUN' : 'DIGITAL STATUS'}`,
    value: false,
    onColor: tag.kind === 'di' ? '#159447' : '#0b7db6',
    offColor: '#697887',
  }, {}, { property: 'value', tag: tag.tag, dataType: 'BOOL' });
}

function hmiScreen(name, subtitle, elements) {
  return {
    id: hmiScreenId(name), kind: 'screen', name, width: 1280, height: 800,
    background: '#d8e0e7', updateRateMs: 250, securityRoleIds: [],
    elements: [...screenHeader(name, subtitle), ...elements],
    navigation: { includeInMenu: true, caption: name },
  };
}

function areaScreen(area) {
  const areaTags = TAGS.filter((tag) => tag.area === area);
  const analogs = areaTags.filter((tag) => !['di', 'mtr'].includes(tag.kind)).slice(0, 6);
  const discretes = areaTags.filter((tag) => ['di', 'mtr'].includes(tag.kind)).slice(0, 4);
  const elements = analogs.map((tag, index) => numericDisplay(
    tag, `${area}_${tag.tag}`, 48 + (index % 3) * 405, 154 + Math.floor(index / 3) * 106,
  ));
  elements.push(...discretes.map((tag, index) => statusLamp(tag, `${area}_${tag.tag}`, 48 + index * 300, 382)));
  elements.push(hmiElement('alarms.alarm-summary', `${area}_alarms`, `${area} Active Alarms`, {
    x: 48, y: 476, width: 1184, height: 270,
  }, { title: `${area} Active Alarms`, filter: `area:${area}` }));
  return hmiScreen(area, 'LIVE PROCESS OVERVIEW · ALARMSTATE SIMULATION', elements);
}

function overviewScreen() {
  const elements = [];
  HMI_AREAS.forEach((area, index) => {
    const analog = TAGS.find((tag) => tag.area === area && !['di', 'mtr'].includes(tag.kind));
    const running = TAGS.find((tag) => tag.area === area && tag.kind === 'mtr');
    const x = 40 + (index % 3) * 410;
    const y = 158 + Math.floor(index / 3) * 190;
    elements.push(hmiText(`overview_${area}_label`, area, { x, y, width: 370, height: 38 }, {
      fill: '#203448', stroke: '#58738d', textColor: '#ffffff', fontSize: 20,
    }));
    if (analog) elements.push(numericDisplay(analog, `overview_${analog.tag}`, x, y + 48));
    if (running) elements.push(statusLamp(running, `overview_${running.tag}`, x, y + 136));
  });
  elements.push(hmiElement('alarms.alarm-summary', 'overview_alarms', 'Plant 7 Active Alarms', {
    x: 860, y: 538, width: 370, height: 208,
  }, { title: 'Plant 7 Active Alarms', filter: '' }));
  return hmiScreen('Overview', 'PRAIRIE GOLD PROCESSING · OPERATIONS', elements);
}

function alarmScreen() {
  return hmiScreen('Alarms', 'ACTIVE AND UNACKNOWLEDGED PROCESS ALARMS', [
    hmiElement('alarms.alarm-summary', 'all_alarms', 'Plant 7 Alarm Summary', {
      x: 40, y: 148, width: 1200, height: 598,
    }, { title: 'Plant 7 Alarm Summary', filter: '' }),
  ]);
}

function trendsForAreas() {
  return HMI_AREAS.map((area, areaIndex) => {
    const traces = TAGS.filter((tag) => tag.area === area && !['di', 'mtr'].includes(tag.kind)).slice(0, 4)
      .map((tag, index) => ({
        id: `plant7_trace_${safeId(area)}_${safeId(tag.tag)}`,
        label: tag.tag,
        source: { kind: 'tag', path: escoTagName(tag.tag), dataType: 'REAL' },
        color: ['#0b78b5', '#159447', '#d17d12', '#a33f4e'][index],
      }));
    return {
      id: `plant7_trend_${safeId(area)}`, name: `${area} Process Trend`,
      timeRangeSeconds: 300, sampleRateMs: 1000 + areaIndex, traces,
    };
  });
}

function trendScreen(activeArea) {
  const trendId = `plant7_trend_${safeId(HMI_AREAS.includes(activeArea) ? activeArea : 'PREP')}`;
  return hmiScreen('Trends', `${activeArea || 'PLANT 7'} · FIVE-MINUTE LIVE HISTORY`, [
    hmiElement('trends.trend-chart', 'active_process_trend', 'Active Process Trend', {
      x: 40, y: 148, width: 1200, height: 598,
    }, { title: `${activeArea || 'Plant 7'} Process Trend`, trendId, timeRangeSeconds: 300 }),
  ]);
}

function ioScreen(scenario) {
  const wanted = [...new Set([...(scenario.trendTags || []), scenario.answer, scenario.alarm?.tag].filter(Boolean))];
  const tags = wanted.map((name) => TAGS.find((tag) => tag.tag === name)).filter(Boolean).slice(0, 8);
  const elements = tags.map((tag, index) => ['di', 'mtr'].includes(tag.kind)
    ? statusLamp(tag, `io_${tag.tag}`, 55 + (index % 3) * 405, 160 + Math.floor(index / 3) * 112)
    : numericDisplay(tag, `io_${tag.tag}`, 55 + (index % 3) * 405, 160 + Math.floor(index / 3) * 112));
  elements.push(hmiText('io_context', 'Use this diagnostic list to compare command, feedback, permissive, and process response. The failed point is not identified for you.', {
    x: 55, y: 650, width: 1170, height: 62,
  }, { fill: '#fff7df', stroke: '#c88b28', textColor: '#392b11', fontSize: 16 }));
  return hmiScreen('I/O', `${scenario.title} · RELEVANT LIVE TAGS`, elements);
}

/**
 * The operator alarm database, taken from the coils in the controller rather
 * than maintained as a second list that can drift away from the logic.
 */
function hmiAlarmDefinitions() {
  return ALARM_DEFS.map((alarm) => ({
    id: `plant7_alarm_${safeId(alarm.tag)}`,
    name: alarm.tag,
    tagPath: alarm.tag,
    severity: alarm.severity,
    trigger: { kind: 'digital', activeValue: true },
    message: alarm.message,
    area: alarm.area,
    allowAcknowledge: true,
    helpText: alarm.helpText,
    enabled: true,
  }));
}

function buildPlant7Hmi(scenario, controllerTags, requestedScreen) {
  const stamp = new Date().toISOString();
  const selectedName = HMI_SCREEN_NAMES.find((name) => name.toUpperCase() === String(requestedScreen || scenario.screen || '').toUpperCase())
    || (HMI_AREAS.includes(scenario.area) ? scenario.area : 'Overview');
  const trends = trendsForAreas();
  const screens = [overviewScreen(), ...HMI_AREAS.map(areaScreen), alarmScreen(), trendScreen(scenario.area), ioScreen(scenario)];
  return {
    schemaVersion: 1,
    id: `plant7_hmi_${safeId(scenario.id)}`,
    name: 'Prairie Gold Plant 7 HMI',
    targetDevice: HMI_DEVICE,
    defaultLanguage: 'en-US',
    homeScreenId: hmiScreenId(selectedName),
    controllerReferences: [{
      id: 'plant7_hmi_controller_ref',
      name: 'PGP Plant 7 Controller',
      controllerName: 'PGP_Plant7_PLC',
      sourceKind: 'manual',
      syncStatus: 'synchronized',
      statusMessage: 'Live values solved by the Plant 7 controller against the AlarmState process simulation.',
      snapshot: {
        controllerTagCount: controllerTags.length,
        programTagCount: 0,
        dataTypeCount: 0,
        alarmCount: ALARM_DEFS.length,
      },
      tags: controllerTags.map((tag) => ({
        path: tag.name, name: tag.name, dataType: tag.dataType, scope: 'controller',
        description: tag.description, externalAccess: 'Read/Write',
      })),
      dataTypes: [], alarms: [],
    }],
    screens,
    popups: [],
    systemBanner: {
      id: 'plant7_hmi_banner', kind: 'system-banner', name: 'System Banner', width: 1280, height: 72,
      background: '#ffffff', updateRateMs: 500, securityRoleIds: [], elements: [], dock: 'top', restoreDefaultAvailable: true,
    },
    shortcuts: [], assets: [], addOnGraphics: [],
    alarms: hmiAlarmDefinitions(),
    alarmViews: [], diagnosticsViews: [], trends,
    dataLogs: [], recipes: [],
    languagePacks: [{ id: 'plant7_hmi_lang_en', languageId: 'en-US', displayName: 'English (United States)', strings: {}, missingStringIds: [] }],
    security: {
      roles: [
        { id: 'role_operator', name: 'Operator', permissions: ['navigate', 'acknowledge-alarms'] },
        { id: 'role_engineer', name: 'Engineer', permissions: ['navigate', 'configure', 'acknowledge-alarms'] },
      ],
      users: [], guestRoleId: 'role_operator', autoLogoffSeconds: 900,
      passwordPolicy: { minimumLength: 8, requireComplexity: true },
    },
    unsupportedContent: [], createdAt: stamp, updatedAt: stamp,
  };
}

function normalOperationsScenario() {
  const source = SCENARIOS[0];
  return {
    ...source,
    id: 'PLANT7_OPERATIONS',
    title: 'Plant 7 Normal Operations',
    area: 'PLANT 7',
    screen: 'OVERVIEW',
    program: null,
    routine: null,
    trendTags: HMI_AREAS.map((area) => TAGS.find((tag) => tag.area === area && !['di', 'mtr'].includes(tag.kind))?.tag).filter(Boolean),
    answer: null,
  };
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export function buildPlant7Project(scenario, values = {}, requestedScreen = null) {
  scenario = scenario || normalOperationsScenario();
  const stamp = new Date().toISOString();
  const projectId = `alarmstate_${safeId(scenario.id)}`;
  const controllerId = `${projectId}_controller`;

  // The whole plant program is loaded every time. A controller does not swap
  // out its code because a different alarm came in; the technician navigates to
  // the routine that owns the alarm.
  const programs = PROGRAMS.map((source, order) => {
    const programId = `${projectId}_program_${safeId(source.name)}`;
    const routines = source.routines.map((routine) => buildRoutine(routine, programId, projectId, source.description));
    return {
      id: programId,
      controllerId,
      name: source.name,
      description: source.description,
      mainRoutineId: routines.find((routine) => routine.name === 'MainRoutine')?.id,
      routines,
      programTags: [],
      order,
    };
  });

  const controllerTags = buildControllerTags(controllerId, values);
  const hmi = buildPlant7Hmi(scenario, controllerTags, requestedScreen);

  return {
    id: projectId,
    name: `PGP Plant 7 - ${scenario.area}`,
    description: `AlarmState live diagnostic project for ${scenario.title}. Simulation only; no hardware connection.`,
    createdAt: stamp,
    updatedAt: stamp,
    hmi,
    controllers: [{
      id: controllerId,
      projectId,
      name: 'PGP_Plant7_PLC',
      description: 'Prairie Gold Processing Plant 7 process controller.',
      processorType: 'ESCO5580',
      catalogNumber: '1756-L85E',
      firmwareRevision: '35.11',
      chassis: '1756-A17',
      slot: 0,
      commDriver: 'AlarmState Live Simulation',
      commPath: 'Simulation\\Plant7\\Controller',
      tasks: [{
        id: `${controllerId}_task`,
        controllerId,
        name: 'Plant7_Continuous',
        description: 'Continuous task carrying every Plant 7 process program.',
        type: 'continuous',
        watchdogMs: 500,
        scheduledProgramIds: programs.map((program) => program.id),
      }],
      programs,
      controllerTags,
      dataTypes: [],
      addOnInstructions: [],
      ioConfiguration: { modules: [
        { id: `${controllerId}_chassis`, name: 'Plant 7 Local Chassis', catalogNumber: '1756-A17', productType: 'Chassis' },
        { id: `${controllerId}_cpu`, name: 'PGP_Plant7_PLC', catalogNumber: '1756-L85E', productType: 'ESCO5580 Processor', slot: 0 },
      ] },
      trends: [],
      quickWatchLists: [],
      parameterConnections: [],
    }],
  };
}

export function storePlant7Project(scenario, values = {}, requestedScreen = null) {
  const key = scenario?.id || 'PLANT7_OPERATIONS';
  localStorage.setItem(`${PROJECT_PREFIX}${key}`, JSON.stringify(buildPlant7Project(scenario, values, requestedScreen)));
  return key;
}

/** Re-exported so callers can name plant tags the way the controller does. */
export { logixName };

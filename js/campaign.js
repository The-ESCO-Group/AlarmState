// Continuous apprenticeship director. The course is progression data; the
// campaign turns it into physical work inside one persistent Plant 7 world.
import { COURSE_WEEKS } from './course.js?v=20260716a';

const ANCHOR_LABELS = {
  dispatch: 'Reliability Center Dispatch',
  controlRoom: 'Central Control Room',
  cv101Workstation: 'CV-101 ESCO Workstation',
  academyStudio: 'HMI Design Studio',
  conditioner: 'Bean Conditioner',
  crackingA: 'Cracking Mill A',
  extractor: 'Main Extractor',
  dt: 'Desolventizer-Toaster',
  pumpAlley: 'Extraction Pump Alley',
  bleacher: 'Bleacher Vacuum Platform',
  deodorizer: 'Deodorizer Discharge',
  boiler: 'Boiler No. 1',
  coolingTower: 'Cooling Tower CT-1',
  pelletCooler: 'Pellet Cooler',
};

export class CampaignDirector {
  constructor(course, world) {
    this.course = course;
    this.world = world;
    this.active = false;
    this.mission = null;
    this.stage = 'off';
    this.lastSuccess = null;
    this.stageTime = 0;
    this.nextPressureAt = 18;
    this.pressureIndex = 0;
  }

  enterStage(stage) {
    this.stage = stage;
    this.stageTime = 0;
    this.nextPressureAt = 18;
    this.pressureIndex = 0;
  }

  start() {
    this.active = true;
    this.mission = null;
    this.lastSuccess = null;
    this.enterStage(this.course.nextMission() ? 'report' : 'qualified');
  }

  accept(mission) {
    this.mission = mission;
    this.enterStage('travel');
    this.lastSuccess = null;
  }

  finish(mission, success) {
    this.mission = mission;
    this.enterStage('return');
    this.lastSuccess = success;
  }

  atDispatch() {
    if (this.stage === 'qualified') return null;
    this.mission = null;
    this.lastSuccess = null;
    const next = this.course.nextMission();
    if (!next) {
      this.enterStage('qualified');
      return null;
    }
    this.enterStage('report');
    return next;
  }

  tick(dt, radio, game) {
    if (!this.active || this.stage === 'qualified' || game.state !== 'campaign') return;
    this.stageTime += dt;
    if (this.stageTime < this.nextPressureAt) return;

    const mission = this.mission || this.course.nextMission();
    let lines;
    if (this.stage === 'report') {
      lines = [
        ['frank', 'Ryder, dispatch called once. I will not turn a direct order into a conversation. Report now.'],
        ['voss', 'Personnel who need repeated routing during a qualification do not finish the qualification. Get to dispatch.'],
        ['frank', 'The next work order is waiting and the plant clock is not paused for you. Move.'],
      ];
    } else if (this.stage === 'return') {
      lines = this.lastSuccess ? [
        ['frank', 'The equipment result is logged. Your debrief is not. Return to Reliability Center immediately.'],
        ['voss', 'A closed fault without a technical handoff is unfinished work. Report before another call drops.'],
      ] : [
        ['frank', 'You failed the assignment and you are still away from dispatch. Return now and account for the miss.'],
        ['voss', 'The failed response is already on your record. Delaying the debrief adds another failure. Report.'],
      ];
    } else {
      lines = [
        ['frank', `${mission?.title || 'Your assignment'} is on the clock. The acceptance gate will not lower its standard because you are slow.`],
        ['voss', 'Production does not pay for effort. It pays for a proven control result. Finish the assigned work.'],
        ['frank', 'Stop rereading the brief. Use the plant facts, build the solution, and make the validator accept it.'],
      ];
    }

    const [who, text] = lines[this.pressureIndex % lines.length];
    this.pressureIndex += 1;
    this.nextPressureAt += Math.max(24, 34 - this.pressureIndex * 2);
    radio.say(who, text);
  }

  managerState(game) {
    if (game.state === 'active') return game.tier === 1 ? 'VOSS MONITORING' : game.tier === 2 ? 'VOSS ESCALATED' : 'INCIDENT REVIEW';
    if (this.stage === 'report') return 'REPORT OVERDUE';
    if (this.stage === 'travel') return 'CLOCK RUNNING';
    if (this.stage === 'return') return 'DEBRIEF REQUIRED';
    if (this.stage === 'qualified') return 'ACCEPTANCE CLOSED';
    return 'NO EXCUSES';
  }

  weekFor(mission = this.mission || this.course.nextMission()) {
    return mission ? COURSE_WEEKS.find((week) => week.missions.some((item) => item.id === mission.id)) : null;
  }

  positionFor(key) {
    return this.world.navAnchors?.[key] || this.world.anchors?.[key] || null;
  }

  target(game) {
    if (!this.active || this.stage === 'qualified') return null;
    if (this.stage === 'report' || this.stage === 'return') {
      return { key: 'dispatch', label: ANCHOR_LABELS.dispatch, pos: this.positionFor('dispatch') };
    }
    if (this.mission?.kind === 'esco') {
      const key = this.mission.destination || 'cv101Workstation';
      return { key, label: ANCHOR_LABELS[key] || 'ESCO Workstation', pos: this.positionFor(key) };
    }
    if (game.activeScenario) {
      const key = game.activeScenario.anchor;
      return { key, label: ANCHOR_LABELS[key] || game.activeScenario.area, pos: this.positionFor(key) };
    }
    return { key: 'controlRoom', label: ANCHOR_LABELS.controlRoom, pos: this.positionFor('controlRoom') };
  }

  guidance(game) {
    const next = this.course.nextMission();
    const mission = this.mission || next;
    const week = this.weekFor(mission);
    const prefix = week ? `WEEK ${week.n} / ${week.title}` : 'PLANT 7 QUALIFICATION';

    if (this.stage === 'qualified') return {
      prefix: 'QUALIFICATION COMPLETE',
      title: 'Acceptance closed',
      detail: 'All required assignments passed. Every delay and shutdown remains in the permanent record.',
    };
    if (this.stage === 'report') return {
      prefix,
      title: 'Report to dispatch',
      detail: next ? `Frank ordered you to dispatch for ${next.title}. The clock is already running.` : 'Return for final acceptance review. Do not keep management waiting.',
    };
    if (this.stage === 'return') return {
      prefix,
      title: this.lastSuccess ? 'Report for debrief now' : 'Report and account for failure',
      detail: this.lastSuccess
        ? `${mission.title} met the gate. Frank requires the evidence and the elapsed time at dispatch.`
        : `${mission.title} failed. Return to dispatch, explain the miss, and take the assignment again.`,
    };
    if (mission?.kind === 'esco') return {
      prefix,
      title: mission.title,
      detail: `Report to the ${ANCHOR_LABELS[mission.destination] || 'ESCO workstation'} and press E. You do not leave until the live project proves the requirement.`,
    };
    if (game.activeScenario) return {
      prefix,
      title: `Respond: ${game.activeScenario.alarm.name}`,
      detail: `Get to ${ANCHOR_LABELS[game.activeScenario.anchor] || game.activeScenario.area}. Correlate field evidence with ESCO HMI and logic, then submit one defensible failed I/O tag before the trip clock wins.`,
    };
    return {
      prefix,
      title: mission?.title || 'Report to Central Control',
      detail: 'Central Control is waiting. The fault call starts on management time, not yours.',
    };
  }
}

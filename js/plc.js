// ============================================================================
// PGP_Plant7_PLC — ladder scan engine
//
// Solves the Plant 7 controller program in js/data/plant-logic.js against live
// process values. This is what makes the plant's logic real: no rung, contact,
// coil, or alarm bit in AlarmState carries an authored truth value. Field input
// values come from the process simulation, everything else is the result of
// scanning the ladder.
//
// Scan order follows a Logix continuous task:
//   1. Input image update — read every field point once, at the top of the scan.
//   2. For each scheduled program, execute MainRoutine; its JSR instructions
//      call the subroutines in order.
//   3. Each rung is solved left to right: instructions in series AND together,
//      parallel branch legs OR together, and output instructions pass
//      rung-condition-in through as rung-condition-out (which is why a coil and
//      a later condition may legally share a rung).
//
// Instructions are only implemented where an offline implementation is
// faithful. PID is deliberately a pass-through: closed-loop control has no
// honest offline algorithm, so the control valves are moved by the process
// simulation and the loop is never pretended to be executing.
// ============================================================================

import { PROGRAMS, ALL_CONTROLLER_TAGS, FIELD_TAGS } from './data/plant-logic.js';

const STRUCT_TYPES = new Set(['TIMER', 'COUNTER', 'PID']);
const newTimer = () => ({ PRE: 0, ACC: 0, EN: false, TT: false, DN: false });
const newCounter = () => ({ PRE: 0, ACC: 0, CU: false, CD: false, DN: false, OV: false, UN: false });

/** Split `Tag.MEMBER` into its base tag and member, if any. */
function splitPath(path) {
  const text = String(path);
  const dot = text.indexOf('.');
  return dot < 0 ? { base: text, member: null } : { base: text.slice(0, dot), member: text.slice(dot + 1) };
}

const isLiteral = (value) => value !== '' && Number.isFinite(Number(value));

export class PlcScan {
  constructor(sim, { programs = PROGRAMS, tags = ALL_CONTROLLER_TAGS } = {}) {
    this.sim = sim;
    this.programs = programs;
    this.tagDefs = tags;

    /** Scalar tag image (BOOL as boolean, REAL/DINT as number). */
    this.tagValues = new Map();
    /** Structure tag image (TIMER / COUNTER / PID members). */
    this.structs = new Map();
    /** Logix names of wired field points. The logic may read these, never write them. */
    this.fieldNames = new Set(FIELD_TAGS.map((tag) => tag.name));
    this.fieldByName = new Map(FIELD_TAGS.map((tag) => [tag.name, tag]));
    /** Structural violations caught during a scan. A correct program leaves this empty. */
    this.violations = [];
    this.scanCount = 0;

    for (const tag of this.tagDefs) {
      if (STRUCT_TYPES.has(tag.dataType)) {
        this.structs.set(tag.name, tag.dataType === 'COUNTER' ? newCounter() : newTimer());
      } else if (tag.dataType === 'BOOL') {
        this.tagValues.set(tag.name, tag.init === true);
      } else {
        this.tagValues.set(tag.name, Number(tag.init) || 0);
      }
    }

    this.routinesByProgram = new Map(this.programs.map((program) => [
      program.name,
      new Map(program.routines.map((routine) => [routine.name, routine])),
    ]));

    this.prescan();
  }

  /**
   * Controller prescan. Logix clears timer status bits and, for an off-delay
   * timer, leaves .ACC at .PRE so a TOF that has never been energised comes up
   * with .DN clear. Without this every off-delay alarm in the plant would be
   * true for its preset on the first scan after power-up.
   */
  prescan() {
    for (const program of this.programs) {
      for (const routine of program.routines) {
        for (const rung of routine.rungs) {
          this.walkNodes(rung.root, (node) => {
            if (node.instructionType !== 'TOF') return;
            const struct = this.structs.get(splitPath(node.operands[0]?.value ?? '').base);
            if (!struct) return;
            struct.PRE = Number(node.operands[1]?.value ?? 0);
            struct.ACC = struct.PRE;
            struct.DN = false;
            struct.EN = false;
            struct.TT = false;
          });
        }
      }
    }
  }

  /** Visit every instruction in a branch tree, including parallel legs. */
  walkNodes(branch, visit) {
    if (!branch) return;
    for (const node of branch.nodes || []) visit(node);
    for (const leg of branch.parallelBranches || []) this.walkNodes(leg, visit);
    this.walkNodes(branch.next, visit);
  }

  // -- tag image access ------------------------------------------------------

  /** Numeric value of an operand: a literal, a scalar tag, or a structure member. */
  numeric(path) {
    if (isLiteral(path)) return Number(path);
    const { base, member } = splitPath(path);
    if (member) {
      const struct = this.structs.get(base);
      if (!struct) return this.reportUnknown(path, 0);
      return Number(struct[member]) || 0;
    }
    if (!this.tagValues.has(base)) return this.reportUnknown(path, 0);
    const value = this.tagValues.get(base);
    return typeof value === 'boolean' ? (value ? 1 : 0) : Number(value) || 0;
  }

  /** Boolean value of a bit operand: a scalar BOOL tag or a structure status bit. */
  readBool(path) {
    const { base, member } = splitPath(path);
    if (member) {
      const struct = this.structs.get(base);
      if (!struct) return this.reportUnknown(path, false);
      return !!struct[member];
    }
    if (!this.tagValues.has(base)) return this.reportUnknown(path, false);
    const value = this.tagValues.get(base);
    return typeof value === 'boolean' ? value : Number(value) >= 0.5;
  }

  reportUnknown(path, fallback) {
    this.violations.push(`Undefined tag reference "${path}".`);
    return fallback;
  }

  /**
   * Write a value into the tag image. A wired field point is refused: a coil
   * that writes an input is a fault in the program, not something to emulate.
   */
  write(path, value) {
    const { base, member } = splitPath(path);
    if (this.fieldNames.has(base)) {
      this.violations.push(`Instruction attempted to write field input "${path}".`);
      return;
    }
    if (member) {
      const struct = this.structs.get(base);
      if (!struct) { this.reportUnknown(path, null); return; }
      struct[member] = value;
      return;
    }
    if (!this.tagValues.has(base)) { this.reportUnknown(path, null); return; }
    this.tagValues.set(base, value);
  }

  structFor(path) {
    const { base } = splitPath(path);
    const struct = this.structs.get(base);
    if (!struct) this.reportUnknown(path, null);
    return struct;
  }

  // -- input image -----------------------------------------------------------

  /** Read every wired field point once at the top of the scan, as a controller does. */
  readInputs() {
    for (const tag of FIELD_TAGS) {
      const raw = this.sim.get(tag.plantTag);
      if (raw === undefined) continue;
      this.tagValues.set(tag.name, tag.dataType === 'BOOL' ? Number(raw) >= 0.5 : Number(raw));
    }
  }

  // -- rung solving ----------------------------------------------------------

  /**
   * Solve one branch. Every instruction executes whether or not power reaches
   * it — a false rung still drives its OTE false and still resets its TON — so
   * nothing here short-circuits.
   */
  evalBranch(branch, rungIn, dt) {
    if (!branch) return rungIn;

    let series = rungIn;
    for (const node of branch.nodes || []) series = this.execute(node, series, dt);

    let power = series;
    for (const leg of branch.parallelBranches || []) {
      const legOut = this.evalBranch(leg, rungIn, dt);
      power = legOut || power;
    }

    return branch.next ? this.evalBranch(branch.next, power, dt) : power;
  }

  /** Execute one instruction and return its rung-condition-out. */
  execute(node, rungIn, dt) {
    const type = node.instructionType;
    const value = (index) => node.operands[index]?.value ?? '';

    switch (type) {
      // --- bit ---
      case 'XIC': return rungIn && this.readBool(value(0));
      case 'XIO': return rungIn && !this.readBool(value(0));
      case 'OTE': this.write(value(0), rungIn); return rungIn;
      case 'OTL': if (rungIn) this.write(value(0), true); return rungIn;
      case 'OTU': if (rungIn) this.write(value(0), false); return rungIn;
      case 'ONS': {
        const previous = this.readBool(value(0));
        this.write(value(0), rungIn);
        return rungIn && !previous;
      }

      // --- timers ---
      case 'TON': {
        const timer = this.structFor(value(0));
        if (!timer) return rungIn;
        timer.PRE = this.numeric(value(1));
        if (rungIn) {
          timer.EN = true;
          timer.ACC = Math.min(timer.PRE, timer.ACC + dt * 1000);
          timer.DN = timer.ACC >= timer.PRE;
          timer.TT = !timer.DN;
        } else {
          timer.EN = false; timer.TT = false; timer.DN = false; timer.ACC = 0;
        }
        return rungIn;
      }
      /**
       * TOF - Timer Off Delay. DN is set while the rung is true and stays set
       * for the preset after it goes false. Prescan leaves ACC at PRE (see
       * `prescan`), so a timer that has never been energised reports DN clear
       * instead of announcing an alarm for its preset at every power-up.
       */
      case 'TOF': {
        const timer = this.structFor(value(0));
        if (!timer) return rungIn;
        timer.PRE = this.numeric(value(1));
        if (rungIn) {
          timer.EN = true; timer.ACC = 0; timer.DN = true; timer.TT = false;
        } else {
          timer.EN = false;
          timer.ACC = Math.min(timer.PRE, timer.ACC + dt * 1000);
          timer.DN = timer.ACC < timer.PRE;
          timer.TT = timer.DN;
        }
        return rungIn;
      }
      case 'RTO': {
        const timer = this.structFor(value(0));
        if (!timer) return rungIn;
        timer.PRE = this.numeric(value(1));
        timer.EN = rungIn;
        if (rungIn) timer.ACC = Math.min(timer.PRE, timer.ACC + dt * 1000);
        timer.DN = timer.ACC >= timer.PRE;
        timer.TT = rungIn && !timer.DN;
        return rungIn;
      }
      case 'RES': {
        if (rungIn) {
          const struct = this.structFor(value(0));
          if (struct) { struct.ACC = 0; struct.DN = false; struct.EN = false; struct.TT = false; }
        }
        return rungIn;
      }

      // --- counters ---
      case 'CTU': {
        const counter = this.structFor(value(0));
        if (!counter) return rungIn;
        counter.PRE = this.numeric(value(1));
        if (rungIn && !counter.CU) counter.ACC += 1;
        counter.CU = rungIn;
        counter.DN = counter.ACC >= counter.PRE;
        return rungIn;
      }

      // --- compare ---
      case 'GRT': return rungIn && this.numeric(value(0)) > this.numeric(value(1));
      case 'LES': return rungIn && this.numeric(value(0)) < this.numeric(value(1));
      case 'GEQ': return rungIn && this.numeric(value(0)) >= this.numeric(value(1));
      case 'LEQ': return rungIn && this.numeric(value(0)) <= this.numeric(value(1));
      case 'EQU': return rungIn && this.numeric(value(0)) === this.numeric(value(1));
      case 'NEQ': return rungIn && this.numeric(value(0)) !== this.numeric(value(1));

      // --- math / move ---
      case 'ADD': if (rungIn) this.write(value(2), this.numeric(value(0)) + this.numeric(value(1))); return rungIn;
      case 'SUB': if (rungIn) this.write(value(2), this.numeric(value(0)) - this.numeric(value(1))); return rungIn;
      case 'MUL': if (rungIn) this.write(value(2), this.numeric(value(0)) * this.numeric(value(1))); return rungIn;
      case 'DIV': {
        if (rungIn) {
          const divisor = this.numeric(value(1));
          this.write(value(2), divisor === 0 ? 0 : this.numeric(value(0)) / divisor);
        }
        return rungIn;
      }
      case 'ABS': if (rungIn) this.write(value(1), Math.abs(this.numeric(value(0)))); return rungIn;
      case 'MOV': if (rungIn) this.write(value(1), this.numeric(value(0))); return rungIn;

      // --- program control ---
      case 'JSR': {
        this.executeRoutine(this.currentProgram, value(0), dt);
        return rungIn;
      }


      /**
       * PID is model-only, exactly as it is in the ESCO instruction set. The
       * loop is not executed and no control variable is written here; the
       * process simulation owns valve movement. Faking a controller's PID
       * algorithm would make every loop in the plant a lie.
       */
      case 'PID': return rungIn;

      default:
        this.violations.push(`Unimplemented instruction "${type}".`);
        return rungIn;
    }
  }

  executeRoutine(programName, routineName, dt) {
    const routine = this.routinesByProgram.get(programName)?.get(routineName);
    if (!routine) {
      this.violations.push(`JSR to unknown routine "${routineName}" in program "${programName}".`);
      return;
    }
    // A controller faults on runaway subroutine nesting rather than hanging.
    this.callDepth = (this.callDepth || 0) + 1;
    if (this.callDepth > 8) {
      this.violations.push(`Subroutine nesting limit exceeded at ${programName}/${routineName}.`);
    } else {
      for (const rung of routine.rungs) this.evalBranch(rung.root, true, dt);
    }
    this.callDepth -= 1;
  }

  /** One full controller scan. `dt` is elapsed seconds since the previous scan. */
  scan(dt) {
    this.violations.length = 0;
    this.readInputs();
    for (const program of this.programs) {
      this.currentProgram = program.name;
      const main = this.routinesByProgram.get(program.name)?.get('MainRoutine');
      if (!main) {
        this.violations.push(`Program "${program.name}" has no MainRoutine.`);
        continue;
      }
      for (const rung of main.rungs) this.evalBranch(rung.root, true, dt);
    }
    this.currentProgram = null;
    this.scanCount += 1;
    return this.violations;
  }

  /** Run enough scans to cover `seconds` of process time at a realistic scan rate. */
  scanFor(seconds, scanMs = 50) {
    const step = scanMs / 1000;
    for (let elapsed = 0; elapsed < seconds; elapsed += step) this.scan(step);
  }

  /**
   * The full live tag image, keyed by Logix tag path. Scalars appear by name and
   * timer/counter members by `Tag.MEMBER`, so the studio receives exactly what
   * the controller holds — including the accumulated value behind every alarm
   * delay.
   */
  image() {
    const values = {};
    for (const [name, value] of this.tagValues) values[name] = value;
    for (const [name, struct] of this.structs) {
      for (const [member, memberValue] of Object.entries(struct)) values[`${name}.${member}`] = memberValue;
    }
    return values;
  }

  /** True when an alarm or status bit is set in the solved image. */
  isSet(name) { return this.readBool(name); }

  /** Every alarm-class bit currently true, for the HUD and the operator alarm summary. */
  activeBits(names) { return names.filter((name) => this.readBool(name)); }
}

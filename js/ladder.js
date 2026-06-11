// ============================================================================
// Ladder logic viewer — Logix Designer style. Auto-opens the routine that
// generated the active alarm; tags are clickable for cross-reference.
// ============================================================================
import { TAGMAP } from './data/tags.js';

const u = (s) => String(s).replace('-', '_');   // PLC-style tag names use underscores

export class LadderViewer {
  constructor(sim, game) {
    this.sim = sim;
    this.game = game;
    this.el = document.getElementById('ladder');
    this.rungsEl = document.getElementById('ld-rungs');
    this.treeEl = document.getElementById('ld-tree-body');
    this.tabEl = document.getElementById('ld-routine-tab');
    this.xrefBanner = document.getElementById('ld-xref-banner');
    this.statusEl = document.getElementById('ld-status');
    this.open = false;
    this.routines = [];
    this.currentIdx = 0;
    this.xrefTag = null;

    this.xrefBanner.addEventListener('click', () => { this.xrefTag = null; this.render(); });
  }

  openOverlay() {
    this.open = true;
    this.el.classList.remove('hidden');
    const sc = this.game.activeScenario;
    if (sc) {
      this.routines = sc.routines;
      this.statusEl.textContent =
        `Active alarm ${sc.alarm.name} → auto-navigated to routine ${sc.routines[0].name}. Click any tag to cross-reference.`;
    } else {
      this.routines = [{
        name: 'Z99_NoActiveAlarm', program: 'Plant', rungs: [
          { c: 'No active alarm. The PLC is bored. Enjoy it while it lasts.', els: [{ t: 'XIC', tag: 'PLANT_OK', on: true }, { t: 'OTE', tag: 'COFFEE_BREAK', on: true }] },
        ],
      }];
      this.statusEl.textContent = 'No active alarm — nothing to chase. For once.';
    }
    this.currentIdx = 0;
    this.xrefTag = null;
    this.render();
  }
  closeOverlay() { this.open = false; this.el.classList.add('hidden'); }

  selectRoutine(i) { this.currentIdx = i; this.xrefTag = null; this.render(); }

  crossRef(tag) {
    this.xrefTag = tag;
    this.render();
  }

  // live value string for comparison/deviation boxes
  _live(ref) {
    if (TAGMAP[ref]) {
      const m = TAGMAP[ref];
      return `${this.sim.fmt(ref)}${m.eu ? ' ' + m.eu : ''}`;
    }
    return ref; // literal constant
  }

  // live truth of a single instruction (CMP/DEV computed from sim, rest scripted)
  _liveOn(e) {
    const num = (ref) => TAGMAP[ref] ? this.sim.get(ref) : parseFloat(ref);
    switch (e.t) {
      case 'GRT': return num(e.a) > num(e.b);
      case 'LES': return num(e.a) < num(e.b);
      case 'GEQ': return num(e.a) >= num(e.b);
      case 'LEQ': return num(e.a) <= num(e.b);
      case 'DEV': return Math.abs(num(e.a) - num(e.b)) > num(e.lim);
      default: return !!e.on;
    }
  }

  _instrHTML(e, energized) {
    const tagLink = (tag, cls = 'i-tag') =>
      `<div class="${cls}" data-xref="${tag}">${u(tag)}</div>`;
    const on = energized ? ' on' : '';
    switch (e.t) {
      case 'XIC': return `<div class="instr${on}">${tagLink(e.tag)}<div class="i-sym">—] [—</div></div>`;
      case 'XIO': return `<div class="instr${on}">${tagLink(e.tag)}<div class="i-sym">—]/[—</div></div>`;
      case 'OTE': return `<div class="instr${on}">${tagLink(e.tag)}<div class="i-sym">—( )—</div></div>`;
      case 'OTL': return `<div class="instr${on}">${tagLink(e.tag)}<div class="i-sym">—(L)—</div></div>`;
      case 'OTU': return `<div class="instr${on}">${tagLink(e.tag)}<div class="i-sym">—(U)—</div></div>`;
      case 'TON': return `<div class="instr${on}"><div class="i-box"><div class="b-head">TON</div>
          <div class="b-row"><span>Timer</span><span class="b-tag" data-xref="${e.tag}">${u(e.tag)}</span></div>
          <div class="b-row"><span>Preset</span><span class="b-val">${e.pre}</span></div>
          <div class="b-row"><span>EN/DN</span><span class="b-val">${e.on ? '1 / 1' : '0 / 0'}</span></div></div></div>`;
      case 'GRT': case 'LES': case 'GEQ': case 'LEQ': {
        const name = e.t;
        return `<div class="instr${on}"><div class="i-box"><div class="b-head">${name}</div>
          <div class="b-row"><span>Src A</span><span class="b-tag" data-xref="${e.a}">${u(e.a)}</span></div>
          <div class="b-row"><span></span><span class="b-val">${this._live(e.a)}</span></div>
          <div class="b-row"><span>Src B</span><span class="b-val">${e.b}</span></div></div></div>`;
      }
      case 'DEV':
        return `<div class="instr${on}"><div class="i-box"><div class="b-head">|A−B| &gt; LIM</div>
          <div class="b-row"><span>A</span><span class="b-tag" data-xref="${e.a}">${u(e.a)}</span></div>
          <div class="b-row"><span></span><span class="b-val">${this._live(e.a)}</span></div>
          <div class="b-row"><span>B</span><span class="b-tag" data-xref="${e.b}">${u(e.b)}</span></div>
          <div class="b-row"><span></span><span class="b-val">${this._live(e.b)}</span></div>
          <div class="b-row"><span>Lim</span><span class="b-val">${e.lim}</span></div></div></div>`;
      case 'PID':
        return `<div class="instr${on}"><div class="i-box"><div class="b-head">PID</div>
          <div class="b-row"><span>Loop</span><span>${u(e.tag)}</span></div>
          <div class="b-row"><span>PV</span><span class="b-tag" data-xref="${e.pv}">${u(e.pv)}</span></div>
          <div class="b-row"><span></span><span class="b-val">${this._live(e.pv)}</span></div>
          <div class="b-row"><span>CV</span><span class="b-tag" data-xref="${e.cv}">${u(e.cv)}</span></div>
          <div class="b-row"><span></span><span class="b-val">${this._live(e.cv)}</span></div></div></div>`;
      default: return `<div class="instr">?</div>`;
    }
  }

  _rungMatchesXref(rung, tag) {
    return rung.els.some(e =>
      e.tag === tag || e.a === tag || e.b === tag || e.pv === tag || e.cv === tag);
  }

  render() {
    // tree
    const sc = this.game.activeScenario;
    let tree = '';
    const progs = {};
    this.routines.forEach((r, i) => {
      (progs[r.program] = progs[r.program] || []).push([r, i]);
    });
    for (const [prog, list] of Object.entries(progs)) {
      tree += `<div class="ld-tree-group">▾ 📁 ${prog}</div>`;
      for (const [r, i] of list) {
        tree += `<div class="ld-tree-item${i === this.currentIdx ? ' activeroutine' : ''}" data-ri="${i}">⬛ ${r.name} ${i === 0 && sc ? ' ⚠' : ''}</div>`;
      }
    }
    tree += `<div class="ld-tree-group" style="color:#999">▸ 📁 (42 other programs)</div>`;
    this.treeEl.innerHTML = tree;
    this.treeEl.querySelectorAll('[data-ri]').forEach(el =>
      el.addEventListener('click', () => this.selectRoutine(Number(el.dataset.ri))));

    const routine = this.routines[this.currentIdx];
    this.tabEl.textContent = `${routine.program} ▸ ${routine.name}  ${sc ? '— alarm source routine for ' + sc.alarm.name : ''}`;

    // xref mode: gather matching rungs across ALL routines
    let rungsToShow;
    if (this.xrefTag) {
      rungsToShow = [];
      this.routines.forEach((r) => {
        r.rungs.forEach((rg, n) => {
          if (this._rungMatchesXref(rg, this.xrefTag)) rungsToShow.push({ ...rg, _src: `${r.name}:${n}` });
        });
      });
      this.xrefBanner.classList.remove('hidden');
      this.xrefBanner.textContent = `Cross Reference: ${u(this.xrefTag)} — ${rungsToShow.length} rung(s). Click to clear ✕`;
    } else {
      rungsToShow = routine.rungs.map((rg, n) => ({ ...rg, _src: String(n) }));
      this.xrefBanner.classList.add('hidden');
    }

    this.rungsEl.innerHTML = rungsToShow.map((rg) => {
      // Logix-style highlighting: inputs show their own truth; outputs/timers
      // highlight only when everything ahead of them in the rung is true.
      let cur = true;
      const states = rg.els.map(e => {
        const own = this._liveOn(e);
        const isOutput = ['OTE', 'OTL', 'OTU', 'TON', 'PID'].includes(e.t);
        const shown = isOutput ? (cur && own) : own;
        cur = cur && own;
        return shown;
      });
      const allOn = rg.els.length > 0 && cur;
      const body = rg.els.map((e, i) => this._instrHTML(e, states[i])).join('');
      return `<div class="rung">
        <div class="rung-num">${rg._src}</div>
        <div class="rung-body">
          ${rg.c ? `<div class="rung-comment">${rg.c}</div>` : ''}
          <div class="rung-wire${allOn ? ' energized' : ''}">${body}</div>
        </div></div>`;
    }).join('');

    this.rungsEl.querySelectorAll('[data-xref]').forEach(el =>
      el.addEventListener('click', (ev) => { ev.stopPropagation(); this.crossRef(el.dataset.xref); }));
  }

  // refresh live values periodically while open
  refresh() {
    if (!this.open) return;
    this._lastRefresh = this._lastRefresh || 0;
    const now = performance.now();
    if (now - this._lastRefresh > 900) {
      this._lastRefresh = now;
      // re-render to update live values (cheap enough at <1Hz)
      const scroll = this.rungsEl.scrollTop;
      this.render();
      this.rungsEl.scrollTop = scroll;
    }
  }
}

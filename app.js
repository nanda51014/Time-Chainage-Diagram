/* ============================================================
   Time-Chainage Diagram Tool
   Self-contained, no dependencies. Plots construction activities
   as lines on a chainage (X) vs. time (Y) grid.
   ============================================================ */

'use strict';

// ---------- Discipline palette (stable colour per discipline) ----------
const PALETTE = [
  '#4ea1ff', '#ff8a3d', '#5fd28a', '#e85d75', '#b48aff',
  '#f2c94c', '#56ccf2', '#bb6bd9', '#27ae60', '#eb5757'
];
const disciplineColors = {};
let _colorIdx = 0;
function colorFor(disc) {
  const key = (disc || 'General').trim() || 'General';
  if (!disciplineColors[key]) {
    disciplineColors[key] = PALETTE[_colorIdx % PALETTE.length];
    _colorIdx++;
  }
  return disciplineColors[key];
}

// ---------- Date helpers ----------
const DAY_MS = 86400000;
function parseDate(s) {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? null : d;
}
function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(d, n) {
  return new Date(d.getTime() + n * DAY_MS);
}
function diffDays(a, b) {
  return Math.round((b - a) / DAY_MS);
}
// Add `workDays` working days (skipping Sat/Sun) and return the end date.
function addWorkingDays(start, workDays) {
  let remaining = Math.ceil(workDays);
  let d = new Date(start);
  while (remaining > 0) {
    d = addDays(d, 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

// ---------- State ----------
let activities = [];   // {id, name, discipline, fromCH, toCH, start, mode, value, dir}
let markers = [];      // {id, ch, label}
let deps = [];         // {id, predId, succId, minDays}
let windows = [];      // {id, fromCH, toCH, start, end, label}
let nextId = 1;
let nextMkId = 1;
let nextDepId = 1;
let nextWinId = 1;

// sample blocked window: env. closure CH 6+000–8+000, 1 Dec 2026–28 Feb 2027.
// Catches Sub-base (~early Dec) and Surfacing (~mid Feb) working through it.
const SAMPLE_WINDOWS = [
  { fromCH: 6000, toCH: 8000, start: '2026-12-01', end: '2027-02-28', label: 'Env. closure' }
];

// sample dependencies declared by activity name; resolved to ids on load.
// Earthworks→Drainage is a near-miss (57 d gap vs 60 required) to show a
// violation; Sub-base→Surfacing passes comfortably.
const SAMPLE_DEPS = [
  { pred: 'Earthworks', succ: 'Drainage', minDays: 60 },
  { pred: 'Sub-base', succ: 'Surfacing', minDays: 14 }
];

const SAMPLE_MARKERS = [
  { ch: 4400, label: 'Bridge BR-04' },
  { ch: 7200, label: 'Level crossing' },
  { ch: 9100, label: 'Rail underpass' }
];

const SAMPLE = [
  { name: 'Site clearance', discipline: 'Enabling', fromCH: 0,    toCH: 10000, start: '2026-07-01', mode: 'rate', value: 400 },
  { name: 'Earthworks',     discipline: 'Earthworks', fromCH: 0,  toCH: 10000, start: '2026-07-20', mode: 'rate', value: 150 },
  { name: 'Drainage',       discipline: 'Drainage',  fromCH: 0,   toCH: 10000, start: '2026-09-15', mode: 'rate', value: 120 },
  { name: 'Sub-base',       discipline: 'Pavement',  fromCH: 0,   toCH: 10000, start: '2026-11-01', mode: 'rate', value: 180 },
  { name: 'Bridge BR-04',   discipline: 'Structures', fromCH: 4200, toCH: 4600, start: '2026-08-01', mode: 'date', value: '2027-03-01' },
  { name: 'Surfacing',      discipline: 'Pavement',  fromCH: 0,   toCH: 10000, start: '2027-01-15', mode: 'rate', value: 220 }
];

// ============================================================
//  Schedule computation
// ============================================================
function computeFinish(act, skipWeekends) {
  const start = parseDate(act.start);
  if (!start) return null;
  if (act.mode === 'date') {
    const end = parseDate(act.value);
    return end || null;
  }
  // rate mode
  const rate = parseFloat(act.value);
  const length = Math.abs(act.toCH - act.fromCH);
  if (!rate || rate <= 0) return null;
  const durDays = length / rate;
  return skipWeekends ? addWorkingDays(start, durDays) : addDays(start, durDays);
}

function buildSchedule() {
  const skipWeekends = document.getElementById('skipWeekends').checked;
  const rows = [];
  for (const act of activities) {
    const start = parseDate(act.start);
    const finish = computeFinish(act, skipWeekends);
    if (!start || !finish || finish < start) continue;
    if (act.fromCH === '' || act.toCH === '' || isNaN(act.fromCH) || isNaN(act.toCH)) continue;
    rows.push({ ...act, start, finish });
  }
  return rows;
}

// Date at which an activity's work-front reaches chainage `ch` (linear
// interpolation along its line). Returns null for zero-length (vertical)
// activities, where a single chainage maps to a date range, not a point.
function dateAtCh(r, ch) {
  if (r.toCH === r.fromCH) return null;
  const frac = (ch - r.fromCH) / (r.toCH - r.fromCH);
  return addDays(r.start, frac * diffDays(r.start, r.finish));
}

// Evaluate declared dependencies. A successor must stay at least `minDays`
// behind its predecessor at every shared chainage. Both work-fronts are
// linear in chainage, so the gap is linear and its minimum lies at an
// endpoint of the shared chainage range — checking the endpoints suffices.
function evalDeps(sched) {
  const byId = {};
  sched.forEach(r => { byId[r.id] = r; });
  const out = [];
  for (const d of deps) {
    const p = byId[d.predId], s = byId[d.succId];
    if (!p || !s) continue;
    if (p.toCH === p.fromCH || s.toCH === s.fromCH) continue; // skip vertical
    const lo = Math.max(Math.min(p.fromCH, p.toCH), Math.min(s.fromCH, s.toCH));
    const hi = Math.min(Math.max(p.fromCH, p.toCH), Math.max(s.fromCH, s.toCH));
    if (lo > hi) continue; // no shared chainage
    const minDays = parseFloat(d.minDays) || 0;
    let worst = null;
    for (const ch of [lo, hi]) {
      const pd = dateAtCh(p, ch), sd = dateAtCh(s, ch);
      if (!pd || !sd) continue;
      const gap = diffDays(pd, sd); // successor minus predecessor, in days
      if (worst === null || gap < worst.gap) worst = { ch, gap, succDate: sd };
    }
    if (worst && worst.gap < minDays) {
      out.push({ dep: d, pred: p, succ: s, minDays, ...worst });
    }
  }
  return out;
}

// Evaluate blocked access windows. An activity intrudes when it occupies a
// chainage inside the window's chainage range at a date inside its blocked
// period. Date is linear in chainage, so the activity's dates over the shared
// chainage range form an interval — intrusion is an interval overlap test.
function evalWindows(sched) {
  const out = [];
  for (const w of windows) {
    const wFrom = Math.min(+w.fromCH, +w.toCH), wTo = Math.max(+w.fromCH, +w.toCH);
    const ws = parseDate(w.start), we = parseDate(w.end);
    if (isNaN(wFrom) || isNaN(wTo) || !ws || !we || we < ws) { out.push({ w, intruders: [] }); continue; }
    const intruders = [];
    for (const r of sched) {
      const aFrom = Math.min(r.fromCH, r.toCH), aTo = Math.max(r.fromCH, r.toCH);
      const lo = Math.max(wFrom, aFrom), hi = Math.min(wTo, aTo);
      if (lo > hi) continue; // no chainage overlap
      if (r.toCH === r.fromCH) {
        // vertical activity: single chainage, spans [start, finish] in time
        if (r.finish < ws || r.start > we) continue;
        const mid = new Date((Math.max(r.start, ws).getTime() + Math.min(r.finish, we).getTime()) / 2);
        intruders.push({ act: r, ch: r.fromCH, date: mid });
        continue;
      }
      const a = dateAtCh(r, lo), b = dateAtCh(r, hi);
      const d1 = a < b ? a : b, d2 = a < b ? b : a;
      if (d2 < ws || d1 > we) continue; // time intervals don't overlap
      const midCh = (lo + hi) / 2;
      intruders.push({ act: r, ch: midCh, date: dateAtCh(r, midCh) });
    }
    out.push({ w, wFrom, wTo, ws, we, intruders });
  }
  return out;
}

// ============================================================
//  Rendering
// ============================================================
const SVGNS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, text) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}

function render() {
  const host = document.getElementById('chartHost');
  host.innerHTML = '';
  const sched = buildSchedule();

  const W = host.clientWidth || 800;
  const H = host.clientHeight || 600;
  const M = { top: 56, right: 30, bottom: 30, left: 70 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  svg.setAttribute('xmlns', SVGNS);

  // background
  svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#0c1117' }));
  svg.appendChild(el('text', { x: M.left, y: 28, class: 'chart-title' }, 'Time–Chainage Diagram'));

  // ----- domains -----
  const chStart = parseFloat(document.getElementById('chStart').value) || 0;
  const chEnd = parseFloat(document.getElementById('chEnd').value) || 0;
  const units = document.getElementById('chUnits').value;
  const timeDir = document.getElementById('timeDir').value; // 'down' | 'up'

  let tMin, tMax;
  const projStart = parseDate(document.getElementById('projStart').value);
  if (sched.length) {
    tMin = sched.reduce((m, r) => r.start < m ? r.start : m, sched[0].start);
    tMax = sched.reduce((m, r) => r.finish > m ? r.finish : m, sched[0].finish);
  } else {
    tMin = projStart || new Date();
    tMax = addDays(tMin, 30);
  }
  if (projStart && projStart < tMin) tMin = projStart;
  // pad time domain a little
  const totalDays = Math.max(1, diffDays(tMin, tMax));

  // ----- scales -----
  const chSpan = (chEnd - chStart) || 1;
  function xOf(ch) { return M.left + ((ch - chStart) / chSpan) * innerW; }
  function yOf(date) {
    const frac = diffDays(tMin, date) / totalDays;
    return timeDir === 'down'
      ? M.top + frac * innerH
      : M.top + (1 - frac) * innerH;
  }

  // ----- grid + chainage axis (X) -----
  const grid = el('g', { class: 'grid' });
  const chTickStep = niceStep(chSpan, 10);
  const firstCh = Math.ceil(chStart / chTickStep) * chTickStep;
  for (let ch = firstCh; ch <= chEnd + 1e-6; ch += chTickStep) {
    const x = xOf(ch);
    grid.appendChild(el('line', { x1: x, y1: M.top, x2: x, y2: M.top + innerH }));
    const label = units === 'km' ? (ch / 1000).toFixed(ch % 1000 ? 1 : 0) : formatCh(ch);
    svg.appendChild(el('text', { x, y: M.top + innerH + 16, class: 'tick-label', 'text-anchor': 'middle' }, label));
  }
  svg.appendChild(el('text', {
    x: M.left + innerW / 2, y: H - 4, class: 'axis-label', 'text-anchor': 'middle'
  }, `Chainage (${units})`));

  // ----- grid + time axis (Y) -----
  const timeStep = niceTimeStep(totalDays, innerH);
  let cursor = startOfStep(tMin, timeStep);
  let guard = 0;
  while (cursor <= tMax && guard++ < 500) {
    if (cursor >= tMin) {
      const y = yOf(cursor);
      grid.appendChild(el('line', { x1: M.left, y1: y, x2: M.left + innerW, y2: y, class: 'major' }));
      svg.appendChild(el('text', { x: M.left - 8, y: y + 3, class: 'tick-label', 'text-anchor': 'end' }, fmtTimeTick(cursor, timeStep)));
    }
    cursor = stepNext(cursor, timeStep);
  }
  svg.appendChild(grid);

  // axis frame
  svg.appendChild(el('rect', { x: M.left, y: M.top, width: innerW, height: innerH, fill: 'none', stroke: '#2f3b47' }));

  // ----- access windows (blocked bands, drawn behind activities) -----
  const tipEl = document.getElementById('tooltip');
  const winResults = evalWindows(sched);
  for (const wr of winResults) {
    if (!wr.ws) continue; // invalid window, nothing to draw
    const x = Math.min(xOf(wr.wFrom), xOf(wr.wTo));
    const wpx = Math.abs(xOf(wr.wTo) - xOf(wr.wFrom));
    const yA = yOf(wr.ws), yB = yOf(wr.we);
    const y = Math.min(yA, yB), hpx = Math.abs(yB - yA);
    const bad = wr.intruders.length > 0;
    const rect = el('rect', {
      x, y, width: wpx, height: hpx,
      class: 'window-band' + (bad ? ' bad' : '')
    });
    rect.addEventListener('mousemove', (ev) => {
      const host = document.getElementById('chartHost').getBoundingClientRect();
      tipEl.hidden = false;
      tipEl.style.left = (ev.clientX - host.left + 14) + 'px';
      tipEl.style.top = (ev.clientY - host.top + 14) + 'px';
      const names = wr.intruders.map(i => esc(i.act.name)).join(', ');
      tipEl.innerHTML =
        `<b>${esc(wr.w.label || 'Blocked window')}</b><br>` +
        `CH ${formatCh(wr.wFrom)}–${formatCh(wr.wTo)}<br>` +
        `${fmtDate(wr.ws)} → ${fmtDate(wr.we)}<br>` +
        (bad ? `⚠ intruding: ${names}` : 'no activities inside');
    });
    rect.addEventListener('mouseleave', () => { tipEl.hidden = true; });
    svg.appendChild(rect);
    if (wr.w.label) {
      svg.appendChild(el('text', {
        x: x + wpx / 2, y: y + 12, class: 'window-text', 'text-anchor': 'middle'
      }, wr.w.label));
    }
  }

  // ----- location markers -----
  for (const mk of markers) {
    const ch = parseFloat(mk.ch);
    if (isNaN(ch) || ch < Math.min(chStart, chEnd) || ch > Math.max(chStart, chEnd)) continue;
    const x = xOf(ch);
    svg.appendChild(el('line', { x1: x, y1: M.top, x2: x, y2: M.top + innerH, class: 'marker-line' }));
    const t = el('text', {
      x: x + 3, y: M.top + 4, class: 'marker-text', transform: `rotate(90 ${x + 3} ${M.top + 4})`
    }, mk.label || formatCh(ch));
    svg.appendChild(t);
  }

  // ----- activity lines -----
  const tip = document.getElementById('tooltip');
  const segs = []; // captured for clash detection
  for (const r of sched) {
    const color = colorFor(r.discipline);
    const x1 = xOf(r.fromCH), x2 = xOf(r.toCH);
    const y1 = yOf(r.start), y2 = yOf(r.finish);
    segs.push({ r, x1, y1, x2, y2 });
    const line = el('line', { x1, y1, x2, y2, class: 'act-line', stroke: color });
    const lengthCh = Math.abs(r.toCH - r.fromCH);
    const days = diffDays(r.start, r.finish) || 1;
    const rateCalc = (lengthCh / days).toFixed(1);
    line.addEventListener('mousemove', (ev) => {
      const host = document.getElementById('chartHost').getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = (ev.clientX - host.left + 14) + 'px';
      tip.style.top = (ev.clientY - host.top + 14) + 'px';
      tip.innerHTML =
        `<b>${esc(r.name)}</b><br>${esc(r.discipline)}<br>` +
        `CH ${formatCh(r.fromCH)} → ${formatCh(r.toCH)} (${formatCh(lengthCh)} ${units})<br>` +
        `${fmtDate(r.start)} → ${fmtDate(r.finish)} (${days} d)<br>` +
        `≈ ${rateCalc} ${units}/day`;
    });
    line.addEventListener('mouseleave', () => { tip.hidden = true; });
    svg.appendChild(line);

    // label near the start of the line
    const lx = (x1 + x2) / 2, ly = (y1 + y2) / 2;
    svg.appendChild(el('text', { x: lx, y: ly - 6, class: 'act-label', 'text-anchor': 'middle' }, r.name));
  }

  // ----- clash detection -----
  // Two activities clash when they occupy the same chainage at the same time,
  // i.e. their lines cross. Axes are affine + monotonic, so a screen-space
  // segment intersection corresponds exactly to a data-space clash.
  const showClashes = document.getElementById('showClashes').checked;
  const chOf = x => chStart + ((x - M.left) / innerW) * chSpan;
  const dateOf = y => {
    const frac = timeDir === 'down' ? (y - M.top) / innerH : 1 - (y - M.top) / innerH;
    return addDays(tMin, frac * totalDays);
  };
  let clashN = 0;
  if (showClashes) {
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const p = segIntersect(segs[i], segs[j]);
        if (!p) continue;
        clashN++;
        const a = segs[i].r, b = segs[j].r;
        const ch = chOf(p.x), date = dateOf(p.y);
        const marker = el('circle', { cx: p.x, cy: p.y, r: 6, class: 'clash-marker' });
        marker.addEventListener('mousemove', (ev) => {
          const host = document.getElementById('chartHost').getBoundingClientRect();
          tip.hidden = false;
          tip.style.left = (ev.clientX - host.left + 14) + 'px';
          tip.style.top = (ev.clientY - host.top + 14) + 'px';
          tip.innerHTML =
            `<b>⚠ Clash</b><br>${esc(a.name)} × ${esc(b.name)}<br>` +
            `at CH ${formatCh(ch)} on ${fmtDate(date)}`;
        });
        marker.addEventListener('mouseleave', () => { tip.hidden = true; });
        svg.appendChild(marker);
      }
    }
  }
  const badge = document.getElementById('clashCount');
  badge.textContent = clashN;
  badge.hidden = !(showClashes && clashN > 0);

  // ----- dependency violations -----
  const viols = evalDeps(sched);
  for (const v of viols) {
    const x = xOf(v.ch), y = yOf(v.succDate);
    const d = 7;
    const path = el('path', {
      d: `M${x} ${y - d} L${x + d} ${y} L${x} ${y + d} L${x - d} ${y} Z`,
      class: 'dep-marker'
    });
    const short = (v.minDays - v.gap);
    path.addEventListener('mousemove', (ev) => {
      const host = document.getElementById('chartHost').getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = (ev.clientX - host.left + 14) + 'px';
      tip.style.top = (ev.clientY - host.top + 14) + 'px';
      const desc = v.gap < 0
        ? `overtakes by ${-v.gap} d`
        : `only ${v.gap} d behind (need ${v.minDays})`;
      tip.innerHTML =
        `<b>⚠ Buffer violation</b><br>${esc(v.succ.name)} vs ${esc(v.pred.name)}<br>` +
        `at CH ${formatCh(v.ch)}: ${desc}<br>short by ${short.toFixed(0)} d`;
    });
    path.addEventListener('mouseleave', () => { tip.hidden = true; });
    svg.appendChild(path);
  }
  const depBadge = document.getElementById('depCount');
  depBadge.textContent = viols.length;
  depBadge.hidden = viols.length === 0;

  // ----- access-window intrusion markers (on top of activities) -----
  let winN = 0;
  for (const wr of winResults) {
    for (const it of wr.intruders) {
      winN++;
      const x = xOf(it.ch), y = yOf(it.date), s = 5;
      const m = el('rect', { x: x - s, y: y - s, width: 2 * s, height: 2 * s, class: 'window-marker' });
      m.addEventListener('mousemove', (ev) => {
        const host = document.getElementById('chartHost').getBoundingClientRect();
        tip.hidden = false;
        tip.style.left = (ev.clientX - host.left + 14) + 'px';
        tip.style.top = (ev.clientY - host.top + 14) + 'px';
        tip.innerHTML =
          `<b>⛔ Works in blocked window</b><br>${esc(it.act.name)}<br>` +
          `inside “${esc(wr.w.label || 'window')}” near CH ${formatCh(it.ch)}`;
      });
      m.addEventListener('mouseleave', () => { tip.hidden = true; });
      svg.appendChild(m);
    }
  }
  const winBadge = document.getElementById('winCount');
  winBadge.textContent = winN;
  winBadge.hidden = winN === 0;

  // ----- legend -----
  const discs = Object.keys(disciplineColors);
  let lx = M.left + 6, ly = M.top + 6;
  const legend = el('g');
  legend.appendChild(el('rect', {
    x: lx - 4, y: ly - 4, rx: 5,
    width: 150, height: discs.length * 16 + 8, fill: 'rgba(20,26,33,.85)', stroke: '#2f3b47'
  }));
  discs.forEach((d, i) => {
    const yy = ly + i * 16 + 8;
    legend.appendChild(el('line', { x1: lx, y1: yy, x2: lx + 18, y2: yy, stroke: disciplineColors[d], 'stroke-width': 4 }));
    legend.appendChild(el('text', { x: lx + 24, y: yy + 3, class: 'legend-text' }, d));
  });
  if (discs.length) svg.appendChild(legend);

  if (!sched.length) {
    svg.appendChild(el('text', {
      x: M.left + innerW / 2, y: M.top + innerH / 2, class: 'axis-label', 'text-anchor': 'middle'
    }, 'Add activities to see the diagram'));
  }

  host.appendChild(svg);
}

// ---------- axis helpers ----------
function niceStep(span, target) {
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm < 1.5) step = 1; else if (norm < 3) step = 2; else if (norm < 7) step = 5; else step = 10;
  return step * mag;
}
function formatCh(ch) {
  const n = Math.round(ch);
  const km = Math.floor(n / 1000);
  const m = Math.abs(n % 1000).toString().padStart(3, '0');
  return `${km}+${m}`;
}
function niceTimeStep(totalDays, innerH) {
  // aim for a gridline roughly every ~50px
  const targetLines = Math.max(2, Math.floor(innerH / 50));
  const dayPer = totalDays / targetLines;
  if (dayPer <= 7) return { unit: 'week', n: 1 };
  if (dayPer <= 16) return { unit: 'week', n: 2 };
  if (dayPer <= 45) return { unit: 'month', n: 1 };
  if (dayPer <= 75) return { unit: 'month', n: 2 };
  if (dayPer <= 130) return { unit: 'month', n: 3 };
  return { unit: 'month', n: 6 };
}
function startOfStep(d, step) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  if (step.unit === 'week') {
    const dow = (r.getDay() + 6) % 7; // Monday=0
    return addDays(r, -dow);
  }
  return new Date(r.getFullYear(), r.getMonth(), 1);
}
function stepNext(d, step) {
  if (step.unit === 'week') return addDays(d, 7 * step.n);
  return new Date(d.getFullYear(), d.getMonth() + step.n, 1);
}
function fmtTimeTick(d, step) {
  if (step.unit === 'week') return `${d.getDate()}/${d.getMonth() + 1}`;
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
// Intersection point of two line segments a,b ({x1,y1,x2,y2}); null if they
// don't cross within both segments. Endpoint-only touches are ignored so that
// activities merely meeting at a shared chainage/date aren't flagged.
function segIntersect(a, b) {
  const r_x = a.x2 - a.x1, r_y = a.y2 - a.y1;
  const s_x = b.x2 - b.x1, s_y = b.y2 - b.y1;
  const denom = r_x * s_y - r_y * s_x;
  if (Math.abs(denom) < 1e-9) return null; // parallel / collinear
  const qp_x = b.x1 - a.x1, qp_y = b.y1 - a.y1;
  const t = (qp_x * s_y - qp_y * s_x) / denom;
  const u = (qp_x * r_y - qp_y * r_x) / denom;
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { x: a.x1 + t * r_x, y: a.y1 + t * r_y };
}

// ============================================================
//  Activity table UI
// ============================================================
function addActivity(data) {
  activities.push({
    id: nextId++,
    name: data.name || 'New activity',
    discipline: data.discipline || 'General',
    fromCH: data.fromCH != null ? data.fromCH : 0,
    toCH: data.toCH != null ? data.toCH : 1000,
    start: data.start || document.getElementById('projStart').value || '',
    mode: data.mode || 'rate',
    value: data.value != null ? data.value : 100
  });
}

function renderTable() {
  const body = document.getElementById('actBody');
  body.innerHTML = '';
  for (const act of activities) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-f="name" value="${esc(act.name)}" /></td>
      <td><input data-f="discipline" value="${esc(act.discipline)}" /></td>
      <td><input data-f="fromCH" type="number" step="any" value="${act.fromCH}" /></td>
      <td><input data-f="toCH" type="number" step="any" value="${act.toCH}" /></td>
      <td><input data-f="start" type="date" value="${act.start}" /></td>
      <td><select data-f="mode">
        <option value="rate" ${act.mode === 'rate' ? 'selected' : ''}>rate</option>
        <option value="date" ${act.mode === 'date' ? 'selected' : ''}>date</option>
      </select></td>
      <td><input data-f="value" ${act.mode === 'date' ? 'type="date"' : 'type="number" step="any"'} value="${act.value}" /></td>
      <td><button class="del-btn" title="Delete">&times;</button></td>
    `;
    tr.querySelectorAll('[data-f]').forEach(inp => {
      inp.addEventListener('input', () => {
        const f = inp.dataset.f;
        let v = inp.value;
        if (f === 'fromCH' || f === 'toCH') v = parseFloat(v);
        act[f] = v;
        if (f === 'mode') renderTable(); // swap value input type
        if (f === 'name') renderDepTable(); // keep dependency dropdowns in sync
        render();
      });
    });
    tr.querySelector('.del-btn').addEventListener('click', () => {
      activities = activities.filter(a => a.id !== act.id);
      deps = deps.filter(d => d.predId !== act.id && d.succId !== act.id);
      renderTable(); renderDepTable(); render();
    });
    body.appendChild(tr);
  }
}

// ---------- markers table ----------
function addMarker(data) {
  markers.push({ id: nextMkId++, ch: data.ch != null ? data.ch : 0, label: data.label || 'Marker' });
}
function renderMarkerTable() {
  const body = document.getElementById('mkBody');
  body.innerHTML = '';
  for (const mk of markers) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-f="ch" type="number" step="any" value="${mk.ch}" /></td>
      <td><input data-f="label" value="${esc(mk.label)}" /></td>
      <td><button class="del-btn" title="Delete">&times;</button></td>
    `;
    tr.querySelectorAll('[data-f]').forEach(inp => {
      inp.addEventListener('input', () => {
        const f = inp.dataset.f;
        mk[f] = f === 'ch' ? parseFloat(inp.value) : inp.value;
        render();
      });
    });
    tr.querySelector('.del-btn').addEventListener('click', () => {
      markers = markers.filter(m => m.id !== mk.id);
      renderMarkerTable(); render();
    });
    body.appendChild(tr);
  }
}

// ---------- dependencies table ----------
function addDep(data) {
  deps.push({
    id: nextDepId++,
    predId: data.predId != null ? data.predId : (activities[0] && activities[0].id),
    succId: data.succId != null ? data.succId : (activities[0] && activities[0].id),
    minDays: data.minDays != null ? data.minDays : 7
  });
}
function activityOptions(selectedId) {
  return activities.map(a =>
    `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${esc(a.name)}</option>`
  ).join('');
}
function renderDepTable() {
  const body = document.getElementById('depBody');
  body.innerHTML = '';
  for (const d of deps) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><select data-f="predId">${activityOptions(d.predId)}</select></td>
      <td><select data-f="succId">${activityOptions(d.succId)}</select></td>
      <td><input data-f="minDays" type="number" step="any" value="${d.minDays}" /></td>
      <td><button class="del-btn" title="Delete">&times;</button></td>
    `;
    tr.querySelectorAll('[data-f]').forEach(inp => {
      inp.addEventListener('input', () => {
        const f = inp.dataset.f;
        d[f] = f === 'minDays' ? parseFloat(inp.value) : parseInt(inp.value, 10);
        render();
      });
    });
    tr.querySelector('.del-btn').addEventListener('click', () => {
      deps = deps.filter(x => x.id !== d.id);
      renderDepTable(); render();
    });
    body.appendChild(tr);
  }
}
// Resolve a name-based sample dependency to current activity ids.
function resolveSampleDep(sd) {
  const byName = n => { const a = activities.find(x => x.name === n); return a && a.id; };
  const predId = byName(sd.pred), succId = byName(sd.succ);
  if (predId && succId) addDep({ predId, succId, minDays: sd.minDays });
}

// ---------- access windows table ----------
function addWindow(data) {
  windows.push({
    id: nextWinId++,
    fromCH: data.fromCH != null ? data.fromCH : 0,
    toCH: data.toCH != null ? data.toCH : 1000,
    start: data.start || '',
    end: data.end || '',
    label: data.label || 'Blocked'
  });
}
function renderWindowTable() {
  const body = document.getElementById('winBody');
  body.innerHTML = '';
  for (const w of windows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-f="fromCH" type="number" step="any" value="${w.fromCH}" /></td>
      <td><input data-f="toCH" type="number" step="any" value="${w.toCH}" /></td>
      <td><input data-f="start" type="date" value="${w.start}" /></td>
      <td><input data-f="end" type="date" value="${w.end}" /></td>
      <td><input data-f="label" value="${esc(w.label)}" /></td>
      <td><button class="del-btn" title="Delete">&times;</button></td>
    `;
    tr.querySelectorAll('[data-f]').forEach(inp => {
      inp.addEventListener('input', () => {
        const f = inp.dataset.f;
        w[f] = (f === 'fromCH' || f === 'toCH') ? parseFloat(inp.value) : inp.value;
        render();
      });
    });
    tr.querySelector('.del-btn').addEventListener('click', () => {
      windows = windows.filter(x => x.id !== w.id);
      renderWindowTable(); render();
    });
    body.appendChild(tr);
  }
}

// ============================================================
//  CSV import / export
// ============================================================
const CSV_COLS = ['name', 'discipline', 'fromCH', 'toCH', 'start', 'mode', 'value'];

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const idx = {};
  CSV_COLS.forEach(c => { idx[c] = header.indexOf(c.toLowerCase()); });
  // fall back to positional if no recognised header
  const hasHeader = CSV_COLS.some(c => idx[c] !== -1);
  const rows = [];
  const dataLines = hasHeader ? lines.slice(1) : lines;
  for (const line of dataLines) {
    const cells = splitCsvLine(line);
    const get = (c, pos) => hasHeader ? (idx[c] !== -1 ? cells[idx[c]] : '') : cells[pos];
    rows.push({
      name: (get('name', 0) || '').trim(),
      discipline: (get('discipline', 1) || 'General').trim(),
      fromCH: parseFloat(get('fromCH', 2)),
      toCH: parseFloat(get('toCH', 3)),
      start: (get('start', 4) || '').trim(),
      mode: (get('mode', 5) || 'rate').trim().toLowerCase() === 'date' ? 'date' : 'rate',
      value: (get('value', 6) || '').trim()
    });
  }
  return rows;
}
function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}
function toCSV() {
  const lines = [CSV_COLS.join(',')];
  for (const a of activities) {
    lines.push(CSV_COLS.map(c => {
      const v = a[c] == null ? '' : String(a[c]);
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','));
  }
  return lines.join('\n');
}

// ============================================================
//  Export SVG / PNG
// ============================================================
function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportSvg() {
  const svg = document.querySelector('#chartHost svg');
  if (!svg) return;
  const clone = svg.cloneNode(true);
  inlineStyles(clone, svg);
  const data = new XMLSerializer().serializeToString(clone);
  download('time-chainage.svg', new Blob([data], { type: 'image/svg+xml' }));
}
function exportPng() {
  const svg = document.querySelector('#chartHost svg');
  if (!svg) return;
  const clone = svg.cloneNode(true);
  inlineStyles(clone, svg);
  const w = svg.clientWidth || 800, h = svg.clientHeight || 600;
  const data = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  const svgBlob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale; canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0c1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(b => download('time-chainage.png', b));
    URL.revokeObjectURL(url);
  };
  img.src = url;
}
// copy computed styles inline so exported file is self-contained
function inlineStyles(clone, original) {
  const origNodes = original.querySelectorAll('*');
  const cloneNodes = clone.querySelectorAll('*');
  cloneNodes.forEach((node, i) => {
    const cs = getComputedStyle(origNodes[i]);
    const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray',
      'font-size', 'font-family', 'font-weight', 'text-anchor', 'stroke-linecap'];
    let style = '';
    props.forEach(p => { const v = cs.getPropertyValue(p); if (v) style += `${p}:${v};`; });
    node.setAttribute('style', style);
  });
}

// ============================================================
//  Wire up
// ============================================================
function init() {
  document.getElementById('projStart').value = '2026-07-01';

  document.getElementById('addRow').addEventListener('click', () => {
    addActivity({}); renderTable(); renderDepTable(); render();
  });
  document.getElementById('loadSample').addEventListener('click', () => {
    activities = []; nextId = 1;
    SAMPLE.forEach(addActivity);
    markers = []; nextMkId = 1;
    SAMPLE_MARKERS.forEach(addMarker);
    deps = []; nextDepId = 1;
    SAMPLE_DEPS.forEach(resolveSampleDep);
    windows = []; nextWinId = 1;
    SAMPLE_WINDOWS.forEach(addWindow);
    renderTable(); renderMarkerTable(); renderDepTable(); renderWindowTable(); render();
  });
  document.getElementById('addMarker').addEventListener('click', () => {
    addMarker({}); renderMarkerTable(); render();
  });
  document.getElementById('addDep').addEventListener('click', () => {
    addDep({}); renderDepTable(); render();
  });
  document.getElementById('addWindow').addEventListener('click', () => {
    addWindow({}); renderWindowTable(); render();
  });
  document.getElementById('csvInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCSV(reader.result);
      activities = []; nextId = 1;
      rows.forEach(addActivity);
      deps = deps.filter(d =>
        activities.some(a => a.id === d.predId) && activities.some(a => a.id === d.succId));
      renderTable(); renderDepTable(); render();
    };
    reader.readAsText(file);
    e.target.value = '';
  });
  document.getElementById('exportCsv').addEventListener('click', () => {
    download('activities.csv', new Blob([toCSV()], { type: 'text/csv' }));
  });
  document.getElementById('exportSvg').addEventListener('click', exportSvg);
  document.getElementById('exportPng').addEventListener('click', exportPng);

  ['projStart', 'timeDir', 'chStart', 'chEnd', 'chUnits', 'skipWeekends', 'showClashes'].forEach(id => {
    document.getElementById(id).addEventListener('input', render);
  });
  window.addEventListener('resize', render);

  // start with sample data so the user sees something immediately
  SAMPLE.forEach(addActivity);
  SAMPLE_MARKERS.forEach(addMarker);
  SAMPLE_DEPS.forEach(resolveSampleDep);
  SAMPLE_WINDOWS.forEach(addWindow);
  renderTable();
  renderMarkerTable();
  renderDepTable();
  renderWindowTable();
  render();
}

document.addEventListener('DOMContentLoaded', init);

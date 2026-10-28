// faces.js — controls drawn as the instrument has them. A parameter with `face` is drawn in the
// Controls panel as:
//   on a checkbox  'drawknob' (a pipe organ's or a harmonium's stop), 'lever' (a harpsichord's hand
//                  stop), 'tab' (a Clavinet's rocker) or 'toggle' (an apparatus's bat-handle switch,
//                  with a pilot lamp);
//   on a slider    'knob' (an amp's) or 'dial' (a lab supply's knurled knob over a printed scale,
//                  its value in a readout);
//   on a dropdown  'selector' (a pointer knob that clicks between engraved positions) or 'rockers'
//                  (a bank of rocker tabs, one down at a time).
// The page's own input stays, out of sight, for the keyboard and screen readers; the face follows
// it (dress() returns { show } for the page to call when the value changes, which a plain slider
// has too: it lights the fader's slot up to the value). Forte's own console gets faces on every
// page: Output's Room is a knob and its Venue a selector (BY_ID). `pedal: true` on a checkbox above
// the keys draws it as a pedal (shared/layout.js). Styled in shared/layout.css.

const BY_ID = { room: 'knob', venue: 'selector' };
export const faceOf = (p) => p.face ?? BY_ID[p.id];

// a face's name: the label without its explanation, "(…)", or the name on the instrument
const faceName = (p) => p.faceLabel ?? p.label.replace(/\s*\([^()]*\)\s*$/, '');
// an engraved legend: the option's name up to its explanation ("Waveguide", not "Waveguide (TE₁₁)")
const legend = (name) => name.replace(/\s*[(:,·].*$/, '').trim() || name;

// Give a parameter's .param its face, once the page has built it: wrap holds its label and input
// (and, for a slider, the .row with the .val). reset() puts the default back (two taps on a knob);
// toSlider(p, v) is the page's map from value to the 0–1000 slider, for where a knob's ring starts.
export function dress(wrap, p, input, { reset = () => {}, toSlider = null } = {}) {
  if (p.pedal) wrap.dataset.pedal = '';
  // a slider is a fader whose slot lights from its left end to the cap (--fill)
  const fill = () => input.style.setProperty('--fill', `${+input.value / 10}%`);
  if (input?.type === 'range') { input.addEventListener('input', fill); fill(); }
  const face = faceOf(p);
  if (!face || !input) return input?.type === 'range' ? { show: fill } : null;
  wrap.dataset.face = face;
  const name = faceName(p), lab = wrap.querySelector('label');
  if (lab && name !== p.label) { lab.textContent = name; lab.title = p.label; input.setAttribute('aria-label', p.label); }
  if (face === 'knob' || face === 'dial') {
    const zero = toSlider && p.min < 0 && p.max > 0 ? toSlider(p, 0) / 1000 : 0;
    const k = rotaryKnob(input, reset, zero, face);
    wrap.insertBefore(k.el, wrap.firstChild);
    return { el: k.el, show: () => { fill(); k.show(); } };
  }
  if (face === 'selector' || face === 'rockers') {
    const labels = p.shortLabels ?? p.options.map(([, n]) => legend(n));
    const pick = (i) => {
      if (i === input.selectedIndex) return;
      input.selectedIndex = i;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const s = face === 'selector' ? rotarySelector(labels, pick) : rockerBank(labels, pick);
    s.el.setAttribute('aria-hidden', 'true'); // the dropdown, out of sight, is the control
    wrap.insertBefore(s.el, wrap.firstChild);
    const show = () => s.show(input.selectedIndex);
    show();
    return { el: s.el, show };
  }
  if (face === 'toggle' && lab) {
    const t = document.createElement('span');
    t.className = 'forte-toggle';
    t.setAttribute('aria-hidden', 'true');
    t.innerHTML = '<span class="on-l">ON</span><span class="lamp"></span><span class="nut"></span><span class="bat"></span><span class="off-l">OFF</span>';
    lab.prepend(t);
  }
  return null; // the checkboxes' faces are their label, restyled
}

// A knob for a range input (0–1000, as the pages build them): drag up or right to turn it (Shift
// for fine), a double click or tap goes back to the default. show() follows the input's value;
// zero (0–1) is where on the slider the ring starts to light. kind 'dial' draws a lab dial: a
// knurled knob over a printed scale whose ticks light up to the value.
export function rotaryKnob(input, reset, zero = 0, kind = 'knob') {
  const el = document.createElement('div');
  el.className = kind === 'dial' ? 'forte-knob forte-dial' : 'forte-knob';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="forte-knob-cap"><span class="forte-knob-mark"></span></div>';
  const ticks = [];
  if (kind === 'dial') {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    for (let i = 0; i <= 30; i++) {
      const a = ((-135 + i * 9) * Math.PI) / 180, major = i % 10 === 0, r0 = major ? 39 : 42.5;
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', 50 + r0 * Math.sin(a)); l.setAttribute('y1', 50 - r0 * Math.cos(a));
      l.setAttribute('x2', 50 + 48 * Math.sin(a)); l.setAttribute('y2', 50 - 48 * Math.cos(a));
      if (major) l.setAttribute('class', 'major');
      svg.appendChild(l); ticks.push(l);
    }
    el.prepend(svg);
  }
  // the ring lights from the zero (the left end, or the middle of a cut-and-boost EQ) to the value
  const show = () => {
    const t = +input.value / 1000, at = t * 270, from = zero * 270;
    el.style.setProperty('--turn', `${at - 135}deg`);
    el.style.setProperty('--a0', `${Math.min(at, from)}deg`);
    el.style.setProperty('--a1', `${Math.max(at, from)}deg`);
    ticks.forEach((l, i) => l.classList.toggle('lit', i / 30 >= Math.min(t, zero) - 1e-9 && i / 30 <= Math.max(t, zero) + 1e-9));
  };
  input.addEventListener('input', show);
  let drag = null, tapped = 0;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* gone */ }
    drag = { x: e.clientX, y: e.clientY, v: +input.value };
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const d = (e.clientX - drag.x - (e.clientY - drag.y)) * (e.shiftKey ? 1 : 5);
    const v = Math.max(0, Math.min(1000, Math.round(drag.v + d)));
    if (v === +input.value) return;
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, (e) => {
    const still = drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3;
    drag = null;
    if (!still || ev === 'pointercancel') return;
    const now = performance.now();
    if (now - tapped < 400) { tapped = 0; reset(); show(); } else tapped = now; // two taps: the default
  });
  show();
  return { el, show };
}

// A rotary selector: a pointer knob over engraved positions, as on an organ's vibrato or a
// receiver's front panel. Click a legend to go there, click the knob to step round, or drag it.
// pick(i) is called with the position chosen; show(i) turns the knob to i.
export function rotarySelector(labels, pick) {
  const n = labels.length, span = n === 2 ? 70 : Math.min(240, 50 * (n - 1));
  const ang = (i) => (n === 1 ? 0 : -span / 2 + (i * span) / (n - 1));
  const el = document.createElement('div');
  el.className = 'forte-selector';
  const knob = document.createElement('div');
  knob.className = 'forte-selector-knob';
  // the box is 156 × 104 px with the knob's centre at (78, 62); dots ring it, legends outside them
  const cx = 78, cy = 62, dots = [], legs = [];
  labels.forEach((t, i) => {
    const a = (ang(i) * Math.PI) / 180, s = Math.sin(a), c = Math.cos(a);
    const dot = document.createElement('i');
    dot.style.left = `${cx + 36 * s}px`; dot.style.top = `${cy - 36 * c}px`;
    const leg = document.createElement('span');
    leg.className = 'forte-selector-legend';
    leg.textContent = t;
    leg.style.left = `${cx + (54 + 10 * Math.abs(s)) * s}px`; leg.style.top = `${cy - 50 * c}px`;
    leg.addEventListener('click', () => pick(i));
    el.append(dot, leg); dots.push(dot); legs.push(leg);
  });
  el.appendChild(knob);
  let at = 0, drag = null;
  const show = (i) => {
    at = Math.max(0, i);
    knob.style.setProperty('--turn', `${ang(at)}deg`);
    dots.forEach((d, j) => d.classList.toggle('on', j === at));
    legs.forEach((l, j) => l.classList.toggle('on', j === at));
  };
  knob.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { knob.setPointerCapture(e.pointerId); } catch { /* gone */ }
    drag = { x: e.clientX, y: e.clientY, moved: false };
  });
  knob.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
    drag.moved = true;
    const r = el.getBoundingClientRect(), a = (Math.atan2(e.clientX - r.left - cx, r.top + cy - e.clientY) * 180) / Math.PI;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(ang(i) - a) < Math.abs(ang(best) - a)) best = i;
    if (best !== at) pick(best);
  });
  knob.addEventListener('pointerup', () => { if (drag && !drag.moved) pick((at + 1) % n); drag = null; });
  knob.addEventListener('pointercancel', () => { drag = null; });
  show(0);
  return { el, knob, show };
}

// A bank of rocker tabs, one down at a time (a Clavinet's pickup selector beside its tone tabs).
function rockerBank(labels, pick) {
  const el = document.createElement('div');
  el.className = 'forte-rockers';
  const tabs = labels.map((t, i) => {
    const b = document.createElement('span');
    b.textContent = t;
    b.addEventListener('click', () => pick(i));
    el.appendChild(b);
    return b;
  });
  return { el, show: (i) => tabs.forEach((b, j) => b.classList.toggle('on', j === i)) };
}

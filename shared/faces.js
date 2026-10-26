// faces.js — controls drawn as the instrument has them. A parameter with `face` (shell.js gives
// the .param data-face) is a drawknob ('drawknob': a pipe organ's or a harmonium's stop), a hand
// stop ('lever': a harpsichord's), a rocker tab ('tab': a Clavinet's) or an amp's knob ('knob'). The
// first three are the page's checkbox, restyled (shared/layout.css); a knob is the page's range
// input, kept for the keyboard and screen readers, under a knob that turns with it.

// A knob for a range input (0–1000, as shell.js builds them): drag up or right to turn it (Shift
// for fine), a double click or tap goes back to the default. show() follows the input's value;
// zero (0–1) is where on the slider the ring starts to light.
export function rotaryKnob(input, reset, zero = 0) {
  const el = document.createElement('div');
  el.className = 'forte-knob';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="forte-knob-cap"><span class="forte-knob-mark"></span></div>';
  // the ring lights from the zero (the left end, or the middle of a cut-and-boost EQ) to the value
  const show = () => {
    const at = (+input.value / 1000) * 270, from = zero * 270;
    el.style.setProperty('--turn', `${at - 135}deg`);
    el.style.setProperty('--a0', `${Math.min(at, from)}deg`);
    el.style.setProperty('--a1', `${Math.max(at, from)}deg`);
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

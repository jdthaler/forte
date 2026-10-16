// focus.js — who gets a key press: the focused control, or the instrument.
//
// A control reached with Tab keeps the keys it uses natively: Space toggles a
// checkbox or presses a button, the arrows move a slider or step through a list.
// A control last touched with the mouse or a finger gives those keys back to
// the instrument, so after a drag or a pick from a menu the arrows still move
// the octave and the velocity, and Space still works the pedal. Every page's
// window key handler asks `controlOwns(e)` first and leaves the key alone when
// it says so.

const byPointer = new WeakSet();
let lastPointer = -Infinity, lastKey = -Infinity;

if (typeof document !== 'undefined') {
  // capture, so these run before any handler that moves the focus itself
  document.addEventListener('pointerdown', () => {
    lastPointer = performance.now();
    // whatever holds the focus once this press is over was last touched by the pointer,
    // including a control that already had it (and one left focused while playing the keys)
    setTimeout(() => { const a = document.activeElement; if (a && a !== document.body) byPointer.add(a); }, 0);
  }, true);
  document.addEventListener('keydown', () => { lastKey = performance.now(); }, true);
  document.addEventListener('focusin', (e) => {
    if (lastPointer > lastKey) byPointer.add(e.target);
    else byPointer.delete(e.target);
  }, true);
}

/** Was this element focused, or last touched, by the mouse or a finger (not by Tab)? */
export const focusedByPointer = (el) => byPointer.has(el);

const SPACE_TAKERS = 'input[type=checkbox], input[type=radio], button, summary, select, [role=button], [role=switch], [role=tab]';
const ARROW_TAKERS = 'input[type=range], select, [role=slider]';
const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

/** Should the instrument leave this key to the focused control? */
export function controlOwns(e) {
  const t = e.target;
  if (!t?.matches || focusedByPointer(t)) return false;
  if (e.code === 'Space') return t.matches(SPACE_TAKERS);
  if (ARROWS.has(e.code)) return t.matches(ARROW_TAKERS);
  return false;
}

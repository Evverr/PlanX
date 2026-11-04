/**
 * "Кнопка T": on the selection panel of something with text, a T that turns the panel into the text
 * panel (its font and text), till the next press on the board. The one panel turns into the other:
 * what was on it fades out, the panel's body slides and stretches to the other's place and size, and
 * what's on that fades in.
 */

/** How long the panel's body takes to turn into the other's, in ms. */
const MORPH = 200;

/** Where an element would stand with its animations done (its coming in, sliding up, not counted). */
function settledRect(el: HTMLElement): DOMRect {
  const anims = el.getAnimations(), was = anims.map((a) => a.currentTime);
  anims.forEach((a) => { a.currentTime = Number(a.effect?.getComputedTiming().endTime ?? 0); });
  const r = el.getBoundingClientRect();
  anims.forEach((a, i) => { a.currentTime = was[i]; });
  return r;
}

/**
 * The panel `from` (a selector) turning into the one `to` comes in as: call it just before the switch.
 * A body like theirs goes from the one's box to the other's while both show only what's on them.
 */
export function morphPanel(from: string, to: string): void {
  const a = document.querySelector<HTMLElement>(`${from}:not(.gone):not(.leaving)`);
  if (!a) return;
  const r = a.getBoundingClientRect(), cs = getComputedStyle(a);
  a.dataset.morph = '';
  const shell = document.createElement('div');
  shell.className = 'panel-shell';
  Object.assign(shell.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: cs.borderRadius });
  document.body.append(shell);
  // The other one, once it's there.
  let tries = 0;
  const find = () => {
    const b = document.querySelector<HTMLElement>(`${to}:not(.gone):not(.leaving):not([data-morph])`);
    if (!b) { if (++tries < 10) requestAnimationFrame(find); else shell.remove(); return; }
    b.dataset.morph = '';
    const q = settledRect(b);
    shell.style.borderRadius = getComputedStyle(b).borderRadius;
    Object.assign(shell.style, { left: `${q.left}px`, top: `${q.top}px`, width: `${q.width}px`, height: `${q.height}px` });
    setTimeout(() => { delete b.dataset.morph; shell.remove(); }, MORPH + 20);
  };
  requestAnimationFrame(find);
}

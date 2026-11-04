/**
 * "Кнопка T": on the selection panel of something with text, a T that turns the panel into the text
 * panel (its font and text), till the next press on the board. It stays the one panel where it is:
 * what's on it fades out, then it takes the other's width, then what's on that fades in.
 */

/** How long what's on the panel takes to fade out, the panel to take the new width, and the new
 *  buttons to fade in, in ms. */
const OUT = 120, WIDEN = 200, IN = 160;

let busy = false;

/** Where an element would stand with its animations done (its coming in, sliding up, not counted). */
function settledRect(el: HTMLElement): DOMRect {
  const anims = el.getAnimations(), was = anims.map((a) => a.currentTime);
  anims.forEach((a) => { a.currentTime = Number(a.effect?.getComputedTiming().endTime ?? 0); });
  const r = el.getBoundingClientRect();
  anims.forEach((a, i) => { a.currentTime = was[i]; });
  return r;
}

/**
 * The panel `from` (a selector) turning into the one that `swap` brings ('tfmt' the text panel,
 * 'panel' the selection panel), standing where it stands. While it goes on, a body like theirs
 * (.panel-shell) stands in for both, and they show only what's on them (see labs.css).
 */
export function morphPanel(from: string, to: 'tfmt' | 'panel', swap: () => void): void {
  const a = document.querySelector<HTMLElement>(`${from}:not(.gone):not(.leaving)`);
  if (!a || busy) { swap(); return; }
  busy = true;
  const root = document.documentElement, r = a.getBoundingClientRect();
  const shell = document.createElement('div');
  shell.className = 'panel-shell';
  Object.assign(shell.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  document.body.append(shell);
  // What's on it fades out, and stays out whatever it does as it goes (its own going away, its ghost).
  a.dataset.morph = '';
  a.dataset.morphOut = '';
  const done = () => { shell.remove(); delete root.dataset.morphIn; busy = false; };
  setTimeout(() => {
    // The other comes in unseen (see labs.css), and the body takes its width.
    root.dataset.morphIn = to;
    swap();
    let tries = 0;
    const find = () => {
      const b = document.querySelector<HTMLElement>(to === 'tfmt' ? '.tfmt:not(.gone):not(.leaving)' : '.bar.panel:not(.gone)');
      if (!b) { if (++tries < 10) requestAnimationFrame(find); else done(); return; }
      b.dataset.morph = '';
      // The body follows its width each frame as it finds it (a panel measures what fits it, and may
      // again as the other one goes); what's on it fades in once that's held still the body's whole
      // way there. (The two are alike but for their width: only that changes.)
      let last = '', since = performance.now();
      const t0 = since;
      const follow = () => {
        const q = settledRect(b), now = `${Math.round(q.left)}|${Math.round(q.width)}`, t = performance.now();
        if (now !== last) {
          last = now;
          since = t;
          Object.assign(shell.style, { left: `${q.left}px`, width: `${q.width}px` });
        }
        if (t - since < WIDEN && t - t0 < 1000) { requestAnimationFrame(follow); return; }
        reveal();
      };
      const reveal = () => {
        // What's on it fades in; then it's itself again.
        b.style.opacity = '0';
        delete root.dataset.morphIn;
        void b.offsetWidth;
        b.style.transition = `opacity ${IN}ms ease`;
        b.style.opacity = '1';
        setTimeout(() => {
          b.style.transition = '';
          b.style.opacity = '';
          delete b.dataset.morph;
          done();
        }, IN + 10);
      };
      follow();
    };
    requestAnimationFrame(find);
  }, OUT);
}

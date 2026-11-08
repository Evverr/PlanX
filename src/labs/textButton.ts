import { layerRoot } from './sideViewport';
/**
 * "Кнопка T": on the selection panel of something with text, a T that turns the panel into the text
 * panel (its font and text), till the next press on the board. It stays the one panel where it is:
 * what's on it fades out, then it takes the other's width, then what's on that fades in.
 */

/** How long what's on the panel takes to fade out, the panel to take the new width, and the new
 *  buttons to fade in, in ms (the first two in labs.css too). */
const OUT = 70, WIDEN = 200, IN = 120;

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
  grow(a, a.getBoundingClientRect(), to, swap);
}

/**
 * The same, once one panel's already given way to the other (by what's typed in starting or ending, say):
 * from where the one stood (`r`), the other coming in unseen as it comes, then its buttons fading in. So
 * the text panel and the selection panel turn into one another rather than one going and the other coming.
 */
export function morphFrom(r: DOMRect | null, to: 'tfmt' | 'panel'): void {
  if (!r || busy) return;
  busy = true;
  // (Unseen at once, before it's drawn: see labs.css.)
  document.documentElement.dataset.morphIn = to;
  grow(null, r, to, () => {});
}

function grow(a: HTMLElement | null, r: DOMRect, to: 'tfmt' | 'panel', swap: () => void): void {
  const root = document.documentElement;
  const shell = document.createElement('div');
  shell.className = 'panel-shell';
  // (Its shadow too: the main panels at the window's edges have one of their own.)
  Object.assign(shell.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, boxShadow: a ? getComputedStyle(a).boxShadow : 'var(--panel-shadow)' });
  layerRoot().append(shell);
  // What's on it fades out, and stays out whatever it does as it goes (its own going away, its ghost).
  if (a) { a.dataset.morph = ''; a.dataset.morphOut = ''; }
  const done = () => { shell.remove(); delete root.dataset.morphIn; busy = false; };
  setTimeout(() => {
    // The other comes in unseen (see labs.css), and the body takes its width.
    root.dataset.morphIn = to;
    swap();
    let tries = 0;
    const find = () => {
      const b = document.querySelector<HTMLElement>(to === 'tfmt' ? '.tfmt:not(.gone):not(.leaving)' : '.bar.panel:not(.gone)');
      if (!b) { if (++tries < 10) requestAnimationFrame(find); else done(); return; }
      shell.style.boxShadow = getComputedStyle(b).boxShadow;
      b.dataset.morph = '';
      // Its usual coming in (with a slide) is off for good: it only fades in, below.
      b.getAnimations().forEach((a) => a.cancel());
      // The body follows where it stands and its size each frame as it finds them (a panel measures what
      // fits it, and may again as the other one goes), gliding there (labs.css); what's on it fades in
      // once that's held still the body's whole way there. (The text panel over what's picked, the
      // selection panel at the bottom: the body glides from one to the other.)
      let last = '', since = performance.now();
      const t0 = since;
      const follow = () => {
        const q = settledRect(b), now = `${Math.round(q.left)}|${Math.round(q.top)}|${Math.round(q.width)}|${Math.round(q.height)}`, t = performance.now();
        if (now !== last) {
          last = now;
          since = t;
          Object.assign(shell.style, { left: `${q.left}px`, top: `${q.top}px`, width: `${q.width}px`, height: `${q.height}px` });
        }
        if (t - since < WIDEN && t - t0 < 1000) { requestAnimationFrame(follow); return; }
        reveal();
      };
      const reveal = () => {
        // What's on it fades in; then it's itself again. (Its own coming in, a slide up, never played: off
        // for good on it, as it'd start again once it's no longer held back.)
        b.style.animation = 'none';
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

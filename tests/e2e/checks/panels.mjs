// The three main panels: moved and resized by their edges, never over one another, kept or put
// back from the board menu.
import { expect, sleep } from '../lib.mjs';

const cursor = (p, q) => p.ev(`getComputedStyle(document.querySelector('${q}')).cursor`);

export const checks = {
  async 'an edge shows its cursor after half a second, then at once on every panel'(p) {
    const top = await p.edge('.tools', 'top');
    await p.mouse('mouseMoved', top[0], top[1] + 30);
    await p.mouse('mouseMoved', ...top);
    await sleep(200);
    expect(await cursor(p, '.tools'), 'rail cursor at 0.2 s').toBe('auto');
    await sleep(450);
    expect(await cursor(p, '.tools'), 'rail cursor at 0.65 s').toBe('move');
    await p.mouse('mouseMoved', 600, 400);
    await sleep(800);
    await p.mouse('mouseMoved', ...(await p.edge('.bar.zoom', 'left')));
    await sleep(50);
    expect(await cursor(p, '.bar.zoom'), 'zoom bar left edge right after').toBe('move');
    await p.mouse('mouseMoved', ...(await p.edge('.bar.zoom', 'right')));
    await sleep(50);
    expect(await cursor(p, '.bar.zoom'), 'zoom bar right edge right after').toBe('ew-resize');
  },

  async 'the rail moves up and over to the right, keeping its length'(p) {
    // (Up, to keep clear of the zoom bar in the lower right; with the trial features' rail, which
    // stands at the right edge, switched off.)
    await p.ev(`localStorage.setItem('planx-labs', JSON.stringify(['export', 'pdf', 'tidy', 'search', 'timer', 'laser', 'follow', 'cursors', 'keys']))`);
    await p.reload();
    const before = await p.rail(), r0 = await p.rect('.tools');
    await p.dragEdge('.tools', 'top', 1000, -60);
    const r = await p.rect('.tools');
    expect(r.r, 'rail right edge').toBe(1200 - 12);
    expect(r.t, 'rail top').toBeNear(r0.t - 60, 2);
    expect((await p.rail()).n, 'buttons on the rail').toBe(before.n);
  },

  async 'the top bar goes to the bottom, level with the zoom bar'(p) {
    await p.dragEdge('.topbar', 'left', 100, 740);
    const top = await p.rect('.topbar'), zoom = await p.rect('.bar.zoom');
    expect(top.b, 'top bar bottom').toBe(800 - 12);
    expect(zoom.b, 'zoom bar bottom').toBe(800 - 12);
  },

  async 'panels are never put over one another'(p) {
    await p.dragEdge('.topbar', 'left', 900, 740);
    const top = await p.rect('.topbar'), zoom = await p.rect('.bar.zoom');
    const apart = top.r + 12 <= zoom.l || top.b + 12 <= zoom.t || top.t >= zoom.b + 12;
    expect(apart, 'top bar clear of the zoom bar').toBeTruthy();
  },

  async 'the zoom bar: its left end moves it, its right end shortens it'(p) {
    const z0 = await p.rect('.bar.zoom');
    await p.dragEdge('.bar.zoom', 'right', -160, 0);
    const z1 = await p.rect('.bar.zoom');
    expect(z1.l, 'left end held').toBe(z0.l);
    expect(z1.w, 'shorter').toBeAtMost(z0.w - 100);
    expect(await p.ev(`!!document.querySelector('.bar.zoom > .more-wrap')`), '"more" button').toBeTruthy();
    await p.dragEdge('.bar.zoom', 'left', -200, 0);
    expect((await p.rect('.bar.zoom')).l, 'moved left').toBeNear(z1.l - 200, 2);
  },

  async 'the rail shortens a button at a time, and back to full'(p) {
    await p.open(1500, 1000, 1.6);
    const full = await p.rail();
    expect(full.more, 'all on the rail at first').toBeFalsy();
    await p.dragEdge('.tools', 'bottom', 0, -250);
    const short = await p.rail();
    expect(short.more, '"more" once shorter').toBeTruthy();
    expect(short.n, 'fewer buttons').toBeAtMost(full.n - 4);
    await p.dragEdge('.tools', 'bottom', 0, 600);
    const back = await p.rail();
    expect(back.n, 'all back').toBe(full.n);
    expect(back.more, 'no "more" when full').toBeFalsy();
  },

  async 'moving the rail keeps how many buttons it shows'(p) {
    await p.open(1200, 700);
    const n = (await p.rail()).n;
    const a = await p.edge('.tools', 'top');
    await p.mouse('mouseMoved', a[0], a[1] + 30);
    await p.mouse('mouseMoved', ...a);
    await sleep(650);
    await p.mouse('mousePressed', ...a);
    for (let i = 1; i <= 20; i++) {
      await p.mouse('mouseMoved', a[0], a[1] + (i <= 10 ? 20 * i : 400 - 20 * i));
      await sleep(30);
      expect((await p.rail()).n, `buttons at step ${i}`).toBe(n);
    }
    await p.mouse('mouseReleased', ...a);
  },

  async 'panels are kept by "save", put back by "reset", and the reset undone'(p) {
    await p.dragEdge('.tools', 'top', 0, 80);
    const moved = (await p.rect('.tools')).t;
    await p.menu('Сохранить панели');
    await p.reload();
    expect((await p.rect('.tools')).t, 'kept after reload').toBe(moved);
    await p.menu('Сбросить панели');
    await sleep(300);
    const reset = (await p.rect('.tools')).t;
    expect(reset < moved, 'put back').toBeTruthy();
    await p.key('z', 'KeyZ', 90, 2);
    await sleep(300);
    expect((await p.rect('.tools')).t, 'undone with Ctrl+Z').toBe(moved);
  },

  async '"reset" also unsticks the panels from the edges, and its undo sticks them back'(p) {
    await p.ev(`document.querySelector('.dock-chevron').closest('button').click()`);
    await sleep(400);
    expect((await p.rect('.topbar')).t, 'stuck to the top').toBe(0);
    await p.menu('Сбросить панели');
    await sleep(400);
    expect((await p.rect('.topbar')).t, 'unstuck').toBe(12);
    await p.key('z', 'KeyZ', 90, 2);
    await sleep(400);
    expect((await p.rect('.topbar')).t, 'stuck again').toBe(0);
  },

  async 'the zoom bar slides to the edge when stuck, not stretching on the way'(p) {
    const heights = [];
    await p.ev(`document.querySelector('.dock-chevron').closest('button').click()`);
    for (let i = 0; i < 8; i++) { heights.push((await p.rect('.bar.zoom')).h); await sleep(30); }
    expect(heights.every((h) => h === 52), `its height on the way: ${heights}`).toBeTruthy();
    expect((await p.rect('.bar.zoom')).b, 'down at the edge').toBe(800);
  },

  async 'a bar beside the rail moves with it when the panels come off the edges'(p) {
    // Stuck to the edges: the rail low on the left, the top bar at the bottom 12px right of it.
    await p.ev(`localStorage.setItem('planx-dock-panels', '1'); localStorage.setItem('planx-tools-top', '400');
      localStorage.setItem('planx-topbar-low', '1'); localStorage.setItem('planx-topbar-x', '72')`);
    await p.reload();
    await sleep(400);
    const rail0 = await p.rect('.tools'), top0 = await p.rect('.topbar');
    expect(top0.l - rail0.r, 'stuck: 12px between them').toBe(12);
    await p.ev(`document.querySelector('.dock-chevron').closest('button').click()`);
    await sleep(500);
    const rail = await p.rect('.tools'), top = await p.rect('.topbar');
    expect(rail.l, 'the rail off the edge').toBe(12);
    expect(top.l - rail.r, 'still 12px between them').toBe(12);
  },

  async 'unsaved moves are gone after a reload'(p) {
    const t0 = (await p.rect('.tools')).t;
    await p.dragEdge('.tools', 'top', 0, 80);
    await p.reload();
    expect((await p.rect('.tools')).t, 'rail back where it was').toBe(t0);
  },

  async 'as the window is resized, the zoom bar keeps to its corner at once, without gliding'(p) {
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
    await sleep(30);
    const z = await p.rect('.bar.zoom');
    expect(await p.ev(`getComputedStyle(document.querySelector('.bar.zoom')).transitionDuration.split(',').every((d) => parseFloat(d) === 0)`), 'no gliding while resizing').toBe(true);
    expect(z.r, 'right away at the right edge').toBeNear(1000 - 12, 2);
    expect(z.b, 'and at the bottom').toBeNear(700 - 12, 2);
    await sleep(400);
    expect(await p.ev(`document.documentElement.dataset.resizing === undefined`), 'glides again after').toBe(true);
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  },
};

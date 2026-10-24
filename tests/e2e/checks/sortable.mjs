// Panel buttons rearranged by holding and dragging them: along a panel, in its "more" popover, and
// from one to the other, never left hanging mid-air.
import { expect, sleep } from '../lib.mjs';

const moreKeys = (p, pop) => p.ev(`[...document.querySelectorAll('${pop} [data-more-key]')].map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.moreKey, Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })`);
const mainKeys = (p, bar) => p.ev(`[...document.querySelector('${bar}').querySelectorAll(':scope > [data-key]')].map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.key, Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })`);
const settled = (p) => p.ev(`({
  moved: [...document.querySelectorAll('[data-key], [data-more-key]')].filter((e) => e.style.transform).length,
  lifted: document.querySelectorAll('.lifted').length, ghost: document.querySelectorAll('.pick-ghost').length,
  sorting: document.querySelectorAll('.sorting').length })`);

/** Holds a button, then drags it along these points and lets go. */
async function carry(p, from, path) {
  await p.mouse('mouseMoved', ...from);
  await p.mouse('mousePressed', ...from);
  await sleep(300);
  let cur = from;
  for (const to of path) {
    for (let i = 1; i <= 12; i++) {
      await p.mouse('mouseMoved', cur[0] + ((to[0] - cur[0]) * i) / 12, cur[1] + ((to[1] - cur[1]) * i) / 12);
      await sleep(25);
    }
    cur = to;
    await sleep(120);
  }
  await p.mouse('mouseReleased', ...cur);
  await sleep(500);
}

export const checks = {
  async 'rail buttons rearrange along the rail'(p) {
    const k0 = await mainKeys(p, '.tools');
    const from = k0.find((k) => k[0] === 'sticky'), to = k0.find((k) => k[0] === 'task');
    await carry(p, from.slice(1), [to.slice(1)]);
    const k1 = (await mainKeys(p, '.tools')).map((k) => k[0]);
    // Brought to the task's middle, it passes the two before it (text and shapes), not the task.
    expect(k1.indexOf('sticky') - k0.findIndex((k) => k[0] === 'sticky'), 'sticky moved down two places').toBe(2);
    expect((await settled(p)).moved, 'nothing left shifted').toBe(0);
    await p.reload();
    expect((await mainKeys(p, '.tools')).map((k) => k[0]).join(), 'kept after reload').toBe(k1.join());
  },

  async 'top bar buttons rearrange along the bar'(p) {
    const k0 = await mainKeys(p, '.topbar');
    const from = k0.find((k) => k[0] === 'undo'), to = k0.find((k) => k[0] === 'new');
    await carry(p, from.slice(1), [to.slice(1)]);
    const k1 = (await mainKeys(p, '.topbar')).map((k) => k[0]);
    expect(k1.indexOf('undo') < k0.findIndex((k) => k[0] === 'undo'), 'undo moved left').toBeTruthy();
  },

  async 'a rail button dragged onto the board makes its item there'(p) {
    const from = await p.at('.tools [data-key="sticky"]');
    await carry(p, from, [[500, 300], [600, 400]]);
    expect(await p.ev(`planx.board.list().filter((i) => i.type === 'sticky').length`), 'a sticky made').toBe(1);
    expect((await mainKeys(p, '.tools')).some((k) => k[0] === 'sticky'), 'the button back on the rail').toBeTruthy();
    expect((await settled(p)).ghost, 'no preview left').toBe(0);
  },

  async 'holding the shapes button opens its variants, a click picks the tool'(p) {
    const oval = await p.at('.tools [data-key="oval"]');
    await p.mouse('mouseMoved', ...oval);
    await p.mouse('mousePressed', ...oval);
    await sleep(400);
    await p.mouse('mouseReleased', ...oval);
    await sleep(200);
    expect(!!(await p.rect('.shape-panel')), 'shapes open').toBeTruthy();
    await p.click(await p.at('.tools [data-key="text"]'));
    expect(await p.ev(`planx.editor.getUI().tool`), 'a click picks the text tool').toBe('text');
  },

  async 'buttons in the rail\'s "more" column rearrange'(p) {
    await p.open(700, 420);
    await p.click(await p.at('.tools > button[aria-label="Ещё"]'));
    const k0 = await moreKeys(p, '.tools-more');
    await carry(p, k0[0].slice(1), [k0[2].slice(1)]);
    const k1 = (await moreKeys(p, '.tools-more')).map((k) => k[0]);
    expect(k1.indexOf(k0[0][0]), 'first one moved to third').toBe(2);
    expect((await settled(p)).moved, 'nothing left shifted').toBe(0);
  },

  async 'a button goes from "more" to the rail and back without getting stuck'(p) {
    await p.open(700, 420);
    await p.click(await p.at('.tools > button[aria-label="Ещё"]'));
    const from = await p.at('.tools-more [data-more-key="table"]'), rail = await p.at('.tools [data-key="hand"]');
    const other = await p.at('.tools-more [data-more-key="frames"]');
    await carry(p, from, [rail, other, [400, 250], other, rail, [400, 250], rail]);
    const s = await settled(p);
    expect(s.moved + s.lifted + s.ghost + s.sorting, 'nothing hanging').toBe(0);
    expect((await mainKeys(p, '.tools')).some((k) => k[0] === 'table'), 'table on the rail').toBeTruthy();
  },

  async 'buttons in a bar\'s "more" popover rearrange'(p) {
    await p.open(360, 800);
    await p.click(await p.at('.bar.zoom .more-wrap > button'));
    const k0 = await moreKeys(p, '.more-pop');
    await carry(p, k0[1].slice(1), [k0[3].slice(1)]);
    const k1 = (await moreKeys(p, '.more-pop')).map((k) => k[0]);
    expect(k1.indexOf(k0[1][0]), 'second one moved to fourth').toBe(3);
  },

  async 'a button dragged from a bar\'s "more" lands on the bar'(p) {
    await p.open(360, 800);
    await p.click(await p.at('.bar.zoom .more-wrap > button'));
    const k0 = await moreKeys(p, '.more-pop'), m0 = await mainKeys(p, '.bar.zoom');
    await carry(p, k0[2].slice(1), [m0[1].slice(1)]);
    expect((await mainKeys(p, '.bar.zoom')).some((k) => k[0] === k0[2][0]), 'it is on the bar').toBeTruthy();
  },
};

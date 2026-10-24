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

// How the panels look: their three sizes, square corners where stuck, the hints.
import { expect, sleep } from '../lib.mjs';

const pickSize = async (p, size) => {
  await p.menu('Размер панелей');
  await p.click(await p.at(`.size-dot[aria-label="${size}"]`));
  await sleep(300);
};

export const checks = {
  async 'three panel sizes, every size in whole pixels'(p) {
    for (const [size, h] of [['Средние', 46], ['Маленькие', 42], ['Большие', 52]]) {
      await pickSize(p, size);
      expect((await p.rect('.topbar')).h, `${size}: top bar`).toBe(h);
      expect((await p.rect('.bar.zoom')).h, `${size}: zoom bar`).toBe(h);
      const off = await p.ev(`(() => { const b = document.querySelector('.bar.zoom .ib'), i = b.querySelector('.pi'); const rb = b.getBoundingClientRect(), ri = i.getBoundingClientRect();
        return [rb.width % 1, rb.height % 1, (ri.left - rb.left) - (rb.right - ri.right), (ri.top - rb.top) - (rb.bottom - ri.bottom)]; })()`);
      expect(off.every((v) => v === 0), `${size}: whole-pixel buttons with centred icons`).toBeTruthy();
    }
  },

  async 'stuck to the edges, the panels have square corners on that side at every size'(p) {
    await pickSize(p, 'Средние');
    await p.escape();
    await p.ev(`document.querySelector('.dock-chevron').closest('button').click()`);
    await sleep(500);
    const r = await p.ev(`['.topbar', '.bar.zoom', '.tools'].map((q) => getComputedStyle(document.querySelector(q)).borderRadius)`);
    expect(r[0].startsWith('0px 0px'), 'top bar square at the top').toBeTruthy();
    expect(r[1].endsWith('0px 0px'), 'zoom bar square at the bottom').toBeTruthy();
    expect(r[2].startsWith('0px') && r[2].endsWith('0px'), 'rail square at the left').toBeTruthy();
  },

  async 'the hints of a row stand level'(p) {
    const tops = [];
    for (const q of ['.bar.zoom .avatar.me', '.bar.zoom .zpct', '.bar.zoom [aria-label="Отдалить"]']) {
      await p.mouse('mouseMoved', ...(await p.at(q)));
      await sleep(1200);
      tops.push((await p.rect('.tip'))?.t);
      await p.mouse('mouseMoved', 600, 400);
      await sleep(1300);
    }
    expect(tops.every((t) => t !== undefined && t === tops[0]), `hint tops ${tops}`).toBeTruthy();
  },

  async 'no hints while a top bar menu is open, nor while dragging'(p) {
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    await p.mouse('mouseMoved', ...(await p.at('.bar.zoom [aria-label="Приблизить"]')));
    await sleep(1300);
    expect(!!(await p.rect('.tip')), 'no hint with the menu open').toBeFalsy();
    await p.escape();
    const a = await p.at('.tools [data-key="sticky"]'), b = await p.at('.tools [data-key="text"]');
    await p.mouse('mouseMoved', ...a);
    await p.mouse('mousePressed', ...a);
    await sleep(300);
    await p.mouse('mouseMoved', b[0], b[1] - 2);
    await sleep(1300);
    expect(!!(await p.rect('.tip')), 'no hint while dragging').toBeFalsy();
    await p.mouse('mouseReleased', b[0], b[1] - 2);
  },
};

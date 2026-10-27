// The features on trial ("Нововведения", src/labs): their switches, and each doing its job.
import { expect, sleep } from '../lib.mjs';
import { carry } from './sortable.mjs';

/** Two stickers through the app's handle; gives back their ids. */
const stickers = (p) => p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(400, 250);
  const a = e.newItem('sticky', X, Y, { text: 'Купить молоко' }), c = e.newItem('sticky', X + 260, Y, { text: 'Позвонить Ёжику' });
  b.add(a); b.add(c); return { a: a.id, c: c.id }; })()`);
const select = (p, id) => p.ev(`planx.editor.setSelection(['${id}'])`);

export const checks = {
  async 'the menu has "Нововведения" with a switch for each, and a switched off one goes away'(p) {
    expect(!!(await p.rect('.labs-rail button[aria-label="Общий таймер"]')), 'the timer button at first').toBeTruthy();
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    const row = await p.ev(`(() => { const e = [...document.querySelectorAll('.board-menu .menu-row')].find((r) => r.textContent.includes('Нововведения')); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await p.mouse('mouseMoved', row[0], row[1]);
    await sleep(250);
    expect(await p.ev(`document.querySelectorAll('.labs-menu .menu-switch').length`), 'switches').toBe(13);
    await p.click(await p.ev(`(() => { const e = [...document.querySelectorAll('.labs-menu .menu-row')].find((r) => r.textContent.includes('Общий таймер')); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`document.querySelector('.labs-menu [aria-checked="false"]')?.textContent`), 'switched off').toBe('Общий таймер');
    expect(!!(await p.rect('.labs-rail button[aria-label="Общий таймер"]')), 'its button gone').toBeFalsy();
    await p.reload();
    expect(!!(await p.rect('.labs-rail button[aria-label="Общий таймер"]')), 'and still gone after a reload').toBeFalsy();
  },

  async '"Экспорт в PDF" saves the board as a PDF of one page'(p) {
    await stickers(p);
    // What's handed to the browser to save.
    await p.ev(`window.saved = null; URL.createObjectURL = (b) => { window.saved = b; return 'blob:x'; }`);
    await p.click(await p.at('.labs-rail button[aria-label="Экспорт в PDF"]'));
    expect(await p.ev(`document.querySelector('.export-pop h3')?.textContent`), 'its window').toBe('Экспорт в PDF');
    expect(await p.ev(`[...document.querySelectorAll('.export-pop .labs-seg button')].some((b) => b.textContent === 'Прозрачный')`), 'no see-through background').toBe(false);
    await p.click(await p.ev(`(() => { const e = [...document.querySelectorAll('.export-pop button')].find((b) => b.textContent === 'Скачать PDF'); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(500);
    const f = await p.ev(`(async () => { const b = window.saved; if (!b) return null; const t = new TextDecoder('latin1').decode(await b.arrayBuffer()); return { type: b.type, size: b.size, head: t.slice(0, 8), tail: t.slice(-6), jpeg: t.includes('/DCTDecode') }; })()`);
    expect(f?.type, 'a PDF').toBe('application/pdf');
    expect(f.head === '%PDF-1.4' && f.tail === '%%EOF\n' && f.jpeg, 'whole, with the picture in it').toBe(true);
  },

  async 'a locked sticker is neither moved nor deleted, until unlocked'(p) {
    const ids = await stickers(p);
    await select(p, ids.a);
    await sleep(300);
    await p.click(await p.at('.panel button[aria-label^="Закрепить"]'));
    const x = await p.ev(`planx.board.get('${ids.a}').x`);
    await p.key('ArrowRight', 'ArrowRight', 39);
    await p.key('Delete', 'Delete', 46);
    expect(await p.ev(`planx.board.get('${ids.a}')?.x`), 'not moved or deleted').toBe(x);
    const at = await p.ev(`(() => { const it = planx.board.get('${ids.a}'), s = planx.editor.toScreen({ x: it.x + 50, y: it.y + 50 }); return [s.x, s.y]; })()`);
    await p.drag(at, [at[0] + 120, at[1] + 60]);
    expect(await p.ev(`planx.board.get('${ids.a}').x`), 'not dragged').toBe(x);
    await select(p, ids.a);
    await sleep(300);
    await p.click(await p.at('.panel button[aria-label="Открепить"]'));
    await p.key('Delete', 'Delete', 46);
    expect(await p.ev(`!!planx.board.get('${ids.a}')`), 'deleted once unlocked').toBeFalsy();
  },

  async 'a reaction goes on from the panel, shows under the sticker and comes off with a click there'(p) {
    const ids = await stickers(p);
    await select(p, ids.c);
    await sleep(300);
    await p.click(await p.at('.panel button[aria-label="Реакция"]'));
    await p.click(await p.at('.react-pop .react-btn'));
    expect(await p.ev(`Object.keys(planx.board.get('${ids.c}').rx).join()`), 'a like on it').toBe('emoji-27');
    expect(await p.ev(`planx.board.get('${ids.c}').rx['emoji-27'].length`), 'one like').toBe(1);
    await p.escape();
    const pill = await p.ev(`(() => { const it = planx.board.get('${ids.c}'), s = planx.editor.toScreen({ x: it.x, y: it.y + it.h }); return [s.x + 20, s.y + 18]; })()`);
    await p.click(pill);
    expect(await p.ev(`planx.board.get('${ids.c}').rx`), 'taken off').toBe(undefined);
  },

  async 'Ctrl+F finds a sticker by its text and goes to it'(p) {
    const ids = await stickers(p);
    await p.ev(`planx.editor.cam = { x: 3000, y: 3000, z: 1 }; planx.editor.camChanged()`);
    await p.key('f', 'KeyF', 70, 2);
    expect(await p.ev(`document.activeElement?.id`), 'the field takes the keys').toBe('labs-search');
    await p.cdp('Input.insertText', { text: 'еж' });
    await sleep(200);
    expect(await p.ev(`document.querySelectorAll('.search-list li').length`), 'one found').toBe(1);
    await p.key('Enter', 'Enter', 13);
    await sleep(600);
    expect(await p.ev(`planx.editor.getUI().selection[0]`), 'picked').toBe(ids.c);
    const s = await p.ev(`(() => { const it = planx.board.get('${ids.c}'); return planx.editor.toScreen({ x: it.x + it.w / 2, y: it.y + it.h / 2 }); })()`);
    expect(s.x, 'in the middle of the screen').toBeNear(600, 2);
  },

  async 'the export popup shows a preview and the picture size'(p) {
    await stickers(p);
    await p.click(await p.at('.labs-rail button[aria-label="Экспорт в PNG"]'));
    expect(await p.ev(`document.querySelector('.export-preview img')?.naturalWidth > 0`), 'a preview').toBeTruthy();
    const size = await p.ev(`document.querySelector('.export-pop .muted').textContent`);
    expect(/^\d+ × \d+ пикселей$/.test(size), `size "${size}"`).toBeTruthy();
  },

  async 'the timer starts from its popup, pauses and goes away'(p) {
    await p.click(await p.at('.labs-rail button[aria-label="Общий таймер"]'));
    await p.click(await p.at('.timer-presets .btn'));
    expect(await p.ev(`document.querySelector('.timer-clock')?.textContent`), 'a minute').toBe('1:00');
    await p.click(await p.at('.timer-pill button[aria-label="Пауза"]'));
    expect(!!(await p.rect('.timer-pill.paused')), 'paused').toBeTruthy();
    await p.click(await p.at('.timer-pill button[aria-label="Убрать таймер"]'));
    expect(!!(await p.rect('.timer-pill')), 'gone').toBeFalsy();
  },

  async '? opens the cheat sheet, and the laser draws without touching the board'(p) {
    await p.key('?', 'Slash', 191, 8);
    expect(!!(await p.rect('.labs-keys')), 'the cheat sheet').toBeTruthy();
    await p.escape();
    expect(!!(await p.rect('.labs-keys')), 'closed').toBeFalsy();
    const ids = await stickers(p);
    await p.key('k', 'KeyK', 75);
    const at = await p.ev(`(() => { const it = planx.board.get('${ids.a}'), s = planx.editor.toScreen({ x: it.x + 50, y: it.y + 50 }); return [s.x, s.y]; })()`);
    const x = await p.ev(`planx.board.get('${ids.a}').x`);
    await p.drag(at, [at[0] + 200, at[1] + 100]);
    expect(await p.ev(`planx.board.get('${ids.a}').x`), 'the sticker stays').toBe(x);
    expect(await p.ev(`planx.board.list().length`), 'nothing drawn on the board').toBe(2);
  },

  async 'their rail is the tool rail\'s kind: same buttons, rearranged by holding, moved by its top edge'(p) {
    const size = (q) => p.ev(`(() => { const e = document.querySelector('${q}'); const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()`);
    expect((await size('.labs-rail .fb')).join(), 'a button as big as the tool rail\'s').toBe((await size('.tools:not(.labs-rail) .fb')).join());
    expect((await size('.labs-rail'))[0], 'as wide').toBe((await size('.tools:not(.labs-rail)'))[0]);
    expect((await p.rect('.labs-rail')).r, 'at the right edge').toBe(1200 - 12);
    const keys = () => p.ev(`[...document.querySelectorAll('.labs-rail > [data-key]')].map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.key, Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })`);
    const k0 = await keys();
    expect(k0.map((k) => k[0]).join(), 'in order').toBe('export,pdf,search,timer,laser,follow,keys');
    // Brought to the fourth one's middle, it passes the two before that, as on the tool rail.
    await carry(p, k0[0].slice(1), [k0[3].slice(1)]);
    const k1 = (await keys()).map((k) => k[0]);
    expect(k1.indexOf('export'), 'export moved down two places').toBe(2);
    expect(await p.ev(`!!document.querySelector('.export-pop')`), 'and that was no click').toBeFalsy();
    const r0 = await p.rect('.labs-rail');
    await p.dragEdge('.labs-rail', 'top', 0, -120);
    const r1 = await p.rect('.labs-rail');
    expect(r1.t, 'moved up').toBeNear(r0.t - 120, 2);
    expect(r1.r, 'still at the right edge').toBe(1200 - 12);
    // The tool rail doesn't go over it.
    await p.dragEdge('.tools', 'top', 1000, 0);
    expect((await p.rect('.tools')).l, 'the tool rail stays at the left').toBe(12);
    await p.reload();
    expect((await keys()).map((k) => k[0]).join(), 'its order kept after a reload').toBe(k1.join());
  },

  async '"Текст не слипается": text typed onto a second line pushes the text just under it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x, y } = e.toWorld(300, 250);
      const t1 = e.newItem('text', x, y, { id: 't1', w: 160, text: 'Первая' }), t2 = e.newItem('text', x, y, { id: 't2', w: 160, text: 'Вторая' }), t3 = e.newItem('text', x + 400, y, { id: 't3', w: 160, text: 'Сбоку' });
      b.add(t1); b.add({ ...t2, y: y + t1.h + 10 }); b.add({ ...t3, y: y + t1.h + 10 }); e.setSelection([]); })()`);
    const before = await p.ev(`['t1', 't2', 't3'].map((id) => { const i = planx.board.get(id); return { y: i.y, h: i.h }; })`);
    await p.ev(`planx.editor.startEditing('t1', null, 'end')`);
    await sleep(200);
    await p.cdp('Input.insertText', { text: ' и ещё много слов, чтобы перенестись' });
    await sleep(300);
    const after = await p.ev(`['t1', 't2', 't3'].map((id) => { const i = planx.board.get(id); return { y: i.y, h: i.h }; })`);
    const grew = after[0].h - before[0].h;
    expect(grew > 0, 'the first is taller').toBe(true);
    expect(after[1].y - before[1].y, 'the one under it pushed as much').toBe(grew);
    expect(after[2].y, 'the one off to the side stays').toBe(before[2].y);
  },
};

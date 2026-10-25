// The features on trial ("Нововведения", src/labs): their switches, and each doing its job.
import { expect, sleep } from '../lib.mjs';

/** Two stickers through the app's handle; gives back their ids. */
const stickers = (p) => p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(400, 250);
  const a = e.newItem('sticky', X, Y, { text: 'Купить молоко' }), c = e.newItem('sticky', X + 260, Y, { text: 'Позвонить Ёжику' });
  b.add(a); b.add(c); return { a: a.id, c: c.id }; })()`);
const select = (p, id) => p.ev(`planx.editor.setSelection(['${id}'])`);

export const checks = {
  async 'the menu has "Нововведения" with a switch for each, and a switched off one goes away'(p) {
    expect(!!(await p.rect('.labs-bar button[aria-label="Общий таймер"]')), 'the timer button at first').toBeTruthy();
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    const row = await p.ev(`(() => { const e = [...document.querySelectorAll('.board-menu .menu-row')].find((r) => r.textContent.includes('Нововведения')); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await p.mouse('mouseMoved', row[0], row[1]);
    await sleep(250);
    expect(await p.ev(`document.querySelectorAll('.labs-menu .menu-switch').length`), 'switches').toBe(8);
    await p.click(await p.ev(`(() => { const e = [...document.querySelectorAll('.labs-menu .menu-row')].find((r) => r.textContent.includes('Общий таймер')); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`document.querySelector('.labs-menu [aria-checked="false"]')?.textContent`), 'switched off').toBe('Общий таймер');
    expect(!!(await p.rect('.labs-bar button[aria-label="Общий таймер"]')), 'its button gone').toBeFalsy();
    await p.reload();
    expect(!!(await p.rect('.labs-bar button[aria-label="Общий таймер"]')), 'and still gone after a reload').toBeFalsy();
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
    await p.click(await p.at('.labs-bar button[aria-label="Экспорт в PNG"]'));
    expect(await p.ev(`document.querySelector('.export-preview img')?.naturalWidth > 0`), 'a preview').toBeTruthy();
    const size = await p.ev(`document.querySelector('.export-pop .muted').textContent`);
    expect(/^\d+ × \d+ пикселей$/.test(size), `size "${size}"`).toBeTruthy();
  },

  async 'the timer starts from its popup, pauses and goes away'(p) {
    await p.click(await p.at('.labs-bar button[aria-label="Общий таймер"]'));
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
};

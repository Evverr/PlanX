// The features on trial ("Нововведения", src/labs): their switches, and each doing its job.
import { expect, sleep } from '../lib.mjs';
import { carry } from './sortable.mjs';

/** Two stickers through the app's handle; gives back their ids. */
const stickers = (p) => p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(400, 250);
  const a = e.newItem('sticky', X, Y, { text: 'Купить молоко' }), c = e.newItem('sticky', X + 260, Y, { text: 'Позвонить Ёжику' });
  b.add(a); b.add(c); return { a: a.id, c: c.id }; })()`);
const select = (p, id) => p.ev(`planx.editor.setSelection(['${id}'])`);

export const checks = {
  async '"Настройки" (the board menu) have a switch for each feature on trial, and a switched off one goes away'(p) {
    expect(!!(await p.rect('.labs-rail button[aria-label="Общий таймер"]')), 'the timer button at first').toBeTruthy();
    const open = async (label) => {
      await p.click(await p.at('.topbar button[aria-label="Меню"]'));
      await p.click(await p.ev(`(() => { const e = [...document.querySelectorAll('.board-menu .menu-row')].find((r) => r.textContent === '${label}'); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
      await sleep(150);
    };
    await open('Настройки');
    expect(await p.ev(`document.querySelectorAll('.modal.settings .settings-row .menu-switch').length`), 'switches').toBe(await p.ev(`(async () => (await import('/src/labs/labs.ts')).LABS.length)()`));
    await p.click(await p.ev(`(() => { const e = [...document.querySelectorAll('.settings-row')].find((r) => r.textContent.includes('Общий таймер')); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`document.querySelector('.settings-row[aria-checked="false"] b')?.textContent`), 'switched off').toBe('Общий таймер');
    expect(!!(await p.rect('.labs-rail button[aria-label="Общий таймер"]')), 'its button gone').toBeFalsy();
    await p.escape();
    expect(await p.ev(`!!document.querySelector('.modal')`), 'Esc closes it').toBe(false);
    await p.reload();
    expect(!!(await p.rect('.labs-rail button[aria-label="Общий таймер"]')), 'and still gone after a reload').toBeFalsy();
    // "Профиль": a character, the fields, kept.
    await open('Профиль');
    expect(await p.ev(`!!document.querySelector('.modal.profile .profile-avatar') + ' ' + document.querySelectorAll('.modal.profile .form-grid label').length`), 'a character and the fields').toBe('true 7');
    await p.ev(`(() => { const i = [...document.querySelectorAll('.form-grid label')].find((l) => l.textContent.startsWith('Должность')).querySelector('input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Дизайнер'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.modal .btn')].find((b) => b.textContent === 'Сохранить').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await open('Профиль');
    expect(await p.ev(`document.querySelector('.profile-role').textContent`), 'kept').toBe('Дизайнер');
  },

  async 'a menu level that would open past the bottom of the screen is moved up into it'(p) {
    // The screen just taller than the menu: its last row's level would open past its bottom.
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    const bottom = await p.ev(`Math.ceil(document.querySelector('.board-menu').getBoundingClientRect().bottom)`);
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: bottom + 16, deviceScaleFactor: 1, mobile: false });
    await sleep(200);
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    const row = await p.ev(`(() => { const e = [...document.querySelectorAll('.board-menu .menu-row')].filter((r) => r.textContent.includes('Оглавление')).pop(); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await p.mouse('mouseMoved', row[0], row[1]);
    await sleep(300);
    const r = await p.ev(`(() => { const r = document.querySelector('.board-menu .board-menu.sub').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight]; })()`);
    await p.cdp('Emulation.clearDeviceMetricsOverride', {});
    expect(r[0] >= 8 && r[1] <= r[2] - 8, `on the screen (${r})`).toBe(true);
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

  async '"Выравнивание" lines the selected up by an edge or the middle, in one undo step'(p) {
    const ids = await stickers(p);
    await p.ev(`planx.board.update('${ids.c}', { y: planx.board.get('${ids.c}').y + 90 })`);
    await p.ev(`planx.editor.setSelection(['${ids.a}', '${ids.c}'])`);
    await sleep(300);
    await p.click(await p.at('.panel button[aria-label="Выравнивание"]'));
    expect(await p.ev(`document.querySelectorAll('.align-pop button').length`), 'six ways').toBe(6);
    await p.ev(`document.documentElement.dataset.compact = ''; document.documentElement.dataset.size = 's'`);
    await sleep(100);
    expect(await p.ev(`[...document.querySelectorAll('.panel > * > .ib, .panel > .ib')][0].offsetWidth === document.querySelector('.align-pop .ib').offsetWidth`), 'as small as the panel').toBe(true);
    await p.ev(`delete document.documentElement.dataset.compact; delete document.documentElement.dataset.size`);
    const y = await p.ev(`planx.board.get('${ids.a}').y`);
    await p.click(await p.at('.align-pop button[aria-label="По верхнему краю"]'));
    expect(await p.ev(`planx.board.get('${ids.c}').y`), 'tops meet').toBe(y);
    await p.click(await p.at('.align-pop button[aria-label="По левому краю"]'));
    expect(await p.ev(`planx.board.get('${ids.c}').x === planx.board.get('${ids.a}').x`), 'left sides meet, the panel still open').toBe(true);
    await p.ev(`planx.editor.undo()`);
    expect(await p.ev(`planx.board.get('${ids.c}').x - planx.board.get('${ids.a}').x`), 'one undo step back').toBe(260);
  },

  async '"Перо": corners clicked make a figure when closed, a straight line on a double click; Backspace and Esc'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setTool('nib'); })()`);
    for (const at of [[400, 300], [560, 300], [560, 420]]) { await p.click(at); await sleep(450); }
    await p.click([480, 360]); await sleep(450);
    await p.key('Backspace', 'Backspace', 8);
    await p.click([402, 302]);
    await sleep(200);
    const fig = await p.ev(`(() => { const l = planx.board.list(); return l.length === 1 ? [l[0].type, l[0].shape ?? '-', l[0].vx.length, l[0].x, l[0].y, l[0].w, l[0].h].join() : l.length; })()`);
    expect(fig, 'closed on the first corner (the fourth taken off): a figure of three').toBe('polygon,-,6,400,300,160,120');
    // A line: two corners and a double click on the last.
    await p.click([400, 500]); await sleep(450);
    await p.click([600, 560]); await p.click([600, 560]);
    await sleep(200);
    const line = await p.ev(`(() => { const i = planx.board.list().find((i) => i.type === 'ink'); return i ? [i.sharp, i.pts.length].join() : 'none'; })()`);
    expect(line, 'a straight line through two corners').toBe('true,4');
    // Esc lets one go.
    await p.click([700, 300]); await sleep(450);
    await p.click([760, 300]); await sleep(100);
    await p.key('Escape', 'Escape', 27);
    expect(await p.ev(`planx.board.list().length`), 'nothing more').toBe(2);
    expect(await p.ev(`planx.editor.tool`), 'still the pen').toBe('nib');
  },

  async 'the drawing button shows and brings back the tool used last; a highlighter line\'s opacity shown as it is'(p) {
    await p.ev(`planx.editor.setTool('marker')`);
    await p.ev(`planx.editor.setTool('select')`);
    await sleep(100);
    // (On the rail, or under its "more" button when the window is low.)
    if (!(await p.rect('.tools [data-key="draw"]'))) await p.click(await p.at('.tools:not(.labs-rail) > button[aria-label="Ещё"]'));
    expect(await p.ev(`document.querySelector('[data-key="draw"] .pi, [data-more-key="draw"] .pi').style.maskImage.includes('highlighter')`), 'the highlighter on the rail').toBe(true);
    await p.key('Escape', 'Escape', 27);
    expect(await p.ev(`localStorage.getItem('planx-last-draw')`), 'kept').toBe('marker');
    await p.ev(`planx.editor.setTool('marker')`);
    await p.drag([400, 300], [600, 380]);
    await sleep(100);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'ink')?.id`);
    await p.ev(`(() => { planx.editor.setTool('select'); planx.editor.setSelection(['${id}']); })()`);
    await sleep(300);
    await p.click(await p.at('.panel button[aria-label^="Цвет"]'));
    expect(await p.ev(`document.querySelector('.palette-pop input[type="range"]').value`), 'its real opacity').toBe('45');
    await p.ev(`localStorage.removeItem('planx-last-draw')`);
  },

  async '"Ластик кружком" takes off only what is under it, the rest left as lines'(p) {
    await p.ev(`(() => { localStorage.removeItem('planx-eraser'); const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setTool('pen'); })()`);
    await p.drag([300, 300], [700, 300]);
    await sleep(100);
    expect(await p.ev(`planx.board.list().filter((i) => i.type === 'ink').length`), 'a line').toBe(1);
    await p.ev(`planx.editor.setTool('eraser')`);
    await p.drag([500, 260], [500, 340]);
    await sleep(100);
    const left = await p.ev(`planx.board.list().filter((i) => i.type === 'ink').map((i) => i.x < 500 ? 'left' : 'right').sort().join()`);
    expect(left, 'cut in two where the eraser went').toBe('left,right');
    // Undone in one step: the line whole again.
    await p.key('z', 'KeyZ', 90, 4);
    expect(await p.ev(`planx.board.list().filter((i) => i.type === 'ink').length`), 'one undo step').toBe(1);
  },

  async '"Перо": pressed and dragged, a smooth corner with handles; a double click on the figure shows its nodes, dragged to change it'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setTool('nib'); })()`);
    await p.click([400, 300]); await sleep(450);
    // Pressed and dragged: smooth, its handles along the drag.
    await p.drag([600, 300], [600, 380]); await sleep(450);
    await p.click([500, 460]); await sleep(450);
    await p.click([401, 301]);
    await sleep(200);
    const fig = await p.ev(`(() => { const l = planx.board.list(); return l.length === 1 ? [l[0].type, l[0].vx.length, l[0].vh?.length].join() : l.length; })()`);
    expect(fig, 'a figure of three corners, with handles').toBe('polygon,6,12');
    // A double click on it: its nodes; a corner dragged changes it.
    await p.ev(`planx.editor.setTool('select')`);
    await p.click([480, 360]); await p.click([480, 360]);
    await sleep(200);
    expect(await p.ev(`(async () => (await import('/src/labs/paths.ts')).nodeEditing() === planx.board.list()[0].id)()`), 'its nodes shown').toBe(true);
    const before = await p.ev(`planx.board.list()[0].h`);
    await p.drag([500, 460], [500, 560]);
    await sleep(100);
    expect(await p.ev(`Math.round(planx.board.list()[0].h - ${before})`), 'taller by the corner dragged down').toBe(100);
    await p.key('z', 'KeyZ', 90, 4);
    expect(await p.ev(`Math.round(planx.board.list()[0].h)`), 'one undo step').toBe(Math.round(before));
    await p.key('Escape', 'Escape', 27);
    expect(await p.ev(`(async () => (await import('/src/labs/paths.ts')).nodeEditing())()`), 'done with Esc').toBe(null);
  },

  async '"Слои": a new layer, the picked items put in it, hidden by its tick (not seen, not picked); new items go in the layer picked'(p) {
    const ids = await stickers(p);
    await select(p, ids.a);
    await p.click(await p.at('.labs-rail button[aria-label="Слои"]'));
    const rows = () => p.ev(`[...document.querySelectorAll('.layers-pop .layer-row')].map((r) => r.querySelector('.layer-name').textContent + ':' + r.querySelector('i').textContent + (r.classList.contains('on') ? '*' : '')).join()`);
    expect(await rows(), 'one layer, the first').toBe('Слой 1:2*');
    await p.click(await p.at('.layers-pop .layers-add'));
    expect(await rows(), 'a new one, picked').toBe('Слой 1:2,Слой 2:0*');
    await p.click(await p.ev(`(() => { const r = document.querySelectorAll('.layers-pop .layer-here')[1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await rows(), 'the sticker put in it').toBe('Слой 1:1,Слой 2:1*');
    await p.click(await p.ev(`(() => { const r = document.querySelectorAll('.layers-pop .layer-row input[type=checkbox]')[1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`planx.editor.shown().map((i) => i.id).join() + ' | ' + planx.editor.selection.size`), 'hidden, and no longer picked').toBe(`${ids.c} | 0`);
    await p.ev(`planx.board.add(planx.editor.newItem('sticky', 0, 0, { id: 'n' }))`);
    expect(await p.ev(`planx.board.get('n').ly === planx.board.get('${ids.a}').ly && planx.editor.shown().length`), 'a new one in the picked layer, shown again').toBe(3);
    // Its bin: asked, then the layer gone with what it holds; one undo brings both back.
    await p.ev(`document.querySelectorAll('.layers-pop .layer-delete')[1].click()`);
    await sleep(150);
    expect(await p.ev(`document.querySelector('.confirm p')?.textContent`), 'asked first').toBe('Удалить «Слой 2» и всё, что в нём (2), у всех участников? Отменить можно через Ctrl+Z');
    await p.click(await p.at('.confirm .btn.primary'));
    expect(await p.ev(`planx.board.list().map((i) => i.id).join()`), 'it and what it held gone').toBe(ids.c);
    await p.key('z', 'KeyZ', 90, 4);
    expect(await p.ev(`(async () => planx.board.list().length + ' ' + (await import('/src/labs/layers.ts')).layersOf(planx.board).map((l) => l.name).join())()`), 'back with one undo').toBe('3 Слой 1,Слой 2');
    // The first one too; the last one gone, a new empty "Слой 1".
    const names = () => p.ev(`(async () => planx.board.list().length + ' ' + (await import('/src/labs/layers.ts')).layersOf(planx.board).map((l) => l.name).join())()`);
    await p.ev(`(async () => { const m = await import('/src/labs/layers.ts'); m.deleteLayer(planx.editor, 'base'); })()`);
    expect(await names(), 'the first gone with what it held').toBe('2 Слой 2');
    await p.ev(`(async () => { const m = await import('/src/labs/layers.ts'); m.deleteLayer(planx.editor, m.layersOf(planx.board)[0].id); })()`);
    expect(await names(), 'the last gone: an empty "Слой 1"').toBe('0 Слой 1');
    await p.ev(`planx.board.add(planx.editor.newItem('sticky', 0, 0, { id: 'm' }))`);
    expect(await p.ev(`(async () => (await import('/src/labs/layers.ts')).layerCounts(planx.board).get(planx.board.get('m').ly))()`), 'a new item in it').toBe(1);
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
    expect(k0.map((k) => k[0]).join(), 'in order').toBe('export,pdf,search,layers,timer,laser,follow,keys');
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

  async '"Текст не слипается" in an instance: the copy grows as it is typed in and pushes the one under it there only'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(300, 250);
      b.transact(() => {
        b.add(e.newItem('frame', X - 1500, Y, { id: 'source', comp: true, text: 'К', w: 300, h: 200, members: ['t1', 't2'], z: 0 }));
        b.add(e.newItem('text', X - 1460, Y + 40, { id: 't1', w: 200, text: 'Заголовок' }));
        b.add(e.newItem('text', X - 1460, Y + 76, { id: 't2', w: 200, text: 'Подпись' }));
        b.add(e.newItem('frame', X, Y, { id: 'instance', inst: 'source', w: 300, h: 200, members: [], z: 0 }));
      }); e.setSelection([]); })()`);
    await sleep(300);
    const y0 = await p.ev(`planx.board.get('instance~t2').y`), h0 = await p.ev(`planx.board.get('instance~t1').h`);
    await p.ev(`planx.editor.startEditing('instance~t1', null, 'end')`);
    await sleep(200);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await p.cdp('Input.insertText', { text: 'вторая строка' });
    await sleep(300);
    const grew = (await p.ev(`planx.board.get('instance~t1').h`)) - h0;
    expect(grew > 0, 'taller while typing').toBe(true);
    expect((await p.ev(`planx.board.get('instance~t2').y`)) - y0, 'the one under it pushed while typing').toBe(grew);
    await p.ev('planx.editor.stopEditing()');
    await sleep(300);
    const end = await p.ev(`(() => { const b = planx.board; return { h: b.get('instance~t1').h, y: b.get('instance~t2').y, src: b.get('t2').y, text: b.get('instance~t1').text }; })()`);
    expect(end.text, 'the new text kept').toBe('Заголовок\nвторая строка');
    expect(end.h - h0, 'still taller').toBe(grew);
    expect(end.y - y0, 'still pushed').toBe(grew);
    // The component moved on: the copy goes along, still pushed as far.
    const s0 = await p.ev(`planx.board.get('t2').y`);
    await p.ev(`planx.board.update('t2', { text: 'Новая подпись' })`);
    await sleep(300);
    expect((await p.ev(`planx.board.get('instance~t2').y`)) - y0, 'pushed as far after the component changed').toBe(grew);
    expect(await p.ev(`planx.board.get('t2').y`), 'the component itself not pushed').toBe(s0);
  },

  async '"Авторасположение": a gap\'s pill under the pointer takes its colour and grows smoothly, twice as thick, 1.3 times as long; and goes back so'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => { b.add(e.newItem('rect', 300, 300, { id: 'a', w: 200, h: 200 })); b.add(e.newItem('rect', 560, 300, { id: 'c', w: 200, h: 200 })); }); e.setSelection(['a', 'c']); })()`);
    await sleep(300);
    await p.click(await p.at('.bar.panel button[aria-label="Авторасположение"]'));
    await sleep(200);
    const m = await p.ev(`(() => { const a = planx.board.get('a'), c = planx.board.get('c'), s = planx.editor.toScreen({ x: (a.x + a.w + c.x) / 2, y: (a.y + a.y + a.h) / 2 }); return [Math.round(s.x), Math.round(s.y)]; })()`);
    // How many solid red dots across its middle and along it just off its middle line.
    const size = () => p.ev(`(() => { const k = devicePixelRatio, c = document.querySelector('canvas').getContext('2d'), red = (x, y) => { const d = c.getImageData(x * k, y * k, 1, 1).data; return d[0] > 200 && d[1] < 110 && d[2] < 110; };
      let across = 0, along = 0; for (let i = -14; i <= 14; i++) { if (red(${m[0]} + i, ${m[1]})) across++; if (red(${m[0]} + 3, ${m[1]} + i)) along++; } return [across, along]; })()`);
    const rest = await size();
    expect(rest[1], 'at rest: 3 off its middle is off it').toBe(0);
    await p.mouse('mouseMoved', m[0], m[1] + 40);
    await sleep(40);
    const mid = await size();
    await sleep(350);
    const big = await size();
    expect(big[0] > mid[0], `grows little by little: ${mid[0]} on the way to ${big[0]}`).toBe(true);
    expect(big[0], 'twice as thick, filled').toBeNear(9, 2);
    expect(big[1], '1.3 times as long (21, its round ends taking 3 here; 16 long would read 13)').toBeNear(18, 1);
    await p.mouse('mouseMoved', 900, 700);
    await sleep(40);
    const back = await size();
    await sleep(350);
    expect(back[0] > rest[0], `goes back little by little: ${back[0]} on the way to ${rest[0]}`).toBe(true);
    expect((await size()).join(), 'as it was').toBe(rest.join());
  },

  async '"Авторасположение" on one mind map node lays out what grows from it as a mind map does; one Ctrl+Z puts it back'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 200, 300, { id: 'r', w: 100, h: 40, text: 'Центр' }));
        b.add(e.newItem('mind', 430, 390, { id: 'a', w: 100, h: 40, parent: 'r', text: 'А' }));
        b.add(e.newItem('mind', 370, 170, { id: 'b', w: 100, h: 40, parent: 'r', text: 'Б' }));
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.click(await p.at('.bar.panel button[aria-label="Авторасположение"]'));
    await sleep(100);
    const at = () => p.ev(`['a', 'b'].map((k) => { const i = planx.board.get(k); return i.x + ',' + i.y; }).join(' ')`);
    expect(await p.ev(`(() => { const [r, a, b] = ['r', 'a', 'b'].map((k) => planx.board.get(k));
      return [a.x === b.x && a.x === r.x + r.w + 60, a.y - b.y - b.h === 16, b.y + a.y + a.h === 2 * r.y + r.h].join(); })()`), 'b above a, 60 off, 16 apart, centred').toBe('true,true,true');
    await p.ev('planx.editor.undo()');
    expect(await at(), 'back').toBe('430,390 370,170');
  },

  async '"Авторасположение" on a mind map node: its handles stretch the gaps as they came out, in proportion'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 100, 300, { id: 'r', w: 100, h: 40, text: 'Центр' }));
        for (const [k, y] of [['a', 200], ['b', 400]]) {
          b.add(e.newItem('mind', 300, y, { id: k, w: 100, h: 40, parent: 'r', text: k }));
          for (const i of [0, 1]) b.add(e.newItem('mind', 500, y + i * 60, { id: k + i, w: 100, h: 40, parent: k, text: k + i }));
        }
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.ev(`planx.editor.tidyMind('r')`);
    await sleep(100);
    const xs = () => p.ev(`['r', 'a', 'a0'].map((k) => planx.board.get(k)).map((i) => i.x + ',' + i.w)`);
    const ys = () => p.ev(`['a0', 'a1', 'b0', 'b1'].map((k) => planx.board.get(k).y)`), h = await p.ev(`planx.board.get('a0').h`);
    const gaps = (y) => [y[1] - y[0] - h, y[2] - y[1] - h, y[3] - y[2] - h];
    const y = await ys(), g0 = gaps(y);
    // The fullest level's widest gap (the cousins'): its handle dragged 40 down.
    const mid = await p.ev(`(() => { const a = planx.board.get('a1'), s = planx.editor.toScreen({ x: a.x + a.w / 2, y: a.y + a.h + ${g0[1]} / 2 }); return [s.x, s.y]; })()`);
    await p.drag(mid, [mid[0], mid[1] + 40]);
    await sleep(200);
    const z = await ys(), k = (g0[1] + 40) / g0[1];
    expect(gaps(z).map((v) => Math.round(v)).join(), 'gaps along times k').toBe(g0.map((v) => Math.round(v * k)).join());
    expect(Math.round((z[0] + z[3]) / 2), 'centred where it was').toBe(Math.round((y[0] + y[3]) / 2));
    // The gap out from the node to its branches: dragged 30 right, every gap out grows in proportion.
    const [r, a] = (await xs()).map((s) => s.split(',').map(Number));
    const out = await p.ev(`(() => { const r = planx.board.get('r'), kids = ['a', 'b'].map((k) => planx.board.get(k)), lo = Math.min(...kids.map((k) => k.y)), hi = Math.max(...kids.map((k) => k.y + k.h));
      const s = planx.editor.toScreen({ x: (r.x + r.w + kids[0].x) / 2, y: lo + Math.max(24, (hi - lo) / 4) / 2 }); return [s.x, s.y]; })()`);
    const gx = a[0] - r[0] - r[1];
    await p.drag(out, [out[0] + 30, out[1]]);
    await sleep(200);
    const [, a2, c2] = (await xs()).map((s) => s.split(',').map(Number)), kx = (gx + 30) / gx;
    expect(Math.round(a2[0] - r[0] - r[1]), 'first gap out').toBe(Math.round(gx * kx));
    expect(Math.round(c2[0] - a2[0] - a2[1]), 'next gap out, in proportion').toBe(Math.round(gx * kx));
  },

  async '"Авторасположение" on a mind map node: no "+" buttons meanwhile; picked again, an ordinary node; pressed again untouched, all as it was'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 100, 300, { id: 'r', w: 100, h: 40, text: 'Центр' }));
        for (const [k, y] of [['a', 200], ['b', 400]]) b.add(e.newItem('mind', 300, y, { id: k, w: 100, h: 40, parent: 'r', text: k }));
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.ev(`planx.editor.tidyMind('r')`);
    const held = () => p.ev(`(async () => (await import('/src/labs/tidyMind.ts')).holds(planx.editor))()`);
    expect(await held(), 'handles').toBe(true);
    expect(await p.ev('planx.editor.plusFade()'), 'no "+" buttons').toBe(0);
    // Stretched by the first level's handle.
    await p.ev(`(async () => { const m = await import('/src/labs/tidyMind.ts'); m.dragMindGap(planx.editor, { axis: 'row', gap: 16, level: 0, out: false, sign: 1 }, 1, 16); })()`);
    const ay = await p.ev(`planx.board.get('a').y`);
    await p.ev(`planx.editor.setSelection([])`);
    await sleep(100);
    const r = await p.ev(`(() => { const r = planx.board.get('r'), s = planx.editor.toScreen({ x: r.x + r.w / 2, y: r.y + r.h / 2 }); return [s.x, s.y]; })()`);
    await p.click(r);
    await sleep(300);
    await p.ev('planx.editor.stopEditing()');
    await sleep(100);
    expect(await held(), 'picked again: an ordinary node').toBe(false);
    await p.ev(`planx.editor.tidyMind('r')`);
    expect(await held() + ' ' + await p.ev(`planx.board.get('a').y`), 'pressed again: handles and stretch as they were').toBe('true ' + ay);
    // Moved by hand: pressed again, laid out afresh with the stretch of the last time; it jumps back.
    const by = await p.ev(`planx.board.get('b').y`);
    await p.ev(`planx.board.update('b', { y: 900 })`);
    await p.ev(`planx.editor.tidyMind('r')`);
    expect(await p.ev(`planx.board.get('b').y`), 'back where it was').toBe(by);
  },

  async '"Авторасположение" on a mind map node: the first handles set every level, the others only their own'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 100, 300, { id: 'r', w: 100, h: 40, text: 'Центр' }));
        for (const [k, y] of [['a', 200], ['b', 400]]) {
          b.add(e.newItem('mind', 300, y, { id: k, w: 100, h: 40, parent: 'r', text: k }));
          for (const i of [0, 1]) b.add(e.newItem('mind', 500, y + i * 60, { id: k + i, w: 100, h: 40, parent: k, text: k + i }));
        }
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.ev(`planx.editor.tidyMind('r')`);
    const g = () => p.ev(`(() => { const b = (k) => planx.board.get(k);
      return { k: b('b').y - b('a').y - b('a').h, g: b('a1').y - b('a0').y - b('a0').h, ok: b('a').x - b('r').x - b('r').w, og: b('a0').x - b('a').x - b('a').w }; })()`);
    const drag = (h, d) => p.ev(`(async () => { const m = await import('/src/labs/tidyMind.ts'); const h = ${JSON.stringify(h)}; m.dragMindGap(planx.editor, h, m.mindStretch(h), ${d}); })()`);
    const g0 = await g();
    await drag({ axis: 'row', gap: g0.g, level: 1, out: false, sign: 1 }, g0.g);
    let g1 = await g();
    expect([g1.k, g1.g].join(), 'the grandchildren\'s own: theirs alone').toBe([g0.k, 2 * g0.g].join());
    await drag({ axis: 'row', gap: g0.k, level: 0, out: false, sign: 1 }, g0.k);
    g1 = await g();
    expect([g1.k, g1.g].join(), 'the children\'s: every level').toBe([2 * g0.k, 4 * g0.g].join());
    await drag({ axis: 'col', gap: g0.og, level: 1, out: true, sign: 1 }, g0.og);
    g1 = await g();
    expect([g1.ok, g1.og].join(), 'out to the grandchildren: that gap alone').toBe([g0.ok, 2 * g0.og].join());
    await drag({ axis: 'col', gap: g0.ok, level: 0, out: true, sign: 1 }, g0.ok);
    g1 = await g();
    expect([g1.ok, g1.og].join(), 'out from the node: every gap out').toBe([2 * g0.ok, 4 * g0.og].join());
  },

  async '"Авторасположение" on a mind map node: a branch moved by hand brings a note at the bottom, its button undoes it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 100, 300, { id: 'r', w: 100, h: 40, text: 'Центр' }));
        for (const [k, y] of [['a', 200], ['b', 400]]) b.add(e.newItem('mind', 300, y, { id: k, w: 100, h: 40, parent: 'r', text: k }));
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.ev(`planx.editor.tidyMind('r')`);
    await p.ev(`planx.editor.setSelection([])`);
    const at = await p.ev(`(() => { const a = planx.board.get('a'); return [a.x, a.y]; })()`);
    const from = await p.ev(`(() => { const a = planx.board.get('a'), s = planx.editor.toScreen({ x: a.x + 4, y: a.y + 4 }); return [s.x, s.y]; })()`);
    await p.drag(from, [from[0] + 80, from[1] + 60]);
    await sleep(200);
    expect(await p.ev(`document.querySelector('.toast.bottom span')?.textContent`), 'the note').toBe('Вы подвинули элемент: авторасположение выключено');
    await p.click(await p.at('.toast.bottom button'));
    await sleep(200);
    expect((await p.ev(`(() => { const a = planx.board.get('a'); return [a.x, a.y]; })()`)).join(), 'moved back').toBe(at.join());
    expect(await p.ev(`(async () => (await import('/src/labs/tidyMind.ts')).mindTidyKept(planx.editor, 'r'))()`), 'its layout kept').toBe(true);
  },

  async '"Авторасположение" of instances picked by a box: laid out by what they show, its handles there, a gap that can go below nothing'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(300, 250);
      b.transact(() => {
        b.add(e.newItem('frame', X - 1500, Y, { id: 'source', comp: true, text: 'К', w: 200, h: 200, members: ['a'], z: 0 }));
        b.add(e.newItem('sticky', X - 1460, Y + 40, { id: 'a', w: 120, h: 120, z: 1 }));
        b.add(e.newItem('frame', X, Y, { id: 'i1', inst: 'source', w: 200, h: 200, members: [], z: 0 }));
        b.add(e.newItem('frame', X + 300, Y + 30, { id: 'i2', inst: 'source', w: 200, h: 200, members: [], z: 0 }));
      }); e.setSelection([]); })()`);
    await sleep(300);
    await p.drag([250, 200], [800, 560]);
    expect((await p.ev(`[...planx.editor.selection].filter((id) => !id.includes('~')).sort().join()`)), 'both picked').toBe('i1,i2');
    await p.click(await p.at('.bar.panel button[aria-label="Авторасположение"]'));
    await sleep(200);
    const gap = () => p.ev(`planx.board.get('i2~a').x - (planx.board.get('i1~a').x + planx.board.get('i1~a').w)`);
    expect(await gap(), 'what they show 24 apart').toBe(24);
    const line = await p.ev(`(() => { const a = planx.board.get('i1~a'), s = planx.editor.toScreen({ x: a.x + a.w + 12, y: a.y + a.h / 2 }); return [s.x, s.y]; })()`);
    const before = await p.ev(`(() => { const c = document.querySelector('canvas'), x = c.getContext('2d').getImageData(${line[0]} * devicePixelRatio, ${line[1]} * devicePixelRatio, 1, 1).data; return [...x].join(); })()`);
    expect(before !== '240,240,240,255', 'its handle drawn').toBe(true);
    await p.drag(line, [line[0] - 60, line[1]]);
    expect(await gap(), 'overlapping now').toBe(-36);
  },

  async '"Клик сквозь": slow clicks on the item picked go down through what lies there, round to the top again'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(300, 250);
      b.add(e.newItem('rect', X, Y, { id: 'low', w: 200, h: 200, z: 1 }));
      b.add(e.newItem('sticky', X + 40, Y + 40, { id: 'top', w: 120, h: 120, z: 2 }));
      e.setSelection([]); })()`);
    const sel = () => p.ev(`[...planx.editor.selection].join()`);
    await p.click([400, 350]);
    expect(await sel(), 'the top one first').toBe('top');
    await sleep(450);
    await p.click([400, 350]);
    expect(await sel(), 'a slow click: the one under it').toBe('low');
    await sleep(450);
    await p.click([400, 350]);
    expect(await sel(), 'past the lowest, the top again').toBe('top');
    // A drag of the one picked still moves it.
    await sleep(450);
    await p.drag([400, 350], [440, 350]);
    expect(await sel(), 'dragged, still picked').toBe('top');
    expect(await p.ev(`planx.board.get('top').x - planx.board.get('low').x`), 'moved').toBe(80);
  },

  async '"Несколько сразу": two picked share the text panel, and one corner scales them both'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(300, 250);
      b.add(e.newItem('sticky', X, Y, { id: 's1', w: 100, h: 100, text: 'Один' }));
      b.add(e.newItem('sticky', X + 150, Y, { id: 's2', w: 100, h: 100, text: 'Два' }));
      e.setSelection(['s1', 's2']); })()`);
    await sleep(900);
    await p.click(await p.at('.tfmt button[aria-label="Жирный"]'));
    expect(await p.ev(`[planx.board.get('s1').fw, planx.board.get('s2').fw].join()`), 'both bold').toBe('700,700');
    // The corner: just past the lower right of the two (at 300 + 250, 250 + 100 on the screen).
    await p.drag([553, 353], [803, 453]);
    const r = await p.ev(`['s1', 's2'].map((id) => { const i = planx.board.get(id); return [i.w, i.fs]; }).join(' ')`);
    expect(r, 'both twice as big, text too').toBe('200,32 200,32');
    expect(await p.ev(`planx.board.get('s2').x - planx.board.get('s1').x`), 'twice as far apart').toBe(300);
    await p.key('z', 'KeyZ', 90, 4);
    await sleep(200);
    expect(await p.ev(`planx.board.get('s1').w`), 'undone in one step').toBe(100);
  },

  async '"Ссылка в тексте": the chain on the text panel sets an address, the text goes blue, Cmd+click opens it'(p) {
    await p.ev(`(() => { const e = planx.editor, { x, y } = e.toWorld(300, 250); planx.board.add(e.newItem('sticky', x, y, { id: 'st', w: 150, h: 150, text: 'Сайт' })); e.setSelection(['st']); e.startEditing('st'); })()`);
    await sleep(300);
    // Typed in, done, picked again: its panel's there.
    await p.ev('planx.editor.stopEditing()');
    await p.click([375, 325]);
    await sleep(900);
    await p.click(await p.at('.tfmt button[aria-label="Ссылка"]'));
    await sleep(200);
    expect(await p.ev(`document.activeElement?.getAttribute('aria-label')`), 'its field ready').toBe('Адрес ссылки');
    await p.cdp('Input.insertText', { text: 'example.com' });
    await p.key('Enter', 'Enter', 13);
    await sleep(200);
    const st = await p.ev(`(() => { const s = planx.board.get('st'); return s.url + ' ' + s.tc; })()`);
    expect(st, 'an address a browser opens, blue text').toBe('https://example.com blue');
    await p.ev(`window.opened = null; window.open = (u) => { window.opened = u; return null; }`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 375, y: 325, button: 'left', buttons: 1, clickCount: 1, modifiers: 4 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 375, y: 325, button: 'left', buttons: 0, clickCount: 1, modifiers: 4 });
    await sleep(200);
    expect(await p.ev('window.opened'), 'Cmd+click opens it').toBe('https://example.com');
  },

  async 'the board menu starts with "Поделиться", which copies the board\'s address'(p) {
    await p.ev(`window.copied = null; navigator.clipboard.writeText = async (t) => { window.copied = t; }`);
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    expect(await p.ev(`document.querySelector('.board-menu .menu-row span').textContent`), 'first in the menu').toBe('Поделиться');
    await p.click(await p.at('.board-menu .menu-row'));
    await sleep(200);
    expect(await p.ev(`window.copied?.includes('?board=')`), 'the board\'s address copied').toBe(true);
  },

  async '"Задача-компонент": a task is the built-in component, its ring clicked through its states, its own text kept'(p) {
    await p.ev(`(() => { const e = planx.editor; e.addTask(e.toWorld(500, 400)); })()`);
    await sleep(200);
    const inst = await p.ev(`planx.board.list().find((i) => i.inst === '@task-open')?.id`);
    expect(!!inst, 'a task to be done').toBe(true);
    expect(await p.ev('planx.editor.editingId'), 'its title open for typing').toBe(`${inst}~@task-title`);
    await p.cdp('Input.insertText', { text: 'Купить молоко' });
    await p.ev('planx.editor.stopEditing()');
    await sleep(200);
    const ring = await p.ev(`(() => { const r = planx.board.get('${inst}~@task-ring'), s = planx.editor.toScreen({ x: r.x + r.w / 2, y: r.y + r.h / 2 }); return [s.x, s.y]; })()`);
    const state = () => p.ev(`planx.board.get('${inst}').inst + ' ' + !!planx.board.get('${inst}~@task-check') + ' ' + planx.board.get('${inst}~@task-title').text`);
    await p.click([900, 700]);
    await p.click(ring);
    expect(await state(), 'done: a tick, its text kept').toBe('@task-done true Купить молоко');
    await sleep(450);
    await p.click(ring);
    expect(await state(), 'put off').toBe('@task-later false Купить молоко');
    await sleep(450);
    await p.click(ring);
    expect(await state(), 'to be done again').toBe('@task-open false Купить молоко');
    expect(await p.ev(`document.querySelectorAll('.swap-pop').length`), 'no neighbours to swap in a task').toBe(0);
  },

  async '"Текст не слипается": Tab goes round the text items going together, Shift+Tab back'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x, y } = e.toWorld(300, 200);
      b.add(e.newItem('text', x, y, { id: 'a', w: 200, h: 26, text: 'Первый' }));
      b.add(e.newItem('text', x, y + 36, { id: 'b', w: 200, h: 26, text: 'Второй' }));
      b.add(e.newItem('text', x, y + 72, { id: 'c', w: 200, h: 26, text: 'Третий' }));
      b.add(e.newItem('text', x, y + 200, { id: 'far', w: 200, h: 26, text: 'Далеко' }));
      e.setSelection(['a']); e.startEditing('a', null, 'end'); })()`);
    await sleep(200);
    const at = () => p.ev('planx.editor.editingId');
    await p.key('Tab', 'Tab', 9); await sleep(100);
    expect(await at(), 'the next').toBe('b');
    await p.key('Tab', 'Tab', 9); await sleep(100);
    await p.key('Tab', 'Tab', 9); await sleep(100);
    expect(await at(), 'round to the top, not the far one').toBe('a');
    await p.key('Tab', 'Tab', 9, 8); await sleep(100);
    expect(await at(), 'Shift+Tab: back up round to the last').toBe('c');
  },

  async '"Ссылка в тексте": a part picked while typing becomes the link, just it blue, Cmd+click on it opens it'(p) {
    await p.ev(`(() => { const e = planx.editor, { x, y } = e.toWorld(300, 250); planx.board.add(e.newItem('text', x, y, { id: 'tx', w: 400, h: 26, text: 'Смотри документацию тут' })); e.setSelection(['tx']); e.startEditing('tx', null, 'end'); })()`);
    await sleep(900);
    // "документацию" is 7…19.
    await p.ev(`document.querySelector('textarea.text-edit').setSelectionRange(7, 19)`);
    await p.click(await p.at('.tfmt button[aria-label="Ссылка"]'));
    await sleep(200);
    await p.cdp('Input.insertText', { text: 'docs.example.com' });
    await p.key('Enter', 'Enter', 13);
    await sleep(300);
    expect(await p.ev(`JSON.stringify(planx.board.get('tx').links)`), 'just that part').toBe('[{"s":7,"e":19,"url":"https://docs.example.com"}]');
    expect(await p.ev(`planx.board.get('tx').url ?? null`), 'not the whole item').toBe(null);
    await p.ev(`planx.editor.stopEditing(); planx.editor.setSelection([]); window.opened = null; window.open = (u) => { window.opened = u; return null; }`);
    await sleep(300);
    // Typing before it moves it along.
    await p.ev(`planx.editor.startEditing('tx', null, 'end')`);
    await sleep(100);
    await p.ev(`(() => { const t = document.querySelector('textarea.text-edit'); t.setSelectionRange(0, 0); })()`);
    await p.cdp('Input.insertText', { text: 'Ну, ' });
    await p.ev('planx.editor.stopEditing()');
    await sleep(300);
    expect(await p.ev(`JSON.stringify(planx.board.get('tx').links.map((l) => [l.s, l.e]))`), 'moved along').toBe('[[11,23]]');
    const at = await p.ev(`(() => { const e = planx.editor, t = planx.board.get('tx'), c = e.canvas.getContext('2d'); c.font = '400 20px Onest'; const s = e.toScreen({ x: t.x + c.measureText('Ну, Смотри докум').width, y: t.y + 13 }); return [s.x, s.y]; })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at[0], y: at[1], button: 'left', buttons: 1, clickCount: 1, modifiers: 4 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at[0], y: at[1], button: 'left', buttons: 0, clickCount: 1, modifiers: 4 });
    await sleep(200);
    expect(await p.ev('window.opened'), 'Cmd+click on the blue part opens it').toBe('https://docs.example.com');
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at[0], y: at[1], button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at[0], y: at[1], button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    expect(await p.ev(`document.querySelector('.context-menu .menu-row span')?.textContent`), 'a right click on it: the way to it first').toBe('Перейти по ссылке');
    await p.ev('window.opened = null');
    await p.click(await p.at('.context-menu .menu-row'));
    expect(await p.ev('window.opened'), 'and it goes there').toBe('https://docs.example.com');
  },

  async '"Объекты": a component\'s arrow names it and makes it one of «Мои объекты», an instance where it stood; the menu puts more'(p) {
    await p.ev(`(() => { localStorage.removeItem('planx-my-objects'); const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 100, h: 100 })); e.setSelection(['s']); e.makeComponent(); e.stopEditing(); })()`);
    await sleep(200);
    const comp = await p.ev(`planx.board.list().find((i) => i.comp)`);
    const arrow = await p.ev(`(() => { const s = planx.editor.toScreen({ x: ${comp.x + comp.w} + 66, y: ${comp.y + comp.h / 2} }); return [s.x, s.y]; })()`);
    await p.click(arrow);
    await sleep(200);
    expect(await p.ev(`document.querySelector('.confirm p')?.textContent`), 'asked').toBe('Добавить в «Мои объекты»? Он будет в меню «Объекты» на любой доске в этом браузере.');
    await p.ev(`(() => { const i = document.querySelector('.confirm-input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Карточка'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.confirm .btn')].find((b) => b.textContent === 'Добавить').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(200);
    const c = await p.ev(`planx.board.get('${comp.id}')`);
    expect(`${c.text} ${c.obj} ${!!c.stowed} ${await p.ev(`planx.board.list().filter((i) => i.inst === '${comp.id}').length`)}`, 'named, an object, an instance in its place').toBe('Карточка true true 1');
    await p.click(await p.at('.tools [data-key="objects"]'));
    expect(await p.ev(`[...document.querySelectorAll('.objects-menu > .menu-item > .menu-row span')].map((e) => e.textContent).join(' | ')`), 'the menu').toBe('Таймлайн | Мои объекты');
    const mineRow = await p.ev(`(() => { const r = [...document.querySelectorAll('.objects-menu .menu-row')].find((b) => b.textContent === 'Мои объекты').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await p.mouse('mouseMoved', ...mineRow);
    await sleep(150);
    const row = await p.ev(`(() => { const r = [...document.querySelectorAll('.objects-mine .menu-row')].find((b) => b.textContent.startsWith('Карточка')).getBoundingClientRect(); return [r.x + 30, r.y + r.height / 2]; })()`);
    await p.click(row);
    await sleep(200);
    expect(await p.ev(`planx.board.list().filter((i) => i.inst === '${comp.id}').length`), 'another instance from the menu').toBe(2);
    // Dragged out onto the board: put where it's let go.
    await p.click(await p.at('.tools [data-key="objects"]'));
    await p.mouse('mouseMoved', ...mineRow);
    await sleep(150);
    await p.drag(row, [700, 500]);
    await sleep(200);
    expect(await p.ev(`(() => { const l = planx.board.list().filter((i) => i.inst === '${comp.id}'), at = l.map((i) => planx.editor.toScreen({ x: i.x + i.w / 2, y: i.y + i.h / 2 })).map((s) => Math.round(s.x) + ',' + Math.round(s.y)); return l.length + ' ' + at.includes('700,500'); })()`), 'dragged onto the board').toBe('3 true');
    // Its cross: off "Мои объекты", once said yes; the board's own still, its instances stay.
    await p.click(await p.at('.tools [data-key="objects"]'));
    await p.mouse('mouseMoved', ...mineRow);
    await sleep(150);
    await p.click(await p.at('.objects-mine .menu-x'));
    await sleep(150);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.confirm .btn')].find((b) => b.textContent === 'Удалить').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(150);
    expect(await p.ev(`(localStorage.getItem('planx-my-objects') ?? '[]') + ' ' + !!planx.board.get('${comp.id}').obj + ' ' + planx.board.list().filter((i) => i.inst === '${comp.id}').length`), 'off the list, its instances there').toBe('[] true 3');
    await p.click(await p.at('.tools [data-key="objects"]'));
    expect(await p.ev(`[...document.querySelectorAll('.objects-menu > .menu-item > .menu-row span')].map((e) => e.textContent).join(' | ')`), 'among the board\'s own now').toBe('Таймлайн | Объекты документа');
  },

  async '"Мои объекты" are kept in the browser: put on another board, a copy of the component comes along; another\'s object is kept with «+»'(p) {
    await p.ev(`(() => { localStorage.removeItem('planx-my-objects'); const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 100, h: 100, text: 'Привет' })); e.setSelection(['s']); e.makeComponent(); e.stopEditing();
      const c = b.list().find((i) => i.comp); e.makeObject(c.id, 'Карточка'); })()`);
    expect(await p.ev(`JSON.parse(localStorage.getItem('planx-my-objects')).map((o) => o.name).join()`), 'kept in the browser').toBe('Карточка');
    // Another board: nothing of it there.
    await p.ev(`planx.editor.clearBoard()`);
    await sleep(100);
    expect(await p.ev(`planx.board.list().length`), 'an empty board').toBe(0);
    await p.click(await p.at('.tools [data-key="objects"]'));
    const mineRow = await p.ev(`(() => { const r = [...document.querySelectorAll('.objects-menu .menu-row')].find((b) => b.textContent === 'Мои объекты').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await p.mouse('mouseMoved', ...mineRow);
    await sleep(150);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.objects-mine .menu-row')].find((b) => b.textContent.startsWith('Карточка')).getBoundingClientRect(); return [r.x + 30, r.y + r.height / 2]; })()`));
    await sleep(300);
    const got = await p.ev(`(() => { const l = planx.board.list(), c = l.find((i) => i.comp), insts = l.filter((i) => i.inst === c?.id);
      return [!!c?.stowed, c?.obj, c?.text, insts.length, l.some((i) => i.host === insts[0]?.id && i.text === 'Привет')].join(); })()`);
    expect(got, 'its component put away here, an instance showing what it holds').toBe('true,true,Карточка,1,true');
    // Again: the component that's here now, no second one.
    await p.click(await p.at('.tools [data-key="objects"]'));
    await p.mouse('mouseMoved', ...mineRow);
    await sleep(150);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.objects-mine .menu-row')].find((b) => b.textContent.startsWith('Карточка')).getBoundingClientRect(); return [r.x + 30, r.y + r.height / 2]; })()`));
    await sleep(200);
    expect(await p.ev(`(() => { const l = planx.board.list(); return l.filter((i) => i.comp).length + ' ' + l.filter((i) => i.inst).length; })()`), 'one component, two instances').toBe('1 2');
    // Someone else's object on the board: under "Объекты документа", kept with «+».
    await p.ev(`(() => { const e = planx.editor, b = planx.board; b.add(e.newItem('frame', 900, 300, { id: 'their', comp: true, obj: true, lib: 'elsewhere', text: 'Чужой', w: 200, h: 120, members: [] })); })()`);
    await p.click(await p.at('.tools [data-key="objects"]'));
    const docRow = await p.ev(`(() => { const r = [...document.querySelectorAll('.objects-menu .menu-row')].find((b) => b.textContent === 'Объекты документа').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await p.mouse('mouseMoved', ...docRow);
    await sleep(150);
    await p.click(await p.at('.objects-mine .menu-take'));
    await sleep(150);
    expect(await p.ev(`JSON.parse(localStorage.getItem('planx-my-objects')).map((o) => o.name).join()`), 'kept').toBe('Карточка,Чужой');
    expect(await p.ev(`[...document.querySelectorAll('.objects-menu > .menu-item > .menu-row span')].map((e) => e.textContent).join(' | ')`), 'no longer the board\'s own only').toBe('Таймлайн | Мои объекты');
    await p.ev(`localStorage.removeItem('planx-my-objects')`);
  },

  async '"Объекты": the rail button opens the menu, a timeline is put with a click, holds what is put on it, in half days'(p) {
    await p.click(await p.at('.tools [data-key="objects"]'));
    expect(await p.ev(`document.querySelector('.objects-menu .menu-row span')?.textContent`), 'the menu').toBe('Таймлайн');
    await p.click(await p.at('.objects-menu .menu-row'));
    expect(await p.ev('planx.editor.tool'), 'its tool').toBe('timeline');
    await p.click([600, 400]);
    const tl = await p.ev(`(() => { const t = planx.board.list().find((i) => i.tl); return t && { id: t.id, x: t.x, y: t.y, w: t.w, tl: t.tl }; })()`);
    expect(tl.tl, 'from the first of this month').toBe(new Date().toISOString().slice(0, 7) + '-01');
    // A sticker dragged on: in half days from its start, and it goes along with it.
    await p.ev(`(() => { const e = planx.editor; planx.board.add(e.newItem('sticky', ${tl.x} + 400, ${tl.y} - 120, { id: 'st', w: 60, h: 60 })); e.setSelection([]); })()`);
    const st = await p.ev(`(() => { const s = planx.editor.toScreen({ x: ${tl.x} + 430, y: ${tl.y} - 90 }); return [s.x, s.y]; })()`);
    await p.drag(st, [st[0] + 7, st[1] + 180]);
    const off = await p.ev(`(planx.board.get('st').x - ${tl.x} - 19) / 11.5`);
    expect(Math.abs(off - Math.round(off)) < 1e-6, `on a half day (${off})`).toBe(true);
    expect(await p.ev(`planx.board.get('${tl.id}').members.includes('st')`), 'held by it').toBe(true);
    // Its left side moved two days on: it starts two days later, there, what's on it staying.
    const stX = await p.ev(`planx.board.get('st').x`);
    await p.ev(`(() => { const e = planx.editor, t = planx.board.get('${tl.id}'); e.cam = { x: 200 - t.x * 0.5, y: 300 - t.y * 0.5, z: 0.5 }; e.camChanged(); e.setSelection(['${tl.id}']); })()`);
    await sleep(100);
    const left = await p.ev(`(() => { const t = planx.board.get('${tl.id}'), s = planx.editor.toScreen({ x: t.x + 1, y: t.y + t.h / 4 }); return [s.x, s.y]; })()`);
    await p.mouse('mouseMoved', left[0], left[1]);
    await sleep(100);
    expect(await p.ev('planx.editor.canvas.style.cursor'), 'its left side').toBe('ew-resize');
    await p.drag(left, [left[0] + 23, left[1]]);
    const now = await p.ev(`(() => { const t = planx.board.get('${tl.id}'); return { x: t.x, w: t.w, tl: t.tl }; })()`);
    expect(now.x - tl.x, 'two days on').toBe(46);
    expect(now.w, 'two days shorter').toBe(tl.w - 46);
    expect(now.tl.slice(8), 'from the third').toBe('03');
    expect(await p.ev(`planx.board.get('st').x`), 'what is on it stays').toBe(stX);
  },

  async '"Меню по правому клику": a right click picks what is under it and opens the menu; its rows do what they say'(p) {
    await stickers(p);
    await p.ev('planx.editor.setSelection([])');
    const a = await p.ev(`(() => { const i = planx.board.list().find((x) => x.text === 'Купить молоко'), s = planx.editor.toScreen({ x: i.x + 40, y: i.y + 40 }); return [s.x, s.y, i.id]; })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0], y: a[1] });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: a[0], y: a[1], button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a[0], y: a[1], button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    expect(await p.ev('[...planx.editor.selection].join()'), 'picked').toBe(a[2]);
    expect(await p.ev(`[...document.querySelectorAll('.context-menu .menu-row span')].map((s) => s.textContent).join(', ')`), 'its rows')
      .toBe('Параметры, Комментарий, Скопировать, Переместить вверх, Переместить вниз, Сделать компонентом, Удалить');
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Удалить').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`planx.board.get('${a[2]}') ?? null`), 'deleted').toBe(null);
    expect(await p.ev(`document.querySelectorAll('.context-menu').length`), 'and the menu gone').toBe(0);
  },

  async '"Линии": the rail tool links any item to any other; a line dragged by its middle goes to another item'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x, y } = e.toWorld(300, 300);
      b.add(e.newItem('sticky', x, y, { id: 'a', w: 100, h: 100 }));
      b.add(e.newItem('sticky', x + 400, y, { id: 'b', w: 100, h: 100 }));
      b.add(e.newItem('sticky', x + 400, y + 250, { id: 'c', w: 100, h: 100 }));
      e.setSelection([]); })()`);
    // On a short screen it's under "more".
    if (!(await p.rect('.tools [data-key="lines"]'))) await p.click(await p.at('.tools > button[aria-label="Ещё"]'));
    await p.click(await p.at('[data-key="lines"], [data-more-key="lines"]'));
    expect(await p.ev('planx.editor.tool'), 'the line tool').toBe('link');
    await p.drag([350, 350], [750, 350]);
    const l = await p.ev(`(() => { const l = planx.board.linkList()[0]; return l && { id: l.id, from: l.from, to: l.to }; })()`);
    expect(`${l.from}>${l.to}`, 'from one to the other').toBe('a>b');
    // A click on its middle picks it, nothing else.
    await p.click([550, 350]);
    expect(await p.ev('[...planx.editor.selection].join()'), 'picked').toBe(l.id);
    expect(await p.ev(`planx.board.getLink('${l.id}').to`), 'still to the same').toBe('b');
    expect(await p.ev('planx.editor.canvas.style.cursor') !== 'grab', 'no hand over its middle').toBe(true);
    // Dragged by its line (off its middle, where a new node would be pulled out) onto another.
    await p.drag([450, 350], [750, 600]);
    expect(await p.ev(`planx.board.getLink('${l.id}').to`), 'to the other now').toBe('c');
    // Dragged by its line onto nothing: it's gone, as by its head.
    const mid = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), sh = g.linkShape(planx.board.getLink('${l.id}'), (id) => planx.board.get(id));
      const m = sh.pts[Math.floor(sh.pts.length / 3)], s = planx.editor.toScreen(m); return [s.x, s.y]; })()`);
    await p.click(mid);
    expect(await p.ev('[...planx.editor.selection].join()'), 'on its line').toBe(l.id);
    await p.drag(mid, [1000, 150]);
    expect(await p.ev(`planx.board.getLink('${l.id}') ?? null`), 'let go on nothing: gone').toBe(null);
  },

  async '"Меню по правому клику" on the board: zoom to 100%, paste there; on a rectangle, its parameters'(p) {
    const right = async ([x, y]) => {
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
      await sleep(200);
    };
    const rows = () => p.ev(`[...document.querySelectorAll('.context-menu .menu-row span')].map((s) => s.textContent).join(', ')`);
    const pick = async (label) => p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent.includes('${label}')).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await p.ev(`(() => { const e = planx.editor; e.zoomCenter(0.5 / e.cam.z); e.setSelection([]); })()`);
    await right([900, 600]);
    expect(await rows(), 'nothing copied: the zoom, a comment').toBe('Масштаб 100%, Комментарий');
    await pick('Масштаб 100%');
    expect(await p.ev('planx.editor.cam.z'), 'at 100%').toBe(1);
    // A rectangle: its parameters.
    await p.ev(`(() => { const e = planx.editor, { x, y } = e.toWorld(300, 300); planx.board.add(e.newItem('rect', x, y, { id: 'r', w: 200, h: 120, text: 'Фигура' })); })()`);
    const r = await p.ev(`(() => { const i = planx.board.get('r'), s = planx.editor.toScreen({ x: i.x + 30, y: i.y + 30 }); return [s.x, s.y]; })()`);
    await right(r);
    expect(await rows(), 'parameters first').toBe('Параметры, Комментарий, Скопировать, Переместить вверх, Переместить вниз, Сделать компонентом, Удалить');
    await pick('Параметры');
    expect(await p.ev(`!!document.querySelector('.params-pop .params-colors')`), 'the popup: colours').toBe(true);
    await p.click(await p.at('.params-pop button[aria-label="Заливка: pink"]'));
    expect(await p.ev(`document.querySelector('.params-pop button[aria-label="Обводка: ink"]') !== null`), 'its outline too').toBe(true);
    expect(await p.ev(`document.querySelector('.params-pop button[aria-label="Жирный"]') !== null`), 'its text as the text panel sets it').toBe(true);
    await p.ev(`(() => { const i = document.querySelector('.params-pop input[type=number]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '24'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(100);
    expect(await p.ev(`planx.board.get('r').color + ' ' + planx.board.get('r').rad`), 'its colour and rounding').toBe('pink 24');
    await p.key('Escape', 'Escape', 27);
    // Copied, then pasted where the board was right-clicked.
    await p.ev(`planx.editor.setSelection(['r']); planx.editor.copy(); planx.editor.setSelection([])`);
    await right([900, 500]);
    expect(await rows(), 'with something copied').toBe('Масштаб 100%, Вставить, Комментарий');
    await pick('Вставить');
    const pasted = await p.ev(`(() => { const i = planx.board.list().find((x) => x.type === 'rect' && x.id !== 'r'), s = planx.editor.toScreen({ x: i.x + i.w / 2, y: i.y + i.h / 2 }); return [Math.round(s.x), Math.round(s.y)]; })()`);
    expect(Math.abs(pasted[0] - 900) <= 1 && Math.abs(pasted[1] - 500) <= 1, `pasted there (${pasted})`).toBe(true);
  },

  async '"Линии": with the line tool, any item under the pointer shows its dots, a mind map node too, and a line goes from the one pressed'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x, y } = e.toWorld(300, 300);
      b.add(e.newItem('mind', x, y, { id: 'm', w: 200, h: 56, text: 'Тема' }));
      b.add(e.newItem('sticky', x + 500, y - 50, { id: 's', w: 120, h: 120 }));
      e.setSelection([]); e.setTool('link'); })()`);
    await p.mouse('mouseMoved', 400, 328);
    await sleep(100);
    expect(await p.ev('planx.editor.linkDots'), 'its dots show').toBe('m');
    const dot = await p.ev(`(() => { const m = planx.board.get('m'), s = planx.editor.toScreen({ x: m.x + m.w + 12, y: m.y + m.h / 2 }); return [s.x, s.y]; })()`);
    await p.mouse('mouseMoved', dot[0], dot[1]);
    await sleep(100);
    expect(await p.ev('planx.editor.linkDots + " " + planx.editor.hotDot'), 'still, on its right dot').toBe('m right');
    await p.drag(dot, [860, 310]);
    const l = await p.ev(`(() => { const l = planx.board.linkList()[0]; return l && l.from + '>' + l.to + ' ' + l.fromSide; })()`);
    expect(l, 'from that dot to the sticker').toBe('m>s right');
  },

  async '"Параметры" of several picked, an instance by what is in it: each under its name, with its opacity'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board, { x, y } = e.toWorld(300, 300);
      b.add(e.newItem('sticky', x, y, { id: 's', w: 100, h: 100 }));
      b.add(e.newItem('text', x + 150, y, { id: 't', w: 150, text: 'Подпись' }));
      e.addTask({ x: x + 500, y: y + 100 }); e.stopEditing();
      const task = b.list().find((i) => i.inst === '@task-open');
      e.setSelection(['s', 't', task.id]); })()`);
    await sleep(200);
    const at = await p.ev(`(() => { const i = planx.board.get('s'), s = planx.editor.toScreen({ x: i.x + 30, y: i.y + 30 }); return [s.x, s.y]; })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at[0], y: at[1], button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at[0], y: at[1], button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Параметры').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    const titles = await p.ev(`[...document.querySelectorAll('.params-pop .params-title')].map((t) => t.textContent).join(' | ')`);
    expect(titles, 'each, the task by what is in it').toBe('Заметка | Текст «Подпись» | Прямоугольник | Эллипс | Текст «Что надо сделать» | Текст «Подробности»');
    expect(await p.ev(`[...document.querySelectorAll('.params-pop .params-item')].map((i) => i.querySelectorAll('input[type=range]').length).join()`), 'an opacity for each colour (no text yet, no text colour)')
      .toBe('1,1,2,2,1,1');
    await p.ev(`(() => { const r = document.querySelectorAll('.params-pop input[type=range]')[0]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, '50'); r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    expect(await p.ev(`planx.board.get('s').fo`), 'the sticker half see-through').toBe(0.5);
  },

  async '"Параметры" of a line: colour, opacity, dashes, its arrowheads at the start and the end'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 200, 300, { id: 'a', w: 100, h: 100 }));
      b.add(e.newItem('sticky', 700, 300, { id: 'b', w: 100, h: 100 }));
      b.addLink({ id: 'L', from: 'a', to: 'b', style: 'straight' }); e.setSelection([]); })()`);
    await sleep(200);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 350, button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 500, y: 350, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    expect(await p.ev(`[...document.querySelectorAll('.context-menu .menu-row span')].map((s) => s.textContent).join(', ')`), 'its menu').toBe('Параметры, Удалить');
    await p.click(await p.at('.context-menu .menu-row'));
    await p.click(await p.at('.params-pop button[aria-label="Цвет: red"]'));
    await p.ev(`(() => { const r = document.querySelector('.params-pop input[type=range]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, '60'); r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const row = async (label) => p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.params-pop .menu-row')].find((b) => b.textContent === '${label}').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await row('Пунктир');
    await row('Стрелка в начале');
    await row('Стрелка в конце');
    const l = await p.ev(`JSON.stringify((({ color, lo, dash, heads }) => ({ color, lo, dash, heads }))(planx.board.getLink('L')))`);
    expect(l, 'red, 60%, dashed, a head at its start only').toBe('{"color":"red","lo":0.6,"dash":true,"heads":"start"}');
  },

  async '"Комментарии": put by a right click on an item, it goes with it; opened, solved, answered once; its own removed'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 150, h: 150 })); e.setSelection([]); })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 400, y: 340, button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 400, y: 340, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Комментарий').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(200);
    await p.cdp('Input.insertText', { text: 'Проверить сроки' });
    await p.key('Enter', 'Enter', 13);
    await sleep(200);
    const stored = () => p.ev(`(async () => { const c = await import('/src/labs/comments.ts'); return c.comments(planx.board); })()`);
    let [c] = await stored();
    expect(`${c.text} ${c.on} ${c.dx},${c.dy}`, 'on the sticker, where clicked').toBe('Проверить сроки s 100,40');
    expect(await p.ev(`document.querySelectorAll('.comment-pin').length`), 'its pin').toBe(1);
    // The sticker moved: the pin with it.
    await p.ev(`planx.board.update('s', { x: 400 })`);
    await sleep(200);
    const pin = await p.ev(`(() => { const r = document.querySelector('.comment-pin').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.bottom)]; })()`);
    expect(pin.join(), 'pin went along').toBe('500,340');
    // Dragged off it, onto the empty board: pinned there; back onto it: on it again (nothing picked, so
    // no panel over it).
    await p.ev('planx.editor.setSelection([])');
    await sleep(200);
    await p.drag([515, 325], [815, 225]);
    [c] = await stored();
    expect(`${c.on ?? 'board'} ${c.x},${c.y}`, 'on the board where let go').toBe('board 800,240');
    expect(await p.ev(`document.querySelectorAll('.comment-card').length`), 'dragged: still open as it was, not toggled').toBe(1);
    await p.drag([815, 225], [515, 325]);
    [c] = await stored();
    expect(`${c.on} ${c.dx},${c.dy}`, `on the sticker again (${JSON.stringify(c)})`).toBe('s 100,40');
    // Solved, answered.
    await p.click(await p.at('.comment-card .comment-solve'));
    await p.click(await p.at('.comment-card .comment-answer'));
    await p.cdp('Input.insertText', { text: 'Сделано' });
    await p.key('Enter', 'Enter', 13);
    await sleep(200);
    [c] = await stored();
    expect(`${c.done} ${c.reply?.text}`, 'ticked, answered').toBe('true Сделано');
    expect(await p.ev(`document.querySelectorAll('.comment-answer').length`), 'once only').toBe(0);
    // Its own: removed.
    await p.click(await p.at('.comment-card .comment-more'));
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.comment-menu button')].find((b) => b.textContent === 'Удалить').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect((await stored()).length, 'gone').toBe(0);
  },

  async '"Зум рамкой": a box drawn with Z held fills the screen, nothing picked'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 150, h: 150 })); e.setSelection([]); })()`);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    // The magnifier all along, over the sticker too, with the pointer just moved.
    const cur = [];
    for (const [x, y] of [[200, 200], [370, 370], [380, 380]]) {
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      cur.push(await p.ev(`getComputedStyle(planx.editor.canvas).cursor`));
    }
    expect(cur.join(), 'the magnifier only').toBe('zoom-in,zoom-in,zoom-in');
    await p.drag([250, 250], [450, 450]);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    await sleep(600);
    expect(await p.ev(`getComputedStyle(planx.editor.canvas).cursor !== 'zoom-in'`), 'Z let go: no magnifier').toBe(true);
    const r = await p.ev(`(() => { const a = planx.editor.toScreen({ x: 250, y: 250 }), b = planx.editor.toScreen({ x: 450, y: 450 }), W = planx.editor.canvas.clientWidth, H = planx.editor.canvas.clientHeight;
      return [Math.round(Math.min(W / (b.x - a.x), H / (b.y - a.y)) * 100) / 100, Math.round((a.x + b.x) / 2 - W / 2), Math.round((a.y + b.y) / 2 - H / 2), planx.editor.selection.size].join(); })()`);
    expect(r, 'the box fills the screen, centred, nothing picked').toBe('1,0,0,0');
    // On the way, the box's middle only comes nearer the screen's, never off to a side and back.
    const off = await p.ev(`(async () => { const e = planx.editor, z = await import('/src/labs/zoomBox.ts');
      e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); const W = e.canvas.clientWidth / 2, H = e.canvas.clientHeight / 2;
      z.zoomToBox(e, { x: 250, y: 250, w: 200, h: 200 }); const pts = [];
      await new Promise((done) => { const t = () => { const c = e.toScreen({ x: 350, y: 350 }); pts.push(c); if (pts.length < 40) requestAnimationFrame(t); else done(); }; t(); });
      const d = pts.map((c) => Math.hypot(c.x - W, c.y - H));
      return Math.max(0, ...d.slice(1).map((v, i) => v - d[i])); })()`);
    expect(off < 0.5, `only nearer and nearer (once ${off.toFixed(1)}px further)`).toBe(true);
    // Z held, a double click even on the sticker: all of the board in view.
    await sleep(500);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: -600, y: -600, z: 3 }; e.camChanged(); })()`);
    const on = await p.ev(`(() => { const s = planx.editor.toScreen({ x: 375, y: 375 }); return [s.x, s.y]; })()`);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    await p.click(on); await p.click(on);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    await sleep(600);
    expect(await p.ev(`(() => { const e = planx.editor, a = e.toScreen({ x: 300, y: 300 }), b = e.toScreen({ x: 450, y: 450 }); return a.x > 0 && a.y > 0 && b.x < e.canvas.clientWidth && b.y < e.canvas.clientHeight && e.cam.z < 3 && e.selection.size === 0; })()`), 'all in view, nothing picked').toBe(true);
  },

  async 'the board cleared takes its comments too; one Ctrl+Z brings both back'(p) {
    const n = () => p.ev(`(async () => { const c = await import('/src/labs/comments.ts'); return c.comments(planx.board).length; })()`);
    await p.ev(`(async () => { const c = await import('/src/labs/comments.ts'), e = planx.editor, b = planx.board;
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 150, h: 150 })); c.addComment(b, { x: 50, y: 50 }, undefined, 'Раз', 'Кот'); })()`);
    expect(await n(), 'put').toBe(1);
    await p.ev('planx.editor.clearBoard()');
    expect(`${await n()} ${await p.ev('planx.board.list().length')}`, 'cleared').toBe('0 0');
    await p.ev('planx.editor.undo()');
    expect(`${await n()} ${await p.ev('planx.board.list().length')}`, 'back').toBe('1 1');
  },

  async 'lines picked together by a box take their parameters together, by a right click or from the selection panel'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 100, 100, { id: 'a', w: 100, h: 100 })); b.add(e.newItem('sticky', 500, 100, { id: 'b', w: 100, h: 100 }));
      b.add(e.newItem('sticky', 100, 350, { id: 'c', w: 100, h: 100 })); b.add(e.newItem('sticky', 500, 350, { id: 'd', w: 100, h: 100 }));
      b.addLink({ id: 'L1', from: 'a', to: 'b', style: 'straight' }); b.addLink({ id: 'L2', from: 'c', to: 'd', style: 'straight' }); e.setSelection([]); })()`);
    await p.drag([260, 90], [440, 460]);
    expect(await p.ev('[...planx.editor.selection].sort().join()'), 'both by a box').toBe('L1,L2');
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 350, y: 150, button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 350, y: 150, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    expect(await p.ev('[...planx.editor.selection].sort().join()'), 'still both').toBe('L1,L2');
    await p.click(await p.at('.context-menu .menu-row'));
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.params-pop .menu-row')].find((b) => b.textContent === 'Пунктир').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`planx.board.linkList().map((l) => !!l.dash).join()`), 'both dashed').toBe('true,true');
    await p.key('Escape', 'Escape', 27);
    await p.ev(`planx.editor.setSelection(['L1', 'L2'])`);
    await sleep(300);
    await p.click(await p.at('.bar.panel button[aria-label="Цвет и стрелки линий"]'));
    await p.click(await p.at('.palette-pop button[aria-label="Цвет: green"]'));
    expect(await p.ev(`planx.board.linkList().map((l) => l.color).join()`), 'both green from the panel').toBe('green,green');
  },
};

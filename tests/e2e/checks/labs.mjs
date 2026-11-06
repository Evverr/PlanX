// The features on trial ("Нововведения", src/labs): their switches, and each doing its job.
import { expect, sleep } from '../lib.mjs';
import { carry } from './sortable.mjs';

/** Two stickers through the app's handle; gives back their ids. */
const stickers = (p) => p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(400, 250);
  const a = e.newItem('sticky', X, Y, { text: 'Купить молоко' }), c = e.newItem('sticky', X + 260, Y, { text: 'Позвонить Ёжику' });
  b.add(a); b.add(c); return { a: a.id, c: c.id }; })()`);
const select = (p, id) => p.ev(`planx.editor.setSelection(['${id}'])`);

export const checks = {
  async '"Код": its copy button copies the code; a block too small for its code scrolls it by the wheel'(p) {
    const text = Array.from({ length: 14 }, (_, i) => `const line${i} = "очень длинная строка кода номер ${i}, чтобы не влезла";`).join('\\n');
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('rect', 200, 150, { id: 'c', code: 'js', text: '${text}', w: 420, h: 200, fs: 14, ff: 'mono', rad: 16 })); e.setSelection([]); })()`);
    await sleep(300);
    const cam = await p.ev('JSON.stringify(planx.editor.cam)');
    await p.mouse('mouseMoved', 400, 280);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 280, deltaX: 0, deltaY: 60 });
    await sleep(100);
    expect(await p.ev('JSON.stringify(planx.editor.cam)'), 'the code scrolled, not the board').toBe(cam);
    // Scrolled to its end: the board stays put still.
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 280, deltaX: 0, deltaY: 3000 });
    await sleep(100);
    expect(await p.ev('JSON.stringify(planx.editor.cam)'), 'at its end, the board not scrolled either').toBe(cam);
    // With Shift, across: as a Mac sends it, and as elsewhere.
    for (const [deltaX, deltaY] of [[40, 0], [0, 40]]) {
      const shot = () => p.ev(`document.querySelector('canvas').toDataURL()`), before = await shot();
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 280, deltaX, deltaY, modifiers: 8 });
      await sleep(100);
      expect(await shot() !== before, `Shift+wheel ${deltaX},${deltaY}: the code scrolled across`).toBe(true);
      expect(await p.ev('JSON.stringify(planx.editor.cam)'), `Shift+wheel ${deltaX},${deltaY}: the board stays`).toBe(cam);
    }
    await p.ev(`window.clip = null; navigator.clipboard.writeText = async (t) => { window.clip = t; }`);
    await p.click([200 + 420 - 26, 150 + 22]);
    await sleep(100);
    expect(await p.ev(`window.clip?.split('\\n').length`), 'all of it copied').toBe(14);
  },

  async '"Код": a block from the right rail, typed in at once, coloured, growing with its lines; its language picked on its panel'(p) {
    await p.click(await p.at('.labs-rail button[aria-label="Код"]'));
    await sleep(200);
    expect(await p.ev(`!!document.querySelector('textarea.text-edit.code')`), 'typed in at once').toBe(true);
    await p.cdp('Input.insertText', { text: 'function hello(name) {\n  return `Привет, ${name}!`;\n}' });
    await sleep(100);
    await p.key('Escape', 'Escape', 27);
    await sleep(200);
    const it = await p.ev(`planx.board.list().find((i) => i.code)`);
    expect([it.type, it.code, it.text.split('\n').length, it.h].join(), 'kept, as tall as its lines').toBe(`rect,js,3,${Math.ceil(56 + 3 * 21 + 16)}`);
    expect(await p.ev(`!!document.querySelector('.tfmt')`), 'no text panel').toBe(false);
    await p.click(await p.at('.bar.panel .code-lang .fpick'));
    await sleep(100);
    await p.click(await p.at('.code-lang .tf-item:nth-child(3)'));
    await sleep(100);
    expect(await p.ev(`planx.board.list().find((i) => i.code).code`), 'Python').toBe('py');
    expect(await p.ev(`document.querySelector('.bar.panel .code-lang .fpick').textContent`), 'shown on the panel').toBe('Python');
  },

  async '"Код": code too long pasted in grows the block to the screen\'s bottom edge at most, the rest scrolled to'(p) {
    await p.click(await p.at('.labs-rail button[aria-label="Код"]'));
    await sleep(200);
    await p.cdp('Input.insertText', { text: Array.from({ length: 120 }, (_, i) => `line(${i});`).join('\n') });
    await sleep(200);
    const bottom = () => p.ev(`(() => { const it = planx.board.list().find((i) => i.code); return Math.round(planx.editor.toScreen({ x: it.x, y: it.y + it.h }).y); })()`);
    expect(await bottom() <= 800, 'down to the screen\'s edge at most').toBe(true);
    expect(await p.ev(`document.querySelector('textarea.text-edit.code').scrollTop > 0`), 'scrolled to the caret, at the end').toBe(true);
    await p.key('Escape', 'Escape', 27);
    await sleep(200);
    expect(await bottom() <= 800, 'kept so').toBe(true);
  },

  async '"Настройки" (the board menu) have a switch for each feature on trial, and a switched off one goes away'(p) {
    expect(!!(await p.rect('.labs-rail button[aria-label="Общий таймер"]')), 'the timer button at first').toBeTruthy();
    const open = async (label) => {
      await p.click(await p.at('.topbar button[aria-label="Меню"]'));
      await p.click(await p.ev(`(() => { const e = [...document.querySelectorAll('.board-menu .menu-row')].find((r) => r.textContent === '${label}'); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
      await sleep(150);
    };
    await open('Настройки');
    expect(await p.ev(`document.querySelectorAll('.modal.settings .labs-list .settings-row .menu-switch').length`), 'switches').toBe(await p.ev(`(async () => (await import('/src/labs/labs.ts')).LABS.length)()`));
    await p.click(await p.ev(`(() => { const e = [...document.querySelectorAll('.settings-row')].find((r) => r.textContent.includes('Общий таймер')); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`[...document.querySelectorAll('.labs-list .settings-row')].find((r) => r.textContent.includes('Общий таймер')).getAttribute('aria-checked')`), 'switched off').toBe('false');
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
    const row = await p.ev(`(() => { const e = [...document.querySelectorAll('.board-menu .menu-row')].filter((r) => r.textContent.includes('Нововведения')).pop(); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
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

  async 'three dots at the right end of the bottom and the text panel open the right click\'s menu, the panel staying; answering up to its edge'(p) {
    const ids = await stickers(p);
    await select(p, ids.a);
    await sleep(300);
    const edge = (q) => p.ev(`(() => { const r = document.querySelector('${q}').getBoundingClientRect(); return !!document.elementFromPoint(r.right - 2, r.top + r.height / 2)?.closest('.item-menu'); })()`);
    const rows = () => p.ev(`[...document.querySelectorAll('.context-menu .menu-row')].map((b) => b.textContent).join()`);
    expect(await p.ev(`document.querySelector('.bar.panel .ib:not(.item-menu)').offsetWidth - document.querySelector('.bar.panel .item-menu').offsetWidth`), 'its highlight 6 narrower').toBe(6);
    // From the dots' middle to the panel's edge 6 less than from another button's to its right.
    expect(await p.ev(`(() => { const b = document.querySelector('.bar.panel .item-menu').getBoundingClientRect(), n = document.querySelector('.bar.panel').getBoundingClientRect(); return Math.round(n.right - (b.left + b.width / 2)); })()`), 'the panel 6 shorter past them').toBe(30);
    expect(await edge('.bar.panel'), 'answers at the panel\'s very edge').toBe(true);
    await p.click(await p.at('.bar.panel .item-menu'));
    expect((await rows()).includes('Параметры,'), 'the menu').toBe(true);
    expect((await rows()).endsWith('Удалить'), 'all of it').toBe(true);
    const menu = await p.rect('.context-menu'), bar = await p.rect('.bar.panel');
    expect(menu.b <= bar.t, 'above the panel').toBe(true);
    expect(menu.r, 'level with its right end').toBe(bar.r);
    expect(await p.ev(`document.querySelector('.bar.panel .item-menu').classList.contains('on')`), 'its button lit').toBe(true);
    await p.click(await p.at('.bar.panel .item-menu'));
    await sleep(150);
    expect(await rows(), 'pressed again: closed').toBe('');
    // Its rows do what they do from a right click.
    await p.click(await p.at('.bar.panel .item-menu'));
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Удалить').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    expect(await p.ev(`!!planx.board.get('${ids.a}')`), 'deleted').toBe(false);
    // While typing: at the text panel's end, for what's typed in.
    await p.ev(`planx.editor.setSelection(['${ids.c}']); planx.editor.startEditing('${ids.c}')`);
    await sleep(400);
    expect(await edge('.tfmt'), 'answers at the text panel\'s very edge').toBe(true);
    await p.click(await p.at('.tfmt .item-menu'));
    await sleep(150);
    expect((await rows()).includes('Скопировать'), 'the menu').toBe(true);
    expect(await p.ev(`planx.editor.editingId`), 'still typing').toBe(ids.c);
    expect(!!(await p.rect('.tfmt:not(.leaving)')), 'the panel staying').toBe(true);
    await p.escape();
    await sleep(150);
    expect(await rows(), 'Esc: closed').toBe('');
    expect(await p.ev(`planx.editor.editingId`), 'and still typing').toBe(ids.c);
    expect(!!(await p.rect('.tfmt:not(.leaving)')), 'the panel too').toBe(true);
    // A row pressed does it, the typing over.
    await p.click(await p.at('.tfmt .item-menu'));
    await sleep(150);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Переместить вниз').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(150);
    expect(await rows(), 'done: closed').toBe('');
    expect(await p.ev(`planx.editor.editingId`), 'typing over').toBe(null);
    // A link alone: its own menu.
    await p.ev(`(() => { const e = planx.editor, b = planx.board; b.add(e.newItem('sticky', 200, 500, { id: 'z' })); b.addLink({ id: 'l', from: '${ids.c}', to: 'z' }); e.setSelection(['l']); })()`);
    await sleep(300);
    await p.click(await p.at('.bar.panel .item-menu'));
    expect(await rows(), 'a link\'s').toBe('Параметры,Удалить');
  },

  async '"Сплошная выбранная иконка": the tool that\'s on, white on blue, solid where there\'s a solid one; switched off, as it was'(p) {
    const on = () => p.ev(`(() => { const b = document.querySelector('.tools .fb.solid-on'); if (!b) return null; const i = getComputedStyle(b.querySelector('.pi')), f = getComputedStyle(b, '::before'); return [b.dataset.key, i.backgroundColor, f.backgroundColor, i.maskImage.includes('solid')].join(); })()`);
    await sleep(200);
    expect(await on(), 'the cursor: no solid one, in white').toBe('select,rgb(255, 255, 255),rgb(0, 128, 255),false');
    await p.ev(`planx.editor.setTool('sticky')`);
    await sleep(200);
    expect(await on(), 'a sticker: solid').toBe('sticky,rgb(255, 255, 255),rgb(0, 128, 255),true');
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('solidTool', false))()`);
    await sleep(200);
    expect(await on(), 'switched off').toBe(null);
    expect(await p.ev(`getComputedStyle(document.querySelector('.tools .fb.on'), '::before').backgroundColor`), 'the pale one back').toBe('rgba(75, 145, 255, 0.14)');
  },

  async '"История": a point set by hand, the board changed, gone back to it (asked, what it was kept as a point, one undo step); the switch is the board\'s'(p) {
    const ids = await stickers(p);
    await sleep(300);
    await p.click(await p.at('.labs-rail button[aria-label="История"]'));
    await sleep(300);
    expect(await p.ev(`document.querySelector('.history-list').textContent`), 'none yet').toBe('Точек пока нет.');
    expect(await p.ev(`document.querySelector('.history-pop .labs-seg .on').textContent`), 'by hand at first').toBe('Вручную');
    const kinds = () => p.ev(`[...document.querySelectorAll('.history-when i')].map((e) => e.textContent).join()`);
    await p.click(await p.at('.history-add'));
    await sleep(400);
    expect(await kinds(), 'a point').toBe('вручную');
    // Then the board's changed: something added, something gone, something moved, a new layer.
    await p.ev(`(async () => { const b = planx.board, e = planx.editor, l = await import('/src/labs/layers.ts'); b.add(e.newItem('sticky', 0, 0, { id: 'later' })); b.remove(['${ids.a}']); b.update('${ids.c}', { x: 5, text: 'Другое' }); l.addLayer(b); b.setTitle('Другая'); })()`);
    await sleep(300);
    // A press on its time: the board as it was, on the canvas, the real one left as it is.
    const real = () => p.ev(`planx.board.list().map((i) => i.text).sort().join('|')`);
    const onCanvas = () => p.ev(`planx.editor.shown().map((i) => i.text).sort().join('|')`);
    const was = await real(), cam0 = await p.ev(`planx.editor.cam`);
    await p.click(await p.at('.history-when'));
    await sleep(400);
    expect(await p.ev(`planx.editor.looking`), 'looking').toBe(true);
    expect(await onCanvas(), 'on the canvas, as it was').toBe('Купить молоко|Позвонить Ёжику');
    expect((await p.ev(`document.querySelector('.history-pill').textContent`)).startsWith('Как было: '), 'says so').toBe(true);
    expect(await p.ev(`getComputedStyle(document.querySelector('.tools')).visibility`), 'no tools').toBe('hidden');
    // Dragged, it moves; keys do nothing to it; the real board's as it is.
    const n = await p.ev(`planx.editor.cam.x`);
    await p.drag([700, 500], [760, 500]);
    expect(Math.round((await p.ev(`planx.editor.cam.x`)) - n), 'a drag moves the view').toBe(60);
    await p.key('a', 'KeyA', 65, 4);
    await p.key('Delete', 'Delete', 46);
    await p.key('z', 'KeyZ', 90, 4);
    expect(await onCanvas(), 'keys leave it').toBe('Купить молоко|Позвонить Ёжику');
    expect(await p.ev(`planx.editor.selection.size`), 'nothing picked').toBe(0);
    expect(await real(), 'the real board as it is').toBe(was);
    expect(await p.ev(`document.querySelector('.history-row').classList.contains('on')`), 'its row lit, the list still open').toBe(true);
    await p.escape();
    await sleep(200);
    expect(await p.ev(`planx.editor.looking`), 'Esc: over').toBe(false);
    expect(await onCanvas(), 'the real board back').toBe(was);
    expect((await p.ev(`planx.editor.cam.x`)), 'where it was').toBe(cam0.x);
    expect(await p.ev(`planx.editor.tool`), 'its tool').toBe('select');
    // Pressed again: off; going back from the bar, asked as ever.
    await p.click(await p.at('.history-when'));
    await sleep(300);
    await p.click(await p.at('.history-when'));
    await sleep(300);
    expect(await p.ev(`planx.editor.looking`), 'pressed again: over').toBe(false);
    await p.click(await p.at('.history-when'));
    await sleep(400);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.history-pill .btn')].find((b) => b.textContent === 'Откатиться').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(200);
    expect((await p.ev(`document.querySelector('.confirm p').textContent`)).startsWith('Вернуть доску к '), 'asked first').toBe(true);
    await p.click(await p.at('.confirm .btn.primary'));
    await sleep(700);
    const state = () => p.ev(`(async () => { const b = planx.board, l = await import('/src/labs/layers.ts'); return [b.list().map((i) => i.text).sort().join('|'), l.layersOf(b).length, b.meta.get('title') ?? ''].join(' ; '); })()`);
    expect(await state(), 'as it was').toBe('Купить молоко|Позвонить Ёжику ; 1 ; ');
    expect(await p.ev(`document.querySelector('.labs-toast')?.textContent?.startsWith('Доска возвращена')`), 'said so').toBe(true);
    expect(await p.ev(`(async () => (await (await fetch('/history/' + new URLSearchParams(location.search).get('board'))).json()).map((p) => p.kind).join())()`), 'what it was, kept').toBe('before,manual');
    await p.ev(`planx.editor.undo()`);
    await sleep(200);
    expect(await state(), 'one undo: back again').toBe('|Другое ; 2 ; Другая');
    // The switch, for the whole board; a point's bin.
    await p.click(await p.at('.labs-rail button[aria-label="История"]'));
    await sleep(100);
    if (!(await p.rect('.history-pop'))) { await p.click(await p.at('.labs-rail button[aria-label="История"]')); await sleep(300); }
    await p.click(await p.ev(`(() => { const r = document.querySelector('.history-pop .labs-seg button').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(150);
    expect(await p.ev(`planx.board.doc.getMap('labs').get('historyAuto')`), 'set on the board').toBe(true);
    expect(!!(await p.rect('.history-add')), 'no button then').toBe(false);
    await p.ev(`document.querySelector('.history-delete').click()`);
    await sleep(400);
    expect(await kinds(), 'taken off').toBe('вручную');
    await p.ev(`document.querySelector('.history-delete').click()`);
    await sleep(300);
  },

  async '"Связи инструментом": no dots on what\'s picked; «Связи» on the zoom bar (or C) puts out every item\'s, a mind map node\'s under the pointer, the cursor kept, things moved as usual'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('linkTool', true))()`);
    await sleep(100);
    const { a, c } = await stickers(p);
    await p.ev(`(() => { const e = planx.editor; planx.board.add(e.newItem('mind', ...Object.values(e.toWorld(500, 600)), { id: 'm', text: 'Тема', w: 120, h: 50 })); })()`);
    // Where an item's right dot is, and its middle, on the screen.
    const dot = (id) => p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), r = await import('/src/canvas/renderer.ts'), e = planx.editor, it = planx.board.get('${id}');
      const s = e.toScreen(g.sidePoint(it, 'right', r.dotGap(it, 'right') / e.cam.z)), b = e.canvas.getBoundingClientRect(); return [s.x + b.left, s.y + b.top]; })()`);
    const mid = (id) => p.ev(`(() => { const e = planx.editor, i = planx.board.get('${id}'), s = e.toScreen({ x: i.x + i.w / 2, y: i.y + i.h / 2 }), b = e.canvas.getBoundingClientRect(); return [s.x + b.left, s.y + b.top]; })()`);
    const links = () => p.ev(`planx.board.linkList().length`);
    // Picked: pulled from where its dot was, it's moved, not linked.
    await p.ev(`planx.editor.setSelection(['${a}'])`);
    await sleep(100);
    const d = await dot(a);
    await p.drag(d, [d[0] + 40, d[1]]);
    expect(await links(), 'no link from a picked one').toBe(0);
    await p.ev(`planx.board.update('${a}', { x: planx.board.get('${a}').x - 40 })`);
    // C: the dots out, the cursor still the tool; the button lit (light blue, its icon solid blue).
    await p.key('c', 'KeyC', 67);
    await sleep(100);
    expect(await p.ev(`(() => { const b = document.querySelector('button[aria-label="Связи"]'); return [planx.editor.tool, !b || b.classList.contains('solid-on')].join(); })()`), 'dots out, the cursor kept, the switch on blue').toBe('select,true');
    // From the first's right dot (the pointer never on the item itself) to the second.
    const from = await dot(a), to = await mid(c);
    await p.mouse('mouseMoved', from[0] + 2, from[1]);
    await sleep(100);
    expect(await p.ev(`[planx.editor.linkDots, planx.editor.hotDot].join()`), 'its dot taken').toBe(`${a},right`);
    await p.drag([from[0] + 2, from[1]], to);
    expect(await links(), 'linked').toBe(1);
    // Things move as usual meanwhile.
    const was = await p.ev(`planx.board.get('${c}').x`), at = await mid(c);
    await p.drag(at, [at[0] + 50, at[1]]);
    expect(await p.ev(`planx.board.get('${c}').x`) - was, 'moved').toBe(50);
    // A mind map node: its dots under the pointer.
    await p.mouse('mouseMoved', 560, 625);
    await sleep(100);
    expect(await p.ev(`[planx.editor.linkDots, planx.editor.plusNode()?.id ?? 'no buttons'].join()`), 'the node\'s dots, not its buttons').toBe('m,no buttons');
    // Picked: its buttons, not its dots.
    await p.click([560, 625]);
    await p.mouse('mouseMoved', 562, 626);
    await sleep(100);
    expect(await p.ev(`[planx.editor.linkDots ?? 'no dots', planx.editor.plusNode()?.id].join()`), 'picked: buttons, no dots').toBe('no dots,m');
    // A central topic's dots out with the pointer anywhere; a branch's not.
    expect(await p.ev(`(async () => { const m = await import('/src/labs/linkTool.ts'), none = new Set(); return [m.dotsAlways(planx.board.get('m'), none), m.dotsAlways({ ...planx.board.get('m'), parent: 'x' }, none)].join(); })()`), 'the central topic\'s always').toBe('true,false');
    await p.ev(`(() => { planx.editor.stopEditing(); planx.editor.setSelection([]); })()`);
    await p.key('c', 'KeyC', 67);
    await sleep(50);
    await p.mouse('mouseMoved', 561, 625);
    await sleep(100);
    expect(await p.ev(`planx.editor.plusNode()?.id ?? 'no buttons'`), 'the dots away: its buttons again').toBe('m');
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('linkTool', false))()`);
  },

  async '"Связи инструментом": an instance of a component has its dots, by what\'s in it, and takes links from them'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('linkTool', true))()`);
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 100, h: 100 })); e.setSelection(['s']); e.makeComponent(); e.stopEditing();
      const c = b.list().find((i) => i.comp); e.addInstance(c.id); const i = b.list().find((i) => i.inst); b.update(i.id, { x: 300, y: 500 });
      b.add(e.newItem('sticky', 800, 500, { id: 'far', w: 100, h: 100 })); e.stopEditing(); e.setSelection([]); })()`);
    await sleep(200);
    // (Its name, typed in as it's made, done with.)
    await p.ev(`planx.editor.stopEditing()`);
    await sleep(100);
    const inst = await p.ev(`planx.board.list().find((i) => i.inst).id`);
    // Its right dot, off what's in it (not its own box).
    const d = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), r = await import('/src/canvas/renderer.ts'), e = planx.editor, it = g.linkBox(planx.board.get('${inst}'));
      const s = e.toScreen(g.sidePoint(it, 'right', r.dotGap(it, 'right') / e.cam.z)), b = e.canvas.getBoundingClientRect(); return [s.x + b.left, s.y + b.top]; })()`);
    await p.key('c', 'KeyC', 67);
    await p.mouse('mouseMoved', d[0] + 1, d[1]);
    await sleep(100);
    expect(await p.ev(`[planx.editor.linkDots, planx.editor.hotDot].join()`), 'its dot').toBe(`${inst},right`);
    await p.drag([d[0] + 1, d[1]], [850, 550]);
    expect(await p.ev(`planx.board.linkList().map((l) => l.from + '>' + l.to).join()`), 'linked from it').toBe(`${inst}>far`);
    await p.key('c', 'KeyC', 67);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('linkTool', false))()`);
  },

  async 'the dark theme in "Настройки", not on the zoom bar; the link dots\' switch there instead'(p) {
    expect(await p.ev(`!!document.querySelector('.bar.zoom [aria-label="Тёмная тема"], .bar.zoom [aria-label="Светлая тема"]')`), 'none on the bar').toBe(false);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('linkTool', true))()`);
    await sleep(100);
    expect(!!(await p.rect('.bar.zoom button[aria-label="Связи"]')), 'the dots\' switch on it').toBe(true);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('linkTool', false))()`);
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    await p.ev(`[...document.querySelectorAll('.board-menu .menu-row')].find((r) => r.textContent.includes('Настройки')).click()`);
    await sleep(300);
    const flip = () => p.ev(`[...document.querySelectorAll('.settings-row')].find((r) => r.textContent.includes('Тёмная тема')).click()`);
    const was = await p.ev(`document.documentElement.dataset.theme`);
    await flip();
    await sleep(100);
    expect(await p.ev(`document.documentElement.dataset.theme`), 'the other theme').toBe(was === 'dark' ? 'light' : 'dark');
    await flip();
    await sleep(100);
    expect(await p.ev(`document.documentElement.dataset.theme`), 'back').toBe(was);
    await p.escape();
  },

  async '"Фон доски": three dots in the board menu pick lines, dots or nothing on the background'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 100, y: 100, z: 1 }; e.camChanged(); })()`);
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    const pixel = async (x, y) => { await sleep(150); return p.ev(`[...planx.editor.canvas.getContext('2d').getImageData(${x}, ${y}, 1, 1).data].slice(0, 3).join()`); };
    const pick = async (name) => p.ev(`document.querySelector('.size-dot[aria-label="${name}"]').click()`);
    const BG = '242,243,246';
    // By default the lines: one through the corner of the board's point (0, 0).
    expect(await p.ev(`document.querySelector('.size-dot[aria-label="Линии"]').getAttribute('aria-checked')`), 'lines first').toBe('true');
    expect(await pixel(100, 150) !== BG, 'a line').toBe(true);
    await pick('Точки');
    expect(await pixel(100, 100) !== BG, 'a dot').toBe(true);
    expect(await pixel(100, 110), 'nothing between them').toBe(BG);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 100, y: 100, z: 0.02 }; e.camChanged(); })()`);
    expect(await pixel(100, 100) !== BG, 'zoomed far out, a dot').toBe(true);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 100, y: 100, z: 40 }; e.camChanged(); })()`);
    expect(await pixel(100, 100) !== BG, 'zoomed far in, a dot').toBe(true);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 100, y: 100, z: 1 }; e.camChanged(); })()`);
    await pick('Пусто');
    expect(await pixel(100, 100), 'no dot').toBe(BG);
    expect(await pixel(100, 150), 'no line').toBe(BG);
    await pick('Линии');
    await p.escape();
  },

  async '"Кроп картинки": edges cut it for good, the ball rounds it, Esc drops it all, a press off it finishes'(p) {
    await p.ev(`(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 400, 200);
      const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('image', 400, 200, { id: 'pic', w: 400, h: 200, src: c.toDataURL('image/png') })); e.setSelection(['pic']); })()`);
    await sleep(300);
    const scissors = async () => p.click(await p.at('button[aria-label="Кроп"]'));
    const pic = () => p.ev(`(() => { const i = planx.board.get('pic'); return [i.x, i.y, i.w, i.h, i.rad ?? 0].join(); })()`);
    const pixels = () => p.ev(`new Promise((ok) => { const m = new Image(); m.onload = () => ok(m.naturalWidth + 'x' + m.naturalHeight); m.src = planx.board.get('pic').src; })`);
    await scissors();
    expect(await p.ev(`document.querySelector('button[aria-label="Кроп"]').classList.contains('on')`), 'lit').toBe(true);
    // Left edge in by 100; nothing on the board yet; Esc: as it was.
    await p.drag([400, 300], [500, 300]);
    expect(await pic(), 'nothing changed yet').toBe('400,200,400,200,0');
    await p.escape();
    await sleep(100);
    expect(await pic(), 'dropped').toBe('400,200,400,200,0');
    expect(await p.ev(`[...planx.editor.selection].join()`), 'still picked').toBe('pic');
    // In again: the left edge and the bottom one, the press inside not moving it; Enter.
    await scissors();
    await p.drag([600, 300], [650, 330]);
    expect(await pic(), 'stays put').toBe('400,200,400,200,0');
    await p.drag([400, 300], [500, 300]);
    await p.drag([600, 400], [600, 350]);
    await p.key('Enter', 'Enter', 13);
    await sleep(150);
    expect(await pic(), 'cut').toBe('500,200,300,150,0');
    expect(await pixels(), 'its pixels too').toBe('300x150');
    expect(await p.ev(`[...planx.editor.selection].join()`), 'still picked').toBe('pic');
    // Not undone: a step after adding it undone, it's cut still.
    await p.ev(`(() => { const u = planx.board.undoManager; u.stopCapturing(); planx.board.update('pic', { fo: 0.9 }); u.undo(); })()`);
    expect(await pixels(), 'gone for good').toBe('300x150');
    // The ball, at the lower left corner: rounds it; can be set anew; a press off it finishes.
    await p.ev(`planx.editor.setSelection(['pic'])`);
    await sleep(100);
    await scissors();
    await p.drag([500, 350], [530, 320]);
    await p.mouse('mouseMoved', 1000, 650);
    await p.click([1000, 650]);
    expect((await pic()).split(',')[4], 'rounded').toBe('30');
    expect(await pixels(), 'its pixels as they were').toBe('300x150');
    await p.ev(`planx.editor.setSelection(['pic'])`);
    await sleep(100);
    await scissors();
    await p.drag([530, 320], [500, 350]);
    await scissors();
    expect((await pic()).split(',')[4], 'square again').toBe('0');
    // A game sticker has no crop button.
    await p.ev(`(() => { const e = planx.editor, d = e.newItem('image', 100, 100, { id: 'dood', w: 80, h: 80, doodle: 'x' }); planx.board.add(d); e.setSelection(['dood']); })()`);
    await sleep(150);
    expect(!!(await p.rect('button[aria-label="Кроп"]')), 'none on a game sticker').toBeFalsy();
  },

  async 'the selection panel comes only on letting go: of something pressed, moved or not, and of a box drawn'(p) {
    const { a } = await stickers(p);
    const bars = () => p.ev(`document.querySelectorAll('.bar.panel:not(.gone)').length`);
    const at = await p.ev(`(() => { const e = planx.editor, i = planx.board.get('${a}'), s = e.toScreen({ x: i.x + i.w / 2, y: i.y + i.h / 2 }); return [s.x, s.y]; })()`);
    for (const lab of [false, true]) {
      await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', ${lab}))()`);
      // Pressed, not moved.
      await p.ev(`planx.editor.setSelection([])`);
      await sleep(250);
      await p.mouse('mouseMoved', at[0], at[1]);
      await p.mouse('mousePressed', at[0], at[1]);
      await sleep(200);
      expect(await p.ev(`planx.editor.selection.size`), 'picked as it\'s pressed').toBe(1);
      expect(await bars(), 'no panel yet').toBe(0);
      await p.mouse('mouseReleased', at[0], at[1]);
      await sleep(250);
      expect(await bars(), 'one on letting go').toBe(1);
      // A box, over the two.
      await p.ev(`planx.editor.setSelection([])`);
      await sleep(250);
      await p.mouse('mouseMoved', 300, 150);
      await p.mouse('mousePressed', 300, 150);
      for (const [x, y] of [[500, 400], [700, 450], [900, 500]]) {
        await p.mouse('mouseMoved', x, y);
        await sleep(120);
        expect(await bars(), 'none while it\'s drawn').toBe(0);
      }
      expect(await p.ev(`planx.editor.selection.size`), 'what it takes in picked meanwhile').toBe(2);
      await p.mouse('mouseReleased', 900, 500);
      await sleep(250);
      expect(await bars(), 'one on letting go').toBe(1);
    }
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async '"Панель над элементом": the selection panel over what\'s picked, not at the bottom; under it near the top, what opens from it opening down; staying by it while it\'s moved or the board is; at the bottom for what\'s picked big or partly off the screen'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); b.add(e.newItem('rect', 480, 300, { id: 'a', w: 240, h: 140 })); e.setSelection(['a']); })()`);
    await sleep(400);
    const over = await p.rect('.panel-over'), under = await p.rect('.bar.panel:not(.panel-over)');
    expect(over.b < 300, 'over the item').toBe(true);
    expect(Math.round((over.l + over.r) / 2), 'in the middle of it').toBe(600);
    expect(!!under, 'not at the bottom too').toBe(false);
    // It works the same: a button there does what it does below.
    await p.click(await p.at('.panel-over button[aria-label^="Дублировать"]'));
    expect(await p.ev(`planx.board.list().filter((i) => i.type === 'rect').length`), 'duplicated').toBe(2);
    await p.ev(`(() => { const e = planx.editor, b = planx.board; b.remove(b.list().filter((i) => i.id !== 'a').map((i) => i.id)); e.setSelection(['a']); e.cam = { x: 0, y: -290, z: 1 }; e.camChanged(); })()`);
    await sleep(300);
    const near = await p.rect('.panel-over');
    expect(near.t > 150, 'near the top: under the item').toBe(true);
    expect(await p.ev(`document.querySelector('.panel-over').classList.contains('opens-down')`), 'opening down').toBe(true);
    await p.click(await p.at('.panel-over button[aria-label="Цвет"]'));
    await sleep(200);
    expect((await p.rect('.panel-over .op-pop')).t > near.b, 'its palette below it').toBe(true);
    await p.click(await p.at('.panel-over button[aria-label="Цвет"]'));
    await sleep(100);
    // Moved, it stays by it.
    await p.mouse('mouseMoved', 600, 80);
    await p.mouse('mousePressed', 600, 80);
    await p.mouse('mouseMoved', 640, 90);
    await p.mouse('mouseMoved', 660, 95);
    await sleep(100);
    expect(!!(await p.rect('.panel-over:not(.gone)')), 'while it moves: there').toBe(true);
    await p.mouse('mouseReleased', 660, 95);
    await sleep(200);
    expect(!!(await p.rect('.panel-over:not(.gone)')), 'let go: still there').toBe(true);
    // The board moved: it stays, by the item.
    const was = await p.rect('.panel-over:not(.gone)');
    await p.ev(`(() => { const e = planx.editor; e.cam = { ...e.cam, x: e.cam.x + 20 }; e.camChanged(); })()`);
    await sleep(60);
    expect(Math.round((await p.rect('.panel-over:not(.gone)')).l - was.l), 'the board moving: along with it').toBe(20);
    // Big: over it all the same, with room there.
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.update('a', { x: 100, y: 200, w: 900, h: 500 }); e.setSelection([]); })()`);
    await sleep(50);
    await p.ev(`planx.editor.setSelection(['a'])`);
    await sleep(400);
    expect([!!(await p.rect('.panel-over:not(.gone)')), !!(await p.rect('.bar.panel:not(.panel-over, .gone)'))].join(), 'big: over it').toBe('true,false');
    expect((await p.rect('.panel-over:not(.gone)')).b < 200, 'above its top').toBe(true);
    // Its top off the screen: under it, not at the bottom of the screen.
    await p.ev(`(() => { const e = planx.editor; planx.board.update('a', { x: 300, y: -100, w: 240, h: 300 }); e.setSelection([]); })()`);
    await sleep(50);
    await p.ev(`planx.editor.setSelection(['a'])`);
    await sleep(300);
    const below = await p.rect('.panel-over:not(.gone)');
    expect(!!below && below.t > 200 && below.t < 260, 'under it').toBe(true);
    // With the handles of «Авторасположение» up: at the bottom, out of their way.
    await p.ev(`(async () => { const e = planx.editor, b = planx.board; b.update('a', { x: 400, y: 300 }); b.add(e.newItem('rect', 700, 300, { id: 'c', w: 100, h: 100 })); e.setSelection(['a', 'c']); })()`);
    await sleep(300);
    expect(!!(await p.rect('.panel-over:not(.gone)')), 'two picked: over them').toBe(true);
    await p.ev(`(async () => { (await import('/src/labs/tidy.ts')).startTidy(planx.editor); })()`);
    await sleep(300);
    expect([!!(await p.rect('.panel-over:not(.gone)')), !!(await p.rect('.bar.panel:not(.panel-over, .gone)'))].join(), 'laid out: at the bottom').toBe('false,true');
    // Switched off, only the one at the bottom.
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
    await sleep(150);
    expect(await p.ev(`document.querySelectorAll('.bar.panel').length`), 'switched off').toBe(1);
  },

  async 'with the panel over a table, it stays put while columns are added, till the pointer leaves it'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('table', 420, 300, { id: 't', w: 360, h: 120, cols: [120, 120, 120], rows: [40, 40, 40], cells: Array(9).fill('') })); e.setSelection(['t']); })()`);
    await sleep(400);
    const before = await p.rect('.panel-over'), plus = await p.at('.panel-over button[aria-label="Добавить столбец"]');
    await p.click(plus);
    await sleep(100);
    await p.click(plus);
    await sleep(200);
    expect(await p.ev(`planx.board.get('t').cols.length`), 'two columns added').toBe(5);
    expect((await p.rect('.panel-over')).l, 'the panel stayed').toBe(before.l);
    await p.mouse('mouseMoved', 600, 700);
    await sleep(200);
    expect((await p.rect('.panel-over')).l > before.l, 'over the middle again, once left').toBe(true);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async '"Кнопка T": the selection panel turns into the text panel, a press on the board turns it back'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('sticky', 500, 300, { id: 's', text: 'Привет' })); e.setSelection(['s']); })()`);
    await sleep(400);
    // (What goes on in between, as it happens.)
    await p.ev(`(() => { window.seen = []; new MutationObserver((rs) => { for (const r of rs) for (const n of r.addedNodes) if (n.classList?.contains('panel-shell')) window.seen.push(n.style.width); }).observe(document.body, { childList: true }); })()`);
    const from = await p.rect('.panel-over');
    await p.click(await p.at('.panel-over button[aria-label="Текст и шрифт"]'));
    await sleep(50);
    expect(await p.ev(`window.seen.join()`), 'a body going from one to the other, from the panel\'s width').toBe(`${from.w}px`);
    await sleep(700);
    expect([!!(await p.rect('.tfmt:not(.leaving)')), !!(await p.rect('.panel-over:not(.gone)'))].join(), 'the text panel instead').toBe('true,false');
    const to = await p.rect('.tfmt:not(.leaving)');
    expect(`${to.t} ${to.b}`, 'standing where the panel stood, as high').toBe(`${from.t} ${from.b}`);
    expect(!!(await p.rect('.panel-shell')), 'the body gone once there').toBe(false);
    await p.click(await p.at('.tfmt button[aria-label="Жирный"]'));
    expect(await p.ev(`planx.board.get('s').fw`), 'its text bold').toBe(700);
    // Its arrow takes it back: what was on the text panel doesn't show again as it goes.
    await p.ev(`(() => { window.shown = 0; const t0 = performance.now(); const f = () => { if (document.querySelector('.panel-shell') && [...document.querySelectorAll('.tfmt')].some((e) => +getComputedStyle(e).opacity > 0.05)) window.shown++; if (performance.now() - t0 < 600) requestAnimationFrame(f); }; setTimeout(() => requestAnimationFrame(f), 170); })()`);
    await p.click(await p.at('.tfmt button[aria-label="Назад"]'));
    await sleep(700);
    expect([!!(await p.rect('.tfmt:not(.leaving)')), !!(await p.rect('.panel-over:not(.gone)'))].join(), 'back by its arrow').toBe('false,true');
    expect(await p.ev(`window.shown`), 'the text panel unseen while the body narrows').toBe(0);
    await p.click(await p.at('.panel-over button[aria-label="Текст и шрифт"]'));
    await sleep(700);
    const s = await p.ev(`planx.editor.toScreen({ x: 600, y: 400 })`);
    await p.click([s.x, s.y]);
    await sleep(700);
    expect([!!(await p.rect('.tfmt:not(.leaving)')), !!(await p.rect('.panel-over:not(.gone)'))].join(), 'back to the selection panel').toBe('false,true');
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async '"Узел на линии": a shape dragged onto a picked line\'s middle becomes a part of it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 200, 300, { id: 'a', w: 100, h: 100 })); b.add(e.newItem('sticky', 800, 300, { id: 'c', w: 100, h: 100 }));
      b.add(e.newItem('rect', 450, 600, { id: 'r', w: 100, h: 60, text: 'Узел' }));
      b.addLink({ id: 'l', from: 'a', to: 'c', style: 'straight', color: 'red', heads: 'both' }); e.setSelection(['l']); })()`);
    await sleep(300);
    const m = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), l = planx.board.getLink('l'); const s = g.linkShape(l, (id) => planx.board.get(id)); const q = g.linkHandles(l, s).middles[0].p; return planx.editor.toScreen(q); })()`);
    // The shape's middle at (500, 630): taken from there to the line's middle circle.
    await p.drag([500, 630], [m.x, m.y], { steps: 16 });
    await sleep(200);
    const out = await p.ev(`(() => { const b = planx.board, r = b.get('r'), ls = b.linkList();
      return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, joint: !!r.joint, old: !!b.getLink('l'), ls: ls.map((l) => l.from + '>' + l.to + ':' + (l.heads ?? 'end') + ':' + l.color).sort().join(' ') }; })()`);
    expect(`${out.cx},${out.cy}`, 'in the middle of the line').toBe(`${(await p.ev(`planx.editor.toWorld(${m.x}, ${m.y}).x`))},${(await p.ev(`planx.editor.toWorld(${m.x}, ${m.y}).y`))}`);
    expect(`${out.joint} ${out.old} ${out.ls}`, 'the line made two through it, as it looked').toBe('true false a>r:start:red r>c:end:red');
    // Moved, the line goes along.
    await p.ev(`planx.board.update('r', { y: 100 })`);
    const ends = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), l = planx.board.linkList().find((l) => l.to === 'r'); return g.linkShape(l, (id) => planx.board.get(id)).pts.at(-1); })()`);
    expect(ends.y < 200, 'the line to it follows it').toBe(true);
    // Taken away, the line is one again, as it was.
    await p.ev(`(() => { planx.editor.setSelection(['r']); planx.editor.deleteSelection(); })()`);
    expect(await p.ev(`planx.board.linkList().map((l) => l.from + '>' + l.to + ':' + (l.heads ?? 'end') + ':' + l.color + ':' + l.style).join()`), 'one again').toBe('a>c:both:red:straight');
  },

  async '"Узел на линии": a task dragged by its header onto a picked line\'s middle goes into it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 100, 300, { id: 'a', w: 100, h: 100 })); b.add(e.newItem('sticky', 1000, 300, { id: 'c', w: 100, h: 100 }));
      b.add(e.newItem('task', 350, 600, { id: 'r', w: 293, h: 52, text: 'Узел' }));
      b.addLink({ id: 'l', from: 'a', to: 'c', style: 'straight' }); e.setSelection(['l']); })()`);
    await sleep(300);
    const m = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), l = planx.board.getLink('l'); const s = g.linkShape(l, (id) => planx.board.get(id)); const q = g.linkHandles(l, s).middles[0].p; return planx.editor.toScreen(q); })()`);
    await p.drag([350 + 220, 626], [m.x, m.y], { steps: 16 });
    await sleep(200);
    const out = await p.ev(`(() => { const b = planx.board, r = b.get('r'); return [!!r.joint, b.linkList().map((l) => l.from + '>' + l.to).sort().join(' ')].join(); })()`);
    expect(out, 'in the line').toBe('true,a>r r>c');
  },
  async '"Узел на линии": dragged with Cmd, what\'s in a line comes out of it, the line one again'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 200, 300, { id: 'a', w: 100, h: 100 })); b.add(e.newItem('sticky', 800, 300, { id: 'c', w: 100, h: 100 }));
      b.add(e.newItem('rect', 500, 320, { id: 'r', w: 100, h: 60, text: 'Узел', joint: true }));
      b.addLink({ id: 'l1', from: 'a', to: 'r', style: 'straight', color: 'red', heads: 'start' }); b.addLink({ id: 'l2', from: 'r', to: 'c', style: 'straight', color: 'red' }); e.setSelection([]); })()`);
    await sleep(200);
    // Without Cmd: it moves, the line with it.
    await p.drag([550, 350], [550, 300]);
    expect(await p.ev(`planx.board.linkList().length + ' ' + !!planx.board.get('r').joint`), 'still in it').toBe('2 true');
    // With it: out, the line one again as it was; where it's let go.
    await p.drag([550, 300], [550, 550], { modifiers: 4 });
    const out = await p.ev(`(() => { const b = planx.board, r = b.get('r'); return [!!r.joint, r.y, b.linkList().map((l) => l.from + '>' + l.to + ':' + (l.heads ?? 'end') + ':' + l.color).join()].join(' '); })()`);
    expect(out, 'out, one line again').toBe('false 520 a>c:both:red');
    // Cmd pressed on the way: out then.
    await p.ev(`(() => { const b = planx.board; b.remove(b.linkList().map((l) => l.id)); b.update('r', { x: 500, y: 320, joint: true });
      b.addLink({ id: 'l1', from: 'a', to: 'r', style: 'straight' }); b.addLink({ id: 'l2', from: 'r', to: 'c', style: 'straight' }); planx.editor.setSelection([]); })()`);
    await sleep(100);
    await p.mouse('mouseMoved', 550, 350);
    await p.mouse('mousePressed', 550, 350);
    for (let y = 360; y <= 420; y += 10) { await p.mouse('mouseMoved', 550, y); await sleep(25); }
    for (let y = 430; y <= 500; y += 10) { await p.mouse('mouseMoved', 550, y, 4); await sleep(25); }
    await p.mouse('mouseReleased', 550, 500);
    await sleep(200);
    expect(await p.ev(`!!planx.board.get('r').joint + ' ' + planx.board.linkList().map((l) => l.from + '>' + l.to).join()`), 'Cmd on the way: out').toBe('false a>c');
    // Not put in, but with two lines out of it (arrows at the others): one line between them, both ends arrowed.
    await p.ev(`(() => { const b = planx.board; b.remove(b.linkList().map((l) => l.id)); b.update('r', { x: 500, y: 320 });
      b.addLink({ id: 'l1', from: 'r', to: 'a', style: 'straight' }); b.addLink({ id: 'l2', from: 'r', to: 'c', style: 'straight' }); planx.editor.setSelection([]); })()`);
    await sleep(100);
    await p.drag([550, 350], [550, 550], { modifiers: 4 });
    expect(await p.ev(`planx.board.linkList().map((l) => l.from + '>' + l.to + ':' + (l.heads ?? 'end')).join()`), 'two out of it: one, arrowed both ways').toBe('a>c:both');
  },

  async '"Узел на линии": a sticker dragged off the rail onto a picked line\'s middle goes into it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('rect', 200, 300, { id: 'a', w: 100, h: 100 })); b.add(e.newItem('rect', 900, 300, { id: 'c', w: 100, h: 100 }));
      b.addLink({ id: 'l', from: 'a', to: 'c', style: 'straight' }); e.setSelection(['l']); })()`);
    await sleep(300);
    const m = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), l = planx.board.getLink('l'); const q = g.linkHandles(l, g.linkShape(l, (id) => planx.board.get(id))).middles[0].p, s = planx.editor.toScreen(q), c = planx.editor.canvas.getBoundingClientRect(); return [s.x + c.left, s.y + c.top]; })()`);
    await carry(p, await p.at('.tools [data-key="sticky"]'), [[m[0] - 100, m[1] + 100], m]);
    const st = await p.ev(`(() => { const s = planx.board.list().find((i) => i.type === 'sticky'); return { joint: !!s?.joint, ls: planx.board.linkList().map((l) => l.from + '>' + l.to).sort().join() , s: s?.id }; })()`);
    expect(`${st.joint} ${st.ls}`, 'in the line').toBe(`true ${[`a>${st.s}`, `${st.s}>c`].sort().join()}`);
  },

  async '"Перестановка в таблице": a table dropped on the board has its pills out at once'(p) {
    await p.ev(`planx.editor.dropItem('table', { x: 500, y: 350 })`);
    await sleep(100);
    expect(await p.ev(`(async () => { const t = planx.board.list().find((i) => i.type === 'table'); return (await import('/src/labs/tableMove.ts')).gripsOn(t.id); })()`), 'pills out').toBe(true);
    // Its plus at the bottom, over the line down its middle: the plus lit, not the line.
    const t = await p.ev(`planx.board.list().find((i) => i.type === 'table')`);
    const c = await p.ev(`(() => { const s = planx.editor.toScreen({ x: ${t.x + t.w / 2}, y: ${t.y + t.h} }), r = planx.editor.canvas.getBoundingClientRect(); return [s.x + r.left, s.y + r.top - 14]; })()`);
    await p.mouse('mouseMoved', c[0], c[1] - 20);
    await p.mouse('mouseMoved', ...c);
    await sleep(700);
    expect(await p.ev(`planx.editor.hotLine`), 'no line lit').toBe(null);
    // Made with the tool, a click on the board: the same.
    await p.ev(`planx.editor.setTool('table')`);
    await p.click([800, 150]);
    await sleep(100);
    expect(await p.ev(`(async () => { const s = planx.editor.selectedItems()[0]; return [s.type, (await import('/src/labs/tableMove.ts')).gripsOn(s.id), planx.editor.editingId].join(); })()`), 'made with the tool: pills out, no cell open').toBe('table,true,');
  },

  async '"Таблица помнит формат": the next empty cell goes on aligned as the last one was set'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      planx.board.add(e.newItem('table', 300, 300, { id: 't', w: 360, h: 120, cols: [120, 120, 120], rows: [40, 40, 40], cells: Array(9).fill('') })); e.setSelection(['t']); e.startEditing('t', 0); })()`);
    await sleep(300);
    await p.ev(`planx.editor.setTextStyle({ ta: 'right' })`);
    await sleep(100);
    await p.key('Tab', 'Tab', 9);
    await sleep(300);
    const t = await p.ev(`planx.board.get('t')`);
    expect(`${await p.ev('planx.editor.editingCell')} ${t.cellFmt?.[1]?.ta}`, 'the next cell right-aligned').toBe('1 right');
    expect(await p.ev(`!!document.querySelector('.tfmt')`), 'the text panel up').toBe(true);
  },

  async '"Удаление строк и столбцов": Delete takes a whole column\'s text, then the column'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      planx.board.add(e.newItem('table', 300, 300, { id: 't', w: 360, h: 120, cols: [120, 120, 120], rows: [40, 40, 40], cells: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }));
      e.setSelection(['t']); e.cells = [1, 4, 7]; e.emit(); })()`);
    await sleep(200);
    await p.key('Delete', 'Delete', 46);
    let t = await p.ev(`planx.board.get('t')`);
    expect(`${t.cells.join('')} ${t.cols.length}`, 'first its text').toBe('acdfgi 3');
    await p.key('Delete', 'Delete', 46);
    t = await p.ev(`planx.board.get('t')`);
    expect(`${t.cells.join('')} ${t.cols.length} ${t.w}`, 'then the column').toBe('acdfgi 2 240');
    expect(!!(await p.ev(`planx.board.get('t')`)), 'the table stays').toBe(true);
  },

  async 'with no room over the panel over what\'s picked, its palette opens down'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('rect', 480, 170, { id: 'a', w: 240, h: 140 })); e.setSelection(['a']); })()`);
    await sleep(400);
    const bar = await p.rect('.panel-over');
    expect(bar.b < 170, 'the panel over it').toBe(true);
    await p.click(await p.at('.panel-over button[aria-label="Цвет"]'));
    await sleep(300);
    expect((await p.rect('.panel-over .op-pop')).t > bar.b, 'its palette under it').toBe(true);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async 'by the bottom of the window, the text panel\'s colours open up, clear of it'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('sticky', 500, 720, { id: 's', w: 120, h: 60, text: 'Низ' })); e.setSelection(['s']); })()`);
    await sleep(400);
    await p.click(await p.at('.panel-over button[aria-label="Текст и шрифт"]'));
    await sleep(700);
    await p.click(await p.at('.tfmt button[aria-label="Цвет текста"]'));
    await sleep(300);
    const m = await p.rect('.tfmt .tf-menu'), t = await p.rect('.tfmt');
    expect(`${m.b <= t.t} ${m.b <= 800}`, 'over the panel, on the screen').toBe('true true');
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async 'typing in a mind map node, its panel follows it, one panel only'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('mind', 400, 300, { id: 'm', text: 'Т', w: 120, h: 50 })); e.setSelection(['m']); })()`);
    await sleep(400);
    await p.ev(`planx.editor.startEditing('m')`);
    await sleep(300);
    for (const ch of 'ема очень длинная') { await p.cdp('Input.insertText', { text: ch }); await sleep(40); }
    await sleep(300);
    expect(await p.ev(`document.querySelectorAll('.panel-over:not(.gone)').length`), 'one panel').toBe(1);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async '"Кнопка T": what comes in on the panel only fades in, it doesn\'t slide'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('sticky', 500, 300, { id: 's', text: 'Привет' })); e.setSelection(['s']); })()`);
    await sleep(400);
    // Each frame: whatever's showing and shifted from its place.
    const watch = (sel) => p.ev(`(() => { window.slid = []; const t0 = performance.now(); const f = () => { for (const e of document.querySelectorAll('${sel}:not(.gone):not(.leaving)')) { const cs = getComputedStyle(e); if (+cs.opacity > 0 && cs.transform !== 'none') window.slid.push(cs.transform); } if (performance.now() - t0 < 600) requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
    await watch('.tfmt');
    await p.click(await p.at('.panel-over button[aria-label="Текст и шрифт"]'));
    await sleep(700);
    expect(await p.ev('window.slid.length'), 'the text panel, no slide').toBe(0);
    await watch('.panel-over');
    await p.click(await p.at('.tfmt button[aria-label="Назад"]'));
    await sleep(700);
    expect(await p.ev('window.slid.length'), 'the panel back, no slide').toBe(0);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async '"Кнопка T" on a mind map node: its text formatted from the text panel'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); planx.board.add(e.newItem('mind', 400, 300, { id: 'm', text: 'Тема', w: 160, h: 60 })); e.setSelection(['m']); })()`);
    await sleep(400);
    await p.click(await p.at('.bar.panel button[aria-label="Текст и шрифт"]'));
    await sleep(700);
    await p.click(await p.at('.tfmt button[aria-label="Курсив"]'));
    expect(await p.ev(`planx.board.get('m').fi`), 'its text in italics').toBe(true);
  },

  async '"Перестановка в таблице": a double click on a table, a cell or a line, puts the pills out, only those of the column and row under the pointer; typing in a cell too'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('table', 300, 300, { id: 't', w: 360, h: 120, cols: [120, 120, 120], rows: [40, 40, 40], cells: Array(9).fill('') })); e.setSelection([]); })()`);
    await sleep(300);
    const on = () => p.ev(`(async () => (await import('/src/labs/tableMove.ts')).gripsOn('t'))()`);
    // Which pills the pointer finds over each column's top and by each row.
    const pills = () => p.ev(`(async () => { const m = await import('/src/labs/tableMove.ts'), e = planx.editor;
      return [[360, 291], [480, 291], [600, 291], [291, 320], [291, 360], [291, 400]].map(([x, y]) => { const g = m.gripAt(e, { x, y }); return g ? g.axis + g.index : '-'; }).join(); })()`);
    const dbl = async ([x, y]) => { await p.mouse('mouseMoved', x, y); for (let i = 0; i < 2; i++) { await p.mouse('mousePressed', x, y); await p.mouse('mouseReleased', x, y); await sleep(60); } await sleep(250); };
    // On the line between the first two columns.
    await dbl([420, 330]);
    expect(await on(), 'out').toBe(true);
    await p.mouse('mouseMoved', 480, 360);
    await sleep(100);
    expect(await pills(), 'the middle column\'s and row\'s only').toBe('-,col1,-,-,row1,-');
    // Pluses on the lines either side of them, just inside: one pressed puts one in there.
    const plusesAt = (pts) => p.ev(`(async () => { const m = await import('/src/labs/tableMove.ts'); return ${JSON.stringify(pts)}.map(([x, y]) => m.tablePlusAt(planx.editor, { x, y }) ?? '-').join(); })()`);
    expect(await plusesAt([[420, 314], [540, 314], [660, 314], [314, 340], [314, 380], [314, 420]]), 'after the column and under the row under the pointer').toBe('-,col@2,-,-,row@2,-');
    // Gone on a little past its line into the next column, it stays, to be pressed.
    await p.mouse('mouseMoved', 540, 330);
    await p.mouse('mouseMoved', 551, 316);
    await sleep(50);
    expect(await plusesAt([[551, 316]]), 'kept, near it').toBe('col@2');
    expect(await plusesAt([[660, 314], [314, 340]]), 'lit, the only column\'s out; the row\'s stays').toBe('-,row@1');
    expect(await pills(), 'the pills as before it, no other column\'s').toBe('-,col1,-,row0,-,-');
    // None on the top or left edge, wherever the pointer is.
    await p.mouse('mouseMoved', 291, 360);
    await sleep(50);
    expect(await plusesAt([[300, 314], [314, 300]]), 'none at the top left').toBe('-,-');
    await p.click([540, 314]);
    const t = await p.ev(`planx.board.get('t')`);
    expect(`${t.cols.length} ${t.w}`, 'a column put in').toBe('4 480');
    await p.mouse('mouseMoved', 600, 400);
    await sleep(100);
    expect(await pills(), 'others as it moves').toBe('-,-,col2,-,-,row2');
    // Off it: none; a click elsewhere puts them away.
    await p.mouse('mouseMoved', 900, 600);
    await sleep(100);
    expect(await pills(), 'none').toBe('-,-,-,-,-,-');
    await p.click([900, 600]);
    expect(await on(), 'away').toBe(false);
    // Typing in a cell: theirs, under the pointer.
    await p.ev(`(() => { const e = planx.editor; e.setSelection(['t']); e.startEditing('t', 4); })()`);
    await sleep(300);
    await p.mouse('mouseMoved', 480, 360);
    await sleep(100);
    expect(await pills(), 'typing, the pointer over the text').toBe('-,col1,-,-,row1,-');
    await p.ev(`planx.editor.stopEditing()`);
    await sleep(100);
    expect(await pills(), 'typing done: no pills').toBe('-,-,-,-,-,-');
  },

  async '"Перестановка в таблице": a column dragged by its pill takes its cells along'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('table', 300, 300, { id: 't', w: 360, h: 120, cols: [100, 120, 140], rows: [40, 40, 40], cells: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] })); e.setSelection(['t']); })()`);
    await sleep(300);
    // No pills till they're put out.
    expect(await p.ev(`(async () => (await import('/src/labs/tableMove.ts')).gripsOn('t'))()`), 'no pills at first').toBe(false);
    await p.ev(`(async () => (await import('/src/labs/tableMove.ts')).toggleGrips(planx.editor))()`);
    expect(await p.ev(`(async () => (await import('/src/labs/tableMove.ts')).gripsOn('t'))()`), 'put out').toBe(true);
    // The first column's pill, on the top edge over its middle, to the last column.
    await p.mouse('mouseMoved', 350, 300);
    await p.drag([350, 297], [640, 307]);
    await sleep(100);
    let t = await p.ev(`planx.board.get('t')`);
    expect(t.cells.join(''), 'the column went last').toBe('bcaefdhig');
    expect(t.cols.join(), 'its width with it').toBe('120,140,100');
    expect(t.x, 'the table stayed').toBe(300);
    // A row's pill, on the left edge.
    await p.drag([300, 400], [310, 305]);
    t = await p.ev(`planx.board.get('t')`);
    expect(t.cells.join(''), 'the last row went first').toBe('higbcaefd');
    // Dragged off the table: taken away.
    await p.drag([297, 360], [297, 700]);
    t = await p.ev(`planx.board.get('t')`);
    expect(t.cells.join(''), 'the middle row gone').toBe('higefd');
    expect(t.h, 'the table shorter').toBe(80);
    // Picked again: no pills, till a second click on it.
    await p.ev(`(() => { planx.editor.setSelection([]); })()`);
    await sleep(50);
    await p.ev(`planx.editor.setSelection(['t'])`);
    await sleep(50);
    expect(await p.ev(`(async () => (await import('/src/labs/tableMove.ts')).gripsOn('t'))()`), 'away once something else was picked').toBe(false);
    // Taken and dragged, it only moves.
    await p.drag([500, 330], [520, 340]);
    expect(await p.ev(`(async () => (await import('/src/labs/tableMove.ts')).gripsOn('t'))()`), 'not out by a drag').toBe(false);
    await p.ev(`planx.board.update('t', { x: 300, y: 300 })`);
    await p.click([500, 330]);
    expect(await p.ev(`(async () => (await import('/src/labs/tableMove.ts')).gripsOn('t'))()`), 'out by a second click').toBe(true);
    // Along the way it moves, just past the table's edge is enough; across, 44 isn't reached by 30.
    await p.drag([360, 293], [360, 260]);
    expect((await p.ev(`planx.board.get('t')`)).cols.length, '30 off its side: kept').toBe(3);
    await p.drag([360, 293], [670, 300]);
    expect((await p.ev(`planx.board.get('t')`)).cols.length, 'just past the right edge: gone').toBe(2);
    // The plus inside by the right edge: a column more.
    const t2 = await p.ev(`planx.board.get('t')`), c = await p.ev(`planx.editor.toScreen({ x: ${t2.x + t2.w}, y: ${t2.y + t2.h / 2} })`);
    await p.click([c.x - 14, c.y]);
    await p.click([c.x - 14, c.y]);
    expect((await p.ev(`planx.board.get('t')`)).cols.length, 'the plus where it was: pressed twice, two columns more').toBe(4);
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

  async 'what\'s in a locked frame (a timeline, a group) is neither dragged nor deleted'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('frame', 200, 150, { id: 'f', w: 500, h: 400, members: ['s'], lock: true }));
      b.add(e.newItem('sticky', 300, 250, { id: 's', w: 100, h: 100 })); e.setSelection([]); })()`);
    await sleep(300);
    await p.drag([350, 300], [500, 400]);
    expect(await p.ev(`planx.board.get('s').x`), 'not dragged').toBe(300);
    await p.key('Delete', 'Delete', 46);
    expect(await p.ev(`!!planx.board.get('s')`), 'not deleted').toBe(true);
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

  async '? opens the help, and the laser draws without touching the board'(p) {
    await p.key('?', 'Slash', 191, 8);
    expect(!!(await p.rect('.help')), 'the help, with the keys').toBeTruthy();
    await p.escape();
    await sleep(250);
    expect(!!(await p.rect('.help')), 'closed').toBeFalsy();
    // In a small window what's in it scrolls inside: the popup itself stays, and its glass with it.
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 900, height: 420, deviceScaleFactor: 1, mobile: false });
    await p.key('?', 'Slash', 191, 8);
    const small = await p.ev(`(() => { const h = document.querySelector('.help:not(.gone)'), b = h.querySelector('.help-body'); return [h.scrollHeight <= h.clientHeight, b.scrollHeight > b.clientHeight].join(); })()`);
    expect(small, 'scrolls inside, not itself').toBe('true,true');
    await p.escape();
    await sleep(250);
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
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
    expect(k0.map((k) => k[0]).join(), 'in order').toBe('export,pdf,search,layers,history,timer,laser,follow,codeBlock');
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

  async '"Авторасположение": a gap\'s pill under the pointer takes its colour and grows smoothly, twice as thick, 1.3 times as long, its line a tenth longer; and goes back so; it answers further off but over an item'(p) {
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
    // Its line, a tenth longer than the 200 it runs (dots of it, its colour, past the top end).
    const beyond = () => p.ev(`(() => { const k = devicePixelRatio, c = document.querySelector('canvas').getContext('2d'); let n = 0; for (let i = 3; i <= 14; i++) { const d = c.getImageData(${m[0]} * k, (${m[1]} - 100 - i) * k, 1, 1).data; if (d[0] > d[1] + 30) n++; } return n; })()`);
    expect(await beyond(), 'its line, 10 further at each end').toBeNear(8, 2);
    await p.mouse('mouseMoved', 900, 700);
    await sleep(40);
    const back = await size();
    await sleep(350);
    expect(back[0] > rest[0], `goes back little by little: ${back[0]} on the way to ${rest[0]}`).toBe(true);
    expect((await size()).join(), 'as it was').toBe(rest.join());
    expect(await beyond(), 'its line, back').toBe(0);
    // It answers 12 either side of its line (the gap made wide enough to look), but 6 over an item there.
    await p.drag(m, [m[0] + 40, m[1]]);
    await sleep(200);
    const wide = await p.ev(`(() => { const a = planx.board.get('a'), c = planx.board.get('c'), s = planx.editor.toScreen({ x: (a.x + a.w + c.x) / 2, y: a.y + a.h / 2 }); return [s.x, s.y, c.x - a.x - a.w]; })()`);
    expect(wide[2] >= 30, `the gap wide: ${wide[2]}`).toBe(true);
    const at = (dx) => p.ev(`(async () => (await import('/src/labs/tidy.ts')).gapAt(planx.editor, { x: ${wide[0]} + ${dx}, y: ${wide[1]} }))()`);
    expect(await at(10), '10 off: answers').toBe('col');
    expect(await at(14), '14 off: no').toBe(null);
    await p.ev(`(() => { const e = planx.editor, w = e.toWorld(${wide[0]} + 8, ${wide[1]} - 20); planx.board.add(e.newItem('sticky', w.x, w.y, { id: 'over', w: 40, h: 40 })); })()`);
    await sleep(100);
    expect(await at(10), 'an item under the pointer, 10 off: no').toBe(null);
    expect(await at(5), 'nearer than 6: still').toBe('col');
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

  async '"Авторасположение" on a mind map node: the lines are all as long, a quarter of the longest level, whatever the size of the nodes; the ones along a level from the nodes\' left edge'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 100, 300, { id: 'r', w: 100, h: 40, text: 'Центр' }));
        for (const [id, y] of [['a', 200], ['c', 300], ['d', 400], ['f', 500]]) b.add(e.newItem('mind', 300, y, { id, w: 500, h: 40, parent: 'r', text: id }));
        b.add(e.newItem('mind', 900, 200, { id: 'g', w: 100, h: 40, parent: 'a', text: 'g' }));
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.ev(`planx.editor.tidyMind('r')`);
    await sleep(200);
    const g = await p.ev(`(() => { const [r, a, c, f, l] = ['r', 'a', 'c', 'f', 'g'].map((k) => planx.board.get(k)); return { x: a.x, y: (a.y + a.h + c.y) / 2, top: a.y, outX: (r.x + r.w + a.x) / 2, leafX: (a.x + a.w + l.x) / 2, leafTop: l.y, long: (f.y + f.h - a.y) / 4 }; })()`);
    const at = (x, y) => p.ev(`(async () => { const h = (await import('/src/labs/tidyMind.ts')).mindGapAt(planx.editor, planx.editor.toScreen({ x: ${x}, y: ${y} })); return h ? h.axis + ' ' + h.out : null; })()`);
    expect(await at(g.x + 2, g.y), 'along: from the left edge').toBe('row false');
    expect(await at(g.x + g.long - 2, g.y), 'to a quarter of the level').toBe('row false');
    expect(await at(g.x + g.long + 4, g.y), 'no further').toBe(null);
    expect(await at(g.x - 4, g.y), 'nor before it').toBe(null);
    expect(await at(g.outX, g.top + g.long - 2), 'out: as long').toBe('col true');
    expect(await at(g.outX, g.top + g.long + 4), 'and no further').toBe(null);
    expect(await at(g.leafX, g.leafTop + g.long - 2), 'out to a level of one node: as long too').toBe('col true');
    expect(await at(g.leafX, g.leafTop + g.long + 4), 'and no further').toBe(null);
    // Stretched far apart, they stay that long.
    const was = await p.ev(`planx.editor.toScreen({ x: ${g.outX}, y: ${g.top + 10} })`);
    await p.drag([was.x, was.y], [was.x + 150, was.y]);
    await sleep(200);
    const far = await p.ev(`(() => { const [r, a, c] = ['r', 'a', 'c'].map((k) => planx.board.get(k)); return { top: a.y, outX: (r.x + r.w + a.x) / 2, x: a.x, y: (a.y + a.h + c.y) / 2 }; })()`);
    expect(far.x > g.x + 100, 'stretched out').toBe(true);
    expect(await at(far.outX, far.top + g.long - 2), 'out, stretched: as long').toBe('col true');
    expect(await at(far.outX, far.top + g.long + 4), 'not longer').toBe(null);
  },

  async '"Авторасположение" on a mind map node: a line along a level stops short of the line across the next gap, not crossing it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.transact(() => {
        b.add(e.newItem('mind', 40, 300, { id: 'r', w: 60, h: 40, text: 'Ц' }));
        for (let i = 0; i < 10; i++) b.add(e.newItem('mind', 200, 40 + i * 60, { id: 'k' + i, w: 60, h: 40, parent: 'r', text: 'к' }));
        b.add(e.newItem('mind', 500, 40, { id: 'g', w: 60, h: 40, parent: 'k0', text: 'л' }));
      }); e.setSelection(['r']); })()`);
    await sleep(300);
    await p.ev(`planx.editor.tidyMind('r')`);
    await sleep(200);
    const g = await p.ev(`(() => { const [a, c, l] = ['k0', 'k1', 'g'].map((k) => planx.board.get(k)); return { x: a.x, y: (a.y + a.h + c.y) / 2, next: (a.x + a.w + l.x) / 2 }; })()`);
    const at = (x) => p.ev(`(async () => { const h = (await import('/src/labs/tidyMind.ts')).mindGapAt(planx.editor, planx.editor.toScreen({ x: ${x}, y: ${g.y} })); return h ? h.axis + ' ' + h.out : null; })()`);
    expect(await at(g.next - 10), 'up to 8 short of the next line').toBe('row false');
    expect((await at(g.next - 4)) === 'row false', 'no nearer').toBe(false);
    expect((await at(g.next + 4)) === 'row false', 'nor past it').toBe(false);
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
    // Typed in, done: its panel's there by the T ("Кнопка T").
    await p.ev('planx.editor.stopEditing()');
    await sleep(300);
    await p.click(await p.at('.bar.panel button[aria-label="Текст и шрифт"]'));
    await sleep(700);
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

  async 'a task\'s description typed in has the text panel with its list and links only; a link in it opens on a click'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('task', 200, 150, { id: 'tk', text: 'Задача', w: 494, h: 52, tv: 'full', keep: true, desc: 'Смотри документацию тут' }));
      e.setSelection(['tk']); e.startEditing('tk', 0, 'end'); })()`);
    await sleep(900);
    expect(await p.ev(`[...document.querySelectorAll('.tfmt button[aria-label]')].map((b) => b.getAttribute('aria-label')).filter((l) => l !== 'Действия').join()`), 'its list and links (and the actions\' menu)').toBe('Список,Ссылка');
    await p.ev(`document.querySelector('textarea.text-edit').setSelectionRange(7, 19)`);
    await p.click(await p.at('.tfmt button[aria-label="Ссылка"]'));
    await sleep(200);
    await p.cdp('Input.insertText', { text: 'docs.example.com' });
    await p.key('Enter', 'Enter', 13);
    await sleep(300);
    expect(await p.ev(`JSON.stringify([planx.board.get('tk').text, planx.board.get('tk').links])`), 'on its description').toBe('["Задача",[{"s":7,"e":19,"url":"https://docs.example.com"}]]');
    await p.click(await p.at('.tfmt button[aria-label="Список"]'));
    await sleep(200);
    await p.click(await p.at('.tfmt button[aria-label="Маркированный список"]'));
    await sleep(200);
    expect(await p.ev(`planx.board.get('tk').ls`), 'a list').toBe('bullet');
    await p.ev(`planx.editor.stopEditing(); planx.editor.setSelection([]); window.opened = null; window.open = (u) => { window.opened = u; return null; }`);
    await sleep(300);
    expect(await p.ev(`planx.board.get('tk').h`), 'as tall as it').toBe(await p.ev(`(async () => (await import('/src/canvas/task.ts')).taskLayout(planx.board.get('tk')).h)()`));
    // On "документацию", after its bullet: a click opens it.
    const at = await p.ev(`(async () => { const t = planx.board.get('tk'), l = (await import('/src/canvas/task.ts')).taskLayout(t); const s = planx.editor.toScreen({ x: t.x + l.desc.x + 120, y: t.y + l.desc.y + 9 }); return [s.x, s.y]; })()`);
    await p.click(at);
    await sleep(200);
    expect(await p.ev('window.opened'), 'opened').toBe('https://docs.example.com');
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
    await p.ev('window.opened = null');
    await p.click(at);
    await sleep(100);
    expect(await p.ev('window.opened'), 'a plain click on it too').toBe('https://docs.example.com');
    await p.ev('window.opened = null; planx.editor.setSelection([])');
    const x0 = await p.ev(`planx.board.get('tx').x`);
    await p.drag(at, [at[0] + 40, at[1] + 30]);
    await sleep(100);
    expect([await p.ev('window.opened'), await p.ev(`planx.board.get('tx').x`) - x0].join(), 'dragged from it, the text moves').toBe(',40');
    await p.ev(`planx.board.update('tx', { x: ${x0}, y: planx.board.get('tx').y - 30 })`);
    await sleep(100);
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

  async '"Объекты": a sticker, a shape and a task resized on a timeline go to whole and half days'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.addTimeline({ x: 600, y: 400 }); })()`);
    const tl = await p.ev(`(() => { const t = planx.board.list().find((i) => i.tl); return { x: t.x, y: t.y }; })()`);
    for (const [type, w, h] of [['sticky', 100, 100], ['rect', 100, 60], ['task', 200, 52]]) {
      const id = await p.ev(`(() => { const e = planx.editor, it = e.newItem('${type}', ${tl.x} + 19 + 23 * 3, ${tl.y} + 60, { w: ${w}, h: ${h} }); planx.board.add(it); e.setSelection([it.id]); return it.id; })()`);
      await sleep(300);
      const c = await p.ev(`(() => { const it = planx.board.get('${id}'), s = planx.editor.toScreen({ x: it.x + it.w, y: it.y + it.h }); return [s.x - 1, s.y - 1]; })()`);
      await p.drag(c, [c[0] + 37, c[1] + 5]);
      const off = await p.ev(`(() => { const it = planx.board.get('${id}'); return (it.x + it.w - ${tl.x} - 19) / 11.5; })()`);
      expect(Math.abs(off - Math.round(off)) < 1e-6, `${type}: its right side on a half day (${off})`).toBe(true);
      await p.ev(`planx.board.remove(['${id}'])`);
    }
  },

  async '"Объекты": a timeline dragged off the menu onto the board is put there'(p) {
    await p.click(await p.at('.tools [data-key="objects"]'));
    await p.drag(await p.at('.objects-menu .menu-row'), [700, 450], { steps: 16 });
    await sleep(200);
    expect(await p.ev(`planx.board.list().filter((i) => i.tl).length`), 'one put').toBe(1);
    expect(await p.ev(`!!document.querySelector('.objects-menu')`), 'the menu gone').toBe(false);
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
    // In a small window what's in it scrolls inside: the popup itself stays, and its glass with it.
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 300, deviceScaleFactor: 1, mobile: false });
    await sleep(100);
    const short = await p.ev(`(() => { const h = document.querySelector('.params-pop'), b = h.querySelector('.params-body'); return [h.scrollHeight <= h.clientHeight, b.scrollHeight > b.clientHeight].join(); })()`);
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(100);
    expect(short, 'scrolls inside, not itself').toBe('true,true');
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

  async '"Меню по правому клику" on nothing, with something picked: the menu of what\'s picked, still picked; with nothing picked, the board\'s'(p) {
    const right = async ([x, y]) => {
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
      await sleep(200);
    };
    const label = () => p.ev(`document.querySelector('.context-menu')?.getAttribute('aria-label') ?? ''`);
    const { a, c } = await stickers(p);
    const empty = [1000, 650];
    for (const ids of [[a], [a, c]]) {
      await p.ev(`planx.editor.setSelection(${JSON.stringify(ids)})`);
      await right(empty);
      expect(await label(), 'what\'s picked').toBe('Действия с выделенным');
      expect(await p.ev(`[...planx.editor.selection].join()`), 'still picked').toBe(ids.join());
      await p.escape();
      await sleep(100);
    }
    const l = await p.ev(`(() => { const b = planx.board, l = { id: 'l1', from: '${a}', to: '${c}', style: 'straight' }; b.addLink(l); planx.editor.setSelection(['l1']); return l.id; })()`);
    await right(empty);
    expect(await label(), 'a line picked: the line\'s').toBe('Линия');
    expect(await p.ev(`[...planx.editor.selection].join()`), 'still picked').toBe(l);
    await p.escape();
    await sleep(100);
    await p.ev(`planx.editor.setSelection([])`);
    await right(empty);
    expect(await label(), 'nothing picked: the board\'s').toBe('Доска');
    await p.escape();
    await sleep(100);
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
      b.add(e.newItem('frame', x - 900, y, { id: 'comp', comp: true, w: 300, h: 200, members: ['cr', 'ct'], text: 'Карточка' }));
      b.add(e.newItem('rect', x - 880, y + 20, { id: 'cr', w: 200, h: 100 }));
      b.add(e.newItem('text', x - 870, y + 30, { id: 'ct', w: 180, text: 'Что надо сделать' }));
      b.add(e.newItem('frame', x + 400, y, { id: 'in', inst: 'comp', w: 300, h: 200, members: [] })); })()`);
    await sleep(300);
    await p.ev(`planx.editor.setSelection(['s', 't', 'in'])`);
    await sleep(200);
    const at = await p.ev(`(() => { const i = planx.board.get('s'), s = planx.editor.toScreen({ x: i.x + 30, y: i.y + 30 }); return [s.x, s.y]; })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at[0], y: at[1], button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at[0], y: at[1], button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Параметры').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    const titles = await p.ev(`[...document.querySelectorAll('.params-pop .params-title')].map((t) => t.textContent).join(' | ')`);
    expect(titles, 'each, the instance by what is in it').toBe('Заметка | Текст «Подпись» | Прямоугольник | Текст 1 «Что надо сделать»');
    expect(await p.ev(`[...document.querySelectorAll('.params-pop .params-item')].map((i) => i.querySelectorAll('input[type=range]').length).join()`), 'an opacity for each colour (no text yet, no text colour)')
      .toBe('1,1,2,1');
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

  async '"Зум рамкой": with Z held any tool gives way to it, a box zooms and a double click shows all; Z let go, the tool\'s back'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 300, 300, { id: 's', w: 150, h: 150 })); e.setSelection([]); })()`);
    const z = (type) => p.cdp('Input.dispatchKeyEvent', { type, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    for (const tool of ['rect', 'pen', 'hand', 'sticky', 'eraser']) {
      await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setTool('${tool}'); })()`);
      const n = await p.ev(`planx.board.list().length`);
      await z('keyDown');
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 600 });
      expect(await p.ev(`getComputedStyle(planx.editor.canvas).cursor`), `${tool}: the magnifier`).toBe('zoom-in');
      await p.drag([250, 250], [500, 500]);
      await sleep(550);
      expect(await p.ev(`planx.board.list().length`), `${tool}: nothing made or rubbed out`).toBe(n);
      expect(await p.ev(`planx.editor.cam.z > 1.5`), `${tool}: zoomed to the box`).toBe(true);
      await p.click([1000, 650]); await p.click([1000, 650]);
      await sleep(100);
      expect(await p.ev(`Math.round(planx.editor.toScreen({ x: 375, y: 375 }).x) > 0 && planx.editor.toScreen({ x: 375, y: 375 }).x < 1200 && planx.editor.toScreen({ x: 375, y: 375 }).y < 800`), `${tool}: a double click, all in view`).toBe(true);
      expect(await p.ev(`planx.board.list().length`), `${tool}: and nothing made by it`).toBe(n);
      await z('keyUp');
      expect(await p.ev(`planx.editor.tool`), `${tool}: Z let go, back`).toBe(tool);
      expect(await p.ev(`getComputedStyle(planx.editor.canvas).cursor !== 'zoom-in'`), `${tool}: no magnifier`).toBe(true);
    }
    // And it works as itself again.
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setTool('rect'); })()`);
    await p.drag([600, 300], [800, 500]);
    expect(await p.ev(`planx.board.list().filter((i) => i.type === 'rect').length`), 'a rectangle').toBe(1);
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
    expect(await p.ev(`planx.editor.linksAsThey`), 'drawn in their colour, not blue, meanwhile').toBe(true);
    await p.click(await p.at('.bar.panel button[aria-label="Цвет и стрелки линий"]'));
    await sleep(100);
    expect(await p.ev(`planx.editor.linksAsThey`), 'blue again once closed').toBe(false);
  },
};

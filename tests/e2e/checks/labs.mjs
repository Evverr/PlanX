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
    expect(await p.ev(`document.querySelectorAll('.labs-menu .menu-switch').length`), 'switches').toBe(12);
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
    await p.ev(`(() => { const e = planx.editor, { x, y } = e.toWorld(300, 250); planx.board.add(e.newItem('sticky', x, y, { id: 'st', w: 150, h: 150, text: 'Сайт' })); e.setSelection(['st']); })()`);
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
    expect(titles, 'each, the task by what is in it').toBe('Стикер | Текст «Подпись» | Прямоугольник | Эллипс | Текст «Что надо сделать» | Текст «Подробности»');
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
};

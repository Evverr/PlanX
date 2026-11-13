// The basic things done on the board with the mouse and keys: moving, resizing, turning, picking
// with a box, drawing and erasing, linking, mind map keys, undo.
import { expect, sleep } from '../lib.mjs';

const put = (p, code) => p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = planx.editor.toWorld(300, 200); ${code} })()`);
const item = (p, id) => p.ev(`planx.board.get('${id}')`);
const screen = (p, x, y) => p.ev(`(() => { const s = planx.editor.toScreen({ x: ${x}, y: ${y} }); return [s.x, s.y]; })()`);
const count = (p, type) => p.ev(`planx.board.list().filter((i) => i.type === '${type}').length`);
const sticky = (p, dx = 0) => put(p, `const s = e.newItem('sticky', X + ${dx}, Y, { w: 160, h: 160 }); b.add(s); return s.id;`);

export const checks = {
  async 'an item is dragged, resized by its handle and turned by its corner, and undone'(p) {
    const id = await sticky(p);
    const s0 = await item(p, id);
    await p.drag(await screen(p, s0.x + 80, s0.y + 80), await screen(p, s0.x + 180, s0.y + 130));
    let s = await item(p, id);
    expect(s.x - s0.x, 'moved right').toBeNear(100, 1);
    const moved = { x: s.x, y: s.y };
    // (Dragged off as it was picked by that press, it's not picked once let go: a click picks it.)
    await p.click(await screen(p, s.x + 80, s.y + 80));
    // Its handle, just past the lower right corner.
    await p.drag(await screen(p, s.x + s.w + 3, s.y + s.h + 3), await screen(p, s.x + s.w + 63, s.y + s.h + 63));
    s = await item(p, id);
    expect(s.w, 'wider').toBeAtLeast(200);
    // Turned by the top right corner, from just outside it.
    await p.drag(await screen(p, s.x + s.w + 8, s.y - 8), await screen(p, s.x + s.w + 60, s.y + s.h / 2));
    s = await item(p, id);
    expect(!!s.rot, 'turned').toBeTruthy();
    // Two steps back: the turn and the resize; the move stays.
    for (let i = 0; i < 2; i++) await p.key('z', 'KeyZ', 90, 2);
    s = await item(p, id);
    expect(s.x === moved.x && s.y === moved.y && !s.rot && s.w === 160, 'back to where it was moved').toBeTruthy();
  },

  async 'a box dragged on the empty board picks what it touches'(p) {
    const a = await sticky(p, 0), b = await sticky(p, 220);
    const A = await item(p, a), B = await item(p, b);
    await p.drag(await screen(p, A.x - 30, A.y - 30), await screen(p, B.x + 40, B.y + 40));
    const sel = await p.ev('planx.editor.getUI().selection');
    expect(sel.includes(a) && sel.includes(b), 'both picked').toBeTruthy();
  },

  async 'the pen draws a line and the eraser takes it away'(p) {
    // (Whole lines, as set for "Ластик кружком"; under its circle only, see labs.mjs.)
    await p.ev(`(async () => (await import('/src/labs/eraseArea.ts')).setEraserStyle({ whole: true }))()`);
    await p.key('p', 'KeyP', 80);
    await p.drag([500, 400], [650, 450]);
    expect(await count(p, 'ink'), 'a drawn line').toBe(1);
    await p.key('e', 'KeyE', 69);
    await p.drag([560, 380], [580, 460]);
    expect(await count(p, 'ink'), 'erased').toBe(0);
    await p.ev(`(async () => (await import('/src/labs/eraseArea.ts')).setEraserStyle({ whole: undefined }))()`);
  },

  async 'a link is drawn from an item\'s dot to another'(p) {
    const a = await sticky(p, 0), b = await sticky(p, 400);
    const A = await item(p, a), B = await item(p, b);
    await p.click(await screen(p, A.x + 80, A.y + 80));
    await sleep(200);
    // The right dot, 16px out from the middle of the right side.
    const dot = await screen(p, A.x + A.w, A.y + A.h / 2);
    await p.drag([dot[0] + 16, dot[1]], await screen(p, B.x + 80, B.y + 80));
    expect(await p.ev(`planx.board.hasLink('${a}', '${b}')`), 'linked').toBeTruthy();
  },

  async 'keys: arrows move, Ctrl+D duplicates, Delete removes'(p) {
    const id = await sticky(p);
    const s0 = await item(p, id);
    await p.ev(`planx.editor.setSelection(['${id}'])`);
    await p.key('ArrowRight', 'ArrowRight', 39);
    await p.key('ArrowDown', 'ArrowDown', 40, 8);
    const s1 = await item(p, id);
    expect(s1.x - s0.x, 'right by 1').toBe(1);
    expect(s1.y - s0.y, 'down by 10 with Shift').toBe(10);
    await p.key('d', 'KeyD', 68, 2);
    expect(await count(p, 'sticky'), 'duplicated').toBe(2);
    const copy = await p.ev(`planx.board.get([...planx.editor.selection][0])`);
    expect([copy.x - s1.x - s1.w, copy.y - s1.y].join(), 'right of it, 24 off, level').toBe('24,0');
    await p.key('Delete', 'Delete', 46);
    expect(await count(p, 'sticky'), 'the copy deleted').toBe(1);
    // In a column of its like: under the column's last, as far as the last two are apart.
    await p.ev(`(() => { const b = planx.board, e = planx.editor, s = b.get('${id}'); b.add(e.newItem('sticky', s.x, s.y + s.h + 40, { id: 'below', w: s.w, h: s.h })); e.setSelection(['below']); })()`);
    await p.key('d', 'KeyD', 68, 2);
    const down = await p.ev(`(() => { const c = planx.board.get([...planx.editor.selection][0]), l = planx.board.get('below'); return [c.x - l.x, c.y - l.y - l.h].join(); })()`);
    expect(down, 'under the column, 40 off as they are').toBe('0,40');
    // Its like under it (the column's top picked): right of it instead.
    await p.ev(`planx.editor.setSelection(['${id}'])`);
    await p.key('d', 'KeyD', 68, 2);
    const right = await p.ev(`(() => { const c = planx.board.get([...planx.editor.selection][0]), s = planx.board.get('${id}'); return [c.x - s.x - s.w, c.y - s.y].join(); })()`);
    expect(right, 'its like under it: right of it').toBe('24,0');
    // A column put by hand, a little off level (up to a fifth of their width): still under it; further
    // off, right of it.
    const dup = (dx) => p.ev(`(() => { const b = planx.board, e = planx.editor; b.add(e.newItem('sticky', 2000, 2000, { id: 'c0${dx}', w: 200, h: 200 })); b.add(e.newItem('sticky', 2000 + ${dx}, 2240, { id: 'c1${dx}', w: 200, h: 200 }));
      e.setSelection(['c1${dx}']); e.duplicate(); const c = b.get([...e.selection][0]), l = b.get('c1${dx}'); b.remove(['c0${dx}', 'c1${dx}', c.id]); return c.y > l.y + l.h ? 'under' : 'right'; })()`);
    expect([await dup(30), await dup(50)].join(), 'a little off: under; more: right').toBe('under,right');
  },

  async 'a mind map node: a click on its edge picks it, on its text opens it; Delete held deletes once'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('mind', 100, 300, { id: 'r', w: 120, h: 48, text: 'Центр' }));
      b.add(e.newItem('mind', 300, 300, { id: 'a', w: 100, h: 48, text: 'Ветка', parent: 'r' })); e.setSelection([]); })()`);
    await sleep(200);
    await p.click([303, 324]);
    await sleep(150);
    await p.click([303, 324]);
    await sleep(150);
    expect(await p.ev(`[...planx.editor.selection].join() + ' ' + planx.editor.editingId`), 'edge: picked only').toBe('a null');
    await p.click([350, 324]);
    await sleep(150);
    expect(await p.ev('planx.editor.editingId'), 'text: typing').toBe('a');
    await p.ev('planx.editor.stopEditing()');
    const del = (repeat) => p.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, autoRepeat: repeat });
    await del(false); await sleep(100);
    for (let i = 0; i < 3; i++) { await del(true); await sleep(50); }
    expect(await p.ev(`planx.board.list().map((i) => i.id).join()`), 'only the node gone').toBe('r');
  },

  async 'Ctrl+Z in a new mind map branch with nothing typed takes it away'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('mind', 300, 300, { id: 'r', w: 120, h: 40, text: 'Центр' })); e.setSelection(['r']); e.addMindNode('r', 'child'); })()`);
    await sleep(200);
    expect(await p.ev(`document.activeElement?.tagName`), 'typing in it').toBe('TEXTAREA');
    await p.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90 });
    await sleep(200);
    expect(await p.ev(`planx.board.list().filter((i) => i.parent === 'r').length + ' ' + [...planx.editor.selection].join()`), 'gone, its parent picked').toBe('0 r');
  },

  async 'the pointer rested on a mind map node a moment shows its buttons, nothing picked; its "+" adds a branch'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('mind', 300, 300, { id: 'r', w: 120, h: 40, text: 'Центр' })); e.setSelection([]); })()`);
    await sleep(200);
    await p.mouse('mouseMoved', 360, 320);
    await sleep(100);
    expect(await p.ev('planx.editor.plusFade()'), 'not yet').toBe(0);
    await sleep(700);
    expect(await p.ev('planx.editor.plusNode()?.id'), 'its buttons').toBe('r');
    const plus = await p.ev(`(async () => { const m = await import('/src/model/mind.ts'), e = planx.editor, it = planx.board.get('r');
      const b = m.mindButtons(it, (id) => planx.board.get(id), e.cam.z, []).find((b) => b.kind === 'child'); return [b.x, b.y]; })()`);
    await p.mouse('mouseMoved', ...plus);
    await p.click(plus);
    await sleep(200);
    expect(await p.ev(`planx.board.list().filter((i) => i.parent === 'r').length`), 'a branch').toBe(1);
  },

  async 'a mind map grows by Tab (a branch) and Enter (one beside it)'(p) {
    await p.make('mind', [600, 400]);
    await p.escape();
    const root = await p.ev(`planx.board.list().find((i) => i.type === 'mind').id`);
    await p.ev(`planx.editor.setSelection(['${root}'])`);
    await p.key('Tab', 'Tab', 9);
    await p.escape();
    const child = await p.ev(`planx.board.list().find((i) => i.type === 'mind' && i.parent === '${root}').id`);
    await p.ev(`planx.editor.setSelection(['${child}'])`);
    await p.key('Enter', 'Enter', 13);
    await p.escape();
    expect(await p.ev(`planx.board.list().filter((i) => i.parent === '${root}').length`), 'two branches of the root').toBe(2);
  },

  async 'the "+" under a central topic leads a branch down, and Tab on it one further down'(p) {
    await p.make('mind', [600, 300]);
    await p.escape();
    const root = await p.ev(`planx.board.list().find((i) => i.type === 'mind').id`);
    // (Set to grow down too: «Конфигурация».)
    await p.ev(`planx.board.update('${root}', { mw: ['right', 'up', 'down'] }); planx.editor.setSelection(['${root}'])`);
    // Where the editor draws it.
    const plus = await p.ev(`(async () => { const m = await import('/src/model/mind.ts'), ed = planx.editor;
      const b = m.mindButtons(planx.board.get('${root}'), (k) => planx.board.get(k), ed.cam.z).find((b) => b.kind === 'down');
      const s = ed.toScreen(b), c = ed.canvas.getBoundingClientRect(); return [s.x + c.left, s.y + c.top]; })()`);
    // The buttons show a moment after it's picked.
    await p.mouse('mouseMoved', ...plus);
    await sleep(700);
    await p.click(plus);
    await p.escape();
    const d = await p.ev(`(() => { const r = planx.board.get('${root}'), d = planx.board.list().find((i) => i.parent === r.id);
      return { id: d.id, down: d.down, under: d.y > r.y + r.h, centred: Math.abs(d.x + d.w / 2 - (r.x + r.w / 2)) < 1 }; })()`);
    expect(d.down, 'led down').toBe(true);
    expect(d.under && d.centred, 'under the topic, centred').toBe(true);
    await p.ev(`planx.editor.setSelection(['${d.id}'])`);
    await p.key('Tab', 'Tab', 9);
    await p.escape();
    const e = await p.ev(`(() => { const d = planx.board.get('${d.id}'), e = planx.board.list().find((i) => i.parent === d.id); return e && e.down && e.y > d.y + d.h; })()`);
    expect(e, 'its branch under it, led down too').toBe(true);
  },

  async 'the "+" over a central topic leads a branch up, which grows upwards as it is typed in'(p) {
    await p.make('mind', [600, 400]);
    await p.escape();
    const root = await p.ev(`planx.board.list().find((i) => i.type === 'mind').id`);
    await p.ev(`planx.board.update('${root}', { mw: ['right', 'left', 'up'] }); planx.editor.setSelection(['${root}'])`);
    const plus = await p.ev(`(async () => { const m = await import('/src/model/mind.ts'), ed = planx.editor;
      const b = m.mindButtons(planx.board.get('${root}'), (k) => planx.board.get(k), ed.cam.z).find((b) => b.kind === 'up');
      const s = ed.toScreen(b), c = ed.canvas.getBoundingClientRect(); return [s.x + c.left, s.y + c.top]; })()`);
    await p.mouse('mouseMoved', ...plus);
    await sleep(700);
    await p.click(plus);
    const u = await p.ev(`(() => { const r = planx.board.get('${root}'), u = planx.board.list().find((i) => i.parent === r.id);
      return { id: u.id, up: u.up, over: u.y + u.h < r.y, centred: Math.abs(u.x + u.w / 2 - (r.x + r.w / 2)) < 1, bottom: u.y + u.h, h: u.h }; })()`);
    expect(u.up, 'led up').toBe(true);
    expect(u.over && u.centred, 'over the topic, centred').toBe(true);
    await sleep(100);
    expect(await p.ev('planx.editor.editingId'), 'it opens for typing').toBe(u.id);
    await p.escape();
    await p.ev(`planx.editor.previewText('${u.id}', 'one\\ntwo')`);
    const after = await p.ev(`planx.board.get('${u.id}')`);
    expect(after.h > u.h, 'a line taller').toBe(true);
    expect(after.y + after.h, 'its lower edge holds still').toBe(u.bottom);
  },

  async 'a mind map branch dragged nearer another family hangs from that one, its line from there as it goes'(p) {
    await p.ev(`(async () => { const { mindSize } = await import('/src/canvas/text.ts'); const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      const mk = (id, x, y, text, extra = {}) => { const it = e.newItem('mind', x, y, { id, text, ...extra }); Object.assign(it, mindSize(it)); b.add(it); };
      mk('r', 200, 300, 'Тема'); mk('a', 420, 200, 'Первая', { parent: 'r' }); mk('b', 420, 420, 'Вторая', { parent: 'r' });
      mk('a1', 620, 200, 'Внук', { parent: 'a' }); mk('x', 620, 440, 'Перенести', { parent: 'b' }); e.setSelection(['x']); })()`);
    await sleep(300);
    const from = await p.ev(`(() => { const i = planx.board.get('x'), s = planx.editor.toScreen({ x: i.x + 20, y: i.y + i.h / 2 }); return [s.x, s.y]; })()`);
    // Up by the other family: the line's from its parent as it goes.
    await p.mouse('mousePressed', ...from);
    for (let i = 1; i <= 10; i++) await p.mouse('mouseMoved', from[0], from[1] - 22 * i);
    await sleep(100);
    expect(await p.ev(`planx.editor.gesture?.mindTo`), 'nearer the other family').toBe('a');
    await p.mouse('mouseReleased', from[0], from[1] - 220);
    await sleep(200);
    expect(await p.ev(`planx.board.get('x').parent`), 'hangs from it now').toBe('a');
    await p.ev('planx.editor.undo()');
    expect(await p.ev(`planx.board.get('x').parent`), 'one step undone').toBe('b');
    // Dragged over to the left of the central topic: a family left of it, the parent right of the branch.
    await p.ev(`(async () => { const { mindSize } = await import('/src/canvas/text.ts'); const e = planx.editor, b = planx.board;
      const it = e.newItem('mind', 20, 300, { id: 'l', text: 'Слева', parent: 'r' }); Object.assign(it, mindSize(it)); b.add(it); e.setSelection(['x']); })()`);
    await sleep(200);
    const x0 = await p.ev(`(() => { const i = planx.board.get('x'), s = planx.editor.toScreen({ x: i.x + 20, y: i.y + i.h / 2 }); return [s.x, s.y]; })()`);
    const to = await p.ev(`(() => { const l = planx.board.get('l'), s = planx.editor.toScreen({ x: l.x - 140, y: l.y + l.h / 2 }); return [s.x, s.y]; })()`);
    await p.mouse('mousePressed', ...x0);
    for (let i = 1; i <= 20; i++) await p.mouse('mouseMoved', x0[0] + (to[0] - x0[0]) * i / 20, x0[1] + (to[1] - x0[1]) * i / 20);
    await sleep(100);
    expect(await p.ev(`planx.editor.gesture?.mindTo`), 'over on the left: the left family').toBe('l');
    await p.mouse('mouseReleased', ...to);
  },

  async 'a box over mind map branches picks the nodes they lead to; a central topic folds each way on its own'(p) {
    await p.make('mind', [600, 400]);
    await p.escape();
    const root = await p.ev(`planx.board.list().find((i) => i.type === 'mind').id`);
    await p.ev(`(() => { const e = planx.editor; for (const k of ['child', 'child', 'left']) e.addMindNode('${root}', k, true); })()`);
    await p.ev(`planx.editor.setSelection([])`);
    // Between the topic and its branches on the right: no node in the box, only the branches.
    const box = await p.ev(`(() => { const r = planx.board.get('${root}'), e = planx.editor, c = e.canvas.getBoundingClientRect();
      const a = e.toScreen({ x: r.x + r.w + 15, y: r.y - 30 }), b = e.toScreen({ x: r.x + r.w + 45, y: r.y + r.h + 30 });
      return [[a.x + c.left, a.y + c.top], [b.x + c.left, b.y + c.top]]; })()`);
    await p.drag(...box);
    const picked = await p.ev(`[...planx.editor.selection].map((id) => planx.board.get(id))`);
    expect(picked.length, 'two picked').toBe(2);
    expect(picked.every((i) => i.parent === root && i.x > 0), 'the branches on the right').toBe(true);
    await p.ev(`planx.editor.setCollapsed('${root}', 'right', true)`);
    expect(await p.ev(`planx.editor.shown().filter((i) => i.type === 'mind').length`), 'the right side folded away, the left still there').toBe(2);
    expect(JSON.stringify(await p.ev(`[...planx.editor.folded().get('${root}')]`)), 'its count').toBe('[["right",2]]');
    // A branch's own branches folded by the ring halfway along their straight start out of it, lit as the
    // pointer comes over it (the topic's own have none: they are the map).
    const left = await p.ev(`planx.board.list().find((i) => i.parent === '${root}' && i.x < planx.board.get('${root}').x).id`);
    await p.ev(`planx.editor.addMindNode('${left}', 'child', true); planx.editor.stopEditing(); planx.editor.setSelection([])`);
    await sleep(200);
    const ring = await p.ev(`(async () => { const m = await import('/src/model/mind.ts'), e = planx.editor, c = e.canvas.getBoundingClientRect(), s = e.toScreen(m.branchBase(planx.board.get('${left}'), 'left')); return [s.x + c.left, s.y + c.top]; })()`);
    await p.mouse('mouseMoved', ...ring);
    await sleep(100);
    expect(await p.ev(`planx.editor.hotPlus`), 'the ring lit').toBe(`ring:${left}:left`);
    await p.click(ring);
    await sleep(100);
    expect(await p.ev(`planx.board.get('${left}').collapsed`), 'its branch folded').toBe(true);
  },

  async 'typing in a mind map node: Tab goes on in a branch of it, Shift+Tab back in its parent, Enter one beside it, Shift+Enter a new line'(p) {
    await p.make('mind', [500, 400]);
    await p.escape();
    const root = await p.ev(`planx.board.list().find((i) => i.type === 'mind').id`);
    await p.ev(`planx.editor.addMindNode('${root}', 'child', true)`);
    await sleep(200);
    const first = await p.ev('planx.editor.editingId');
    await p.cdp('Input.insertText', { text: 'А' });
    await p.key('Tab', 'Tab', 9);
    const child = await p.ev('planx.editor.editingId');
    expect(await p.ev(`planx.board.get('${child}').parent`), 'a branch of it typed in').toBe(first);
    await p.cdp('Input.insertText', { text: 'Б' });
    await p.key('Tab', 'Tab', 9, 8);
    await sleep(200);
    expect(await p.ev('planx.editor.editingId'), 'its parent typed in').toBe(first);
    await p.key('Enter', 'Enter', 13, 8);
    expect(await p.ev('planx.editor.editingId'), 'Shift+Enter: still typed in (a new line there)').toBe(first);
    await p.key('Enter', 'Enter', 13, 4);
    expect([await p.ev('planx.editor.editingId') === first, await p.ev(`document.querySelector('textarea.text-edit').value.endsWith('\\n')`)].join(), 'Cmd+Enter: a new line').toBe('true,true');
    await p.key('Enter', 'Enter', 13);
    const next = await p.ev('planx.editor.editingId');
    expect([next !== first, await p.ev(`planx.board.get('${next}').parent`)].join(), 'one beside it typed in').toBe(`true,${root}`);
  },

  async 'Enter while typing in a lone mind map branch makes the next, and the next; once done they centre'(p) {
    await p.make('mind', [400, 400]);
    await p.escape();
    const root = await p.ev(`planx.board.list().find((i) => i.type === 'mind').id`);
    await p.ev(`planx.editor.setSelection(['${root}'])`);
    await p.key('Tab', 'Tab', 9);
    for (const t of ['один', 'два', 'три']) {
      await p.cdp('Input.insertText', { text: t });
      await p.key('Enter', 'Enter', 13);
    }
    await p.cdp('Input.insertText', { text: 'четыре' });
    const kids = () => p.ev(`planx.board.list().filter((i) => i.parent === '${root}').sort((m, n) => m.y - n.y)`);
    const going = await kids();
    expect(going.map((k) => k.text ?? '').join(), 'made one after another, going down').toBe('один,два,три,');
    expect(await p.ev('planx.editor.editingId'), 'the last typed in').toBe(going[3].id);
    const r0 = await p.ev(`planx.board.get('${root}')`);
    expect((going[0].y + going[3].y + going[3].h) / 2, 'centred on the topic as they come').toBeNear(r0.y + r0.h / 2, 1);
    // Done typing: they glide to stand centred on the topic.
    await p.escape();
    await sleep(500);
    const done = await kids(), r = await p.ev(`planx.board.get('${root}')`);
    expect(done.map((k) => k.text).join(), 'what was typed').toBe('один,два,три,четыре');
    expect((done[0].y + done[3].y + done[3].h) / 2, 'centred on the topic').toBeNear(r.y + r.h / 2, 1);
  },

  async 'Cmd+Enter while typing keeps the text and leaves nothing picked'(p) {
    await p.make('sticky', [600, 400]);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'sticky').id`);
    await p.ev(`planx.editor.setSelection(['${id}']); planx.editor.startEditing('${id}')`);
    await sleep(200);
    await p.cdp('Input.insertText', { text: 'готово' });
    await p.key('Enter', 'Enter', 13, 4);
    expect(await p.ev(`planx.board.get('${id}').text`), 'the text kept').toBe('готово');
    expect(await p.ev('planx.editor.editingId'), 'not typing').toBe(null);
    expect(await p.ev('planx.editor.selection.size'), 'nothing picked').toBe(0);
  },

  async 'a family folded away, its cousins close up where it was, out again make room; not once the map\'s moved by hand'(p) {
    await p.ev(`(async () => { const { mindSize } = await import('/src/canvas/text.ts'); const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 0.8 }; e.camChanged();
      const mk = (id, x, y, text, extra = {}) => { const it = e.newItem('mind', x, y, { id, text, ...extra }); Object.assign(it, mindSize(it)); b.add(it); };
      mk('r', 0, 300, 'Тема');
      ['a', 'b', 'c'].forEach((k, i) => { mk(k, 220, 100 + i * 200, k.toUpperCase(), { parent: 'r' }); [0, 1, 2].forEach((j) => mk(k + j, 440, 40 + i * 200 + j * 50, k + j, { parent: k })); });
      e.setSelection([]); })()`);
    await sleep(300);
    await p.ev(`planx.editor.tidyMind('r')`);
    const y = (k) => p.ev(`planx.board.get('${k}').y`);
    const c0 = await y('c0');
    await p.ev(`planx.editor.setCollapsed('b', 'right', true)`);
    await sleep(100);
    const c1 = await y('c0');
    expect(c1 < c0, `c's family closed up (${c0} → ${c1})`).toBe(true);
    await p.ev(`planx.editor.setCollapsed('b', 'right', false)`);
    await sleep(100);
    expect(await y('c0') > c1, 'out again: room made').toBe(true);
    // Moved by hand: folding leaves the rest where it is.
    await p.ev(`planx.board.update('r', { mhand: true })`);
    const c2 = await y('c0');
    await p.ev(`planx.editor.setCollapsed('b', 'right', true)`);
    await sleep(100);
    expect(await y('c0'), 'moved by hand: left where it was').toBe(c2);
  },

  async 'a click on a folded mind map node\'s count unfolds it and leaves nothing picked'(p) {
    await p.make('mind', [400, 400]);
    await p.escape();
    const root = await p.ev(`planx.board.list().find((i) => i.type === 'mind').id`);
    await p.ev(`(() => { const e = planx.editor; e.addMindNode('${root}', 'child'); })()`);
    await p.escape();
    const a = await p.ev(`planx.board.list().find((i) => i.parent === '${root}').id`);
    await p.ev(`(() => { const e = planx.editor; e.addMindNode('${a}', 'child', true); e.addMindNode('${a}', 'child', true); })()`);
    await p.escape();
    await p.ev(`planx.editor.setCollapsed('${a}', 'right', true); planx.editor.setSelection(['${a}'])`);
    await sleep(800);
    const at = await p.ev(`(async () => { const m = await import('/src/model/mind.ts'), e = planx.editor; const b = m.foldBadge(planx.board.get('${a}'), 'right', e.cam.z, 2, e.slid.get('${a}:right') ?? 0);
      const s = e.toScreen(b), c = e.canvas.getBoundingClientRect(); return [s.x + c.left, s.y + c.top]; })()`);
    await p.click(at);
    expect(await p.ev(`!!planx.board.get('${a}').collapsed`), 'unfolded').toBe(false);
    expect(await p.ev('planx.editor.selection.size'), 'nothing picked').toBe(0);
  },

  async 'Tab while typing in a central topic goes on in a new branch of it, to the right'(p) {
    await p.make('mind', [400, 400]);
    const root = await p.ev(`planx.board.list().find((i) => i.type === 'mind').id`);
    await p.ev(`planx.editor.setSelection(['${root}']); planx.editor.startEditing('${root}')`);
    await sleep(200);
    await p.cdp('Input.insertText', { text: 'План' });
    await p.key('Tab', 'Tab', 9);
    const kid = await p.ev(`planx.board.list().find((i) => i.parent === '${root}')`);
    expect(!!kid && kid.x > (await p.ev(`planx.board.get('${root}').x`)), 'a branch on the right').toBe(true);
    expect(await p.ev('planx.editor.editingId'), 'typed in at once').toBe(kid.id);
    expect(await p.ev(`planx.board.get('${root}').text`), 'the topic kept its name').toBe('План');
  },

  async 'the hand pans the board and the wheel zooms it'(p) {
    const cam0 = await p.ev('planx.editor.cam');
    await p.key('h', 'KeyH', 72);
    await p.drag([600, 400], [700, 450]);
    const cam1 = await p.ev('planx.editor.cam');
    expect(cam1.x - cam0.x, 'panned right').toBeNear(100, 1);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 600, y: 400, deltaX: 0, deltaY: -100 });
    await sleep(200);
    expect((await p.ev('planx.editor.cam')).z > cam1.z, 'zoomed in').toBeTruthy();
  },

  async '"Зум с Cmd" in the settings: the wheel alone scrolls up and down, with Cmd or Ctrl it zooms; off, as ever'(p) {
    await p.click(await p.at('.topbar button[aria-label="Меню"]'));
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.board-menu .menu-row')].find((b) => b.textContent === 'Настройки').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(150);
    // (Second, after the theme.)
    const row = () => p.ev(`(() => { const r = document.querySelector('.modal.settings .settings-list:not(.labs-list) .settings-row:nth-child(2)'); return r.querySelector('b').textContent.startsWith('Зум с') + ' ' + r.getAttribute('aria-checked'); })()`);
    expect(await row(), 'off at first').toBe('true false');
    await p.click(await p.at('.modal.settings .settings-list:not(.labs-list) .settings-row:nth-child(2)'));
    expect(await row(), 'switched on').toBe('true true');
    await p.escape();
    await sleep(150);
    const turn = async (modifiers) => {
      const a = await p.ev('planx.editor.cam');
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 600, y: 400, deltaX: 0, deltaY: -100, modifiers });
      await sleep(200);
      const b = await p.ev('planx.editor.cam');
      return { z: b.z - a.z, y: b.y - a.y };
    };
    const alone = await turn(0);
    expect(alone.z, 'alone: no zoom').toBe(0);
    expect(alone.y, 'alone: scrolled').toBe(100);
    expect((await turn(4)).z > 0, 'with Cmd: zoomed').toBe(true);
    expect((await turn(2)).z > 0, 'with Ctrl: zoomed').toBe(true);
    await p.reload();
    expect((await turn(0)).z, 'kept after a reload').toBe(0);
    await p.ev(`(async () => (await import('/src/labs/wheelZoom.ts')).setZoomsWithKey(false))()`);
    expect((await turn(0)).z > 0, 'off: the wheel zooms').toBe(true);
  },
};

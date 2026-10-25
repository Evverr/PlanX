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
    await p.key('p', 'KeyP', 80);
    await p.drag([500, 400], [650, 450]);
    expect(await count(p, 'ink'), 'a drawn line').toBe(1);
    await p.key('e', 'KeyE', 69);
    await p.drag([560, 380], [580, 460]);
    expect(await count(p, 'ink'), 'erased').toBe(0);
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
    await p.key('Delete', 'Delete', 46);
    expect(await count(p, 'sticky'), 'the copy deleted').toBe(1);
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
    await p.ev(`planx.editor.setSelection(['${root}'])`);
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
    await p.ev(`planx.editor.setSelection(['${root}'])`);
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
    expect(await p.ev(`[...planx.editor.selection].join()`), 'the topic still picked, for another click').toBe(root);
    await p.ev(`planx.editor.previewText('${u.id}', 'one\\ntwo')`);
    const after = await p.ev(`planx.board.get('${u.id}')`);
    expect(after.h > u.h, 'a line taller').toBe(true);
    expect(after.y + after.h, 'its lower edge holds still').toBe(u.bottom);
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
  },

  async 'Tab while typing in a mind map node goes on to the next branch of the same parent, Shift+Tab back'(p) {
    await p.make('mind', [500, 400]);
    await p.escape();
    const root = await p.ev(`planx.board.list().find((i) => i.type === 'mind').id`);
    await p.ev(`(() => { for (let i = 0; i < 3; i++) planx.editor.addMindNode('${root}', 'child', true); })()`);
    const kids = await p.ev(`planx.board.list().filter((i) => i.parent === '${root}').sort((m, n) => m.y - n.y).map((i) => i.id)`);
    await p.ev(`planx.editor.setSelection(['${kids[0]}']); planx.editor.startEditing('${kids[0]}')`);
    await sleep(200);
    await p.key('Tab', 'Tab', 9);
    expect(await p.ev('planx.editor.editingId'), 'the second one typed in').toBe(kids[1]);
    await p.key('Tab', 'Tab', 9, 8);
    expect(await p.ev('planx.editor.editingId'), 'back to the first').toBe(kids[0]);
    await p.key('Tab', 'Tab', 9, 8);
    expect(await p.ev('planx.editor.editingId'), 'round to the last').toBe(kids[2]);
    expect(await p.ev(`planx.board.list().filter((i) => i.type === 'mind').length`), 'nothing new made').toBe(4);
  },

  async 'Tab while typing in a new mind map node goes on in a new one after it, again and again'(p) {
    await p.make('mind', [500, 400]);
    await p.escape();
    const root = await p.ev(`planx.board.list().find((i) => i.type === 'mind').id`);
    await p.ev(`planx.editor.setSelection(['${root}'])`);
    await p.key('Tab', 'Tab', 9);
    for (const t of ['один', 'два', 'три']) {
      await p.cdp('Input.insertText', { text: t });
      await p.key('Tab', 'Tab', 9);
    }
    await p.escape();
    const kids = await p.ev(`planx.board.list().filter((i) => i.parent === '${root}').sort((m, n) => m.y - n.y).map((i) => i.text ?? '')`);
    expect(kids.join(','), 'one after another, the last still empty').toBe('один,два,три,');
    // Opened again later, Tab goes to the next one instead.
    const ids = await p.ev(`planx.board.list().filter((i) => i.parent === '${root}').sort((m, n) => m.y - n.y).map((i) => i.id)`);
    await p.ev(`planx.editor.setSelection(['${ids[3]}']); planx.editor.startEditing('${ids[3]}')`);
    await sleep(200);
    await p.key('Tab', 'Tab', 9);
    expect(await p.ev('planx.editor.editingId'), 'round to the first').toBe(ids[0]);
    expect(await p.ev(`planx.board.list().filter((i) => i.parent === '${root}').length`), 'nothing new').toBe(4);
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
};

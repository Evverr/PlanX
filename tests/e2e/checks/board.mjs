// Things on the board: frames folding by double click, table lines, the selection and text panels, clearing.
import { expect, sleep } from '../lib.mjs';

/** Puts items on the board through the app's own handle (window.planx), and gives back their ids;
 *  (X, Y) in the code is a point on the board towards the screen's upper left, clear of the panels. */
const put = (p, code) => p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = planx.editor.toWorld(300, 200); ${code} })()`);
const screen = (p, x, y) => p.ev(`(() => { const s = planx.editor.toScreen({ x: ${x}, y: ${y} }); return [s.x, s.y]; })()`);
const origin = (p) => p.ev(`planx.editor.toWorld(300, 200)`);

export const checks = {
  async 'a frame folds into a bar on a double click, shows what it holds in a popup, and unfolds on another'(p) {
    const ids = await put(p, `
      const f = e.newItem('frame', X, Y, { w: 400, h: 300, members: [] }), s = e.newItem('sticky', X + 60, Y + 60), o = e.newItem('sticky', X + 600, Y + 60);
      b.add(f); b.add(s); b.add(o); b.update(f.id, { members: [s.id] });
      b.addLink({ id: 'link-1', from: s.id, to: o.id });
      return { f: f.id, s: s.id, o: o.id };`);
    await sleep(200);
    const twice = async (at) => { await p.mouse('mouseMoved', ...at); for (const _ of [0, 1]) { await p.mouse('mousePressed', ...at); await p.mouse('mouseReleased', ...at); } await sleep(300); };
    // On an empty spot inside it.
    const o = await origin(p);
    await twice(await screen(p, o.x + 300, o.y + 220));
    expect(await p.ev(`!!planx.board.get('${ids.f}').fold`), 'folded').toBeTruthy();
    expect(await p.ev(`planx.editor.shown().some((i) => i.id === '${ids.s}')`), 'its sticky out of sight').toBeFalsy();
    expect(await p.ev(`planx.editor.shownLinks()[0].from`), 'the link starts at the bar').toBe(ids.f);
    // On the bar: the eye, at its right end.
    const bar = await p.ev(`planx.board.get('${ids.f}')`);
    await p.click(await screen(p, bar.x + bar.w - 20 - 12, bar.y + bar.h / 2));
    expect(!!(await p.rect('.peek')), 'the look into it opens').toBeTruthy();
    await p.escape();
    expect(!!(await p.rect('.peek')), 'and closes on Esc').toBeFalsy();
    await sleep(400);
    await twice(await screen(p, bar.x + 40, bar.y + bar.h / 2));
    const f = await p.ev(`planx.board.get('${ids.f}')`);
    expect(!!f.fold, 'unfolded').toBeFalsy();
    expect(f.w, 'its size back').toBe(400);
    // A double click on its title over it opens that for typing instead.
    await sleep(400);
    await twice(await screen(p, o.x + 20, o.y - 12));
    expect(await p.ev('planx.editor.editingId'), 'the title open for typing').toBe(ids.f);
    expect(await p.ev(`!!planx.board.get('${ids.f}').fold`), 'not folded').toBeFalsy();
  },

  async 'a frame lies under all it holds, a frame made in a frame too'(p) {
    // The outer frame, a sticky in it, then a frame drawn inside it (new frames go to the bottom of the stack).
    const o = await origin(p), a = await screen(p, o.x, o.y), b = await screen(p, o.x + 500, o.y + 360);
    await p.key('f', 'KeyF', 70);
    await p.drag(a, b);
    await p.escape();
    await p.escape();
    await p.make('sticky', await screen(p, o.x + 400, o.y + 80));
    await p.key('f', 'KeyF', 70);
    await p.drag(await screen(p, o.x + 40, o.y + 140), await screen(p, o.x + 300, o.y + 330));
    await p.escape();
    await p.escape();
    const ids = await p.ev(`(() => { const fs = planx.board.list().filter((i) => i.type === 'frame').sort((m, n) => n.w - m.w); return { outer: fs[0].id, inner: fs[1].id, s: planx.board.list().find((i) => i.type === 'sticky').id }; })()`);
    expect(await p.ev(`planx.board.get('${ids.inner}').z < planx.board.get('${ids.outer}').z`), 'the inner frame lower in the stack').toBe(true);
    const at = await p.ev(`(() => { const ids = planx.editor.shown().map((i) => i.id); return { outer: ids.indexOf('${ids.outer}'), inner: ids.indexOf('${ids.inner}'), s: ids.indexOf('${ids.s}') }; })()`);
    expect(at.outer < at.inner && at.outer < at.s, 'drawn under both').toBe(true);
    // A click inside the inner frame picks it, not the outer one.
    await p.click(await screen(p, o.x + 200, o.y + 250));
    expect(await p.ev(`[...planx.editor.selection].join()`), 'the inner frame picked').toBe(ids.inner);
    // Brought to the top of the stack, the outer frame still lies under the sticky.
    await p.ev(`planx.board.update('${ids.outer}', { z: planx.board.maxZ() + 1 })`);
    const now = await p.ev(`planx.editor.shown().map((i) => i.id)`);
    expect(now.indexOf(ids.outer) < now.indexOf(ids.s), 'still under the sticky').toBe(true);
  },

  async 'the frame button with something picked puts a frame round it, one item as well'(p) {
    const o = await origin(p);
    await p.make('sticky', await screen(p, o.x + 200, o.y + 200));
    const s = await p.ev(`planx.board.list().find((i) => i.type === 'sticky')`);
    await p.ev(`planx.editor.setSelection(['${s.id}'])`);
    await p.click(await p.at('.tools [data-key="frames"]'));
    await p.escape();
    const f = await p.ev(`planx.board.list().find((i) => i.type === 'frame')`);
    expect(!!f, 'a frame made').toBe(true);
    expect(f.members.join(), 'the sticky in it').toBe(s.id);
    expect(f.x < s.x && f.y < s.y && f.x + f.w > s.x + s.w && f.y + f.h > s.y + s.h, 'round it').toBe(true);
    // With nothing picked, the button picks the frame tool instead.
    await p.ev(`planx.editor.setSelection([])`);
    await p.click(await p.at('.tools [data-key="frames"]'));
    expect(await p.ev('planx.editor.tool'), 'the frame tool').toBe('frame');
  },

  async 'a mind map node framed by the frame button goes in with all its branches'(p) {
    await p.make('mind', await screen(p, (await origin(p)).x + 150, (await origin(p)).y + 150));
    await p.escape();
    const root = await p.ev(`planx.board.list().find((i) => i.type === 'mind').id`);
    await p.ev(`(() => { const e = planx.editor; e.addMindNode('${root}', 'child'); e.addMindNode('${root}', 'child'); })()`);
    const kid = await p.ev(`planx.board.list().find((i) => i.parent === '${root}').id`);
    await p.ev(`planx.editor.addMindNode('${kid}', 'child')`);
    await p.escape();
    await p.ev(`planx.editor.setSelection(['${root}'])`);
    await p.click(await p.at('.tools [data-key="frames"]'));
    await p.escape();
    const f = await p.ev(`planx.board.list().find((i) => i.type === 'frame')`);
    // The topic in it (its branches go wherever it goes), and all of them inside its box.
    expect(f.members.join(), 'the topic in it').toBe(root);
    const outside = await p.ev(`planx.board.list().filter((i) => i.type === 'mind' && !(i.x > ${f.x} && i.y > ${f.y} && i.x + i.w < ${f.x + f.w} && i.y + i.h < ${f.y + f.h})).length`);
    expect(outside, 'all of them inside it').toBe(0);
  },

  async 'Tab while typing in a table cell goes on to the next cell, Shift+Tab back'(p) {
    const id = await put(p, `const t = e.newItem('table', X, Y, { cols: [120, 120], rows: [40, 40], cells: Array(4).fill(''), w: 240, h: 80 }); b.add(t); return t.id;`);
    await p.ev(`planx.editor.startEditing('${id}', 0)`);
    await sleep(200);
    await p.cdp('Input.insertText', { text: 'a' });
    await p.key('Tab', 'Tab', 9);
    expect(await p.ev('planx.editor.editingCell'), 'the next cell').toBe(1);
    await p.cdp('Input.insertText', { text: 'b' });
    await p.key('Tab', 'Tab', 9);
    expect(await p.ev('planx.editor.editingCell'), 'on to the next row').toBe(2);
    await p.key('Tab', 'Tab', 9, 8);
    expect(await p.ev('planx.editor.editingCell'), 'back').toBe(1);
    await p.escape();
    expect((await p.ev(`planx.board.get('${id}').cells`)).join(','), 'what was typed kept').toBe('a,b,,');
  },

  async 'a component made of what\'s picked, its "+" makes instances that follow it, but for what was changed in them'(p) {
    const ids = await put(p, `const a = e.newItem('sticky', X, Y, { text: 'Привет' }), c = e.newItem('rect', X + 200, Y, { text: 'Кнопка' });
      b.add(a); b.add(c); e.setSelection([a.id, c.id]); return { a: a.id, c: c.id };`);
    await p.click(await p.at('.tools [data-key="component"]'));
    await p.escape();
    const comp = await p.ev(`planx.board.list().find((i) => i.comp)`);
    expect(comp?.members?.length, 'a component round both').toBe(2);
    await p.ev(`planx.editor.setSelection(['${comp.id}'])`);
    await sleep(200);
    await p.click(await screen(p, comp.x + comp.w + 40, comp.y + comp.h / 2));
    await sleep(200);
    const inst = await p.ev(`planx.board.list().find((i) => i.inst === '${comp.id}')`);
    const copy = (k) => p.ev(`planx.board.get('${inst.id}~${k}')`);
    // The first instance folds the component; its "+" by the bar makes another.
    const bar = await p.ev(`planx.board.get('${comp.id}')`);
    expect(!!bar.fold, 'the component folded').toBe(true);
    await sleep(200);
    await p.click(await screen(p, bar.x + bar.w + 40, bar.y + bar.h / 2));
    await sleep(200);
    expect(await p.ev(`planx.board.list().filter((i) => i.inst === '${comp.id}').length`), 'a second instance').toBe(2);
    expect(await p.ev(`planx.board.list().filter((i) => i.inst === '${comp.id}').every((i) => i.w === ${comp.w})`), 'as big as the component unfolded').toBe(true);
    expect((await copy(ids.a))?.text, 'a copy of the sticky in the instance').toBe('Привет');
    // Changed in the component, changed in the instance; a change undone, undone there too.
    await p.ev(`planx.editor.setSelection([]); planx.board.update('${ids.a}', { text: 'Новое', color: 'pink' })`);
    await sleep(100);
    expect((await copy(ids.a)).color, 'its colour followed').toBe('pink');
    await p.key('z', 'KeyZ', 90, 4);
    await sleep(100);
    expect((await copy(ids.a)).text, 'and was undone with it').toBe('Привет');
    // Its own text, typed into the copy, stays; its colour still follows.
    await p.ev(`planx.board.update('${inst.id}~${ids.a}', { text: 'Своё' })`);
    await p.ev(`planx.board.update('${ids.a}', { text: 'Ещё', color: 'blue' })`);
    await sleep(100);
    const c = await copy(ids.a);
    expect(c.text + ' ' + c.color, 'its own text kept, the colour followed').toBe('Своё blue');
    // A click on a copy picks the whole instance.
    const at = await screen(p, c.x + 50, c.y + 50);
    await p.ev(`planx.editor.setSelection([])`);
    await p.click(at);
    expect(await p.ev(`[...planx.editor.selection].join()`), 'the instance picked').toBe(inst.id);
    // Deleted and the deleting undone, it's back with its own text.
    await p.key('Delete', 'Delete', 46);
    expect(await copy(ids.a), 'gone with it').toBe(undefined);
    await p.key('z', 'KeyZ', 90, 4);
    await sleep(100);
    expect((await copy(ids.a))?.text, 'back, its own text too').toBe('Своё');
  },

  async 'a picked link\'s panel has its three ways of running: smooth, right angles, straight'(p) {
    await put(p, `const a = e.newItem('sticky', X, Y), c = e.newItem('sticky', X + 420, Y + 260); b.add(a); b.add(c);
      b.addLink({ id: 'L1', from: a.id, to: c.id, fromSide: 'right', toSide: 'left' });`);
    await p.ev(`planx.editor.setSelection(['L1'])`);
    await sleep(300);
    expect(await p.ev(`document.querySelector('.bar.panel button[aria-label="Плавная линия"]')?.getAttribute('aria-pressed')`), 'smooth at first').toBe('true');
    await p.click(await p.at('.bar.panel button[aria-label="Линия с прямыми углами"]'));
    expect(await p.ev(`planx.board.getLink('L1').style`), 'right angles').toBe('elbow');
    // Picked by a click on its corner, where only a right-angled line runs.
    const corner = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'); const sh = g.linkShape(planx.board.getLink('L1'), (k) => planx.board.get(k)); const s = planx.editor.toScreen(sh.pts[1]), c = planx.editor.canvas.getBoundingClientRect(); return [s.x + c.left, s.y + c.top]; })()`);
    await p.ev(`planx.editor.setSelection([])`);
    await p.click(corner);
    expect(await p.ev(`[...planx.editor.selection].join()`), 'picked on its corner').toBe('L1');
    await p.click(await p.at('.bar.panel button[aria-label="Прямая линия"]'));
    expect(await p.ev(`planx.board.getLink('L1').style`), 'straight').toBe('straight');
    await p.click(await p.at('.bar.panel button[aria-label="Плавная линия"]'));
    expect(await p.ev(`planx.board.getLink('L1').style ?? null`), 'smooth again').toBe(null);
  },

  async 'a link is faintly lit under the pointer, and its arrowhead dragged onto another item leads it there'(p) {
    const ids = await put(p, `const a = e.newItem('sticky', X, Y), c = e.newItem('sticky', X + 420, Y), d = e.newItem('sticky', X + 420, Y + 280); b.add(a); b.add(c); b.add(d);
      b.addLink({ id: 'L1', from: a.id, to: c.id, fromSide: 'right', toSide: 'left' }); return { d: d.id };`);
    const pts = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'); return g.linkShape(planx.board.getLink('L1'), (k) => planx.board.get(k)).pts.map((q) => { const s = planx.editor.toScreen(q), c = planx.editor.canvas.getBoundingClientRect(); return [s.x + c.left, s.y + c.top]; }); })()`);
    await p.mouse('mouseMoved', ...pts[12]);
    expect(await p.ev('planx.editor.hotLink'), 'lit').toBe('L1');
    const d = await p.ev(`planx.board.get('${ids.d}')`);
    await p.drag(pts[pts.length - 1], await screen(p, d.x + 60, d.y + 60));
    expect(await p.ev(`planx.board.getLink('L1').to`), 'led to the third').toBe(ids.d);
    const tip = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'); const sh = g.linkShape(planx.board.getLink('L1'), (k) => planx.board.get(k)).pts; const s = planx.editor.toScreen(sh[sh.length - 1]), c = planx.editor.canvas.getBoundingClientRect(); return [s.x + c.left, s.y + c.top]; })()`);
    // Taken hold of, the item it goes to isn't lit.
    await p.mouse('mouseMoved', ...tip);
    await p.mouse('mousePressed', ...tip);
    await p.mouse('mouseMoved', tip[0] + 2, tip[1] + 6);
    expect(await p.ev('planx.editor.gesture?.target ?? null'), 'nothing lit at first').toBe(null);
    await p.mouse('mouseReleased', tip[0] + 2, tip[1] + 6);
    expect(await p.ev(`planx.board.getLink('L1')?.to`), 'let go there, it stays').toBe(ids.d);
    // Taken off and let go on nothing, it's gone.
    await p.drag(tip, [tip[0] + 200, tip[1] + 150]);
    expect(await p.ev(`!!planx.board.getLink('L1')`), 'gone').toBe(false);
    await p.key('z', 'KeyZ', 90, 4);
    expect(await p.ev(`planx.board.getLink('L1')?.to`), 'and back on undo').toBe(ids.d);
  },

  async 'an instance detached from its component is an ordinary frame, as it was, and stays so'(p) {
    const ids = await put(p, `const a = e.newItem('sticky', X, Y, { text: 'Привет' }); b.add(a); e.setSelection([a.id]); return { a: a.id };`);
    await p.click(await p.at('.tools [data-key="component"]'));
    await p.escape();
    const comp = await p.ev(`planx.board.list().find((i) => i.comp)`);
    await p.ev(`planx.editor.addInstance('${comp.id}')`);
    await sleep(200);
    const inst = await p.ev(`planx.board.list().find((i) => i.inst)`), A = `${inst.id}~${ids.a}`;
    await p.ev(`planx.board.update('${A}', { color: 'pink' }); planx.editor.setSelection(['${inst.id}'])`);
    await sleep(300);
    await p.click(await p.at('.bar.panel button[aria-label^="Отвязать от компонента"]'));
    await p.ev(`planx.board.update('${ids.a}', { text: 'Новое' })`);
    await sleep(200);
    const c = await p.ev(`planx.board.get('${A}')`);
    expect(await p.ev(`planx.board.get('${inst.id}').inst ?? null`), 'an ordinary frame').toBe(null);
    expect(c.text + ' ' + c.color + ' ' + (c.host ?? 'free'), 'as it was, not following the component').toBe('Привет pink free');
    await p.key('z', 'KeyZ', 90, 4);
    await p.key('z', 'KeyZ', 90, 4);
    await sleep(200);
    expect(await p.ev(`planx.board.get('${inst.id}').inst`), 'undone, an instance again').toBe(comp.id);
  },

  async 'text on a dark fill is white by itself; a text colour given stays'(p) {
    await put(p, `const a = e.newItem('sticky', X, Y, { text: 'Тёмный', color: '#1C1F26' }); b.add(a); e.setSelection([a.id]);`);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'sticky').id`);
    const ink = await p.ev(`(async () => { const m = await import('/src/model/color.ts'); return m.autoInk(planx.board.get('${id}')); })()`);
    expect(ink, 'white on it').toBe('#FFFFFF');
    await sleep(300);
    await p.click(await p.at('.bar.panel [data-key="colors"] button, .bar.panel button[aria-label="Цвет"]'));
    await p.click(await p.at('.palette-pop button[aria-label="Цвет текста"]'));
    await p.click(await p.at('.palette-pop button[aria-label="Цвет текста orange"]'));
    expect(await p.ev(`planx.board.get('${id}').tc`), 'its own').toBe('orange');
    expect(await p.ev(`(async () => { const m = await import('/src/model/color.ts'); return m.autoInk(planx.board.get('${id}')); })()`), 'not by itself any more').toBe(null);
  },

  async 'a table line takes hold only after the mouse rests on it'(p) {
    const id = await put(p, `const t = e.newItem('table', X, Y, { cols: [120, 120, 120], rows: [40, 40, 40], cells: Array(9).fill(''), w: 360, h: 120 }); b.add(t); return t.id;`);
    await sleep(200);
    const t0 = await p.ev(`planx.board.get('${id}')`), line = await screen(p, t0.x + 120, t0.y + 20);
    await p.drag(line, [line[0] + 60, line[1] + 60], { rest: 200 });
    let t = await p.ev(`planx.board.get('${id}')`);
    expect(t.cols[0], 'no resize after 0.2 s').toBe(120);
    expect(t.x === t0.x && t.y === t0.y, 'the table moved instead').toBeFalsy();
    const line2 = await screen(p, t.x + 120, t.y + 20);
    await p.mouse('mouseMoved', line2[0] - 40, line2[1]);
    await p.drag(line2, [line2[0] + 60, line2[1]], { rest: 700 });
    t = await p.ev(`planx.board.get('${id}')`);
    expect(t.cols[0], 'the column widened after 0.7 s').toBeNear(180, 2);
  },

  async 'the selection panel goes up above a bar beneath it, and back down'(p) {
    await p.make('sticky', [600, 350]);
    await p.click([600, 350]);
    await sleep(400);
    const panel = await p.rect('.bar.panel'), zoom = await p.rect('.bar.zoom');
    expect(panel.b, 'above the zoom bar').toBe(zoom.t - 12);
    await p.dragEdge('.bar.zoom', 'left', 0, -700);
    await sleep(500);
    expect((await p.rect('.bar.panel')).b, 'down at the bottom once it has gone').toBe(800 - 12);
  },

  async 'the text panel keeps its bottom over the item whatever the panels\' size'(p) {
    await p.make('sticky', [600, 380]);
    await p.click([600, 380]);
    await sleep(900);
    const b0 = (await p.rect('.tfmt')).b;
    for (const size of ['Средние', 'Маленькие']) {
      await p.menu('Размер панелей');
      await p.click(await p.at(`.size-dot[aria-label="${size}"]`));
      await sleep(300);
      expect((await p.rect('.tfmt')).b, `bottom with ${size}`).toBe(b0);
    }
  },

  async 'clearing the board plays the picture, and it goes'(p) {
    await p.make('sticky', [600, 380]);
    await p.click(await p.at('.topbar button[aria-label="Очистить доску"]'));
    await p.click(await p.at('.confirm .btn.primary'));
    expect(!!(await p.rect('.clear-fx')), 'the picture shows').toBeTruthy();
    expect(await p.ev('planx.board.list().length'), 'the board is empty').toBe(0);
    await sleep(2300);
    expect(!!(await p.rect('.clear-fx')), 'and goes').toBeFalsy();
  },
};

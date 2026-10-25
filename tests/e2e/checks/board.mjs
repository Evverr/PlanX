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

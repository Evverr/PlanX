import { expect, sleep } from '../lib.mjs';

// The component stays off screen; its instance has 40 units of padding around two visible items.
const fixture = (p) => p.ev(`(() => {
  const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(300, 250);
  b.transact(() => {
    b.add(e.newItem('frame', X - 1500, Y, { id: 'source', comp: true, text: 'Карточка', w: 350, h: 200, members: ['a', 'b'], z: 0 }));
    b.add(e.newItem('rect', X - 1460, Y + 40, { id: 'a', w: 100, h: 80, text: 'Первый', color: 'blue', z: 1 }));
    b.add(e.newItem('rect', X - 1310, Y + 40, { id: 'b', w: 100, h: 80, text: 'Второй', color: 'yellow', z: 2 }));
    b.add(e.newItem('frame', X, Y, { id: 'instance', inst: 'source', w: 350, h: 200, members: [], z: 0 }));
  });
  e.stopEditing(); e.setTool('select'); e.setSelection([]);
  return { x: X, y: Y };
})()`);
const selected = (p) => p.ev(`[...planx.editor.selection].join(',')`);

export const checks = {
  async 'a first click picks the instance, the next picks its child even after a pause'(p) {
    await fixture(p);
    await p.click([390, 330]);
    expect(await selected(p), 'first click picks the group').toBe('instance');
    await sleep(450);
    await p.click([390, 330]);
    expect(await selected(p), 'second single click picks the child').toBe('instance~a');
    expect(await p.ev('planx.editor.editingId'), 'selection alone does not start typing').toBe(null);
    await p.click([540, 330]);
    expect(await selected(p), 'another child in the same instance').toBe('instance~b');
    await p.click([900, 600]);
    await p.click([390, 330]);
    expect(await selected(p), 'leaving resets selection to the group').toBe('instance');
  },

  async 'a quick second click enters the instance without opening text'(p) {
    await fixture(p);
    await p.click([390, 330]);
    await p.click([390, 330]);
    expect(await selected(p), 'quick second click picks the child').toBe('instance~a');
    expect(await p.ev('planx.editor.editingId'), 'no accidental text editing').toBe(null);
  },

  async 'the red title shows only while the instance (or something in it) is picked, hugging the contents, with no red frame'(p) {
    const at = await fixture(p);
    for (const selection of [[], ['instance'], ['instance~a']]) {
      const drawing = await p.ev(`(() => {
        const e = planx.editor, ctx = e.canvas.getContext('2d'), text = [], strokes = [];
        const fillText = ctx.fillText, stroke = ctx.stroke;
        e.setSelection(${JSON.stringify(selection)});
        ctx.fillText = function(t, x, y, ...rest) { if (this.fillStyle.toLowerCase() === '#e5484d') text.push({ t, x, y }); return fillText.call(this, t, x, y, ...rest); };
        ctx.stroke = function(...args) { if (this.strokeStyle.toLowerCase() === '#e5484d') strokes.push(true); return stroke.apply(this, args); };
        try { e.render(); } finally { ctx.fillText = fillText; ctx.stroke = stroke; }
        return { text, strokes: strokes.length };
      })()`);
      if (!selection.length) {
        expect(drawing.text.length, 'no title while nothing is picked').toBe(0);
        continue;
      }
      expect(drawing.text.length, 'one red title while picked').toBe(1);
      expect(drawing.text[0].t, 'only the title, without a diamond').toBe('Карточка');
      expect(drawing.text[0].x, 'title flush with the contents on the left').toBe(at.x + 40);
      expect(drawing.text[0].y, 'title directly above the contents').toBe(at.y + 40);
      expect(drawing.strokes, 'no red instance frame').toBe(0);
    }
    await p.ev('planx.editor.setSelection([])');
    await p.click([390, 280]);
    expect(await selected(p), 'where its title shows picks the group').toBe('instance');
  },

  async 'dragging on the first press still moves the whole instance and keeps its source unchanged'(p) {
    await fixture(p);
    const before = await p.ev(`['instance', 'instance~a', 'instance~b', 'a'].map((id) => { const i = planx.board.get(id); return { id, x: i.x, y: i.y }; })`);
    await p.drag([390, 330], [450, 370]);
    const after = await p.ev(`['instance', 'instance~a', 'instance~b', 'a'].map((id) => { const i = planx.board.get(id); return { id, x: i.x, y: i.y }; })`);
    for (let i = 0; i < 4; i++) {
      expect(after[i].x - before[i].x, `${after[i].id} horizontal movement`).toBeNear(i < 3 ? 60 : 0);
      expect(after[i].y - before[i].y, `${after[i].id} vertical movement`).toBeNear(i < 3 ? 40 : 0);
    }
  },

  async 'the title of a picked instance stays visible when a turned child extends into view from offscreen'(p) {
    const titleY = await p.ev(`(async () => {
      const e = planx.editor, b = planx.board;
      e.cam = { x: 0, y: 0, z: 1 }; e.needsFit = false;
      b.transact(() => {
        b.add(e.newItem('frame', -1200, 900, { id: 'source', comp: true, text: 'Повернутый', w: 600, h: 80, members: ['a'], z: 0 }));
        b.add(e.newItem('rect', -1160, 900, { id: 'a', w: 500, h: 30, rot: 90, color: 'blue', z: 1 }));
        b.add(e.newItem('frame', 200, 900, { id: 'instance', inst: 'source', w: 600, h: 80, members: [], z: 0 }));
      });
      await new Promise(requestAnimationFrame);
      e.setSelection(['instance']);
      const ctx = e.canvas.getContext('2d'), fillText = ctx.fillText; let y = null;
      ctx.fillText = function(t, x, atY, ...rest) { if (t === 'Повернутый') y = atY; return fillText.call(this, t, x, atY, ...rest); };
      try { e.render(); } finally { ctx.fillText = fillText; }
      return y;
    })()`);
    expect(titleY, 'title above the visible rotated child').toBeNear(665);
  },
};

// "Замена двойным кликом" (src/labs/swap.ts): an emoji, an icon or a shape double-clicked shows its
// neighbours, one picked takes its place; in an instance, as a change of the copy.
import { expect, sleep } from '../lib.mjs';

/** A double click as the browser has it: the second press counted as such (for its dblclick). */
const dbl = async (p, [x, y]) => {
  await p.mouse('mouseMoved', x, y);
  for (let i = 1; i <= 2; i++) {
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: i });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: i });
    await sleep(60);
  }
  await sleep(250);
};
const tiles = (p) => p.ev(`document.querySelectorAll('.swap-pop .icon-grid button').length`);
/** Clicks the popup's tile `n` (counted from 0), gives back its label. */
const pickTile = async (p, n) => {
  const at = await p.ev(`(() => { const b = document.querySelectorAll('.swap-pop .icon-grid button')[${n}], r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await p.click(at);
};

export const checks = {
  async 'a double-clicked emoji shows the others and one picked takes its place, the popup staying'(p) {
    await p.ev(`(() => { const e = planx.editor, { x, y } = e.toWorld(300, 250); planx.board.add(e.newItem('emoji', x, y, { id: 'em', emoji: 'emoji-3', w: 60, h: 60 })); e.setSelection([]); })()`);
    await dbl(p, [330, 280]);
    expect(await tiles(p) > 40, 'all the emoji').toBe(true);
    expect(await p.ev(`document.querySelector('.swap-pop button.on') !== null`), 'the one it is now picked out').toBe(true);
    await pickTile(p, 0);
    const now = await p.ev(`planx.board.get('em').emoji`);
    expect(now !== 'emoji-3', 'another emoji now').toBe(true);
    expect(await p.ev(`planx.board.get('em').x === planx.editor.toWorld(300, 250).x`), 'in the same place').toBe(true);
    expect(await tiles(p) > 0, 'popup still open').toBe(true);
    await p.click([900, 600]);
    expect(await tiles(p), 'a press beside it closes it').toBe(0);
  },

  async 'an icon gets the icon set with its search, a shape the shapes and also opens for typing'(p) {
    await p.ev(`(() => { const e = planx.editor, { x, y } = e.toWorld(300, 250); planx.board.add(e.newItem('icon', x, y, { id: 'ic', icon: 'heart', w: 60, h: 60 }));
      planx.board.add(e.newItem('ellipse', x + 300, y, { id: 'sh', w: 120, h: 80, text: 'Фигура' })); e.setSelection([]); })()`);
    await dbl(p, [330, 280]);
    expect(await tiles(p) > 100, 'the icon set').toBe(true);
    await p.ev(`(() => { const i = document.querySelector('.swap-pop input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'звезд'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(100);
    expect(await tiles(p) < 10, 'searched').toBe(true);
    await p.key('Escape', 'Escape', 27);
    expect(await tiles(p), 'Esc closes it').toBe(0);
    await dbl(p, [650, 280]);
    expect(await tiles(p), 'the shapes').toBe(11);
    expect(await p.ev('planx.editor.editingId'), 'typing into the shape too').toBe('sh');
    await pickTile(p, 1);
    expect(await p.ev(`planx.board.get('sh').type`), 'an ellipse now').toBe('ellipse');
    await pickTile(p, 5);
    const sh = await p.ev(`(() => { const s = planx.board.get('sh'); return { type: s.type, shape: s.shape, text: s.text, w: s.w }; })()`);
    expect(`${sh.type} ${sh.shape} ${sh.text} ${sh.w}`, 'a star, keeping its text and size').toBe('polygon star Фигура 120');
  },

  async 'in an instance, a double-click on its emoji swaps it there only, and the instance holds'(p) {
    const at = await p.ev(`(() => {
      const e = planx.editor, b = planx.board, { x: X, y: Y } = e.toWorld(300, 250);
      b.transact(() => {
        b.add(e.newItem('frame', X - 1500, Y, { id: 'source', comp: true, text: 'Карточка', w: 300, h: 200, members: ['s', 'm'], z: 0 }));
        b.add(e.newItem('sticky', X - 1460, Y + 40, { id: 's', w: 160, h: 160, z: 1 }));
        b.add(e.newItem('emoji', X - 1340, Y + 40, { id: 'm', emoji: 'emoji-3', w: 40, h: 40, z: 2 }));
        b.add(e.newItem('frame', X, Y, { id: 'instance', inst: 'source', w: 300, h: 200, members: [], z: 0 }));
      });
      e.stopEditing(); e.setTool('select'); e.setSelection([]);
      return true;
    })()`);
    expect(at, 'made').toBe(true);
    await sleep(200);
    await dbl(p, [480, 310]);
    expect(await p.ev(`[...planx.editor.selection].join(',')`), 'the emoji in it picked').toBe('instance~m');
    expect(await tiles(p) > 40, 'its neighbours').toBe(true);
    await pickTile(p, 0);
    const state = await p.ev(`(() => { const b = planx.board; return { copy: b.get('instance~m').emoji, src: b.get('m').emoji, host: b.get('instance~m').host, ovr: b.get('instance~m').ovr }; })()`);
    expect(state.copy !== 'emoji-3', 'swapped in the instance').toBe(true);
    expect(state.src, 'the component keeps its own').toBe('emoji-3');
    expect(state.host, 'still in the instance').toBe('instance');
    expect(state.ovr.includes('emoji'), 'kept as its change').toBe(true);
    // The component changed elsewhere: the copy keeps its own emoji, and follows the rest.
    await p.ev(`planx.board.update('m', { emoji: 'emoji-5', w: 50 })`);
    await sleep(300);
    const after = await p.ev(`(() => { const c = planx.board.get('instance~m'); return { emoji: c.emoji, w: c.w }; })()`);
    expect(after.emoji, 'its own emoji').toBe(state.copy);
    expect(after.w, 'its size follows').toBe(50);
  },

  async 'a shape being typed in shows its neighbours again on a double click on its text'(p) {
    await p.ev(`(() => { const e = planx.editor, { x, y } = e.toWorld(300, 250); planx.board.add(e.newItem('ellipse', x, y, { id: 'sh', w: 200, h: 120, text: 'Фигура' })); e.setSelection([]); })()`);
    await dbl(p, [400, 360]);
    expect(await p.ev('planx.editor.editingId'), 'typing').toBe('sh');
    // A press in the text (as for the caret) puts the popup away; a double click there brings it back.
    const t = await p.ev(`(() => { const r = document.querySelector('textarea.text-edit').getBoundingClientRect(); return [r.x + 20, r.y + r.height / 2]; })()`);
    await p.click(t);
    expect(await tiles(p), 'put away').toBe(0);
    await dbl(p, t);
    expect(await tiles(p), 'back on a double click in the text').toBe(11);
  },
};

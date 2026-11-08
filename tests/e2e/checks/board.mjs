// Things on the board: frames folding by double click, table lines, the selection and text panels, clearing.
import { expect, sleep } from '../lib.mjs';

/** Puts items on the board through the app's own handle (window.planx), and gives back their ids;
 *  (X, Y) in the code is a point on the board towards the screen's upper left, clear of the panels. */
const put = (p, code) => p.ev(`(() => { const e = planx.editor, b = planx.board, { x: X, y: Y } = planx.editor.toWorld(300, 200); ${code} })()`);
const screen = (p, x, y) => p.ev(`(() => { const s = planx.editor.toScreen({ x: ${x}, y: ${y} }); return [s.x, s.y]; })()`);
const origin = (p) => p.ev(`planx.editor.toWorld(300, 200)`);

/** A double click as the browser has it: the second press counted as such. */
// A trial feature switched as the page has it (its module by the address the page took it from, a
// changed one's coming with a time to it).
const setLab = (p, id, on) => p.ev(`(async () => { const u = performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/src/labs/labs.ts')) ?? '/src/labs/labs.ts';
  (await import(u)).setLab('${id}', ${on}); })()`);
const dblClick = async (p, [x, y]) => {
  await p.mouse('mouseMoved', x, y);
  for (let i = 1; i <= 2; i++) {
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: i });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: i });
  }
};

export const checks = {
  async 'a task: put opened to its description, title then description typed in, closed on Ctrl+Enter; its ring makes it done or to do; opened by its arrow and a double click on its header (to its description first, «Задача сразу целиком» off); subtasks; closed by Esc or a click elsewhere, unless «Не сворачивать»; with subtasks, done by them; «Завершить»'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setTool('task'); })()`);
    // (Low enough to be all on screen closed: it's put opened, by its middle.)
    await p.click([400, 400]);
    await sleep(200);
    const id = await p.ev(`planx.board.list().find((i) => i.type === 'task').id`);
    const t = () => p.ev(`planx.board.get('${id}')`);
    let it = await t();
    expect([it.tv, it.w, await p.ev(`planx.editor.editingId`) === id].join(), 'opened to its description, its title typed in').toBe('desc,494,true');
    await p.cdp('Input.insertText', { text: 'Купить молоко' });
    await p.key('Enter', 'Enter', 13);
    await sleep(100);
    expect(await p.ev('planx.editor.editingCell'), 'Enter: on to its description').toBe(0);
    await p.cdp('Input.insertText', { text: 'Два литра' });
    for (const type of ['keyDown', 'keyUp']) await p.cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' && { text: '\r' }) });
    await p.cdp('Input.insertText', { text: 'и хлеб' });
    await p.key('Enter', 'Enter', 13, 2);
    await sleep(100);
    it = await t();
    expect([it.text, it.desc, it.tv ?? 'closed', it.w, await p.ev('planx.editor.editingId') ?? ''].join('|'), 'Enter in it a new line; Ctrl+Enter: done and closed').toBe('Купить молоко|Два литра\nи хлеб|closed|293|');
    // Where a part of it is on the screen, from its layout.
    const at = (expr) => p.ev(`(async () => { const t = planx.board.get('${id}'), l = (await import('/src/canvas/task.ts')).taskLayout(t), s = planx.editor.toScreen((${expr})(t, l)); return [s.x, s.y]; })()`);
    const ring = await at('(t) => ({ x: t.x + 26, y: t.y + 26 })');
    await p.click(ring);
    expect((await t()).st, 'done').toBe('done');
    await sleep(450);
    await p.click(ring);
    expect((await t()).st, 'to do again').toBe('todo');
    await sleep(450);
    // Dragged by its ring or its arrow, it moves, its status and view as they were.
    for (const [part, dx] of [['(t) => ({ x: t.x + 26, y: t.y + 26 })', 60], ['(t) => ({ x: t.x + t.w - 23, y: t.y + 26 })', -60]]) {
      const x0 = (await t()).x;
      await p.drag(await at(part), (await at(part)).map((v, i) => v + (i ? 0 : dx)));
      it = await t();
      expect([it.x - x0, it.st ?? 'todo', it.tv ?? 'closed'].join(), 'dragged, not clicked').toBe(`${dx},todo,closed`);
      await sleep(450);
    }
    await p.ev(`planx.board.add(planx.editor.newItem('sticky', 1200, 1200, { id: 'over', z: 50 }))`);
    await p.click(await at('(t) => ({ x: t.x + t.w - 23, y: t.y + 26 })'));
    it = await t();
    expect([it.tv, it.w, it.z > 50].join(), 'its arrow: all of it, wider, on top').toBe('full,494,true');
    // Its blocks added by its menu (the burger at its foot): none at first; who set it and does it, by when.
    const rows = () => p.ev(`(async () => (await import('/src/canvas/task.ts')).taskLayout(planx.board.get('${id}')).rows?.map((r) => r.key).join() ?? '')()`);
    const menu = async (label) => {
      await p.click(await at('(t, l) => ({ x: t.x + l.menu.x + 16, y: t.y + l.menu.y + 16 })'));
      await sleep(200);
      await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.task-pop .menu-row')].find((b) => b.textContent === '${label}').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
      await sleep(200);
    };
    expect(await rows(), 'none at first').toBe('');
    await menu('Блок с ответственными');
    await menu('Дата завершения');
    expect(await rows(), 'who set it, does it, by when').toBe('boss,doer,due');
    expect((await t()).h, 'as tall as them').toBe(await p.ev(`(async () => (await import('/src/canvas/task.ts')).taskLayout(planx.board.get('${id}')).h)()`));
    await menu('Дата завершения');
    expect(await rows(), 'by when taken away').toBe('boss,doer');
    // «Задача сразу целиком» off: its description first, then all of it.
    await sleep(450);
    await p.click(await at('(t) => ({ x: t.x + t.w - 23, y: t.y + 26 })'));
    expect((await t()).tv ?? 'closed', 'closed by its arrow').toBe('closed');
    await setLab(p, 'taskFull', false);
    await sleep(450);
    await p.click(await at('(t) => ({ x: t.x + t.w - 23, y: t.y + 26 })'));
    expect((await t()).tv, 'its description').toBe('desc');
    await sleep(450);
    await dblClick(p, await at('(t) => ({ x: t.x + 300, y: t.y + 12 })'));
    await sleep(100);
    expect((await t()).tv, 'all of it, by a double click on its header').toBe('full');
    await setLab(p, 'taskFull', true);
    // Subtasks: the first added by its menu, Enter going on to the next; an empty one goes.
    await sleep(450);
    await menu('Подзадачи');
    await sleep(100);
    await p.cdp('Input.insertText', { text: 'Первая' });
    await p.key('Enter', 'Enter', 13);
    await sleep(100);
    await p.cdp('Input.insertText', { text: 'Вторая' });
    await p.key('Enter', 'Enter', 13);
    await sleep(100);
    await p.key('Escape', 'Escape', 27);
    await sleep(100);
    it = await t();
    expect([it.subs.map((s) => s.t).join(), it.tv ?? 'closed'].join('|'), 'two, the empty third gone; Esc: closed').toBe('Первая,Вторая|closed');
    // «Не сворачивать» ticked: not closed by Esc, nor by a click elsewhere. (Its top near the screen's,
    // for all of it to be on it.)
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 60 - planx.board.get('${id}').y, z: 1 }; e.camChanged(); })()`);
    await sleep(450);
    await p.click(await at('(t) => ({ x: t.x + t.w - 23, y: t.y + 26 })'));
    await sleep(450);
    // «Закрепить описание» in its menu: kept open, a pin over its menu.
    await menu('Закрепить описание');
    expect([(await t()).keep, !!(await p.ev(`(async () => (await import('/src/canvas/task.ts')).taskLayout(planx.board.get('${id}')).pin)()`))].join(), 'kept open, its pin').toBe('true,true');
    await p.ev(`planx.board.add(planx.editor.newItem('sticky', planx.board.get('${id}').x, planx.board.get('${id}').y, { id: 'atop' }))`);
    expect(await p.ev(`planx.board.list().at(-1).id`), 'over what is put later').toBe(id);
    await p.ev(`planx.board.remove(['atop'])`);
    await p.key('Escape', 'Escape', 27);
    await p.click([1100, 100]);
    await sleep(100);
    expect((await t()).tv, 'still open after Esc and a click elsewhere').toBe('full');
    // Its pin clicked: unpinned.
    await p.click(await at('(t, l) => ({ x: t.x + l.pin.x + 12, y: t.y + l.pin.y + 12 })'));
    await sleep(100);
    await p.click([1100, 100]);
    await sleep(100);
    expect((await t()).tv ?? 'closed', 'unpinned: closed by a click elsewhere').toBe('closed');
    await sleep(450);
    await p.click(await at('(t) => ({ x: t.x + t.w - 23, y: t.y + 26 })'));
    await sleep(100);
    await p.click(await at('(t, l) => ({ x: t.x + 56, y: t.y + l.subs[0] + 11 })'));
    expect((await t()).subs.map((s) => !!s.done).join(), 'the first ticked off').toBe('true,false');
    it = await t();
    expect(it.h, 'as tall as all of it').toBe(await p.ev(`(async () => (await import('/src/canvas/task.ts')).taskLayout(planx.board.get('${id}')).h)()`));
    // Subtasks left to do: its ring and «Завершить» (its buttons shown by its menu) only say it's done by them.
    await sleep(450);
    await menu('Кнопки');
    await sleep(450);
    await p.click(await at('(t, l) => ({ x: t.x + l.finish.x + 20, y: t.y + l.finish.y + 16 })'));
    await sleep(100);
    it = await t();
    expect([it.st ?? 'todo', it.tv, await p.ev(`document.querySelector('.tip.task-tip')?.textContent`)].join('|'), 'not done, said why')
      .toBe('todo|full|Задачу можно выполнить, только выполнив все подзадачи');
    await sleep(450);
    await p.click(await at('(t, l) => ({ x: t.x + 56, y: t.y + l.subs[1] + 11 })'));
    expect(await p.ev(`(async () => (await import('/src/canvas/task.ts')).statusOf(planx.board.get('${id}')))()`), 'done with them all').toBe('done');
    await sleep(450);
    await p.click(await at('(t, l) => ({ x: t.x + l.finish.x + 20, y: t.y + l.finish.y + 16 })'));
    it = await t();
    expect([it.st, it.tv ?? 'closed', it.w, it.h].join(), '«Завершить»: done and closed').toBe('done,closed,293,52');
    // Done, its ring makes it to do again: the last subtask to do again.
    await sleep(450);
    await p.click(await at('(t) => ({ x: t.x + 26, y: t.y + 26 })'));
    expect(await p.ev(`(async () => { const t = planx.board.get('${id}'); return (await import('/src/canvas/task.ts')).statusOf(t) + ',' + t.subs.map((s) => !!s.done).join(); })()`), 'to do again').toBe('doing,true,false');
    // A double click on its header (off its title): all of it, closed again; on its title, that typed in.
    for (const want of ['full', 'closed']) {
      await sleep(450);
      await dblClick(p, await at('(t) => ({ x: t.x + 210, y: t.y + 12 })'));
      await sleep(100);
      expect((await t()).tv ?? 'closed', 'the next view').toBe(want);
    }
    await sleep(450);
    await dblClick(p, await at('(t) => ({ x: t.x + 70, y: t.y + 26 })'));
    await sleep(100);
    expect([await p.ev('planx.editor.editingId') === id, await p.ev('planx.editor.editingCell')].join(), 'its title typed in').toBe('true,');
  },

  async 'tasks of before become tasks of now: a ticked card done, a built-in one by its title and note'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board;
      b.add(e.newItem('task', 100, 100, { id: 'old', w: 180, h: 110, text: 'Старая', done: true }));
      b.add(e.newItem('frame', 400, 100, { id: 'bi', w: 335, h: 410, inst: '@task-later', members: [], text: 'Задача' }));
      b.add(e.newItem('text', 460, 160, { id: 'bi~@task-title', host: 'bi', from: '@task-title', text: 'Позвонить' }));
      b.add(e.newItem('text', 460, 200, { id: 'bi~@task-note', host: 'bi', from: '@task-note', text: 'Вечером' })); })()`);
    await sleep(800);
    const old = await p.ev(`(async () => { const t = planx.board.get('old'); return [(await import('/src/canvas/task.ts')).statusOf(t), t.h].join(); })()`);
    expect(old, 'done, as tall as a closed one').toBe('done,52');
    const bi = await p.ev(`(() => { const t = planx.board.get('bi'); return [t.type, t.text, t.desc, t.st, t.inst ?? '', planx.board.list().filter((i) => i.host === 'bi').length].join(); })()`);
    expect(bi, 'made a task in its place').toBe('task,Позвонить,Вечером,todo,,0');
  },

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

  async 'a component made of what\'s picked, its tick makes instances that follow it, but for what was changed in them'(p) {
    const ids = await put(p, `const a = e.newItem('sticky', X, Y, { text: 'Привет' }), c = e.newItem('rect', X + 200, Y, { text: 'Кнопка' });
      b.add(a); b.add(c); e.setSelection([a.id, c.id]); return { a: a.id, c: c.id };`);
    await p.click(await p.at('.bar.panel button[aria-label="Компонент из выделенного"]'));
    await p.ev('planx.editor.stopEditing()');
    const comp = await p.ev(`planx.board.list().find((i) => i.comp)`);
    expect(comp?.members?.length, 'a component round both').toBe(2);
    await p.ev(`planx.editor.setSelection(['${comp.id}'])`);
    await sleep(200);
    await p.click(await screen(p, comp.x + comp.w + 40, comp.y + comp.h / 2));
    await sleep(200);
    const inst = await p.ev(`planx.board.list().find((i) => i.inst === '${comp.id}')`);
    const copy = (k) => p.ev(`planx.board.get('${inst.id}~${k}')`);
    // Its tick puts the component away, the instance picked; brought back, its tick makes another.
    expect(await p.ev(`(() => { const c = planx.board.get('${comp.id}'); return !!c.stowed && !planx.editor.shown().some((i) => i.id === c.id); })()`), 'the component put away').toBe(true);
    expect(await p.ev(`[...planx.editor.selection].join()`), 'the instance picked').toBe(inst.id);
    await p.ev(`planx.editor.goToComponent('${inst.id}')`);
    await sleep(800);
    const back = await p.ev(`planx.board.get('${comp.id}')`);
    expect(!back.stowed, 'brought back').toBe(true);
    await p.click(await screen(p, back.x + back.w + 40, back.y + back.h / 2));
    await sleep(200);
    expect(await p.ev(`planx.board.list().filter((i) => i.inst === '${comp.id}').length`), 'a second instance').toBe(2);
    expect(await p.ev(`planx.board.list().filter((i) => i.inst === '${comp.id}').every((i) => i.w === ${comp.w})`), 'as big as the component unfolded').toBe(true);
    expect((await copy(ids.a))?.text, 'a copy of the sticky in the instance').toBe('Привет');
    // The second stands where the first does (both where the component was): moved aside, to click the first.
    await p.ev(`(() => { const i = planx.board.list().find((i) => i.inst === '${comp.id}' && i.id !== '${inst.id}'); planx.board.update(i.id, { x: i.x + 800 }); })()`);
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
    // A link drawn next, from a sticky's blue dot, runs the same way.
    const a = await p.ev(`planx.board.getLink('L1').from`), d = await p.ev(`(() => { const e = planx.editor, { x: X, y: Y } = e.toWorld(300, 560); const d = e.newItem('sticky', X, Y); planx.board.add(d); return d; })()`);
    await p.ev(`planx.editor.setSelection(['${a}'])`);
    await sleep(300);
    const dot = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'), e = planx.editor; const q = g.sidePoint(planx.board.get('${a}'), 'bottom', 16 / e.cam.z); const s = e.toScreen(q), c = e.canvas.getBoundingClientRect(); return [s.x + c.left, s.y + c.top]; })()`);
    await p.drag(dot, await screen(p, d.x + 80, d.y + 80));
    expect(await p.ev(`planx.board.linkList().find((l) => l.to === '${d.id}')?.style`), 'the new one straight too').toBe('straight');
    await p.ev(`planx.editor.setSelection(['L1'])`);
    await sleep(300);
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

  async 'a link\'s start dragged onto another item turns it round, its arrow going there, where along the side it was let go'(p) {
    const ids = await put(p, `const a = e.newItem('sticky', X, Y), c = e.newItem('sticky', X + 420, Y), d = e.newItem('rect', X, Y + 300, { w: 300, h: 100 }); b.add(a); b.add(c); b.add(d);
      b.addLink({ id: 'L2', from: a.id, to: c.id, style: 'straight' }); return { a: a.id, c: c.id, d: d.id };`);
    const start = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'); const s = planx.editor.toScreen(g.linkShape(planx.board.getLink('L2'), (k) => planx.board.get(k)).pts[0]); return [s.x, s.y]; })()`);
    const d = await p.ev(`planx.board.get('${ids.d}')`);
    // Let go a third of the way along its top.
    await p.drag(start, await screen(p, d.x + 100, d.y + 5));
    let l = await p.ev(`planx.board.getLink('L2')`);
    expect(`${l.from === ids.c} ${l.to === ids.d} ${l.toSide} ${Math.round(l.toAt * 100)}`, 'from the other end to the new one, a third along its top').toBe('true true top 33');
    // Near its middle: the middle.
    const end = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'); const pts = g.linkShape(planx.board.getLink('L2'), (k) => planx.board.get(k)).pts, s = planx.editor.toScreen(pts.at(-1)); return [s.x, s.y]; })()`);
    await p.drag(end, await screen(p, d.x + 155, d.y + 5));
    l = await p.ev(`planx.board.getLink('L2')`);
    expect(`${l.to === ids.d} ${l.toAt ?? 'middle'}`, 'snapped to the middle').toBe('true middle');
    // Its arrow at its start: led on by its other end, the arrow goes there all the same.
    await p.ev(`planx.board.updateLink('L2', { heads: 'start' })`);
    const tip = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'); const s = planx.editor.toScreen(g.linkShape(planx.board.getLink('L2'), (k) => planx.board.get(k)).pts.at(-1)); return [s.x, s.y]; })()`);
    const a = await p.ev(`planx.board.get('${ids.a}')`);
    await p.drag(tip, await screen(p, a.x + 50, a.y + 50));
    l = await p.ev(`planx.board.getLink('L2')`);
    expect(`${l.from === ids.c} ${l.to === ids.a} ${l.heads ?? 'end'}`, 'the arrow into what it was led to').toBe('true true end');
    // Its arrow end led onto the item it comes from: it turns round, the arrow going into that.
    const tip2 = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'); const s = planx.editor.toScreen(g.linkShape(planx.board.getLink('L2'), (k) => planx.board.get(k)).pts.at(-1)); return [s.x, s.y]; })()`);
    const c = await p.ev(`planx.board.get('${ids.c}')`);
    await p.drag(tip2, await screen(p, c.x + 50, c.y + 50));
    l = await p.ev(`planx.board.getLink('L2')`);
    expect(`${l.from === ids.a} ${l.to === ids.c} ${l.heads ?? 'end'}`, 'turned round').toBe('true true end');
    // Taken by its start and let go back on the same item: turned round, the arrow into that.
    const first = await p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'); const s = planx.editor.toScreen(g.linkShape(planx.board.getLink('L2'), (k) => planx.board.get(k)).pts[0]); return [s.x, s.y]; })()`);
    const a2 = await p.ev(`planx.board.get('${ids.a}')`);
    await p.drag(first, await screen(p, a2.x + 60, a2.y + 60));
    l = await p.ev(`planx.board.getLink('L2')`);
    expect(`${l.from === ids.c} ${l.to === ids.a}`, 'turned round onto its own start').toBe('true true');
  },

  async 'Esc and Cmd+Enter are done with a component being changed, as its tick'(p) {
    for (const key of ['esc', 'enter']) {
      await put(p, `const a = e.newItem('sticky', X, Y, { text: 'Привет' }); b.add(a); e.setSelection([a.id]); return {};`);
      await p.click(await p.at('.bar.panel button[aria-label="Компонент из выделенного"]'));
      await sleep(100);
      // Its title being typed in: done there and then.
      if (key === 'esc') await p.escape(); else await p.key('Enter', 'Enter', 13, 4);
      await sleep(200);
      const c = await p.ev(`planx.board.list().filter((i) => i.comp).pop()`);
      expect(`${!!c.stowed} ${await p.ev(`planx.board.list().filter((i) => i.inst === '${c.id}').length`)}`, `${key}: an instance in its place`).toBe('true 1');
    }
    // Out again with nothing picked (the focus anywhere): Esc is done with it all the same.
    const c = await p.ev(`planx.board.list().filter((i) => i.comp).pop().id`);
    await p.ev(`planx.editor.goToComponent(planx.board.list().find((i) => i.inst === '${c}').id); planx.editor.setSelection([]);`);
    await sleep(200);
    await p.escape();
    await sleep(100);
    expect(await p.ev(`!!planx.board.get('${c}').stowed`), 'nothing picked: done with it').toBe(true);
  },

  async 'an instance detached from its component leaves its items, as they were, with no frame, and they stay so'(p) {
    const ids = await put(p, `const a = e.newItem('sticky', X, Y, { text: 'Привет' }); b.add(a); e.setSelection([a.id]); return { a: a.id };`);
    await p.click(await p.at('.bar.panel button[aria-label="Компонент из выделенного"]'));
    await p.ev('planx.editor.stopEditing()');
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
    expect(await p.ev(`planx.board.get('${inst.id}') ?? null`), 'no frame left').toBe(null);
    expect(await p.ev(`[...planx.editor.selection].join()`), 'its items picked').toBe(A);
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

  async '"Сохранить доску" in the menu saves it in a file, which "Загрузить доску" opens as a new board just like it'(p) {
    await put(p, `const a = e.newItem('sticky', X, Y, { text: 'Купить молоко' }), c = e.newItem('sticky', X + 260, Y, { text: 'Позвонить Ёжику' }); b.add(a); b.add(c);`);
    await p.ev(`planx.board.setTitle('Доска для файла'); window.saved = null; URL.createObjectURL = (b) => { window.saved = b; return 'blob:x'; }`);
    await p.menu('Сохранить доску');
    await sleep(200);
    expect(await p.ev(`(async () => new TextDecoder().decode(new Uint8Array(await window.saved.arrayBuffer()).subarray(0, 8)))()`), 'a board file').toBe('PLANPLNT');
    const was = await p.ev('location.search');
    await p.ev(`(async () => { const m = await import('/src/collab/boardFile.ts'); const f = new File([await window.saved.arrayBuffer()], 'x.plnt'); setTimeout(() => m.openBoardFile(f), 0); })()`);
    await sleep(1500);
    const now = await p.ev('location.search');
    expect(now !== was && now.startsWith('?board='), 'a new board opened').toBe(true);
    await sleep(800);
    expect(await p.ev(`planx.board.list().filter((i) => i.type === 'sticky').map((i) => i.text).sort().join()`), 'just like it').toBe('Купить молоко,Позвонить Ёжику');
    expect(await p.ev('planx.board.title'), 'its name too').toBe('Доска для файла');
  },

  async '"Сохранить как…" in the menu asks for a name, the board\'s at first, and saves the file under it'(p) {
    await put(p, `b.add(e.newItem('sticky', X, Y, { text: 'Тут' }));`);
    await p.ev(`planx.board.setTitle('План'); window.named = null; HTMLAnchorElement.prototype.click = function () { window.named = this.download; }`);
    await p.menu('Сохранить как…');
    await sleep(200);
    expect(await p.ev(`document.querySelector('.confirm-input').value`), 'the board\'s name at first').toBe('План');
    await p.ev(`(() => { const i = document.querySelector('.confirm-input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'План: копия'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(50);
    await p.click(await p.at('.btn.primary'));
    await sleep(200);
    expect(await p.ev('window.named'), 'saved under it').toBe('План  копия.plnt');
    expect(await p.ev('planx.board.title'), 'the board keeps its own').toBe('План');
  },

  async 'the shapes\' gear sets how new shapes come out, and the selected ones too: their corners\' rounding'(p) {
    await put(p, `b.add(e.newItem('polygon', X, Y, { shape: 'hexagon' })); b.add(e.newItem('rect', X + 220, Y));`);
    const ids = await p.ev(`planx.board.list().map((i) => i.id)`);
    expect(await p.ev(`planx.board.list().map((i) => [i.rad, i.sc]).join(';')`), 'round 4, no outline').toBe('4,none;4,none');
    await p.ev(`planx.editor.setSelection(${JSON.stringify(ids)})`);
    const a = await p.at('.tools [data-key="oval"]');
    await p.mouse('mouseMoved', ...a); await p.mouse('mousePressed', ...a); await sleep(400); await p.mouse('mouseReleased', ...a); await sleep(200);
    expect(await p.ev(`document.querySelectorAll('.shape-panel > [data-key]').length`), 'eleven shapes').toBe(11);
    await p.click(await p.at('.shape-panel button[aria-label="Настройки фигур"]'));
    await p.ev(`(() => { const i = document.querySelector('.shape-menu input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '12'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    expect(await p.ev(`planx.board.list().map((i) => i.rad).join()`), 'the selected rounder').toBe('12,12');
    expect(await p.ev(`JSON.parse(localStorage.getItem('planx-shape-style')).rad`), 'and new ones too').toBe(12);
  },

  async 'a new shape is drawn by dragging out its box, or dragged off the shapes\' panel onto the board'(p) {
    const hold = async () => { const a = await p.at('.tools [data-key="oval"]'); await p.mouse('mouseMoved', ...a); await p.mouse('mousePressed', ...a); await sleep(400); await p.mouse('mouseReleased', ...a); await sleep(200); };
    await hold();
    await p.click(await p.at('.shape-panel button[aria-label="Шестиугольник"]'));
    await p.drag([500, 300], [640, 420]);
    expect(await p.ev(`planx.board.list().filter((i) => i.shape === 'hexagon').length`), 'a hexagon drawn').toBe(1);
    await hold();
    const from = await p.at('.shape-panel button[aria-label="Крест"]');
    await p.drag(from, [800, 500], { rest: 0, hold: 450, steps: 16 });
    expect(await p.ev(`planx.board.list().filter((i) => i.shape === 'cross').length`), 'a cross dropped').toBe(1);
  },

  async 'a box picks the links it runs into; their different ways are all lit, and one pressed sends them all that way'(p) {
    await put(p, `const a = e.newItem('sticky', X, Y), c = e.newItem('sticky', X + 460, Y), d = e.newItem('sticky', X + 460, Y + 260); b.add(a); b.add(c); b.add(d);
      b.addLink({ id: 'L1', from: a.id, to: c.id, fromSide: 'right', toSide: 'left', style: 'straight' });
      b.addLink({ id: 'L2', from: a.id, to: d.id, fromSide: 'bottom', toSide: 'left', style: 'elbow' });`);
    // A box between the stickers, touching only the links.
    const o = await origin(p);
    await p.drag(await screen(p, o.x + 200, o.y - 40), await screen(p, o.x + 300, o.y + 400));
    const picked = await p.ev(`[...planx.editor.selection].sort().join()`);
    expect(picked, 'both links').toBe('L1,L2');
    await sleep(300);
    const lit = await p.ev(`[...document.querySelectorAll('.bar.panel button[aria-pressed="true"]')].map((b) => b.getAttribute('aria-label')).join()`);
    expect(lit, 'both their ways lit').toBe('Линия с прямыми углами,Прямая линия');
    await p.click(await p.at('.bar.panel button[aria-label="Плавная линия"]'));
    expect(await p.ev(`planx.board.linkList().filter((l) => l.style).length`), 'all smooth now').toBe(0);
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

  async 'zoomed out to under 56%, a table\'s lines aren\'t taken: the table is'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 0.5 }; e.camChanged();
      b.add(e.newItem('table', 600, 500, { id: 't', w: 360, h: 120, cols: [120, 120, 120], rows: [40, 40, 40], cells: Array(9).fill('') })); e.setSelection(['t']); })()`);
    await sleep(200);
    const line = await screen(p, 720, 520);
    await p.drag(line, [line[0] + 40, line[1] + 40], { rest: 700 });
    const t = await p.ev(`planx.board.get('t')`);
    expect(t.cols[0], 'no resize').toBe(120);
    expect(t.x, 'the table moved').toBeNear(600 + 40 / 0.5, 2);
  },

  async 'the selection panel goes up above a bar beneath it, and back down'(p) {
    await p.make('sticky', [600, 350]);
    await p.escape();
    await p.ev(`planx.editor.setSelection([planx.board.list().find((i) => i.type === 'sticky').id])`);
    await sleep(400);
    const panel = await p.rect('.bar.panel'), zoom = await p.rect('.bar.zoom');
    expect(panel.b, 'above the zoom bar').toBe(zoom.t - 12);
    await p.dragEdge('.bar.zoom', 'left', 0, -700);
    await sleep(500);
    expect((await p.rect('.bar.panel')).b, 'down at the bottom once it has gone').toBe(800 - 12);
  },

  async 'the text panel keeps its bottom over the item whatever the panels\' size'(p) {
    // It's there by the T on the selection panel ("Кнопка T", src/labs), not on just picking it.
    await p.ev(`(() => { const e = planx.editor, { x, y } = e.toWorld(500, 370); planx.board.add(e.newItem('text', x, y, { id: 'tx', w: 200, h: 26, text: 'Текст' })); e.setSelection(['tx']); })()`);
    expect(await p.rect('.tfmt'), 'not on just picking it').toBeFalsy();
    await sleep(300);
    await p.click(await p.at('.bar.panel button[aria-label="Текст и шрифт"]'));
    await sleep(700);
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

  async 'text typed onto three lines keeps them all in sight when made bold while typing'(p) {
    await put(p, `const a = e.newItem('text', X, Y, { id: 'tx', w: 300, text: 'Один' }); b.add(a); e.setSelection([a.id]);`);
    await p.ev(`planx.editor.startEditing('tx', null, 'end')`);
    await sleep(200);
    for (const line of ['Два', 'Три']) {
      await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await p.cdp('Input.insertText', { text: line });
    }
    await sleep(200);
    const h = await p.ev(`planx.board.get('tx').h`);
    await p.ev(`planx.editor.setTextStyle({ fw: 700 })`);
    await sleep(200);
    expect(await p.ev(`planx.board.get('tx').h`), 'still three lines tall').toBeNear(h, 2);
    expect(await p.ev('planx.editor.editingId'), 'still typing').toBe('tx');
  },

  async 'a shape stretches across by its right side only, down by its bottom only'(p) {
    await put(p, `const a = e.newItem('rect', X, Y, { id: 'r', w: 200, h: 120 }); b.add(a); e.setSelection([a.id]);`);
    const r = await p.ev(`(() => { const i = planx.board.get('r'), a = planx.editor.toScreen({ x: i.x + i.w, y: i.y + i.h * 0.25 }), b = planx.editor.toScreen({ x: i.x + i.w * 0.25, y: i.y + i.h }); return [a.x, a.y, b.x, b.y]; })()`);
    await p.drag([r[0], r[1]], [r[0] + 60, r[1] + 40]);
    expect(await p.ev(`[planx.board.get('r').w, planx.board.get('r').h].join()`), 'wider only').toBe('260,120');
    await p.drag([r[2], r[3]], [r[2] + 40, r[3] + 30]);
    expect(await p.ev(`[planx.board.get('r').w, planx.board.get('r').h].join()`), 'taller only').toBe('260,150');
  },

  async 'a picture copied anywhere is pasted on the board as one added from the panel'(p) {
    const n0 = await p.ev(`planx.board.list().filter((i) => i.type === 'image').length`);
    await p.ev(`(async () => {
      const c = document.createElement('canvas'); c.width = 40; c.height = 30; c.getContext('2d').fillRect(0, 0, 40, 30);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const dt = new DataTransfer(); dt.items.add(new File([blob], 'shot.png', { type: 'image/png' }));
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    })()`);
    await sleep(600);
    expect(await p.ev(`planx.board.list().filter((i) => i.type === 'image').length`) - n0, 'a picture').toBe(1);
  },

  async 'what is copied goes on the system clipboard as text, and is pasted from it (another board, another window) under the pointer'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 100, 100, { id: 's1', w: 100, h: 100 })); b.add(e.newItem('sticky', 300, 100, { id: 's2', w: 100, h: 100 }));
      b.addLink({ id: 'l1', from: 's1', to: 's2' }); e.setSelection(['s1', 's2']); e.copy(); })()`);
    const text = 'planx-copy:' + await p.ev(`localStorage.getItem('planx-clipboard')`);
    // As on another board: this one emptied, what's copied there only on the clipboard.
    await p.ev('planx.editor.clearBoard()');
    await p.mouse('mouseMoved', 600, 400);
    await p.ev(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(text)});
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
    await sleep(200);
    expect(await p.ev(`planx.board.list().length + ' ' + planx.board.linkList().length`), 'both, and the link').toBe('2 1');
    const mid = await p.ev(`(() => { const l = planx.board.list(), x = (Math.min(...l.map((i) => i.x)) + Math.max(...l.map((i) => i.x + i.w))) / 2, y = (Math.min(...l.map((i) => i.y)) + Math.max(...l.map((i) => i.y + i.h))) / 2, s = planx.editor.toScreen({ x, y }); return Math.round(s.x) + ',' + Math.round(s.y); })()`);
    expect(mid, 'under the pointer').toBe('600,400');
  },

  async 'a timeline is picked by a box drawn round it, or over its edge'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 0.5 }; e.camChanged(); e.addTimeline({ x: 1000, y: 800 }); e.setSelection([]); })()`);
    await sleep(200);
    const r = await p.ev(`(() => { const t = planx.board.list().find((i) => i.tl), a = planx.editor.toScreen({ x: t.x, y: t.y }), b = planx.editor.toScreen({ x: t.x + t.w, y: t.y + t.h }); return [a.x, a.y, b.x, b.y, t.w, t.h]; })()`);
    await p.drag([r[0] - 20, r[1] - 20], [r[2] + 20, r[3] + 20]);
    await sleep(100);
    expect(await p.ev(`[...planx.editor.selection].map((id) => !!planx.board.get(id)?.tl).join()`), 'round it').toBe('true');
    await p.ev('planx.editor.setSelection([])');
    await p.drag([r[0] + 40, r[1] - 40], [r[0] + 120, r[1] + 30]);
    await sleep(100);
    expect(await p.ev(`[...planx.editor.selection].map((id) => !!planx.board.get(id)?.tl).join()`), 'over its edge').toBe('true');
  },

  async 'a timeline\'s «Параметры» set its step: days wider, the card as wide, what is on it keeping its day'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 0.5 }; e.camChanged(); e.addTimeline({ x: 1000, y: 800 });
      const t = b.list().find((i) => i.tl); b.add(e.newItem('sticky', t.x + 19 + 23 * 10, t.y + 60, { id: 'on', w: 60, h: 60 })); b.update(t.id, { members: ['on'] }); e.setSelection([t.id]); })()`);
    await sleep(200);
    const t0 = await p.ev(`planx.board.list().find((i) => i.tl)`);
    const at = await p.ev(`(() => { const s = planx.editor.toScreen({ x: ${t0.x} + 40, y: ${t0.y} + 150 }); return [s.x, s.y]; })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at[0], y: at[1], button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at[0], y: at[1], button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Параметры').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(200);
    expect(await p.ev(`[...document.querySelectorAll('.params-pop .labs-seg button')].map((b) => b.textContent).join()`), 'the steps').toBe('1x,2x,4x,6x');
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.params-pop .labs-seg button')][1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(100);
    const t1 = await p.ev(`planx.board.get('${t0.id}')`), on = await p.ev(`planx.board.get('on')`);
    expect(`${t1.ts} ${t1.w === t0.w} ${on.x - t1.x - 19}`, 'twice as wide a day, as wide a card, the sticker on day 10 still').toBe('2 true 460');
  },

  async 'a frame takes a fill and an outline colour as a rectangle does'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('frame', 200, 200, { id: 'f', w: 300, h: 200, text: 'Фрейм', members: [] })); e.setSelection(['f']);
      e.setColor('blue'); e.setStroke('red'); })()`);
    await sleep(150);
    expect(await p.ev(`(async () => { const m = await import('/src/model/mind.ts'); return m.fillOpacity({ ...planx.board.get('f'), color: undefined }); })()`), 'its usual fill shown as it is, 60%').toBe(0.6);
    expect(await p.ev(`planx.board.get('f').color + ' ' + planx.board.get('f').sc`), 'its fill and outline').toBe('blue red');
    const at = await p.ev(`(() => { const s = planx.editor.toScreen({ x: 350, y: 300 }); return [s.x, s.y]; })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at[0], y: at[1], button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at[0], y: at[1], button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Параметры').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(150);
    expect(await p.ev(`[...document.querySelectorAll('.params-pop .params-title, .params-pop .params-label')].map((e) => e.textContent).slice(0, 3).join(' | ')`), 'its parameters').toBe('Фрейм «Фрейм» | Заливка | Обводка');
    // Any colour floats over the parameters, not pushing them down; a press elsewhere puts it away.
    const tall = await p.ev(`document.querySelector('.params-pop').scrollHeight`);
    await p.click(await p.at('.params-pop .sw.custom'));
    await sleep(200);
    expect(await p.ev(`getComputedStyle(document.querySelector('.params-pop .color-picker')).position + ' ' + (document.querySelector('.params-pop').scrollHeight - ${tall})`), 'floating').toBe('fixed 0');
    await p.click(await p.ev(`(() => { const r = document.querySelector('.params-pop .params-title').getBoundingClientRect(); return [r.x + 10, r.y + r.height / 2]; })()`));
    expect(await p.ev(`!!document.querySelector('.params-pop .color-picker:not(.gone)')`), 'put away').toBe(false);
  },

  async 'what can\'t be seen can\'t be taken: by a box, a click or Cmd+A, nor is it in "show all"; a pen at no opacity leaves nothing'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setSelection([]);
      b.add(e.newItem('ink', 300, 300, { id: 'line', w: 100, h: 100, iw: 100, sw: 4, pts: [0, 0, 100, 100], fo: 0 }));
      b.add(e.newItem('rect', 450, 300, { id: 'bare', w: 100, h: 100, color: 'none', sc: 'none' }));
      b.add(e.newItem('rect', 600, 300, { id: 'worded', w: 100, h: 100, color: 'none', sc: 'none', text: 'Слово' }));
      b.add(e.newItem('sticky', 750, 300, { id: 'seen', w: 100, h: 100 }));
      b.add(e.newItem('ink', 9000, 9000, { id: 'far', w: 100, h: 100, iw: 100, sw: 4, pts: [0, 0, 100, 100], fo: 0 })); })()`);
    await sleep(100);
    const picked = () => p.ev(`[...planx.editor.selection].sort().join()`);
    await p.drag([250, 250], [900, 450]);
    expect(await picked(), 'by a box').toBe('seen,worded');
    await p.click([1000, 700]);
    await p.click([350, 350]);
    expect(await picked(), 'a click on the line').toBe('');
    await p.click([500, 350]);
    expect(await picked(), 'a click on the bare shape').toBe('');
    await p.key('a', 'KeyA', 65, 4);
    expect(await picked(), 'Cmd+A').toBe('seen,worded');
    await p.ev(`planx.editor.setSelection([]); planx.editor.fit()`);
    await sleep(100);
    expect(await p.ev(`planx.editor.cam.z > 0.5`), 'show all: not reaching out to it').toBe(true);
    // Made so while picked, it's still in hand till let go.
    await p.ev(`(() => { const e = planx.editor; e.setSelection(['seen']); e.setOpacity('fill', 0); })()`);
    expect(await p.ev(`planx.editor.selectedItems().length + ' ' + planx.editor.shown().some((i) => i.id === 'seen')`), 'picked, out of sight').toBe('1 false');
    await p.ev(`(() => { const e = planx.editor; e.setOpacity('fill', 1); e.setSelection([]); e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); })()`);
    // A pen at no opacity leaves no line.
    const n = await p.ev(`planx.board.list().length`);
    await p.ev(`(() => { const e = planx.editor; e.setPenStyle('pen', e.pens.pen.active, { op: 0 }); e.setTool('pen'); })()`);
    await p.drag([300, 600], [500, 650]);
    expect(await p.ev(`planx.board.list().length`), 'nothing added').toBe(n);
    await p.ev(`(() => { const e = planx.editor; e.setPenStyle('pen', e.pens.pen.active, { op: undefined }); })()`);
    await p.drag([300, 600], [500, 650]);
    expect(await p.ev(`planx.board.list().length`), 'as usual, a line').toBe(n + 1);
  },

  async 'no outline: its opacity reads 0; a colour given, it jumps to 100; drawn up from 0, the usual outline'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('rect', 200, 200, { id: 'a', w: 200, h: 120, sc: 'none', so: 0.5 })); e.setSelection(['a']); })()`);
    await sleep(150);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 300, y: 260, button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 300, y: 260, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Параметры').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(150);
    const reads = () => p.ev(`document.querySelector('input[aria-label="Обводка: непрозрачность, %"]').value`);
    expect(await reads(), 'none: 0').toBe('0');
    await p.click(await p.at('button[aria-label="Обводка: red"]'));
    expect(await reads(), 'a colour: 100').toBe('100');
    expect(await p.ev(`planx.board.get('a').sc + ' ' + planx.board.get('a').so`), 'the colour, fully there').toBe('red undefined');
    await p.click(await p.at('button[aria-label="Обводка: нет"]'));
    expect(await reads(), 'none again: 0').toBe('0');
    // Through the bottom panel's way too; the slider off 0 brings the usual outline.
    await p.ev(`planx.editor.setOpacity('stroke', 0.4)`);
    expect(await p.ev(`planx.board.get('a').sc + ' ' + planx.board.get('a').so`), 'drawn up from 0').toBe('undefined 0.4');
    await p.ev(`(() => { planx.editor.setStroke('none'); planx.editor.setStroke('blue'); })()`);
    expect(await p.ev(`planx.board.get('a').sc + ' ' + planx.board.get('a').so`), 'a colour after none: fully there').toBe('blue undefined');
  },

  async 'items of a kind are told apart in the parameters by a number: Прямоугольник, Прямоугольник 1'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('rect', 200, 200, { id: 'a', w: 200, h: 120 })); b.add(e.newItem('rect', 450, 200, { id: 'c', w: 200, h: 120 })); e.setSelection(['a', 'c']); })()`);
    await sleep(150);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 300, y: 260, button: 'right', buttons: 2, clickCount: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 300, y: 260, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(200);
    await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.context-menu .menu-row')].find((b) => b.textContent === 'Параметры').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    await sleep(150);
    expect(await p.ev(`[...document.querySelectorAll('.params-pop .params-title')].map((e) => e.textContent).join(' | ')`), 'their names').toBe('Прямоугольник | Прямоугольник 1');
  },

  async 'an item is stretched by its left and top sides too, the other side staying put'(p) {
    for (const type of ['rect', 'frame']) {
      await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); b.replaceAll([], []);
        b.add(e.newItem('${type}', 300, 300, { id: 'r', w: 200, h: 120, members: [] })); e.setSelection(['r']); })()`);
      await sleep(150);
      const at = (x, y) => p.ev(`(() => { const s = planx.editor.toScreen({ x: ${'${x}'}, y: ${'${y}'} }); return [s.x, s.y]; })()`.replace('${x}', x).replace('${y}', y));
      await p.drag(await at(300, 330), await at(260, 330));
      await p.drag(await at(320, 300), await at(320, 270));
      const r = await p.ev(`(() => { const r = planx.board.get('r'); return [r.x, r.y, r.x + r.w, r.y + r.h].join(); })()`);
      expect(r, `${type}: left and top out, right and bottom where they were`).toBe('260,270,500,420');
    }
    // The top left corner: both back, the bottom right where it was; with Alt, from the middle.
    await p.ev(`(() => { const e = planx.editor, b = planx.board; b.replaceAll([], []); b.add(e.newItem('rect', 300, 300, { id: 'r', w: 200, h: 120 })); e.setSelection(['r']); })()`);
    await sleep(150);
    const sc = (x, y) => p.ev(`(() => { const s = planx.editor.toScreen({ x: ${'X'}, y: ${'Y'} }); return [s.x, s.y]; })()`.replace('X', x).replace('Y', y));
    await p.drag(await sc(298, 298), await sc(278, 268));
    expect(await p.ev(`(() => { const r = planx.board.get('r'); return [r.x, r.y, r.x + r.w, r.y + r.h].join(); })()`), 'by the top left corner').toBe('280,270,500,420');
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Alt', code: 'AltLeft', modifiers: 1 });
    const [hx, hy] = await sc(503, 423);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hx, y: hy, modifiers: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: hx, y: hy, button: 'left', buttons: 1, clickCount: 1, modifiers: 1 });
    for (let i = 1; i <= 5; i++) await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hx + 2 * i, y: hy + 2 * i, button: 'left', buttons: 1, modifiers: 1 });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hx + 10, y: hy + 10, button: 'left', buttons: 0, clickCount: 1, modifiers: 1 });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Alt', code: 'AltLeft' });
    expect(await p.ev(`(() => { const r = planx.board.get('r'); return [r.x, r.y, r.x + r.w, r.y + r.h].join(); })()`), 'with Alt, from the middle').toBe('270,260,510,430');
  },

  async 'Ctrl+↑ and Ctrl+↓ take what is picked a layer up or down'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board;
      ['a', 'b', 'c'].forEach((id, i) => b.add(e.newItem('sticky', 100 + i * 20, 100, { id, z: i + 1 }))); e.setSelection(['a']); })()`);
    const order = () => p.ev(`planx.board.list().filter((i) => 'abc'.includes(i.id)).sort((m, n) => m.z - n.z).map((i) => i.id).join('')`);
    await p.key('ArrowUp', 'ArrowUp', 38, 4);
    expect(await order(), 'one up').toBe('bac');
    await p.key('ArrowUp', 'ArrowUp', 38, 4);
    await p.key('ArrowUp', 'ArrowUp', 38, 4);
    expect(await order(), 'at the top it stays').toBe('bca');
    await p.key('ArrowDown', 'ArrowDown', 40, 4);
    expect(await order(), 'one down').toBe('bac');
  },

  async 'what\'s picked is taken first, but not from under something solid over it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('task', 100, 100, { id: 'lo', w: 494, h: 400, tv: 'full', keep: true, z: 600 }));
      b.add(e.newItem('task', 300, 200, { id: 'hi', w: 494, h: 400, tv: 'full', keep: true, z: 601 }));
      b.add(e.newItem('ink', 120, 160, { id: 'ink', w: 40, h: 40, pts: [0, 0, 40, 40], z: 602 })); e.setSelection(['lo']); })()`);
    await sleep(200);
    // Over both, where the upper one's header is.
    await p.drag([520, 226], [560, 226]);
    expect(await p.ev(`[planx.board.get('lo').x, planx.board.get('hi').x].join()`), 'the one over it taken').toBe('100,340');
    // A drawing over what's picked doesn't hide it.
    await p.ev(`planx.editor.setSelection(['lo'])`);
    await sleep(100);
    await p.drag([140, 180], [180, 180]);
    expect(await p.ev(`[planx.board.get('lo').x, planx.board.get('ink').x].join()`), 'the picked one taken from under the drawing').toBe('140,120');
  },

  async 'a task opened and closed by its right corner: its «ЗАДАЧА» pill, by its arrow, the corner round it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('task', 200, 200, { id: 't', text: 'Задача', w: 293, h: 52 })); e.setSelection([]); })()`);
    await sleep(300);
    const tv = () => p.ev(`planx.board.get('t').tv ?? 'closed'`);
    const at = (dx, dy) => p.ev(`(() => { const t = planx.board.get('t'), s = planx.editor.toScreen({ x: t.x + t.w - ${dx}, y: t.y + ${dy} }); return [s.x, s.y]; })()`);
    await p.mouse('mouseMoved', ...(await at(46, 4)));
    await sleep(100);
    expect(await p.ev('planx.editor.hotPlus'), 'the pill lit').toBe('task:t:arrow');
    await p.click(await at(46, 4));
    expect(await tv(), 'its pill: opened').toBe('full');
    await sleep(450);
    await p.click(await at(8, 45));
    expect(await tv(), 'the corner by its arrow: closed').toBe('closed');
  },

  async 'a picked item\'s handle under something solid over it is neither drawn nor taken hold of'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add({ id: 'low', type: 'task', x: 300, y: 300, w: 293, h: 52, z: 1, text: 'Нижняя' }); b.add({ id: 'up', type: 'task', x: 500, y: 320, w: 293, h: 52, z: 2, text: 'Верхняя' }); e.setSelection(['low']); })()`);
    await sleep(300);
    const corner = await p.ev(`(() => { const s = planx.editor.toScreen({ x: 596, y: 355 }), r = planx.editor.canvas.getBoundingClientRect(); return [r.left + s.x, r.top + s.y]; })()`);
    await p.drag(corner, [corner[0] + 80, corner[1] + 40]);
    expect(await p.ev(`[planx.board.get('low').w, planx.board.get('up').x > 500].join()`), 'not stretched: the one over it taken').toBe('293,true');
  },

  async '"Перетаскивание подзадач": a subtask dragged down past another goes there; a click on one still ticks it'(p) {
    await p.ev(`(async () => { const { taskSize } = await import('/src/canvas/task.ts'); const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      const t = { id: 't', type: 'task', x: 300, y: 100, w: 494, h: 52, z: 1, text: 'З', tv: 'full', subs: [{ t: 'Один' }, { t: 'Два' }, { t: 'Три' }] }; t.h = taskSize(t).h; b.add(t); e.setSelection(['t']); })()`);
    await sleep(400);
    const row = (i) => p.ev(`(async () => { const { taskLayout } = await import('/src/canvas/task.ts'); const t = planx.board.get('t'), l = taskLayout(t), s = planx.editor.toScreen({ x: t.x + 140, y: t.y + l.subs[${i}] + 11 }), r = planx.editor.canvas.getBoundingClientRect(); return [r.left + s.x, r.top + s.y]; })()`);
    const subs = () => p.ev(`planx.board.get('t').subs.map((s) => s.t + (s.done ? '✓' : '')).join()`);
    const [a, c] = [await row(0), await row(2)];
    await p.drag(a, [a[0], c[1] + 6]);
    await sleep(200);
    expect(await subs(), 'the first now last').toBe('Два,Три,Один');
    expect(await p.ev(`[planx.board.get('t').x, planx.board.get('t').y].join()`), 'the task stays').toBe('300,100');
    await p.click(await row(0));
    await sleep(200);
    expect(await subs(), 'a click ticks it').toBe('Два✓,Три,Один');
  },

  async 'a task\'s menu (the burger at its foot): pinned, its pin over it, its buttons shown or not'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('task', 100, 60, { id: 't', text: 'Задача', desc: 'Описание', w: 494, h: 52, tv: 'full' })); e.setSelection(['t']); })()`);
    await sleep(300);
    const lay = () => p.ev(`(async () => { const t = planx.board.get('t'), l = (await import('/src/canvas/task.ts')).taskLayout(t); return { menu: l.menu, pin: !!l.pin, buttons: !!l.finish, w: t.w }; })()`);
    const open = async () => { const t = await p.ev(`planx.board.get('t')`), l = await lay(); await p.click(await p.ev(`(() => { const s = planx.editor.toScreen({ x: ${t.x} + ${l.menu.x} + 12, y: ${t.y} + ${l.menu.y} + 12 }); return [s.x, s.y]; })()`)); await sleep(200); };
    const pick = async (label) => { await p.click(await p.ev(`(() => { const r = [...document.querySelectorAll('.task-pop .menu-row')].find((b) => b.textContent === '${label}').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`)); await sleep(200); };
    let l = await lay();
    expect([l.menu.x, l.pin, l.buttons].join(), 'its burger at its right, nothing else at its foot').toBe(`${l.w - 35},false,false`);
    await open();
    expect(await p.ev(`[...document.querySelectorAll('.task-pop .menu-row')].map((b) => b.textContent).join()`), 'its menu')
      .toBe('Закрепить описание,Подзадачи,Блок с ответственными,Дата завершения,Кнопки');
    await pick('Закрепить описание');
    await open();
    await pick('Кнопки');
    l = await lay();
    expect([await p.ev(`planx.board.get('t').keep`), l.pin, l.buttons].join(), 'pinned (kept open), its pin; its buttons').toBe('true,true,true');
    expect(await p.ev(`(async () => (await import('/src/canvas/task.ts')).taskLayout(planx.board.get('t')).h)()`), 'as tall as it').toBe(await p.ev(`planx.board.get('t').h`));
  },

  async 'a task\'s subtask ticked by a click on its text too, typed in on a double click, taken away by the cross left of it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('task', 100, 60, { id: 't', text: 'Задача', w: 494, h: 52, tv: 'full', keep: true, subs: [{ t: 'Первая' }, { t: 'Вторая' }] })); e.setSelection([]); })()`);
    await sleep(300);
    const at = (dx, i) => p.ev(`(async () => { const t = planx.board.get('t'), l = (await import('/src/canvas/task.ts')).taskLayout(t), s = planx.editor.toScreen({ x: t.x + ${dx}, y: t.y + l.subs[${i}] + 11 }); return [s.x, s.y]; })()`);
    const subs = () => p.ev(`planx.board.get('t').subs.map((s) => s.t + (s.done ? '+' : '')).join()`);
    await p.click(await at(110, 0));
    expect(await subs(), 'its text clicked: ticked').toBe('Первая+,Вторая');
    await sleep(450);
    await dblClick(p, await at(110, 1));
    await sleep(150);
    expect([await subs(), await p.ev('planx.editor.editingCell')].join('|'), 'a double click: typed in, its tick as it was').toBe('Первая+,Вторая|2');
    await p.key('Escape', 'Escape', 27);
    await sleep(450);
    const cross = await at(33, 0);
    await p.mouse('mouseMoved', ...cross);
    await sleep(100);
    expect(await p.ev('planx.editor.hotPlus'), 'the cross lit').toBe('task:t:del:0');
    await p.click(cross);
    expect(await subs(), 'taken away').toBe('Вторая');
  },

  async 'a shape set to «Без текста» on its panel isn\'t typed in, by a double click or otherwise; set back, it is'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('rect', 400, 300, { id: 'r', w: 200, h: 120, text: 'Фигура' })); e.setSelection(['r']); })()`);
    await sleep(400);
    await p.click(await p.at('.bar.panel button[aria-label="Без текста"]'));
    expect(await p.ev(`planx.board.get('r').nt`), 'set').toBe(true);
    expect(await p.ev(`document.querySelector('.bar.panel button[aria-label="Текст и шрифт"]')?.disabled !== false`), 'its «Текст и шрифт» off (or not there)').toBe(true);
    await dblClick(p, [500, 360]);
    await sleep(150);
    expect([await p.ev('planx.editor.editingId'), await p.ev(`planx.board.get('r').text`)].join(), 'not typed in, its text as it was').toBe(',Фигура');
    await p.ev(`planx.editor.setSelection(['r'])`);
    await sleep(400);
    await p.click(await p.at('.bar.panel button[aria-label="Без текста"]'));
    await sleep(450);
    await dblClick(p, [500, 360]);
    await sleep(150);
    expect(await p.ev('planx.editor.editingId'), 'set back: typed in').toBe('r');
  },

  async 'any colour for a shape opens on the screen: under its palette when there\'s no room over it'(p) {
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', true))()`);
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('rect', 500, 240, { id: 'r', w: 200, h: 120 })); e.setSelection(['r']); })()`);
    await sleep(500);
    await p.click(await p.at('.panel-over button[aria-label="Цвет"]'));
    await sleep(200);
    await p.click(await p.at('.palette-pop .sw.custom'));
    await sleep(400);
    const r = await p.rect('.color-picker');
    expect(r.t >= 8 && r.b <= 792, `on the screen (${r.t}…${r.b})`).toBe(true);
    await p.ev(`(async () => (await import('/src/labs/labs.ts')).setLab('panelOver', false))()`);
  },

  async '«Группы»: groups in groups, as in Figma: picked by the outermost, a double click a level in, undone a level at a time; how many on the panel; copies in groups of their own'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      ['a', 'b', 'c', 'd'].forEach((k, i) => b.add(e.newItem('sticky', 200 + i * 260, 300, { id: k }))); b.add(e.newItem('sticky', 200, 600, { id: 'e' })); e.setSelection(['a', 'b']); })()`);
    await sleep(400);
    const gp = (k) => p.ev(`(planx.board.get('${k}').gp ?? []).length`);
    const picked = () => p.ev(`[...planx.editor.selection].sort().join()`);
    const count = () => p.ev(`document.querySelector('.bar.panel .group-count span')?.textContent ?? ''`);
    await p.click(await p.at('.bar.panel button[aria-label^="Сгруппировать"]'));
    await sleep(200);
    // Cmd+G.
    await p.ev(`planx.editor.setSelection(['c', 'd'])`);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'g', code: 'KeyG', modifiers: 4 });
    await sleep(200);
    expect(await p.ev(`(() => { const g = (k) => planx.board.get(k).gp?.join(); return g('a') === g('b') && g('c') === g('d') && g('a') !== g('c') && !g('e'); })()`), 'two groups').toBe(true);
    await p.ev(`planx.editor.setSelection(['a'])`);
    expect(await picked(), 'picked together').toBe('a,b');
    // The two grouped: one group of them.
    await p.ev(`planx.editor.setSelection(['a', 'c'])`);
    expect(await picked(), 'both picked whole').toBe('a,b,c,d');
    await p.ev(`planx.editor.group()`);
    await sleep(300);
    expect([await gp('a'), await gp('d'), await count()].join(), 'a group of the two').toBe('2,2,2 объекта');
    // A double click a level in, then again to the one clicked.
    const at = await p.ev(`(() => { const a = planx.board.get('a'), s = planx.editor.toScreen({ x: a.x + a.w / 2, y: a.y + 10 }), r = planx.editor.canvas.getBoundingClientRect(); return [r.left + s.x, r.top + s.y]; })()`);
    const dbl = async () => {
      // (Apart from the one before, not taken as a double click with it.)
      await sleep(500);
      await p.click(at);
      await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: at[0], y: at[1], button: 'left', buttons: 1, clickCount: 2 });
      await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at[0], y: at[1], button: 'left', buttons: 0, clickCount: 2 });
      await sleep(300);
    };
    await p.ev(`planx.editor.setSelection(['a'])`);
    await dbl();
    expect([await picked(), await count()].join(' '), 'a level in').toBe('a,b 2 объекта');
    await dbl();
    expect(await picked(), 'the one clicked').toBe('a');
    // Undone a level: the two groups again.
    await p.ev(`planx.editor.setSelection(['a'])`);
    await sleep(300);
    await p.click(await p.at('.bar.panel button[aria-label^="Разгруппировать"]'));
    await sleep(300);
    expect([await gp('a'), await gp('d')].join(), 'the two again').toBe('1,1');
    // Copies in a group of their own.
    await p.ev(`planx.editor.setSelection(['a']); planx.editor.duplicate()`);
    await sleep(300);
    expect(await p.ev(`(() => { const g = planx.board.get('a').gp.join(), copies = planx.board.list().filter((i) => i.type === 'sticky' && !'abcde'.includes(i.id)); return copies.length === 2 && copies[0].gp?.join() === copies[1].gp?.join() && copies[0].gp?.join() !== g; })()`), 'copies grouped apart').toBe(true);
    // Cmd+Shift+G.
    await p.ev(`planx.editor.setSelection(['a'])`);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'G', code: 'KeyG', modifiers: 12 });
    await sleep(200);
    expect(await gp('a'), 'ungrouped by keys').toBe(0);
    await p.ev(`planx.editor.setSelection(['a'])`);
    expect(await picked(), 'picked alone again').toBe('a');
  },

  async 'a group folded and unfolded by the arrow on its panel'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 450, 350, { id: 's' })); b.add(e.newItem('frame', 400, 300, { id: 'f', w: 300, h: 260, members: ['s'], text: 'Группа' })); e.setSelection(['f']); })()`);
    await sleep(400);
    await p.click(await p.at('.bar.panel button[aria-label="Свернуть фрейм"]'));
    await sleep(300);
    expect(!!(await p.ev(`planx.board.get('f').fold`)), 'folded').toBe(true);
    await p.click(await p.at('.bar.panel button[aria-label="Развернуть фрейм"]'));
    await sleep(300);
    expect(!!(await p.ev(`planx.board.get('f').fold`)), 'unfolded').toBe(false);
  },

  async 'the usual arrow over items, text and all; a second click on a picked item\'s text types in it'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('task', 100, 100, { id: 't', text: 'Задача', w: 293, h: 52 }));
      b.add(e.newItem('rect', 100, 250, { id: 'c', code: 'js', text: '', w: 480, h: 120, fs: 14, ff: 'mono', rad: 16 }));
      b.add(e.newItem('sticky', 700, 100, { id: 's', w: 160, h: 160, text: 'Стикер' }));
      b.add(e.newItem('mind', 700, 400, { id: 'm', w: 160, h: 48, text: 'Тема' })); e.setSelection([]); })()`);
    await sleep(200);
    const at = async (x, y) => { await p.mouse('mouseMoved', x, y); await sleep(50); return p.ev(`planx.editor.canvas.style.cursor`); };
    expect([await at(170, 126), await at(340, 330), await at(780, 180), await at(780, 424)].join(), 'task title, empty code, sticker, mind map text').toBe(',,,');
    // Picked, a second click on its text types in it (the arrow over it all the same).
    await p.click([780, 180]);
    await sleep(450);
    expect(await at(780, 180), 'the sticker picked').toBe('');
    await p.click([780, 180]);
    await sleep(200);
    expect(await p.ev('planx.editor.editingId'), 'typed in on a second click').toBe('s');
    await p.key('Escape', 'Escape', 27);
    await p.ev(`planx.editor.setSelection(['t'])`);
    await sleep(450);
    await p.click([170, 126]);
    await sleep(200);
    expect([await p.ev('planx.editor.editingId'), await p.ev('planx.editor.editingCell')].join(), 'a task\'s title, the same').toBe('t,');
  },

  async 'a layer up stops under a task kept open'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board;
      b.add(e.newItem('task', 100, 100, { id: 'k', w: 494, h: 300, tv: 'full', keep: true, z: 600 }));
      b.add(e.newItem('sticky', 200, 200, { id: 's', z: 5 })); e.setSelection(['s']); e.shiftZ(1); })()`);
    expect(await p.ev(`planx.board.list().map((i) => i.id).join()`), 'still under it').toBe('s,k');
  },

  async 'a layer up or down goes past what it lies over, not something elsewhere; an instance takes what it holds along, a new task comes on top'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('rect', 300, 200, { id: 'r', w: 400, h: 300, z: 1 }));
      b.add(e.newItem('sticky', 900, 600, { id: 'far', w: 100, h: 100, z: 2 }));
      b.add(e.newItem('sticky', 350, 250, { id: 's', w: 100, h: 100, z: 3 })); e.setSelection(['s']); })()`);
    const order = () => p.ev(`planx.board.list().filter((i) => ['r', 'far', 's'].includes(i.id)).sort((m, n) => m.z - n.z).map((i) => i.id).join(' ')`);
    await p.key('ArrowDown', 'ArrowDown', 40, 4);
    expect(await order(), 'under the rectangle at once, past the one far off').toBe('s r far');
    // A task put on the rectangle: on top; a layer down, all of it under the rectangle.
    await p.ev(`planx.editor.setTool('task')`);
    await p.click([600, 420]);
    await sleep(300);
    const over = () => p.ev(`(() => { const t = planx.board.list().find((i) => i.type === 'task'), r = planx.board.get('r'); return t.z > r.z ? 'over' : 'under'; })()`);
    expect(await over(), 'the task over the rectangle').toBe('over');
    // (Opened, it lies over all that isn't: a layer down only once it's closed, back where it was put.)
    await p.ev(`(() => { planx.editor.stopEditing(); planx.editor.setSelection([planx.board.list().find((i) => i.type === 'task').id]); })()`);
    await p.key('ArrowDown', 'ArrowDown', 40, 4);
    await sleep(200);
    expect(await over(), 'opened: still over').toBe('over');
    await p.ev(`(() => { planx.editor.setSelection([]); planx.editor.setSelection([planx.board.list().find((i) => i.type === 'task').id]); })()`);
    await sleep(200);
    expect(await p.ev(`(() => { const t = planx.board.list().find((i) => i.type === 'task'); return [t.tv ?? 'closed', t.z > planx.board.get('r').z && t.z < 400].join(); })()`), 'closed, where it was put').toBe('closed,true');
    await p.key('ArrowDown', 'ArrowDown', 40, 4);
    await sleep(200);
    expect(await over(), 'a layer down: under').toBe('under');
    // An instance of one's own component alike.
    await p.ev(`(() => { const e = planx.editor, b = planx.board;
      b.add(e.newItem('frame', -800, 0, { id: 'comp', comp: true, w: 200, h: 200, members: ['cs'], z: -5 }));
      b.add(e.newItem('sticky', -780, 20, { id: 'cs', w: 100, h: 100, z: 0.5 }));
      b.add(e.newItem('frame', 320, 220, { id: 'in', inst: 'comp', w: 200, h: 200, members: [] })); })()`);
    await sleep(200);
    const mine = () => p.ev(`(() => { const c = planx.board.get('in~cs'), r = planx.board.get('r'); return c ? (c.z > r.z ? 'over' : 'under') : 'none'; })()`);
    expect(await mine(), 'a new instance over the rectangle').toBe('over');
    await p.ev(`planx.editor.setSelection(['in'])`);
    await p.key('ArrowDown', 'ArrowDown', 40, 4);
    await sleep(200);
    expect(await mine(), 'a layer down, what it holds along').toBe('under');
  },

  async 'a picked link gets nodes pulled out of its middles, moved, and gone on a double click; they go with both its ends'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 200, 300, { id: 'a', w: 100, h: 100 }));
      b.add(e.newItem('sticky', 700, 300, { id: 'b', w: 100, h: 100 }));
      b.addLink({ id: 'L', from: 'a', to: 'b', style: 'straight' }); e.setSelection(['L']); })()`);
    await sleep(200);
    const via = () => p.ev(`(() => { const l = planx.board.getLink('L'); return l ? JSON.stringify(l.via ?? null) : 'NO LINK'; })()`);
    // A click on its middle leaves it as it is; pulled, a node.
    await p.click([500, 350]);
    expect(await via(), 'a click: no node').toBe('null');
    await p.drag([500, 350], [500, 200]);
    expect(await via(), 'pulled out: a node there').toBe('[{"x":500,"y":200}]');
    await p.drag([500, 200], [450, 150]);
    expect(await via(), 'moved').toBe('[{"x":450,"y":150}]');
    // Both its ends moved: the node goes along.
    await p.ev(`planx.editor.setSelection(['a', 'b'])`);
    await p.drag([250, 350], [250, 450]);
    expect(await via(), 'along with them').toBe('[{"x":450,"y":250}]');
    await p.ev(`planx.editor.setSelection(['L'])`);
    await sleep(100);
    await p.click([450, 250]);
    await p.click([450, 250]);
    expect(await via(), 'a double click: gone').toBe('null');
  },

  async 'a right-angled link moves by its stretches, square at every turn; the one at the arrow gets a new bend'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('sticky', 100, 200, { id: 'a', w: 100, h: 100 }));
      b.add(e.newItem('sticky', 600, 450, { id: 'b', w: 100, h: 100 }));
      b.addLink({ id: 'L', from: 'a', to: 'b', style: 'elbow' }); e.setSelection(['L']); })()`);
    await sleep(200);
    const pts = () => p.ev(`(async () => { const g = await import('/src/canvas/geometry.ts'); return g.linkShape(planx.board.getLink('L'), (id) => planx.board.get(id)).pts.map((q) => [Math.round(q.x), Math.round(q.y)]); })()`);
    const square = (ps) => ps.slice(1).every((q, i) => q[0] === ps[i][0] || q[1] === ps[i][1]);
    const p0 = await pts();
    // Its stretch up and down in the middle: moved across.
    const k = p0.findIndex((q, i) => i > 0 && i < p0.length - 1 && p0[i + 1] && q[0] === p0[i + 1][0]);
    const mid = [(p0[k][0] + p0[k + 1][0]) / 2, (p0[k][1] + p0[k + 1][1]) / 2];
    await p.drag(mid, [mid[0] + 80, mid[1]]);
    const p1 = await pts();
    expect(p1[k][0] - p0[k][0], 'that stretch across').toBe(80);
    expect(square(p1), 'square at every turn').toBe(true);
    // The stretch at the arrow, moved: a new bend, its end still on the item.
    const n = p1.length, last = [(p1[n - 2][0] + p1[n - 1][0]) / 2, (p1[n - 2][1] + p1[n - 1][1]) / 2];
    await p.drag(last, [last[0], last[1] - 60]);
    const p2 = await pts();
    expect(p2.length > n, 'more bends').toBe(true);
    expect(p2[p2.length - 1].join(), 'its end where it was').toBe(p1[n - 1].join());
    expect(square(p2), 'still square').toBe(true);
  },

  async 'the picker\'s stickers are the game ones, and one picked goes on the board with its outline'(p) {
    await p.ev(`window.dispatchEvent(new CustomEvent('planx:toggle-icons'))`);
    await sleep(300);
    await p.ev(`[...document.querySelectorAll('.pick-tabs button')].find((b) => b.textContent === 'Стикеры').click()`);
    await sleep(200);
    expect(await p.ev(`[...document.querySelectorAll('.doodle-grid')].map((g) => g.children.length).join()`), 'fifteen of them, fourteen badges under them, four characters').toBe('15,14,4');
    await p.click(await p.at('.doodle-grid button'));
    await sleep(300);
    const it = await p.ev(`(() => { const i = planx.board.list().find((x) => x.doodle); return i && i.type + ' ' + i.doodle; })()`);
    expect(it, 'a picture of that sticker').toBe('image 01-love');
  },

  async 'typing in a table\'s cell, its lines still resize it, the typing going on'(p) {
    const id = await put(p, `const t = e.newItem('table', X, Y, { cols: [120, 120, 120], rows: [40, 40, 40], cells: Array(9).fill(''), w: 360, h: 120 }); b.add(t); e.setSelection([t.id]); e.startEditing(t.id, 4); return t.id;`);
    await sleep(300);
    await p.cdp('Input.insertText', { text: 'Привет' });
    const t0 = await p.ev(`planx.board.get('${id}')`), line = await screen(p, t0.x + 120, t0.y + 100);
    await p.mouse('mouseMoved', line[0] - 30, line[1]);
    await p.drag(line, [line[0] + 50, line[1]], { rest: 700 });
    const t = await p.ev(`planx.board.get('${id}')`);
    expect(t.cols[0], 'the column wider').toBeNear(170, 2);
    expect(`${await p.ev('planx.editor.editingId') === id} ${await p.ev('planx.editor.editingCell')}`, 'still typing in that cell').toBe('true 4');
  },

  async 'once a table line has been waited for, the table\'s other lines are taken at once, till the pointer is off it a second'(p) {
    await p.ev(`(() => { const e = planx.editor, b = planx.board; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged();
      b.add(e.newItem('table', 200, 200, { id: 't', w: 360, h: 120, cols: [120, 120, 120], rows: [40, 40, 40], cells: Array(9).fill('') })); e.setSelection([]); })()`);
    const cursor = () => p.ev('planx.editor.canvas.style.cursor');
    // Columns meet at x 320 and 440.
    await p.mouse('mouseMoved', 320, 240);
    await sleep(150);
    expect(await cursor() === 'col-resize', 'not at once the first time').toBe(false);
    await sleep(600);
    expect(await cursor(), 'after waiting').toBe('col-resize');
    await p.mouse('mouseMoved', 380, 240);
    await sleep(100);
    await p.mouse('mouseMoved', 440, 240);
    await sleep(50);
    expect(await cursor(), 'the next one at once').toBe('col-resize');
    // Off the table over a second: waited for again.
    await p.mouse('mouseMoved', 800, 600);
    await sleep(1200);
    await p.mouse('mouseMoved', 320, 280);
    await sleep(50);
    expect(await cursor() === 'col-resize', 'off it a second: not at once again').toBe(false);
  },

  async 'a shape being drawn moves along with the pointer while Space is held, and goes on growing once it\'s let go'(p) {
    await p.ev(`(() => { const e = planx.editor; e.cam = { x: 0, y: 0, z: 1 }; e.camChanged(); e.setTool('rect'); })()`);
    const space = (type) => p.cdp('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    const to = async (x, y) => { await p.mouse('mouseMoved', x, y); await sleep(30); };
    await to(300, 300);
    await p.mouse('mousePressed', 300, 300);
    for (const [x, y] of [[350, 340], [400, 380]]) await to(x, y);
    await space('keyDown');
    for (const [x, y] of [[450, 430], [500, 480]]) await to(x, y);
    await space('keyUp');
    await to(520, 500);
    await p.mouse('mouseReleased', 520, 500);
    await sleep(200);
    expect(await p.ev(`(() => { const r = planx.board.list().find((i) => i.type === 'rect'); return [r.x, r.y, r.w, r.h].join(); })()`), 'moved by 100, 100, then 20 bigger').toBe('400,400,120,100');
  },
};

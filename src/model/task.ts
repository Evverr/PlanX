import type { Board } from './board';
import { inKanban, KANBAN_LANE, type Item, type TaskStatus } from './types';
import { remapLinks } from './textLinks';
import { taskSize, TASK_OPEN_W, TASK_W } from '../canvas/task';

/**
 * Tasks (see canvas/task.ts for how one looks): what's done to one, and the tasks of before made these.
 * Before, a task was a card with a tick box (`done`), or, on trial, a component that came with PlanX
 * (a frame with `inst` "@task-open", "@task-done" or "@task-later", its title and note in copies).
 */

/** Its status; ticked off as before is done. */
export function setStatus(board: Board, id: string, st: TaskStatus): void {
  board.update(id, { st, done: undefined });
}

/** Where an opened task goes: 500 over the board's top, over the others opened too (see Board.maxZ,
 *  which leaves them out, so what's put on the board after stays under them). */
export function openZ(board: Board): number {
  const open = board.list().filter((i) => i.type === 'task' && i.tv);
  return Math.max(board.maxZ() + 500, ...open.map((i) => i.z + 1));
}

/** Opened to its description or all of it, or closed: wider opened, back to its width closed. Opened,
 *  up over the board (see openZ); closed (kept open or not before), back where it lay. */
export function setView(board: Board, it: Item, tv: Item['tv']): void {
  // (In a kanban's column, as wide as it open or closed: it grows down alone, see labs/kanban.ts.)
  const lane = inKanban(board.list(), it.id);
  const w = lane ? KANBAN_LANE : tv ? Math.max(it.w, it.tv ? it.w : TASK_OPEN_W) : it.cw ?? TASK_W;
  const next = { ...it, tv, w };
  const z = tv && !it.tv ? { oz: it.z, z: openZ(board) } : !tv && it.tv ? { oz: undefined, z: it.oz ?? it.z } : {};
  board.update(it.id, { tv, w, h: taskSize(next).h, cw: lane ? undefined : tv && !it.tv ? it.w : tv ? it.cw : undefined, ...z });
}

/** Kept open («Не сворачивать»): not closed by Esc, Cmd+Enter or a click elsewhere (up over the board
 *  as any opened one is). */
export function keepOpen(board: Board, id: string): void {
  board.update(id, { keep: true });
}

/** Done with it (Esc, Cmd+Enter, picked no more): closed, unless it's to stay open («Не сворачивать»). */
export function closeTask(board: Board, id: string): void {
  const it = board.get(id);
  if (it?.type === 'task' && it.tv && !it.keep) setView(board, it, undefined);
}

/** A double click on its header: opened (`open`: to its description, or all of it, alike now: what's
 *  ticked in its menu shows either way), or closed; nothing between. */
export const nextView = (board: Board, it: Item, open: Item['tv'] = 'desc'): void =>
  setView(board, it, !it.tv ? open : undefined);

/** A new task, its middle at `c`: opened (`open`: to its description, as one put on the board comes, or
 *  all of it; closed, as wide as usual), up over the board as opened ones are, closed where it was put. */
export function freshTask(board: Board, it: Item, c: { x: number; y: number }, open: Item['tv'] = 'desc'): Item {
  const t = { ...it, tv: open, w: TASK_OPEN_W, cw: TASK_W }, h = taskSize(t).h;
  return { ...t, h, x: Math.round(c.x - TASK_OPEN_W / 2), y: Math.round(c.y - h / 2), oz: it.z, z: openZ(board) };
}

/** Its height for what's in it now, with a change to it. */
export const fitTask = (it: Item, patch: Partial<Item> = {}): number => taskSize({ ...it, ...patch }).h;

/** A subtask ticked off, or back on. */
export function toggleSub(board: Board, it: Item, i: number): void {
  const subs = [...(it.subs ?? [])];
  if (!subs[i]) return;
  subs[i] = { ...subs[i], done: subs[i].done ? undefined : true };
  board.update(it.id, { subs });
}

/** A subtask put elsewhere among them ("Перетаскивание подзадач", src/labs). */
export function moveSub(board: Board, it: Item, from: number, to: number): void {
  const subs = [...(it.subs ?? [])];
  if (from === to || !subs[from]) return;
  subs.splice(to, 0, ...subs.splice(from, 1));
  board.update(it.id, { subs });
}

/** A subtask taken away (its cross), the task as tall as what's left. */
export function removeSub(board: Board, it: Item, i: number): void {
  const subs = (it.subs ?? []).filter((_, k) => k !== i);
  board.update(it.id, { subs: subs.length ? subs : undefined, h: fitTask(it, { subs: subs.length ? subs : undefined }) });
}

/** A new subtask after the `after`th (at the end, without one): its number among them. */
export function addSub(board: Board, it: Item, after = (it.subs?.length ?? 0) - 1): number {
  const subs = [...(it.subs ?? [])];
  subs.splice(after + 1, 0, { t: '' });
  board.update(it.id, { subs, h: fitTask(it, { subs }) });
  return after + 1;
}

/** The text typed in a part of it: the title (null), the description (0), a subtask (1…); a subtask
 *  left empty goes. */
export function taskTextPatch(it: Item, field: number | null, value: string): Partial<Item> | null {
  if (field === null) return value === (it.text ?? '') ? null : { text: value };
  // (Links on parts of its description moved along with what's typed.)
  if (field === 0) return value === (it.desc ?? '') ? null : { desc: value || undefined, ...(it.links && { links: remapLinks(it.desc ?? '', value, it.links) }) };
  const subs = [...(it.subs ?? [])], i = field - 1;
  if (!subs[i]) return null;
  if (!value.trim()) subs.splice(i, 1);
  else if (value === subs[i].t) return null;
  else subs[i] = { ...subs[i], t: value };
  return { subs: subs.length ? subs : undefined };
}

const OLD_STATES: Record<string, TaskStatus> = { '@task-open': 'todo', '@task-done': 'done', '@task-later': 'todo' };

/** The tasks of before made these, and every task as tall as its contents (its font come in, say, or
 *  as it was before): for good, not a step to undo, the same on every screen that does it. */
export function renewTasks(board: Board, typing: string | null = null): void {
  const all = board.list();
  const old = all.filter((it) => it.type === 'frame' && it.inst && OLD_STATES[it.inst] !== undefined);
  const fits = all.filter((it) => it.type === 'task' && !it.host && it.id !== typing && Math.abs(it.h - taskSize(it).h) > 2);
  if (!old.length && !fits.length) return;
  board.forGood(() => {
    for (const f of old) {
      const title = all.find((c) => c.host === f.id && c.from === '@task-title')?.text;
      const note = all.find((c) => c.host === f.id && c.from === '@task-note')?.text;
      // (Made one in its place, so lines to it stay.)
      const patch: Partial<Item> = { type: 'task', w: TASK_W, text: title ?? '', color: 'blue', fs: 16, st: OLD_STATES[f.inst!],
        desc: note && note !== 'Подробности' ? note : undefined, inst: undefined, members: undefined, born: undefined, grow: undefined };
      board.remove(all.filter((c) => c.host === f.id).map((c) => c.id));
      board.update(f.id, { ...patch, h: taskSize({ ...f, ...patch }).h });
    }
    for (const it of fits) board.update(it.id, { h: taskSize(it).h });
  });
}

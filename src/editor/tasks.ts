import type { Editor } from './editor';
import type { Item } from '../model/types';
import type { Point } from '../canvas/geometry';
import { nextStatus, progressOf, statusOf, taskLayout, taskPartAt, type TaskPart } from '../canvas/task';
import { addSub, setStatus, setView, toggleSub } from '../model/task';
import { isLocked } from '../labs/labs';
import { taskOpen } from '../labs/taskFull';

/** Who set it, who does it, by when: picked in a popup at a screen point (see ui/TaskPop.tsx). */
export interface TaskPick { id: string; field: 'boss' | 'doer' | 'due'; x: number; y: number }
/** «Не сворачивать» pressed on a task: the popup asking first, by it (its box's left, top and bottom on the screen). */
export interface TaskKeep { id: string; x: number; top: number; bottom: number }
/** A word on a task, in a blue hint's bubble over a point on the screen (see ui/TaskPop.tsx). */
export interface TaskTip { text: string; x: number; y: number }

/** The part of a task a press is on that does something at once: its ring, its arrows, a subtask's
 *  ring, adding a subtask, the people and the date, the buttons. Not its text: that's taken to move it,
 *  and typed in on a double click. */
export function taskButtonAt(it: Item | null | undefined, w: Point): TaskPart | null {
  if (it?.type !== 'task' || isLocked(it)) return null;
  const part = taskPartAt(it, w);
  return part === 'title' || part === 'desc' || part === 'head' || (typeof part === 'object' && part && !part.tick) ? null : part;
}

/** Does what a click on a task's button does (on letting go, not dragged); whether it was on one. */
export function pressTask(ed: Editor, it: Item, w: Point, sp: Point): boolean {
  const part = taskButtonAt(it, w);
  if (!part) return false;
  const board = ed.board;
  // With subtasks, it's done by doing them: its ring and «Завершить» only say so.
  const pr = progressOf(it);
  if ((part === 'status' || part === 'finish') && pr !== null && pr < 1) {
    // (Over its ring: the hint's bubble pointing down at it, on the screen.)
    const r = ed.canvas?.getBoundingClientRect(), s = ed.toScreen({ x: it.x + 26, y: it.y + 15 });
    window.dispatchEvent(new CustomEvent<TaskTip>('planx:task-tip', { detail: { text: 'Задачу можно выполнить, только выполнив все подзадачи', x: s.x + (r?.left ?? 0), y: s.y + (r?.top ?? 0) } }));
    return true;
  }
  // Done, its ring makes it to do again: with subtasks, by the last of them to do again.
  if (part === 'status') { if (pr === null) setStatus(board, it.id, nextStatus(statusOf(it))); else toggleSub(board, it, it.subs!.length - 1); }
  else if (part === 'arrow') setView(board, it, it.tv ? undefined : taskOpen());
  else if (part === 'more') setView(board, it, 'full');
  else if (part === 'cancel') setView(board, it, undefined);
  else if (part === 'keep') {
    // Unticked at once; ticked once said yes to, in a popup by it saying why not to.
    if (it.keep) board.update(it.id, { keep: undefined });
    else {
      const l = taskLayout(it), r = ed.canvas?.getBoundingClientRect(), dx = r?.left ?? 0, dy = r?.top ?? 0;
      const a = ed.toScreen({ x: it.x + (l.keep?.x ?? 0), y: it.y + (l.keep?.y ?? 0) }), b = ed.toScreen({ x: it.x + (l.keep?.x ?? 0), y: it.y + (l.keep ? l.keep.y + l.keep.h : 0) });
      window.dispatchEvent(new CustomEvent<TaskKeep>('planx:task-keep', { detail: { id: it.id, x: a.x + dx, top: a.y + dy, bottom: b.y + dy } }));
    }
  }
  else if (part === 'finish') board.transact(() => { setStatus(board, it.id, 'done'); setView(board, { ...it, st: 'done' }, undefined); });
  else if (part === 'add') {
    const n = addSub(board, it);
    ed.setSelection([it.id]);
    // (Done once let go, the press can't take the typing's focus away.)
    setTimeout(() => ed.startEditing(it.id, n + 1, 'end'));
  } else if (part === 'boss' || part === 'doer' || part === 'due') {
    ed.setSelection([it.id]);
    window.dispatchEvent(new CustomEvent<TaskPick>('planx:task-pick', { detail: { id: it.id, field: part, x: sp.x, y: sp.y } }));
  } else if (typeof part === 'object') toggleSub(board, it, part.sub);
  return true;
}

/** The part typed in on a double click at a point: the description (0), a subtask (1…), else the title. */
export function taskFieldAt(it: Item, w: Point): number | null {
  const part = taskPartAt(it, w);
  if (part === 'desc') return 0;
  if (typeof part === 'object' && part) return part.sub + 1;
  return null;
}

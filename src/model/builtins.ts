import type { Item } from './types';

/**
 * Components that come with PlanX, kept here rather than on a board: an instance of one is a frame
 * with `inst` set to its id (starting "@"), its copies made from these items as for any component, so
 * what's changed in them is kept. Their items' ids start "@" too (a copy of one: "<instance>~@task-title"),
 * which is how a copy tells it's from one. Each is laid out as on its board, its frame at 0, 0.
 *
 * The task ("Задача", from Женя's board): a card with a title and a note under it, and a ring at the
 * top right; to be done, done (a tick in the ring) or put off (grey). A click on the ring moves it on.
 */
export interface Builtin { frame: Item; items: Item[] }

const card = (color: string, extra: Partial<Item> = {}): Item => ({
  id: '@task-bg', type: 'rect', x: 40, y: 40, w: 255, h: 330, z: 0, color, text: '', fs: 16, ta: 'left', va: 'top', rad: 4, sc: 'none', so: 0.14, ...extra,
});
const ring: Item = { id: '@task-ring', type: 'ellipse', x: 239, y: 55, w: 40, h: 40, z: 1, color: '#ffffff', fo: 0.44, text: '', fs: 16, ta: 'left', va: 'top', sc: 'none' };
// Clear of the ring by 10, so it never runs under it.
const title = (text: string, extra: Partial<Item> = {}): Item => ({ id: '@task-title', type: 'text', x: 62, y: 64, w: 167, h: 21, z: 3, text, fs: 16, fw: 700, ...extra });
// Plain text under the title, in line with it; typed away, the title's left alone.
const note = (extra: Partial<Item> = {}): Item => ({ id: '@task-note', type: 'text', x: 62, y: 96, w: 211, h: 18, z: 4, text: 'Подробности', fs: 14, fw: 400, ta: 'left', ...extra });
const frame = (id: string, text: string, members: string[]): Item => ({ id, type: 'frame', x: 0, y: 0, w: 335, h: 410, z: 0, text, comp: true, members });

const task = (id: string, name: string, items: Item[]): [string, Builtin] => [id, { frame: frame(id, name, items.map((i) => i.id)), items }];

export const BUILTINS = new Map<string, Builtin>([
  task('@task-open', 'Задача', [card('green'), ring, title('Что надо сделать'), note()]),
  task('@task-done', 'Задача сделана', [card('#cfe3f8'), ring,
    { id: '@task-check', type: 'icon', x: 238, y: 54, w: 42, h: 42, z: 2, color: 'blue', icon: 'circle-check-solid' },
    title('Что уже сделано'), note()]),
  task('@task-later', 'Отложенная', [card('gray'), ring, title('Что надо сделать', { tc: 'gray' }), note({ tc: 'gray' })]),
]);

export const isBuiltin = (id: string | undefined): boolean => !!id && id.startsWith('@');

/** A task's states in the order a click on its ring goes through them. */
export const TASK_STATES = ['@task-open', '@task-done', '@task-later'];
export const nextTaskState = (state: string): string => TASK_STATES[(TASK_STATES.indexOf(state) + 1) % TASK_STATES.length];

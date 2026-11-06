import { describe, expect, it } from 'vitest';
import { nextStatus, progressOf, statusOf } from '../src/canvas/task';
import { taskTextPatch } from '../src/model/task';
import type { Item } from '../src/model/types';

const task = (extra: Partial<Item> = {}): Item => ({ id: 't', type: 'task', x: 0, y: 0, w: 293, h: 52, z: 0, text: 'Купить', ...extra });

describe('tasks', () => {
  it('go round their statuses; a task ticked off before is done', () => {
    expect([nextStatus('todo'), nextStatus('doing'), nextStatus('done')]).toEqual(['doing', 'done', 'todo']);
    expect(statusOf(task({ done: true }))).toBe('done');
    expect(statusOf(task())).toBe('todo');
  });

  it('with subtasks, are as far on as they are', () => {
    const subs = (...done: boolean[]) => done.map((d) => ({ t: 'П', done: d || undefined }));
    expect([progressOf(task()), progressOf(task({ subs: subs(true, false, false, false) }))]).toEqual([null, 0.25]);
    expect([statusOf(task({ st: 'done', subs: subs(false) })), statusOf(task({ subs: subs(true, false) })), statusOf(task({ subs: subs(true, true) }))]).toEqual(['todo', 'doing', 'done']);
  });

  it('keep what is typed in each part; an empty subtask goes', () => {
    const t = task({ subs: [{ t: 'Первая' }, { t: 'Вторая', done: true }] });
    expect(taskTextPatch(t, null, 'Купить')).toBe(null);
    expect(taskTextPatch(t, null, 'Продать')).toEqual({ text: 'Продать' });
    expect(taskTextPatch(t, 0, 'Два литра')).toEqual({ desc: 'Два литра' });
    expect(taskTextPatch(t, 2, 'Вторая!')).toEqual({ subs: [{ t: 'Первая' }, { t: 'Вторая!', done: true }] });
    expect(taskTextPatch(t, 1, ' ')).toEqual({ subs: [{ t: 'Вторая', done: true }] });
    expect(taskTextPatch(task({ subs: [{ t: '' }] }), 1, '')).toEqual({ subs: undefined });
  });
});

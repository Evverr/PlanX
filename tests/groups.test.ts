import { describe, expect, it } from 'vitest';
import { copyGroups, grouped, levelIn, pickedGroup, ungrouped, withGroups } from '../src/labs/groups';
import type { Item } from '../src/model/types';

const item = (id: string, gp?: string[]): Item => ({ id, type: 'sticky', x: 0, y: 0, w: 100, h: 100, z: 0, gp });
/** Applies new paths, as the board would. */
const apply = (items: Item[], paths: Map<string, string[] | undefined>) => items.map((i) => (paths.has(i.id) ? { ...i, gp: paths.get(i.id) } : i));
const ids = (...k: string[]) => new Set(k);

describe('groups in groups («Группы»)', () => {
  it('two groups grouped make a group of the two, undone back to the two', () => {
    let items = [item('a', ['A']), item('b', ['A']), item('c', ['B']), item('d', ['B']), item('e')];
    items = apply(items, grouped(items, items.filter((i) => i.id !== 'e'))!);
    const g = items[0].gp![0];
    expect(items.map((i) => i.gp?.join('>'))).toEqual([`${g}>A`, `${g}>A`, `${g}>B`, `${g}>B`, undefined]);
    expect(pickedGroup(items, ids('a', 'b', 'c', 'd'))).toEqual({ g, level: 0, count: 2 });
    items = apply(items, ungrouped(items, ids('a', 'b', 'c', 'd'))!);
    expect(items.map((i) => i.gp?.join('>'))).toEqual(['A', 'A', 'B', 'B', undefined]);
  });

  it('a click picks all of the outermost; double clicks go a level in at a time', () => {
    const items = [item('a', ['G', 'A']), item('b', ['G', 'A']), item('c', ['G']), item('e')];
    expect([...withGroups(items, ids('b'))].sort()).toEqual(['a', 'b', 'c']);
    expect(levelIn(items, ids('a', 'b', 'c'), items[1])).toEqual(['a', 'b']);
    expect(levelIn(items, ids('a', 'b'), items[1])).toEqual(['b']);
    expect(levelIn(items, ids('b'), items[1])).toBeNull();
    expect(pickedGroup(items, ids('a', 'b'))).toEqual({ g: 'A', level: 1, count: 2 });
  });

  it('grouped within the group they are in; one thing alone is not grouped', () => {
    const items = [item('a', ['G', 'A']), item('b', ['G', 'A']), item('c', ['G'])];
    const paths = grouped(items, [items[0], items[2]])!;
    const g = paths.get('c')![1];
    expect([paths.get('a'), paths.get('c')]).toEqual([['G', g, 'A'], ['G', g]]);
    // (All of A picked is A: on its own, nothing to group.)
    expect(grouped(items, [items[0], items[1]])).toBeNull();
    expect(grouped([...items, item('d')], [items[0], item('d')])).not.toBeNull();
  });

  it('copies in groups of their own, the same for all copied from one', () => {
    const fresh = copyGroups([item('a', ['G', 'A']), item('b', ['G'])]);
    const a = fresh(['G', 'A'])!, b = fresh(['G'])!;
    expect(a[0]).toBe(b[0]);
    expect(a[0]).not.toBe('G');
    expect(fresh(undefined)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { Item, Link } from '../src/model/types';
import { syncOps } from '../src/model/components';

const item = (id: string, x: number, y: number, extra: Partial<Item> = {}): Item => ({ id, type: 'sticky', x, y, w: 100, h: 100, z: 1, ...extra });
/** The board after the ops, as items by id. */
const apply = (items: Item[], links: Link[] = []) => {
  const ops = syncOps(items, links), by = new Map(items.map((i) => [i.id, { ...i }]));
  ops.add.forEach((i) => by.set(i.id, i));
  ops.change.forEach((p, id) => { const it = by.get(id)! as unknown as Record<string, unknown>; for (const [k, v] of Object.entries(p)) { if (v === undefined) delete it[k]; else it[k] = v; } });
  ops.remove.forEach((id) => by.delete(id));
  return { by, ops };
};

describe('components and their instances', () => {
  const comp = item('c', 0, 0, { type: 'frame', w: 300, h: 200, comp: true, members: ['a', 'b'], text: 'Кнопка' });
  const a = item('a', 20, 20, { text: 'Привет', color: 'yellow' }), b = item('b', 150, 20, { type: 'rect' });
  const inst = item('i', 500, 100, { type: 'frame', w: 10, h: 10, inst: 'c', members: [] });

  it('an instance gets a copy of all in its component, as far from it as the instance is', () => {
    const { by } = apply([comp, a, b, inst]);
    expect(by.get('i')).toMatchObject({ w: 300, h: 200, text: 'Кнопка', members: ['i~a', 'i~b'] });
    expect(by.get('i~a')).toMatchObject({ x: 520, y: 120, text: 'Привет', from: 'a', host: 'i' });
    expect(by.get('i~b')).toMatchObject({ x: 650, y: 120, type: 'rect' });
  });

  it('in step, nothing to do', () => {
    const { by } = apply([comp, a, b, inst]);
    const ops = syncOps([...by.values()], []);
    expect(ops.add.length + ops.change.size + ops.remove.length).toBe(0);
  });

  it('a change to the component reaches the copies, but not what was changed on a copy', () => {
    const { by } = apply([comp, a, b, inst]);
    by.set('i~a', { ...by.get('i~a')!, text: 'Своё', ovr: ['text'] });
    const after = apply([...by.values()].map((i) => (i.id === 'a' ? { ...i, text: 'Новое', color: 'pink', x: 30 } : i))).by;
    expect(after.get('i~a')).toMatchObject({ text: 'Своё', color: 'pink', x: 530 });
  });

  it('what\'s taken out of the component goes from its instances, what\'s put in comes', () => {
    const { by } = apply([comp, a, b, inst]);
    const c2 = { ...comp, members: ['a', 'n'] }, n = item('n', 40, 120);
    const after = apply([...by.values()].filter((i) => i.id !== 'c').concat([c2, n])).by;
    expect(after.has('i~b')).toBe(false);
    expect(after.get('i~n')).toMatchObject({ x: 540, y: 220 });
    expect(after.get('i')?.members).toEqual(['i~a', 'i~n']);
  });

  it('a mind map\'s branches and the links inside come along, pointing at the copies', () => {
    const r = item('r', 20, 20, { type: 'mind' }), k = item('k', 150, 20, { type: 'mind', parent: 'r' });
    const c2 = { ...comp, members: ['r'] }, l: Link = { id: 'L', from: 'r', to: 'k' };
    const { by, ops } = apply([c2, r, k, inst], [l]);
    expect(by.get('i~k')).toMatchObject({ parent: 'i~r', x: 650 });
    expect(ops.addLinks).toEqual([{ id: 'i~L', from: 'i~r', to: 'i~k' }]);
  });

  it('with its component gone, an instance is left an ordinary frame', () => {
    const { by } = apply([comp, a, b, inst]);
    const after = apply([...by.values()].filter((i) => i.id !== 'c')).by;
    expect(after.get('i')?.inst).toBeUndefined();
    expect(after.get('i~a')?.host).toBeUndefined();
  });

  it('an instance\'s copies go with it', () => {
    const { by } = apply([comp, a, b, inst]);
    const after = apply([...by.values()].filter((i) => i.id !== 'i')).by;
    expect([...after.keys()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('an instance put inside its own component makes no copies of itself', () => {
    const c2 = { ...comp, members: ['a', 'i'] };
    const { by } = apply([c2, a, inst]);
    expect([...by.keys()].filter((k) => k.includes('~'))).toEqual([]);
  });
});

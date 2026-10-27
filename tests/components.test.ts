import { describe, expect, it } from 'vitest';
import type { Item, Link } from '../src/model/types';
import { syncOps } from '../src/model/components';
import { copiesOf } from '../src/editor/copies';

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

  it('a folded component\'s instances keep its size unfolded', () => {
    const folded = { ...comp, w: 200, h: 72, fold: { w: 300, h: 200 } };
    expect(apply([folded, a, b, inst]).by.get('i')).toMatchObject({ w: 300, h: 200 });
  });

  it('a detached instance\'s copies of links stay, its own now', () => {
    const r = item('r', 20, 20), k = item('k', 150, 20), c2 = { ...comp, members: ['r', 'k'] }, l: Link = { id: 'L', from: 'r', to: 'k' };
    const { by, ops } = apply([c2, r, k, inst], [l]);
    const loose = [...by.values()].map((i) => (i.id === 'i' ? { ...i, inst: undefined } : i.host ? { ...i, host: undefined, from: undefined } : i));
    expect(syncOps(loose, [l, ...ops.addLinks]).removeLinks).toEqual([]);
  });
});

describe('copies of instances', () => {
  const comp = item('c', 0, 0, { type: 'frame', w: 300, h: 200, comp: true, members: ['a'], text: 'Кнопка' });
  const a = item('a', 20, 20, { text: 'Привет', color: 'yellow' });
  const inst = item('i', 500, 100, { type: 'frame', w: 300, h: 200, inst: 'c', members: ['i~a'] });
  const copy = item('i~a', 520, 120, { text: 'Привет', color: 'blue', from: 'a', host: 'i', ovr: ['color'] });

  it('a copied instance keeps what was changed in it, under its new id, and sync leaves it be', () => {
    const { items, map } = copiesOf([inst, copy], [], 30, 5);
    const ni = map.get('i')!, nc = items.find((x) => x.id !== ni)!;
    expect(nc.id).toBe(`${ni}~a`);
    expect(nc).toMatchObject({ host: ni, from: 'a', ovr: ['color'], color: 'blue', x: 550 });
    expect(items.find((x) => x.id === ni)!.members).toEqual([`${ni}~a`]);
    const { ops } = apply([comp, a, inst, copy, ...items]);
    expect(ops.add).toEqual([]);
    expect(ops.remove).toEqual([]);
    expect(ops.change.get(nc.id)?.color).toBeUndefined();
  });

  it('a copy taken without its instance becomes an item of its own', () => {
    const [it] = copiesOf([copy], [], 30, 5).items;
    expect(it.id).not.toContain('~');
    expect(it.host ?? it.from ?? it.ovr).toBeUndefined();
    expect(apply([comp, a, inst, copy, it]).ops.remove).toEqual([]);
  });
});

describe('a stretched instance', () => {
  // A card 300×200 with a background over all of it, a badge in the top right corner, a title in the
  // middle of the top and a button in the bottom left.
  const comp = item('c', 0, 0, { type: 'frame', w: 300, h: 200, comp: true, members: ['bg', 'badge', 'title', 'btn'] });
  const bg = item('bg', 0, 0, { type: 'rect', w: 300, h: 200 });
  const badge = item('badge', 260, 10, { type: 'emoji', w: 30, h: 30 });
  const title = item('title', 100, 10, { type: 'text', w: 100, h: 30, ta: 'center' });
  const btn = item('btn', 10, 160, { type: 'rect', w: 80, h: 30 });
  const inst = item('i', 1000, 0, { type: 'frame', w: 300, h: 200, inst: 'c', members: [], grow: { w: 100, h: 60 } });

  it('stretches what takes most of it, and keeps the rest to their corners and sides', () => {
    const { by } = apply([comp, bg, badge, title, btn, inst]);
    const at = (id: string) => { const c = by.get(`i~${id}`)!; return [c.x - 1000, c.y, c.w, c.h]; };
    expect(at('bg')).toEqual([0, 0, 400, 260]);
    expect(at('badge')).toEqual([360, 10, 30, 30]);
    expect(at('title')).toEqual([150, 10, 100, 30]);
    expect(at('btn')).toEqual([10, 220, 80, 30]);
    expect([by.get('i')!.w, by.get('i')!.h]).toEqual([400, 260]);
  });

  it('keeps wide text in the top left corner to its left, and stretches a wide bar across only', () => {
    const note = item('note', 20, 20, { type: 'text', w: 220, h: 20 }), bar = item('bar', 10, 120, { type: 'rect', w: 280, h: 20 });
    const c = { ...comp, members: ['bg', 'note', 'bar'] };
    const { by } = apply([c, bg, note, bar, inst]);
    const at = (id: string) => { const x = by.get(`i~${id}`)!; return [x.x - 1000, x.y, x.w, x.h]; };
    expect(at('note')).toEqual([20, 20, 220, 20]);
    expect(at('bar')).toEqual([10, 150, 380, 20]);
  });
});

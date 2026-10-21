import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Board } from '../src/model/board';
import type { Item } from '../src/model/types';

const sticky = (id: string, extra: Partial<Item> = {}): Item =>
  ({ id, type: 'sticky', x: 0, y: 0, w: 160, h: 160, z: 1, text: id, color: 'yellow', fs: 16, ...extra });

/** Two boards wired together the way the sync server would. */
function pair() {
  const a = new Board(), b = new Board();
  a.doc.on('update', (u: Uint8Array, origin: unknown) => { if (origin !== 'remote') Y.applyUpdate(b.doc, u, 'remote'); });
  b.doc.on('update', (u: Uint8Array, origin: unknown) => { if (origin !== 'remote') Y.applyUpdate(a.doc, u, 'remote'); });
  return [a, b] as const;
}

describe('Board', () => {
  it('adds, updates and lists items by stacking order', () => {
    const b = new Board();
    b.add(sticky('top', { z: 5 }));
    b.add(sticky('bottom', { z: 1 }));
    b.update('top', { x: 40, color: 'pink' });
    expect(b.list().map((i) => i.id)).toEqual(['bottom', 'top']);
    expect(b.get('top')).toMatchObject({ x: 40, color: 'pink' });
  });

  it('removes links whose ends are deleted', () => {
    const b = new Board();
    b.add(sticky('a'));
    b.add(sticky('b'));
    b.addLink({ id: 'l', from: 'a', to: 'b' });
    b.remove(['a']);
    expect(b.linkList()).toEqual([]);
    expect(b.links.size).toBe(0);
  });

  it('keeps the sides of a curved link and syncs them', () => {
    const [a, b] = pair();
    a.add(sticky('x'));
    a.add(sticky('y'));
    a.addLink({ id: 'c', from: 'x', to: 'y', fromSide: 'right', toSide: 'left' });
    a.addLink({ id: 's', from: 'y', to: 'x' });
    expect(b.getLink('c')).toEqual({ id: 'c', from: 'x', to: 'y', fromSide: 'right', toSide: 'left' });
    expect(b.getLink('s')).toEqual({ id: 's', from: 'y', to: 'x' });
  });

  it('merges different fields changed by two people at once', () => {
    const [a, b] = pair();
    a.add(sticky('s'));
    // Both edit before hearing from each other.
    const ua: Uint8Array[] = [], ub: Uint8Array[] = [];
    const left = new Board(), right = new Board();
    Y.applyUpdate(left.doc, Y.encodeStateAsUpdate(a.doc));
    Y.applyUpdate(right.doc, Y.encodeStateAsUpdate(b.doc));
    left.doc.on('update', (u: Uint8Array) => ua.push(u));
    right.doc.on('update', (u: Uint8Array) => ub.push(u));
    left.update('s', { x: 300 });
    right.update('s', { color: 'green' });
    ub.forEach((u) => Y.applyUpdate(left.doc, u));
    ua.forEach((u) => Y.applyUpdate(right.doc, u));
    expect(left.get('s')).toMatchObject({ x: 300, color: 'green' });
    expect(right.get('s')).toEqual(left.get('s'));
  });

  it('undoes only your own changes', () => {
    const [a, b] = pair();
    a.add(sticky('mine'));
    b.add(sticky('theirs'));
    a.undo();
    expect(a.get('mine')).toBeUndefined();
    expect(a.get('theirs')).toBeDefined();
    expect(b.get('mine')).toBeUndefined();
  });

  it('turns a whole drag into one undo step', () => {
    const b = new Board();
    b.add(sticky('s'));
    b.beginGesture();
    for (let x = 1; x <= 20; x++) b.update('s', { x });
    b.endGesture();
    expect(b.get('s')!.x).toBe(20);
    b.undo();
    expect(b.get('s')!.x).toBe(0);
    b.redo();
    expect(b.get('s')!.x).toBe(20);
  });
});

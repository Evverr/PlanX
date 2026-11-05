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

describe('a change for good', () => {
  it('is not undone, and what it replaced is gone from what\'s stored; undoing what came before leaves it', () => {
    const b = new Board();
    const it = { id: 'p', type: 'image', x: 0, y: 0, w: 100, h: 100, z: 1, src: 'ORIGINALPICTURE' } as never;
    b.add(it);
    b.undoManager.stopCapturing();
    b.update('p', { x: 50 });
    b.undoManager.stopCapturing();
    b.updateForGood('p', { src: 'CUTPICTURE', w: 60 });
    const stored = new TextDecoder('latin1').decode(Y.encodeStateAsUpdate(b.doc));
    expect(stored).toContain('CUTPICTURE');
    expect(stored).not.toContain('ORIGINALPICTURE');
    b.undoManager.undo();
    expect(b.get('p')?.src).toBe('CUTPICTURE');
    expect(b.get('p')?.w).toBe(60);
    expect(b.get('p')?.x).toBe(0);
    // Undone as far as it goes and back: what's cut stays cut.
    b.undoManager.undo();
    expect(b.get('p')).toBeUndefined();
    b.undoManager.redo();
    expect(b.get('p')?.src).toBe('CUTPICTURE');
  });
});

describe('Board', () => {
  it('adds, updates and lists items by stacking order', () => {
    const b = new Board();
    b.add(sticky('top', { z: 5 }));
    b.add(sticky('bottom', { z: 1 }));
    b.update('top', { x: 40, color: 'pink' });
    expect(b.list().map((i) => i.id)).toEqual(['bottom', 'top']);
    expect(b.get('top')).toMatchObject({ x: 40, color: 'pink' });
  });

  it('numbers the items of a kind as they come, the first without a number, a copy too', () => {
    const b = new Board();
    b.add(sticky('a'));
    b.add(sticky('b'));
    b.add({ ...sticky('c'), type: 'rect' });
    b.transact(() => { b.add(sticky('d')); b.add({ ...b.get('b')!, id: 'e' }); });
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => b.get(id)!.nm)).toEqual([undefined, 1, undefined, 2, 3]);
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

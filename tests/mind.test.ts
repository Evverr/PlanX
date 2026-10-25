import { describe, expect, it } from 'vitest';
import { addChild, balance, branchCurve, buttonKey, canMoveTo, childPlace, descendants, foldBadge, foldedAway, folding, insertBeside, makeRoom, mindButtons, mindDepth, moveBranch, type Way } from '../src/model/mind';
import type { Item } from '../src/model/types';

const node = (id: string, x: number, y: number, extra: Partial<Item> = {}): Item =>
  ({ id, type: 'mind', x, y, w: 100, h: 40, z: 0, ...extra });

describe('mind map', () => {
  const root = node('r', 0, 0);
  const a = node('a', 160, -60, { parent: 'r' });
  const a1 = node('a1', 320, -60, { parent: 'a' });
  const b = node('b', -260, 0, { parent: 'r' });
  const items = [root, a, a1, b];
  const get = (id: string) => items.find((i) => i.id === id);

  it('knows how deep a node is', () => {
    expect(mindDepth(a1, get)).toBe(2);
  });

  it('centres the branches on a side around their node', () => {
    // A second branch on the right under a: the two stack 16 apart, centred on the root's middle (20).
    const a2 = node('a2', 160, 40, { parent: 'r' });
    const moves = balance('a2', [...items, a2]);
    expect(moves.get('a')?.y).toBe(-28);
    expect(moves.get('a1')?.y).toBe(-28);
    expect(moves.get('a2')?.y).toBe(28);
    expect(moves.has('b')).toBe(false);
  });

  it('moves a branch to another node, over to its side', () => {
    expect(canMoveTo('a1', 'b', items)).toBe(true);
    expect(canMoveTo('a', 'a1', items)).toBe(false);  // not under its own branch
    expect(canMoveTo('r', 'b', items)).toBe(false);   // the centre stays the centre
    // b grows left of the centre, so a1 goes to its left, level with it.
    expect(moveBranch('a1', 'b', items, 1).get('a1')).toEqual({ x: -420, y: 0 });
  });

  it('puts a node above or below another without moving it, the others making room', () => {
    const a2 = node('a2', 160, 0, { parent: 'r' }), x = node('x', 160, 0, { parent: 'r' });
    const all = [...items, a2, x];
    // Below a (at -60): x goes 16 under it, a2 (further down) moves down by x's height and a gap.
    const below = insertBeside('x', 'a', 'below', all);
    expect(below.get('x')?.y).toBe(-4);
    expect(below.get('a2')?.y).toBe(56);
    expect(below.has('a')).toBe(false);
    // Above a2: x goes over it, and a with its branch moves up instead.
    const above = insertBeside('x', 'a2', 'above', all);
    expect(above.get('x')?.y).toBe(-56);
    expect(above.get('a')?.y).toBe(-116);
    expect(above.get('a1')?.y).toBe(-116);
  });

  it('moves the branches of the same parent below a node that grows as it is typed in', () => {
    const a2 = node('a2', 160, 0, { parent: 'r' }), a3 = node('a3', 320, 40, { parent: 'a2' });
    // a1 grows: nothing else hangs from a, so nothing moves (a2, a level up, stays put).
    expect(makeRoom('a1', 0, 20, [...items, a2, a3]).size).toBe(0);
    const moves = makeRoom('a', 0, 20, [...items, a2, a3]);
    expect(moves.get('a2')?.y).toBe(20);
    expect(moves.get('a3')?.y).toBe(60);
    expect(moves.has('a')).toBe(false);
    expect(moves.has('b')).toBe(false);  // on the other side of the centre
  });

  it('finds everything branching from a node', () => {
    expect(descendants(['r'], items).sort()).toEqual(['a', 'a1', 'b']);
    expect(descendants(['a'], items)).toEqual(['a1']);
  });

  it('puts a new child beside its parent, on its side of the centre, under the last one', () => {
    expect(childPlace(a, items, get, 100, 40)).toEqual({ x: 320, y: -4 });
    expect(childPlace(b, items, get, 100, 40)).toEqual({ x: -420, y: 0 });
    expect(childPlace(root, items, get, 100, 40)).toEqual({ x: 160, y: -4 });
  });
});

describe('mind map: adding keeps the levels further in still', () => {
  const n = (id: string, x: number, y: number, parent?: string): Item => node(id, x, y, parent ? { parent } : {});
  // A central topic with three branches, each with branches of its own.
  const base = () => [n('r', 0, 28), n('A', 200, 0, 'r'), n('B', 200, 56, 'r'), n('C', 200, -56, 'r'),
    n('a1', 400, 0, 'A'), n('b1', 400, 56, 'B'), n('b2', 400, 112, 'B'), n('c1', 400, -56, 'C')];
  const still = (moves: Map<string, unknown>) => ['r', 'A', 'B', 'C'].forEach((id) => expect(moves.has(id)).toBe(false));

  it('a new branch re-centres its own level, pushing the same level of other parents away', () => {
    const moves = addChild('a2', [...base(), n('a2', 400, 56, 'A')]);
    still(moves);
    expect(moves.get('a1')?.y).toBe(-28);
    expect(moves.get('a2')?.y).toBe(28);
    // B's and C's branches make way, as far as it takes.
    expect(moves.get('b1')?.y).toBe(84);
    expect(moves.get('c1')?.y).toBe(-84);
  });

  it('a branch put beside another moves only that level', () => {
    const moves = insertBeside('a2', 'a1', 'below', [...base(), n('a2', 400, 56, 'A')]);
    still(moves);
    // The new one right under a1 (where it was put), B's branches out of its way.
    expect(moves.get('a2')?.y ?? 56).toBe(56);
    expect(moves.get('b1')?.y).toBe(112);
  });

  it('a node growing as it is typed in pushes its level only', () => {
    const moves = makeRoom('a1', 0, 30, base().map((i) => (i.id === 'a1' ? { ...i, h: 70 } : i)));
    still(moves);
    expect(moves.get('b1')?.y).toBe(86);
  });
});

describe('mind map: branches led down from the central topic', () => {
  // The central topic (100 × 40 at 0, 0), two branches led down, one with a branch of its own.
  const r = node('r', 0, 0), d1 = node('d1', -62, 88, { parent: 'r', down: true }), d2 = node('d2', 62, 88, { parent: 'r', down: true });
  const d11 = node('d11', -62, 176, { parent: 'd1', down: true });
  const all = [r, d1, d2, d11];
  const get = (id: string) => all.find((i) => i.id === id);

  it('the central topic has a "+" on each side: right, left, below and above', () => {
    expect(mindButtons(r, get, 1).map((b) => [b.kind, b.x, b.y])).toEqual([['child', 111, 20], ['left', -11, 20], ['down', 50, 51], ['up', 50, -11]]);
    const kinds = Object.fromEntries(mindButtons(d1, get, 1).map((b) => [b.kind, [b.x, b.y]]));
    // Under its parent: its own branch below, the parallel ones left and right, the arrow on top.
    expect(kinds.child).toEqual([-12, 139]);
    expect(kinds.above).toEqual([-73, 108]);
    expect(kinds.below).toEqual([49, 108]);
    expect(kinds.move).toEqual([-12, 77]);
  });

  it('a first branch led down goes under the topic, centred', () => {
    expect(childPlace(r, [r], (id) => (id === 'r' ? r : undefined), 100, 40, 'down')).toEqual({ x: 0, y: 88 });
  });

  it('branches under a node stand side by side, centred on it', () => {
    const d3 = node('d3', 186, 88, { parent: 'r', down: true });
    const moves = addChild('d3', [...all, d3]);
    // Three of them, 24 apart: 348 across, centred on the topic's middle (50).
    expect(moves.get('d1')).toEqual({ x: -124, y: 88 });
    expect(moves.get('d11')).toEqual({ x: -124, y: 176 });
    expect(moves.get('d2')).toEqual({ x: 0, y: 88 });
    expect(moves.get('d3')).toEqual({ x: 124, y: 88 });
    expect(moves.has('r')).toBe(false);
  });

  it('a parallel branch under a node goes to its right (or left), level with it', () => {
    const x = node('x', 0, 0, { parent: 'r', down: true });
    const moves = insertBeside('x', 'd1', 'below', [...all, x]);
    expect(moves.get('x')).toEqual({ x: 62, y: 88 });
    expect(moves.get('d2')).toEqual({ x: 186, y: 88 });
    expect(moves.has('d1')).toBe(false);
  });

  it('a branch under its parent growing as it is typed in moves those after it, and its own down', () => {
    const moves = makeRoom('d1', 20, 10, all.map((i) => (i.id === 'd1' ? { ...i, w: 120, h: 50 } : i)));
    expect(moves.get('d2')).toEqual({ x: 82, y: 88 });
    expect(moves.get('d11')).toEqual({ x: -62, y: 186 });
  });

  it('the line to a branch under its parent runs down from the parent\'s bottom to its top', () => {
    const [a, , , b] = branchCurve(r, d1);
    expect(a).toEqual({ x: 50, y: 40 });
    expect(b).toEqual({ x: -12, y: 88 });
  });

  it('a branch moved from beside the topic to under it is laid out downwards, all of it', () => {
    const a = node('a', 160, 0, { parent: 'r' }), a1 = node('a1', 320, 0, { parent: 'a' });
    const moves = moveBranch('a', 'r', [r, a, a1], 'down');
    expect(moves.get('a')).toEqual({ x: 0, y: 88, down: true });
    expect(moves.get('a1')).toEqual({ x: 0, y: 176, down: true });
  });
});

describe('mind map: folding a node\'s branches away', () => {
  const r = node('r', 0, 0), a = node('a', 160, 0, { parent: 'r' }), l = node('l', -160, 0, { parent: 'r' }), d = node('d', 0, 88, { parent: 'r', down: true });
  const all = [r, a, l, d];
  const get = (id: string) => all.find((i) => i.id === id);

  it('a node with branches has a chevron past its "+" for a branch, folding them; folded, or with them only just got, none', () => {
    const kinds = (it: Item, ways: Way[]) => mindButtons(it, get, 1, ways).map((b) => b.kind);
    expect(kinds(a, [])).toEqual(['child', 'above', 'below', 'move']);
    expect(kinds(a, ['right'])).toEqual(['child', 'fold', 'above', 'below', 'move']);
    expect(kinds({ ...a, collapsed: true }, ['right'])).toEqual(['child', 'above', 'below', 'move']);
    expect(mindButtons(a, get, 1, ['right'], 'right').map((b) => b.kind)).toEqual(['child', 'above', 'below', 'move']);
    // The chevron 22 past the "+".
    const at = (it: Item) => mindButtons(it, get, 1, ['right']).filter((b) => b.kind === 'child' || b.kind === 'fold').map((b) => [b.x, b.y]);
    expect(at(a)).toEqual([[271, 20], [293, 20]]);
    expect(at(l)).toEqual([[-171, 20], [-193, 20]]);
    expect(at(d)).toEqual([[50, 139], [50, 161]]);
  });

  it('the central topic has a chevron each way it has branches, folding that way on its own', () => {
    const folded = { ...r, foldedWays: ['left' as const] };
    expect(mindButtons(folded, get, 1, ['right', 'left']).map(buttonKey)).toEqual(['child', 'fold:right', 'left', 'down', 'up']);
    expect([...foldedAway(folded, all, get)]).toEqual([['left', ['l']]]);
    expect(folding(folded, 'down', true)).toEqual({ foldedWays: ['left', 'down'] });
    expect(folding(folded, 'left', false)).toEqual({ foldedWays: undefined });
    // Another node folds all its branches at once.
    expect(folding(a, 'right', true)).toEqual({ collapsed: true });
  });

  it('a folded node\'s count sits where its chevron was, coming in from past it', () => {
    expect(foldBadge(a, 'right', 1, 3)).toEqual({ x: 293, y: 20, w: 18, h: 18 });
    expect(foldBadge(l, 'left', 1, 3)).toEqual({ x: -193, y: 20, w: 18, h: 18 });
    expect(foldBadge(d, 'down', 1, 3)).toEqual({ x: 50, y: 161, w: 18, h: 18 });
    expect(foldBadge(a, 'right', 1, 3, 1)).toEqual({ x: 315, y: 20, w: 18, h: 18 });
    // A wider one keeps its near end there.
    expect(foldBadge(a, 'right', 1, 120)).toEqual({ x: 298, y: 20, w: 28, h: 18 });
    expect(foldBadge(d, 'down', 1, 120)).toEqual({ x: 50, y: 161, w: 28, h: 18 });
    // In screen pixels whatever the zoom.
    expect(foldBadge(a, 'right', 2, 3)).toEqual({ x: 276.5, y: 20, w: 9, h: 9 });
  });
});

describe('mind map: branches led up from the central topic', () => {
  // The central topic (100 × 40 at 0, 0), two branches led up, one with a branch of its own.
  const r = node('r', 0, 0), u1 = node('u1', -62, -88, { parent: 'r', up: true }), u2 = node('u2', 62, -88, { parent: 'r', up: true });
  const u11 = node('u11', -62, -176, { parent: 'u1', up: true });
  const all = [r, u1, u2, u11];
  const get = (id: string) => all.find((i) => i.id === id);

  it('a first branch led up goes over the topic, centred', () => {
    expect(childPlace(r, [r], (id) => (id === 'r' ? r : undefined), 100, 40, 'up')).toEqual({ x: 0, y: -88 });
  });

  it('branches over a node stand side by side, centred on it', () => {
    const u3 = node('u3', 186, -88, { parent: 'r', up: true });
    const moves = addChild('u3', [...all, u3]);
    expect(moves.get('u1')).toEqual({ x: -124, y: -88 });
    expect(moves.get('u11')).toEqual({ x: -124, y: -176 });
    expect(moves.get('u3')).toEqual({ x: 124, y: -88 });
  });

  it('its buttons: its own branch above, the parallel ones left and right, the arrow under it', () => {
    const kinds = Object.fromEntries(mindButtons(u1, get, 1).map((b) => [b.kind, [b.x, b.y]]));
    expect(kinds.child).toEqual([-12, -99]);
    expect(kinds.above).toEqual([-73, -68]);
    expect(kinds.below).toEqual([49, -68]);
    expect(kinds.move).toEqual([-12, -37]);
  });

  it('a parallel branch over a node lines up with its lower edge', () => {
    const x = node('x', 0, 0, { parent: 'r', up: true, h: 30 });
    const moves = insertBeside('x', 'u1', 'below', [...all, x]);
    expect(moves.get('x')).toEqual({ x: 62, y: -78 });
    expect(moves.get('u2')).toEqual({ x: 186, y: -88 });
  });

  it('one growing taller as it is typed in moves what grows from it up', () => {
    const moves = makeRoom('u1', 0, 10, all.map((i) => (i.id === 'u1' ? { ...i, y: -98, h: 50 } : i)));
    expect(moves.get('u11')).toEqual({ x: -62, y: -186 });
  });

  it('the line to a branch over its parent runs up from the parent\'s top to its bottom', () => {
    const [a, , , b] = branchCurve(r, u1);
    expect(a).toEqual({ x: 50, y: 0 });
    expect(b).toEqual({ x: -12, y: -48 });
  });

  it('a branch moved from under the topic to over it is laid out upwards, all of it', () => {
    const d = node('d', 0, 88, { parent: 'r', down: true }), d1 = node('d1', 0, 176, { parent: 'd', down: true });
    const moves = moveBranch('d', 'r', [r, d, d1], 'up');
    expect(moves.get('d')).toEqual({ x: 0, y: -88, down: undefined, up: true });
    expect(moves.get('d1')).toEqual({ x: 0, y: -176, down: undefined, up: true });
  });
});

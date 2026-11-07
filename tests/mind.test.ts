import { describe, expect, it } from 'vitest';
import { addChild, balance, branchCurve, branchBase, buttonKey, canMoveTo, childPlace, descendants, foldBadge, foldedAway, folding, insertBeside, makeRoom, tidyBranches, mindButtons, mindDepth, moveBranch, siblingOf } from '../src/model/mind';
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

  it('on the left of its parent, lines branches up by their left edges, the widest the gap off it', () => {
    const r = node('r', 0, 0), b = node('b', -160, 0, { parent: 'r' }), b1 = node('b1', -320, 0, { parent: 'b' });
    const get = (id: string) => [r, b, b1].find((i) => i.id === id);
    // A wider one (160) goes the gap off the centre; b, and what grows from it, level with its left edge.
    const at = childPlace(r, [r, b, b1], get, 160, 40, -1);
    expect(at.x).toBe(-220);
    const c = node('c', at.x, at.y, { parent: 'r', w: 160 }), added = addChild('c', [r, b, b1, c]);
    expect(added.get('b')?.x).toBe(-220);
    expect(added.get('b1')?.x).toBe(-380);
    // b typed wider than c (keeping its left edge): the row goes out to stay level, its branch with it.
    const grown = makeRoom('b', 100, 0, [r, { ...b, x: -220, w: 200 }, { ...b1, x: -380 }, { ...c, ...added.get('c') }]);
    expect(grown.get('b')?.x).toBe(-260);
    expect(grown.get('c')?.x).toBe(-260);
    expect(grown.get('b1')?.x).toBe(-420);
    // Laid out afresh, the same.
    const tidy = tidyBranches('r', [r, { ...b, x: -500, w: 200 }, { ...b1, x: -1000 }, { ...c, x: -900 }]);
    expect([tidy.get('b')?.x, tidy.get('c')?.x, tidy.get('b1')?.x]).toEqual([-260, -260, -420]);
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
    // B's and C's branches make way, as far as it takes: a node's height off a's (a2's).
    expect(moves.get('b1')?.y).toBe(108);
    expect(moves.get('c1')?.y).toBe(-108);
  });

  it('a branch put beside another moves only that level', () => {
    const moves = insertBeside('a2', 'a1', 'below', [...base(), n('a2', 400, 56, 'A')]);
    still(moves);
    // The new one right under a1 (where it was put), B's branches out of its way.
    expect(moves.get('a2')?.y ?? 56).toBe(56);
    expect(moves.get('b1')?.y).toBe(136);
  });

  it('a node growing as it is typed in pushes its level only', () => {
    const moves = makeRoom('a1', 0, 30, base().map((i) => (i.id === 'a1' ? { ...i, h: 70 } : i)));
    still(moves);
    expect(moves.get('b1')?.y).toBe(110);
  });
});

describe('mind map: branches led down from the central topic', () => {
  // The central topic (100 × 40 at 0, 0), two branches led down, one with a branch of its own.
  const r = node('r', 0, 0), d1 = node('d1', -62, 88, { parent: 'r', down: true }), d2 = node('d2', 62, 88, { parent: 'r', down: true });
  const d11 = node('d11', -62, 176, { parent: 'd1', down: true });
  const all = [r, d1, d2, d11];
  const get = (id: string) => all.find((i) => i.id === id);

  it('the central topic has a "+" each way it grows (all four set: right, left, below and above)', () => {
    expect(mindButtons({ ...r, mw: ['right', 'left', 'down', 'up'] }, get, 1).map((b) => [b.kind, b.x, b.y])).toEqual([['child', 111, 20], ['left', -11, 20], ['down', 50, 51], ['up', 50, -11]]);
    const kinds = Object.fromEntries(mindButtons(d1, get, 1).map((b) => [b.kind, [b.x, b.y]]));
    // Under its parent: its own branch below, the next one right of it (as a table's "+"), no more.
    expect(kinds.child).toEqual([-12, 139]);
    expect(kinds.below).toEqual([49, 108]);
    expect(Object.keys(kinds).join()).toBe('child,below');
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
    // Still centred under it, and down with its lower edge.
    expect(moves.get('d11')).toEqual({ x: -52, y: 186 });
  });

  it('the line to a branch under the central topic runs down from its middle (under it) to the branch\'s top', () => {
    const [a, , , b] = branchCurve(r, d1);
    expect(a).toEqual({ x: 50, y: 20 });
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

  it('a node\'s "+" for a branch 11 out from its side; its branches folded by the ring where they leave it', () => {
    expect(mindButtons(a, get, 1).map((b) => b.kind)).toEqual(['child', 'below']);
    const at = (it: Item) => mindButtons(it, get, 1).filter((b) => b.kind === 'child').map((b) => [b.x, b.y]);
    expect(at(a)).toEqual([[271, 20]]);
    expect(at(l)).toEqual([[-171, 20]]);
    expect(at(d)).toEqual([[50, 139]]);
    // 2 past halfway along the straight start of its branches, 16 long.
    expect([branchBase(a, 'right'), branchBase(d, 'down')]).toEqual([{ x: 270, y: 20 }, { x: 50, y: 138 }]);
    expect(branchCurve(a, node('aa', 360, 0, { parent: 'a' }))[0]).toEqual({ x: 276, y: 20 });
  });

  it('the central topic grows the ways it\'s set to (right and left unless set), each folding on its own', () => {
    const folded = { ...r, foldedWays: ['left' as const] };
    expect(mindButtons(folded, get, 1).map(buttonKey)).toEqual(['child', 'left']);
    expect(mindButtons({ ...r, mw: ['right', 'left', 'down', 'up'] }, get, 1).map(buttonKey)).toEqual(['child', 'left', 'down', 'up']);
    expect([...foldedAway(folded, all, get)]).toEqual([['left', ['l']]]);
    expect(folding(folded, 'down', true)).toEqual({ foldedWays: ['left', 'down'] });
    expect(folding(folded, 'left', false)).toEqual({ foldedWays: undefined });
    // Another node folds all its branches at once.
    expect(folding(a, 'right', true)).toEqual({ collapsed: true });
  });

  it('a folded node\'s count sits 4 off it where its "+" for a branch is, out in the chevron\'s place while its buttons show', () => {
    expect(foldBadge(a, 'right', 1, 3)).toEqual({ x: 273, y: 20, w: 18, h: 18 });
    expect(foldBadge(l, 'left', 1, 3)).toEqual({ x: -173, y: 20, w: 18, h: 18 });
    expect(foldBadge(d, 'down', 1, 3)).toEqual({ x: 50, y: 141, w: 18, h: 18 });
    expect(foldBadge(a, 'right', 1, 3, 1)).toEqual({ x: 293, y: 20, w: 18, h: 18 });
    // A wider one keeps its near end there.
    expect(foldBadge(a, 'right', 1, 120)).toEqual({ x: 278, y: 20, w: 28, h: 18 });
    expect(foldBadge(d, 'down', 1, 120)).toEqual({ x: 50, y: 141, w: 28, h: 18 });
    // In screen pixels whatever the zoom.
    expect(foldBadge(a, 'right', 2, 3)).toEqual({ x: 266.5, y: 20, w: 9, h: 9 });
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

  it('its buttons: its own branch above, the next one right of it', () => {
    const kinds = Object.fromEntries(mindButtons(u1, get, 1).map((b) => [b.kind, [b.x, b.y]]));
    expect(kinds.child).toEqual([-12, -99]);
    expect(kinds.below).toEqual([49, -68]);
    expect(Object.keys(kinds).join()).toBe('child,below');
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

  it('the line to a branch over the central topic runs up from its middle (under it) to the branch\'s bottom', () => {
    const [a, , , b] = branchCurve(r, u1);
    expect(a).toEqual({ x: 50, y: 20 });
    expect(b).toEqual({ x: -12, y: -48 });
  });

  it('a branch moved from under the topic to over it is laid out upwards, all of it', () => {
    const d = node('d', 0, 88, { parent: 'r', down: true }), d1 = node('d1', 0, 176, { parent: 'd', down: true });
    const moves = moveBranch('d', 'r', [r, d, d1], 'up');
    expect(moves.get('d')).toEqual({ x: 0, y: -88, down: undefined, up: true });
    expect(moves.get('d1')).toEqual({ x: 0, y: -176, down: undefined, up: true });
  });
});

describe('mind map: going from branch to branch', () => {
  const r = node('r', 0, 0), a = node('a', 160, -56, { parent: 'r' }), b = node('b', 160, 0, { parent: 'r' }), c = node('c', 160, 56, { parent: 'r' });
  const l = node('l', -160, 0, { parent: 'r' }), all = [r, c, a, l, b];

  it('the next branch of the same parent growing the same way, top to bottom, round past the last', () => {
    expect(siblingOf('a', all)).toBe('b');
    expect(siblingOf('c', all)).toBe('a');
    expect(siblingOf('a', all, -1)).toBe('c');
  });

  it('none for a branch alone on its side, or the central topic', () => {
    expect(siblingOf('l', all)).toBe(null);
    expect(siblingOf('r', all)).toBe(null);
  });
});

describe('mind map: a node growing as it is typed in pushes what grows from it', () => {
  const r = node('r', 0, 0), a = node('a', 160, 0, { parent: 'r' }), a1 = node('a1', 320, 0, { parent: 'a' }), a11 = node('a11', 480, 0, { parent: 'a1' });
  const l = node('l', -160, 0, { parent: 'r' }), l1 = node('l1', -320, 0, { parent: 'l' }), d = node('d', 0, 88, { parent: 'r', down: true });

  it('wider, its next level and all past it move out by as much, keeping the gap', () => {
    const moves = makeRoom('a', 50, 0, [r, a, a1, a11].map((i) => (i.id === 'a' ? { ...i, w: 150 } : i)));
    expect(moves.get('a1')).toEqual({ x: 370, y: 0 });
    expect(moves.get('a11')).toEqual({ x: 530, y: 0 });
  });

  it('on the left it grows leftwards, and pushes them left', () => {
    const moves = makeRoom('l', 50, 0, [r, l, l1].map((i) => (i.id === 'l' ? { ...i, x: -210, w: 150 } : i)));
    expect(moves.get('l1')).toEqual({ x: -370, y: 0 });
  });

  it('taller, they stay centred on it', () => {
    expect(makeRoom('a', 0, 20, [r, a, a1].map((i) => (i.id === 'a' ? { ...i, h: 60 } : i))).get('a1')).toEqual({ x: 320, y: 10 });
  });

  it('the central topic pushes its branches on the right out, and those below down', () => {
    const moves = makeRoom('r', 40, 20, [r, a, a1, l, d].map((i) => (i.id === 'r' ? { ...i, w: 140, h: 60 } : i)));
    expect(moves.get('a')).toEqual({ x: 200, y: 10 });
    expect(moves.get('a1')).toEqual({ x: 360, y: 10 });
    expect(moves.get('l')).toEqual({ x: -160, y: 10 });
    expect(moves.get('d')).toEqual({ x: 20, y: 108 });
  });
});

describe('mind map: floors stand clear of the biggest branch next to them', () => {
  // A wide branch over a narrow one, both on the right of the topic.
  const r = node('r', 0, 0), a = node('a', 160, -28, { parent: 'r', w: 200 }), b = node('b', 160, 28, { parent: 'r' });

  it('a floor started from the narrow one goes out from the wide one, level with its', () => {
    const get = (id: string) => [r, a, b].find((i) => i.id === id);
    expect(childPlace(b, [r, a, b], get, 100, 40).x).toBe(420);
  });

  it('the wide one growing wider pushes out the narrow one\'s floor too', () => {
    const b1 = node('b1', 420, 28, { parent: 'b' }), a1 = node('a1', 420, -28, { parent: 'a' });
    const moves = makeRoom('a', 50, 0, [r, a, b, a1, b1].map((i) => (i.id === 'a' ? { ...i, w: 250 } : i)));
    expect(moves.get('a1')).toEqual({ x: 470, y: -28 });
    expect(moves.get('b1')).toEqual({ x: 470, y: 28 });
  });
});

describe('mind map: "Авторасположение" on a node', () => {
  it('lays out everything growing from it afresh, in the order it stands; the node stays put', () => {
    const items = [
      node('r', 0, 0),
      node('a', 230, 90, { parent: 'r' }), node('b', 170, -130, { parent: 'r' }), node('l', -300, 30, { parent: 'r' }),
      node('a1', 500, 200, { parent: 'a' }), node('a2', 400, 60, { parent: 'a', w: 180 }),
    ];
    const moves = tidyBranches('r', items), at = (id: string) => moves.get(id) ?? items.find((i) => i.id === id)!;
    expect(moves.has('r')).toBe(false);
    // On the right: b above a, 60 off the root, 16 apart whatever grows from them, centred on it; a's
    // own (a2 above a1, as they stood), a's alone on their level, 60 off a, 16 apart, centred on it.
    expect([at('b').x, at('a').x, at('l').x]).toEqual([160, 160, -160]);
    expect([at('b').y, at('a').y]).toEqual([-28, 28]);
    expect([at('a2').x, at('a1').x]).toEqual([320, 320]);
    expect(at('a1').y - at('a2').y).toBe(56);
    expect((at('a2').y + at('a1').y + 40) / 2).toBe(at('a').y + 20);
    expect(at('l').y).toBe(0);
  });
});

describe('mind map: "Авторасположение", branches with their own', () => {
  it('stand the gap apart, whatever grows from them; their branches, cousins, three node heights apart, centred as one on them', () => {
    const items = [node('r', 0, 0), node('a', 200, 0, { parent: 'r' }), node('b', 200, 60, { parent: 'r' }),
      ...[0, 1, 2].flatMap((i) => [node(`a${i}`, 400, i * 50, { parent: 'a' }), node(`b${i}`, 400, 200 + i * 50, { parent: 'b' })])];
    const moves = tidyBranches('r', items), y = (id: string) => (moves.get(id) ?? items.find((i) => i.id === id)!).y;
    expect(y('b') - y('a')).toBe(56);
    expect(y('a1') - y('a0')).toBe(56);
    expect(y('b0') - y('a2')).toBe(160);
    expect(y('a0') + y('b2')).toBe(y('a') + y('b'));
  });
});

describe('mind map: "Авторасположение" keeps sides', () => {
  it('a branch stays on the side of its parent it was on', () => {
    const items = [node('r', 0, 0), node('a', 400, 0, { parent: 'r' }), node('a1', 380, 100, { parent: 'a' }), node('a2', 700, 0, { parent: 'a' })];
    const moves = tidyBranches('r', items), at = (id: string) => moves.get(id) ?? items.find((i) => i.id === id)!;
    expect(at('a1').x + 100 <= at('a').x).toBe(true);
    expect(at('a2').x >= at('a').x + 100).toBe(true);
  });
});

describe('mind map: a new branch among neighbours with their own', () => {
  it('stands the gap off them by their own sizes, their branches kept clear of each other', () => {
    const items = [node('r', 0, 0), node('a', 160, 0, { parent: 'r' }), ...[0, 1, 2].map((i) => node(`a${i}`, 320, -56 + i * 56, { parent: 'a' })),
      node('b', 160, 200, { parent: 'r' })];
    const moves = addChild('b', items), y = (id: string) => (moves.get(id) ?? items.find((i) => i.id === id)!).y;
    expect(y('b') - y('a')).toBe(56);
  });
});

describe('mind map: one put beside another with its own', () => {
  it('goes the gap off the node itself, not what grows from it', () => {
    const items = [node('r', 0, 0), node('a', 160, 0, { parent: 'r' }), ...[0, 1, 2].map((i) => node(`a${i}`, 320, -56 + i * 56, { parent: 'a' })),
      node('b', 160, 300, { parent: 'r' })];
    const moves = insertBeside('b', 'a', 'below', items), y = (id: string) => (moves.get(id) ?? items.find((i) => i.id === id)!).y;
    expect(y('b') - y('a')).toBe(56);
  });
});

describe('mind map: cousins make way for a new branch by its level alone', () => {
  it('not by what grows further from its neighbours', () => {
    const items = [node('r', 0, 0), node('P', 160, -100, { parent: 'r' }), node('Q', 160, 100, { parent: 'r' }),
      node('c', 320, -100, { parent: 'P' }), node('L', 320, 100, { parent: 'Q' }),
      ...[0, 1, 2, 3, 4, 5].map((i) => node(`k${i}`, 480, 100 - 140 + i * 56, { parent: 'L' })), node('M', 320, 160, { parent: 'Q' })];
    const moves = addChild('M', items);
    // c is far enough from L itself (L's own branches reaching up past it don't count).
    expect(moves.has('c')).toBe(false);
  });
});

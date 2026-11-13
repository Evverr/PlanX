import { describe, expect, it } from 'vitest';
import { Board } from '../src/model/board';
import type { Item } from '../src/model/types';
import { FIRST_STAGES, addStage, columns, deleteStage, kanbanSize, moveStage, tidyKanbans } from '../src/labs/kanban';

const make = () => {
  const b = new Board(), size = kanbanSize(3);
  b.add({ id: 'k', type: 'frame', x: 0, y: 0, ...size, z: 0, kb: FIRST_STAGES, members: ['t1', 't2', 'r', 's'] } as Item);
  const col = columns(b.get('k')!);
  // Two tasks let go in the first column (t2 over t1), a rectangle in the second, a sticker in the third.
  b.add({ id: 't1', type: 'task', x: col[0].x + 40, y: 300, w: 293, h: 52, z: 1 } as Item);
  b.add({ id: 't2', type: 'task', x: col[0].x - 10, y: 120, w: 293, h: 52, z: 2 } as Item);
  b.add({ id: 'r', type: 'rect', x: col[1].x + 30, y: 200, w: 100, h: 80, z: 3 } as Item);
  b.add({ id: 's', type: 'sticky', x: col[2].x + 30, y: 200, w: 160, h: 160, z: 4 } as Item);
  return { b, col };
};

describe('«Канбан»', () => {
  it('stands each card in its column, in the order let go, one under another; a rectangle as wide as the column; a sticker left as it is', () => {
    const { b, col } = make();
    tidyKanbans(b);
    expect(b.get('t2')).toMatchObject({ x: col[0].x, y: col[0].y + 16 });
    expect(b.get('t1')).toMatchObject({ x: col[0].x, y: col[0].y + 16 + 52 + 12 });
    expect(b.get('r')).toMatchObject({ x: col[1].x, y: col[1].y + 16, w: col[1].w });
    expect(b.get('s')).toMatchObject({ x: col[2].x + 30, y: 200 });
  });

  it('pushes those under one that grows down, and grows itself with its longest column', () => {
    const { b, col } = make();
    tidyKanbans(b);
    b.update('t2', { h: 400 });
    tidyKanbans(b);
    expect(b.get('t1')!.y).toBe(col[0].y + 16 + 400 + 12);
    expect(b.get('k')!.h).toBe(kanbanSize(3, 400 + 12 + 52).h);
  });

  it('closes the gap of one taken out, and leaves what\'s being dragged where it is', () => {
    const { b, col } = make();
    tidyKanbans(b);
    b.update('k', { members: ['t1', 'r', 's'] });
    tidyKanbans(b, new Set(['r']));
    expect(b.get('t1')!.y).toBe(col[0].y + 16);
  });

  it('takes one more stage on its right, wider for it, in a colour none has', () => {
    const { b } = make();
    tidyKanbans(b);
    addStage(b, b.get('k')!);
    const k = b.get('k')!;
    expect(k.kb!.map((s) => s.c)).toEqual(['gray', 'blue', 'green', 'yellow']);
    expect(k.w).toBe(kanbanSize(4).w);
  });

  it('moves a stage with its cards, and deletes one with its cards, those on its right moving over', () => {
    const { b, col } = make();
    tidyKanbans(b);
    moveStage(b, b.get('k')!, 0, 1);
    expect(b.get('k')!.kb!.map((s) => s.n)).toEqual(['В работе', 'Не начато', 'Готово']);
    expect(b.get('t1')!.x).toBe(col[1].x);
    expect(b.get('r')!.x).toBe(col[0].x);
    deleteStage(b, b.get('k')!, 0);
    expect(b.get('r')).toBeUndefined();
    expect(b.get('k')!.kb!.map((s) => s.n)).toEqual(['Не начато', 'Готово']);
    expect(b.get('t1')!.x).toBe(col[0].x);
    expect(b.get('k')!.w).toBe(kanbanSize(2).w);
  });
});

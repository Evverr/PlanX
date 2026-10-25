import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { findOnBoard, snippet } from '../src/labs/search';
import { addMinute, clockText, leftOf, pauseTimer, readTimer, resumeTimer, startTimer, stopTimer } from '../src/labs/timer';
import type { Item } from '../src/model/types';

const item = (id: string, patch: Partial<Item>): Item => ({ id, type: 'sticky', x: 0, y: 0, w: 100, h: 100, z: 0, ...patch });

describe('search on the board', () => {
  const items = [
    item('a', { text: 'Позвонить Ёжику', y: 200 }),
    item('b', { type: 'table', cells: ['', 'ежедневно', ''], y: 100 }),
    item('c', { type: 'image', y: 0 }),
    item('d', { type: 'frame', text: 'План', y: 50 }),
  ];

  it('finds text in any case, ё as е, top of the board first', () => {
    expect(findOnBoard(items, 'ЕЖ').map((f) => f.id)).toEqual(['b', 'a']);
  });

  it('names what it found and leaves out what has no text', () => {
    expect(findOnBoard(items, 'план')).toEqual([{ id: 'd', kind: 'Фрейм', text: 'План', at: 0, len: 4 }]);
    expect(findOnBoard(items, '   ')).toEqual([]);
  });

  it('shows the match in a line of the text around it', () => {
    const [f] = findOnBoard([item('a', { text: 'Первая строка\nвторая строка с ёжиком' })], 'ежик');
    expect(snippet(f, 6)).toEqual({ before: '…ока с ', match: 'ёжик', after: 'ом' });
  });
});

describe('the shared timer', () => {
  it('runs, pauses with what was left, and goes on from there', () => {
    const doc = new Y.Doc();
    startTimer(doc, 60000, 'Ёж');
    const t = readTimer(doc)!;
    expect(leftOf(t, t.end! - 30000)).toBe(30000);
    pauseTimer(doc);
    const paused = readTimer(doc)!;
    expect(paused.end).toBeUndefined();
    expect(paused.left).toBeGreaterThan(59000);
    resumeTimer(doc);
    expect(readTimer(doc)!.end).toBeDefined();
  });

  it('takes a minute more, and goes away when stopped', () => {
    const doc = new Y.Doc();
    startTimer(doc, 60000, 'Ёж');
    addMinute(doc);
    const t = readTimer(doc)!;
    expect(t.total).toBe(120000);
    expect(leftOf(t)).toBeGreaterThan(119000);
    stopTimer(doc);
    expect(readTimer(doc)).toBeNull();
  });

  it('never shows less than nothing, and shows minutes and seconds', () => {
    expect(leftOf({ total: 1000, end: 0, by: '' })).toBe(0);
    expect(clockText(61000)).toBe('1:01');
    expect(clockText(500)).toBe('0:01');
  });
});

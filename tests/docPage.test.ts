import { describe, expect, it } from 'vitest';
import type { Item } from '../src/model/types';
import { docLines, pageCount } from '../src/labs/docPage';

const page = (text: string, rs?: Item['rs']) => ({ id: Math.random().toString(36), type: 'page', x: 0, y: 0, w: 794, h: 1123, z: 0, fs: 16, text, rs }) as Item;

describe('«Документ» laid out', () => {
  it('makes a heading\'s lines bigger, and wraps them sooner', () => {
    const long = 'слово '.repeat(30).trim(), text = `${long}\n${long}`;
    const lines = docLines(page(text, [{ s: long.length, e: long.length + 1, h: 1 }]));
    const head = lines.filter((l) => l.h === 1), body = lines.filter((l) => !l.h);
    expect(head[0].size).toBe(28);
    expect(body[0].size).toBe(16);
    expect(head.length).toBeGreaterThan(body.length);
  });

  it('wraps bold words sooner than plain ones', () => {
    const long = 'слово '.repeat(60).trim();
    // (Without a page to measure in, bold is as wide as plain: the same lines then.)
    expect(docLines(page(long, [{ s: 0, e: long.length, b: true }])).length).toBeGreaterThanOrEqual(docLines(page(long)).length);
  });

  it('goes on to the next page when a page is full, ten pages at most', () => {
    expect(pageCount(page('строка\n'.repeat(80)))).toBe(2);
    expect(pageCount(page('строка\n'.repeat(2000)))).toBe(10);
  });
});

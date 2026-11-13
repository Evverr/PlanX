import { describe, expect, it } from 'vitest';
import type { Item } from '../src/model/types';
import { docMarkdown } from '../src/labs/docExport';

describe('«Документ» as Markdown', () => {
  it('has its styles as Markdown has them, their spaces outside the marks, each line a paragraph', () => {
    const text = 'Договор услуг\nВажно: оплата в течение пяти дней. Старое условие.';
    const s = (w: string) => text.indexOf(w);
    const it = {
      id: 'd', type: 'page', x: 0, y: 0, w: 794, h: 1123, z: 0, text,
      rs: [{ s: 0, e: 13, b: true }, { s: s('Важно'), e: s('Важно') + 7, b: true, i: true }, { s: s('пяти'), e: s('пяти') + 4, u: true }, { s: s('Старое'), e: s('Старое') + 14, x: true, c: 'red' }],
    } as Item;
    expect(docMarkdown(it)).toBe('**Договор услуг**\n\n***Важно:*** оплата в течение <u>пяти</u> дней. ~~Старое условие~~.\n');
  });

  it('has its headings after #s', () => {
    const text = 'Договор\nТекст договора\nРаздел 1';
    const it = { id: 'd', type: 'page', x: 0, y: 0, w: 794, h: 1123, z: 0, text, rs: [{ s: 7, e: 8, h: 1 }, { s: text.length, e: text.length + 1, h: 2 }] } as Item;
    expect(docMarkdown(it)).toBe('# Договор\n\nТекст договора\n\n## Раздел 1\n');
  });
});

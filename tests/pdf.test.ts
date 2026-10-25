import { describe, expect, it } from 'vitest';
import { pdfOf } from '../src/labs/exportPdf';

describe('a PDF of one picture', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const pdf = pdfOf(jpeg, 300, 200, 225, 150), text = new TextDecoder('latin1').decode(pdf);

  it('starts and ends as a PDF does, the page as big as asked, the picture in it as it is', () => {
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.endsWith('%%EOF\n')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 225 150]');
    expect(text).toContain('/Width 300 /Height 200');
    expect(text).toContain('q 225 0 0 150 0 0 cm /Im0 Do Q');
    expect([...pdf]).toEqual(expect.arrayContaining([...jpeg]));
  });

  it('its table says where each object starts, and where the table does', () => {
    const xref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
    const rows = text.slice(xref).split('\n').slice(3, 8).map((r) => Number(r.slice(0, 10)));
    rows.forEach((at, i) => expect(text.slice(at, at + 8)).toBe(`${i + 1} 0 obj\n`));
  });
});

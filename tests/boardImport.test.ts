import { describe, expect, it } from 'vitest';
import { boardIdIn } from '../src/labs/boardImport';

describe('a board by its address', () => {
  it('takes the whole address, a part of it, or just the code', () => {
    expect(boardIdIn('https://planx-ten.vercel.app/?board=rib30crmca')).toBe('rib30crmca');
    expect(boardIdIn('  http://localhost:5173/?board=abc_12-x&title=План ')).toBe('abc_12-x');
    expect(boardIdIn('?board=xyz')).toBe('xyz');
    expect(boardIdIn('rib30crmca')).toBe('rib30crmca');
    expect(boardIdIn('https://example.com/page')).toBeNull();
    expect(boardIdIn('не адрес')).toBeNull();
  });
});

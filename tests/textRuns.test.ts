import { describe, expect, it } from 'vitest';
import { remapLinks, runsHave, setRun, type TextRun } from '../src/model/textLinks';

describe('styles on parts of the text («Документ»)', () => {
  it('sets one on a part, takes it off again, joins neighbours alike', () => {
    let r = setRun(undefined, 2, 5, 'b', true);
    expect(r).toEqual([{ s: 2, e: 5, b: true }]);
    r = setRun(r, 5, 8, 'b', true);
    expect(r).toEqual([{ s: 2, e: 8, b: true }]);
    r = setRun(r, 4, 6, 'i', true);
    expect(r).toEqual([{ s: 2, e: 4, b: true }, { s: 4, e: 6, b: true, i: true }, { s: 6, e: 8, b: true }]);
    expect(runsHave(r, 4, 6, 'i')).toBe(true);
    expect(runsHave(r, 3, 6, 'i')).toBe(false);
    r = setRun(r, 4, 6, 'i', false);
    expect(r).toEqual([{ s: 2, e: 8, b: true }]);
    r = setRun(r, 0, 10, 'b', false);
    expect(r).toBeUndefined();
  });

  it('colours a part, the colour told apart from another', () => {
    const r = setRun(setRun(undefined, 0, 4, 'c', true, 'red'), 4, 6, 'c', true, 'blue');
    expect(r).toEqual([{ s: 0, e: 4, c: 'red' }, { s: 4, e: 6, c: 'blue' }]);
    expect(runsHave(r, 0, 4, 'c', 'red')).toBe(true);
    expect(runsHave(r, 0, 6, 'c', 'red')).toBe(false);
  });

  it('moves with what\'s typed before it, and grows with what\'s typed inside', () => {
    const r: TextRun[] = [{ s: 6, e: 11, b: true }];
    expect(remapLinks('Hello world', 'Oh, Hello world', r)).toEqual([{ s: 10, e: 15, b: true }]);
    expect(remapLinks('Hello world', 'Hello wonderful world', r)).toEqual([{ s: 6, e: 21, b: true }]);
  });
});

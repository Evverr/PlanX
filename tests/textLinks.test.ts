import { describe, expect, it } from 'vitest';
import { drawnLinks, remapLinks, setLink } from '../src/model/textLinks';

const L = (s: number, e: number, url = 'u') => ({ s, e, url });

describe('links on part of a text', () => {
  it('move with what is typed before them, stretch with what is typed in them, stay with what is typed after', () => {
    // "see docs here": "docs" is 4..8
    expect(remapLinks('see docs here', 'please see docs here', [L(4, 8)])).toEqual([L(11, 15)]);
    expect(remapLinks('see docs here', 'see the docs here', [L(4, 8)])).toEqual([L(8, 12)]);
    expect(remapLinks('see docs here', 'see my docs here', [L(4, 8)])).toEqual([L(7, 11)]);
    expect(remapLinks('see docs here', 'see dorcs here', [L(4, 8)])).toEqual([L(4, 9)]);
    expect(remapLinks('see docs here', 'see docss here', [L(4, 8)])).toEqual([L(4, 8)]);
    expect(remapLinks('see docs here', 'see docs, here', [L(4, 8)])).toEqual([L(4, 8)]);
  });

  it('go with what is cut out', () => {
    expect(remapLinks('see docs here', 'see here', [L(4, 8)])).toBeUndefined();
    expect(remapLinks('see docs here', 'see dhere', [L(4, 8)])).toEqual([L(4, 5)]);
  });

  it('a new one takes the place of what was there', () => {
    expect(setLink([L(0, 10, 'a')], 3, 6, 'b')).toEqual([L(0, 3, 'a'), L(3, 6, 'b'), L(6, 10, 'a')]);
    expect(setLink([L(0, 10, 'a')], 0, 10, '')).toBeUndefined();
  });

  it('shift past the bullets and numbers of a list as drawn', () => {
    expect(drawnLinks('one\ntwo', 'bullet', [L(4, 7)])).toEqual([L(10, 13)]);
    expect(drawnLinks('one\ntwo', 'number', [L(0, 3)])).toEqual([L(3, 6)]);
  });
});

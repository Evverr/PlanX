import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addPoint, isPointId, LIMIT, listPoints, readPoint, removePoint } from '../server/history';

describe('points a board can go back to', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planx-history-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('keeps each with its state, the latest first; one taken off goes', () => {
    addPoint(dir, 'b', new Uint8Array([1]), 'manual', 100);
    addPoint(dir, 'b', new Uint8Array([2]), 'auto', 200);
    expect(listPoints(dir, 'b')).toEqual([{ id: '200-a', t: 200, kind: 'auto' }, { id: '100-m', t: 100, kind: 'manual' }]);
    expect([...readPoint(dir, 'b', '100-m')!]).toEqual([1]);
    removePoint(dir, 'b', '100-m');
    expect(readPoint(dir, 'b', '100-m')).toBe(null);
    expect(listPoints(dir, 'other')).toEqual([]);
  });

  it(`past ${LIMIT} the oldest go, those made by hand last`, () => {
    addPoint(dir, 'b', new Uint8Array(), 'manual', 1);
    for (let t = 2; t <= LIMIT; t++) addPoint(dir, 'b', new Uint8Array(), 'auto', t);
    addPoint(dir, 'b', new Uint8Array(), 'before', LIMIT + 1);
    const ids = listPoints(dir, 'b').map((p) => p.id);
    expect(ids.length).toBe(LIMIT);
    expect(ids).toContain('1-m');
    expect(ids).not.toContain('2-a');
    for (let t = 0; t < LIMIT; t++) addPoint(dir, 'b', new Uint8Array(), 'manual', 1000 + t);
    expect(listPoints(dir, 'b').map((p) => p.kind).every((k) => k === 'manual')).toBe(true);
    expect(listPoints(dir, 'b').some((p) => p.id === '1-m')).toBe(false);
  });

  it('takes as ids only what it made, no way out of its folder', () => {
    expect(isPointId('1730000000000-m')).toBe(true);
    for (const bad of ['../x', '1-x', 'a-m', '1-m/../../y', '']) expect(isPointId(bad)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Board } from '../src/model/board';
import { decodeBoardFile, encodeBoardFile } from '../src/labs/boardFile';

describe('a board file (.plnt)', () => {
  const doc = new Y.Doc(), board = new Board(doc);
  board.add({ id: 's', type: 'sticky', x: 10, y: 20, w: 160, h: 160, z: 1, text: 'Привет' });
  board.setTitle('Моя доска');
  const bytes = encodeBoardFile(doc);

  it('begins with PLANPLNT, the version and the length of the board in it', () => {
    expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe('PLANPLNT');
    expect(bytes[8]).toBe(1);
    expect(new DataView(bytes.buffer).getUint32(10, true)).toBe(bytes.length - 14);
  });

  it('read back, it is the board as it was', () => {
    const got = decodeBoardFile(bytes);
    if ('error' in got) throw new Error(got.error);
    const copy = new Y.Doc();
    Y.applyUpdate(copy, got.update);
    const b = new Board(copy);
    expect(b.title).toBe('Моя доска');
    expect(b.get('s')).toMatchObject({ text: 'Привет', x: 10, y: 20 });
  });

  it('says what is wrong with what is not one', () => {
    expect(decodeBoardFile(new TextEncoder().encode('hello world, not a board'))).toEqual({ error: 'Это не файл доски' });
    const newer = bytes.slice(); newer[8] = 9;
    expect(decodeBoardFile(newer)).toEqual({ error: 'Файл из более новой версии PlanX' });
    expect(decodeBoardFile(bytes.slice(0, 40))).toEqual({ error: 'Файл повреждён: он короче, чем должен быть' });
  });
});

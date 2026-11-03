import fs from 'node:fs';
import path from 'node:path';

/**
 * "История" (src/labs): points a board can go back to, each a copy of its state in a file of its own,
 * DATA_DIR/history/<board>/<time>-<kind>.bin; made by hand, by the server now and then (where a board's
 * set to), or just before going back to another. Past LIMIT the oldest go, those made by hand last.
 */
export type PointKind = 'manual' | 'auto' | 'before';
export interface Point { id: string; t: number; kind: PointKind }

export const LIMIT = 50;
const KINDS: Record<string, PointKind> = { m: 'manual', a: 'auto', b: 'before' };
const LETTER: Record<PointKind, string> = { manual: 'm', auto: 'a', before: 'b' };
const FILE = /^(\d+)-([mab])\.bin$/;

/** A point's id as it comes in an address, to be checked before it's made a path of. */
export const isPointId = (id: string) => /^\d+-[mab]$/.test(id);
export const isPointKind = (k: string | null): k is PointKind => k === 'manual' || k === 'auto' || k === 'before';

const dirFor = (dataDir: string, board: string) => path.join(dataDir, 'history', board);

/** A board's points, the latest first. */
export function listPoints(dataDir: string, board: string): Point[] {
  let names: string[];
  try { names = fs.readdirSync(dirFor(dataDir, board)); } catch { return []; }
  const out: Point[] = [];
  for (const n of names) {
    const m = FILE.exec(n);
    if (m) out.push({ id: `${m[1]}-${m[2]}`, t: Number(m[1]), kind: KINDS[m[2]] });
  }
  return out.sort((a, b) => b.t - a.t);
}

export function addPoint(dataDir: string, board: string, state: Uint8Array, kind: PointKind, t = Date.now()): Point {
  const dir = dirFor(dataDir, board), id = `${t}-${LETTER[kind]}`;
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `${id}.tmp`);
  fs.writeFileSync(tmp, state);
  fs.renameSync(tmp, path.join(dir, `${id}.bin`));
  const all = listPoints(dataDir, board);
  for (let extra = all.length - LIMIT; extra > 0; extra--) {
    const left = listPoints(dataDir, board), oldest = [...left].reverse();
    removePoint(dataDir, board, (oldest.find((p) => p.kind !== 'manual') ?? oldest[0]).id);
  }
  return { id, t, kind };
}

export function readPoint(dataDir: string, board: string, id: string): Buffer | null {
  try { return fs.readFileSync(path.join(dirFor(dataDir, board), `${id}.bin`)); } catch { return null; }
}

export function removePoint(dataDir: string, board: string, id: string): void {
  fs.rmSync(path.join(dirFor(dataDir, board), `${id}.bin`), { force: true });
}

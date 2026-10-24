import { useEffect, useState } from 'react';
import { crowds, EDGE, shownRects, type Box } from '../../layout';
import { readText, writeText } from '../../storage';

/**
 * The panels' places and lengths, each a number under its key (null: as by default). Moving a panel
 * changes it for now; "Сохранить панели" keeps them all for next time, "Сбросить панели" puts every
 * panel back as by default and forgets what was kept.
 */
const live = new Map<string, number | null>();
const setters = new Map<string, Set<(v: number | null) => void>>();
const kept = (key: string): number | null => {
  const s = readText(key);
  return s === null ? null : Number(s);
};

/** One of the panels' numbers, as it is now (what was saved, till it's changed), and a way to change it. */
export function usePanelNumber(key: string): [number | null, (v: number | null) => void] {
  const [v, setV] = useState<number | null>(() => (live.has(key) ? live.get(key)! : kept(key)));
  useEffect(() => {
    if (!setters.has(key)) setters.set(key, new Set());
    setters.get(key)!.add(setV);
    return () => { setters.get(key)?.delete(setV); };
  }, [key]);
  const set = (n: number | null) => { live.set(key, n); setV(n); };
  return [v, set];
}

/** Keeps the panels as they are now for next time. */
export function savePanels(): void {
  for (const [key, v] of live) writeText(key, v === null ? null : String(Math.round(v)));
}

/** Other things put back by "Сбросить панели" (sticking the panels to the edges): each puts its
 *  part back as by default and gives back what undoes that. */
const resets = new Set<() => () => void>();
export function onPanelsReset(reset: () => () => void): () => void {
  resets.add(reset);
  return () => { resets.delete(reset); };
}

/** Puts every panel back as by default, and forgets what was kept; gives back what puts it all as
 *  it was again (for undo). */
export function resetPanels(): () => void {
  const was = [...setters.keys()].map((key) => ({ key, now: live.has(key) ? live.get(key)! : kept(key), saved: readText(key) }));
  const put = (key: string, v: number | null) => { live.set(key, v); setters.get(key)?.forEach((f) => f(v)); };
  for (const { key } of was) {
    put(key, null);
    writeText(key, null);
  }
  const undos = [...resets].map((reset) => reset());
  return () => {
    for (const { key, now, saved } of was) {
      put(key, now);
      if (saved !== null) writeText(key, saved);
    }
    undos.forEach((undo) => undo());
  };
}

/** The main panels, which mustn't be put over one another. */
const PANELS = '.topbar, .bar.zoom, .tools';

/** Whether a panel at this place (screen pixels) would lie over another of the main panels. */
export function overPanels(r: Box, self: Element | null): boolean {
  return shownRects(PANELS, self).some((o) => crowds(r, o));
}

/**
 * Where a panel dragged by (dx, dy) from its box `r` goes along the screen's edge it stands by (a bar
 * runs along x, the rail along y), kept 12px from the ends; and whether it's been pulled past the
 * middle of the screen across, over to the other edge.
 */
export function dragAlong(r: DOMRect, dx: number, dy: number, along: 'x' | 'y'): { at: number; past: boolean } {
  const clamp = (v: number, size: number, room: number) => Math.min(Math.max(v, EDGE), Math.max(EDGE, room - EDGE - size));
  return along === 'x'
    ? { at: clamp(r.left + dx, r.width, innerWidth), past: r.top + r.height / 2 + dy > innerHeight / 2 }
    : { at: clamp(r.top + dy, r.height, innerHeight), past: r.left + r.width / 2 + dx > innerWidth / 2 };
}

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';

/**
 * "Общий таймер": one countdown per board that everyone on it sees, kept in the board's document
 * (outside what Ctrl+Z undoes). Running, it has the moment it ends; paused, how much was left.
 */
export interface TimerState { total: number; end?: number; left?: number; by: string }

const mapOf = (doc: Y.Doc) => doc.getMap('labs');

export function readTimer(doc: Y.Doc): TimerState | null {
  return (mapOf(doc).get('timer') as TimerState | undefined) ?? null;
}

function write(doc: Y.Doc, t: TimerState | null): void {
  doc.transact(() => { if (t) mapOf(doc).set('timer', t); else mapOf(doc).delete('timer'); });
}

/** What's left, in ms (never below 0). */
export const leftOf = (t: TimerState, now = Date.now()): number => Math.max(0, t.end !== undefined ? t.end - now : t.left ?? 0);

export const startTimer = (doc: Y.Doc, ms: number, by: string) => write(doc, { total: ms, end: Date.now() + ms, by });
export const stopTimer = (doc: Y.Doc) => write(doc, null);

export function pauseTimer(doc: Y.Doc): void {
  const t = readTimer(doc);
  if (t?.end !== undefined) write(doc, { total: t.total, left: leftOf(t), by: t.by });
}

export function resumeTimer(doc: Y.Doc): void {
  const t = readTimer(doc);
  if (t && t.end === undefined) write(doc, { total: t.total, end: Date.now() + (t.left ?? 0), by: t.by });
}

/** A minute more (and a minute longer in all), running or paused; an ended one starts again with it. */
export function addMinute(doc: Y.Doc): void {
  const t = readTimer(doc);
  if (!t) return;
  const left = leftOf(t);
  if (t.end !== undefined) write(doc, { total: (left ? t.total : 0) + 60000, end: Date.now() + left + 60000, by: t.by });
  else write(doc, { total: t.total + 60000, left: left + 60000, by: t.by });
}

/** The board's timer, kept up to date, with the time now ticking along while it runs. */
export function useTimer(doc: Y.Doc): { timer: TimerState | null; now: number } {
  const map = mapOf(doc);
  const subscribe = useMemo(() => (fn: () => void) => { map.observe(fn); return () => map.unobserve(fn); }, [map]);
  const timer = useSyncExternalStore(subscribe, () => map.get('timer') as TimerState | undefined) ?? null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (timer?.end === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer?.end]);
  return { timer, now };
}

/** Three short soft beeps. */
export function chime(): void {
  try {
    const ac = new AudioContext();
    for (let i = 0; i < 3; i++) {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * 0.28;
      o.frequency.value = 880;
      o.type = 'sine';
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 0.25);
    }
    setTimeout(() => void ac.close(), 1200);
  } catch { /* no sound then */ }
}

/** m:ss */
export function clockText(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

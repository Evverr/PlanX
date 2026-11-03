import { useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from '../storage';

/**
 * "Зум с Cmd" (in "Настройки", kept per browser), off at first: the wheel then zooms as ever; on, it
 * zooms with Cmd (Ctrl on Windows) and scrolls up and down by itself.
 */
const KEY = 'planx-wheel-zoom-key';
let on = readJSON<boolean>(KEY) === true;
const listeners = new Set<() => void>();

export const zoomsWithKey = () => on;
export const zoomKeyName = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl');
export const useZoomsWithKey = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, zoomsWithKey);

export function setZoomsWithKey(v: boolean): void {
  on = v;
  writeJSON(KEY, v);
  listeners.forEach((fn) => fn());
}

/** How the zoom's done, for the help. */
export const zoomHelp = () => (on ? `${zoomKeyName()} + колесо, щипок` : 'Колесо, щипок');

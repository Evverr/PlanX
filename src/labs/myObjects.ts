import { readJSON, readText, writeJSON } from '../storage';
import { uid } from '../model/types';

/**
 * "Мои объекты" ("Объекты", src/labs): the components made objects by the person in this browser, kept
 * here and not on a board, to be put on any board. Each is a snapshot of the component with what it
 * holds, as copied (see Editor.copy): put on a board, a copy of it goes there (see Editor.placeMyObject);
 * what's changed in one place doesn't spread to the others.
 */
export interface MyObject { id: string; name: string; data: string; at: number }

const KEY = 'planx-my-objects';

export const myObjects = (): MyObject[] => readJSON<MyObject[]>(KEY) ?? [];

/** Keeps a snapshot under its name; its id, or null when the browser won't hold it (too big). */
export function keepMyObject(name: string, data: string): string | null {
  const id = uid(), list = [...myObjects(), { id, name, data, at: Date.now() }];
  writeJSON(KEY, list);
  return readText(KEY)?.includes(`"${id}"`) ? id : null;
}

export function dropMyObject(id: string): void {
  writeJSON(KEY, myObjects().filter((o) => o.id !== id));
}

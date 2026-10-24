/**
 * What this browser keeps for its person (panels, pens, the camera, their name...). Storage can be
 * missing or refuse (a private window, a full or blocked store): reading then gives null, and
 * writing just doesn't keep it.
 */
export function readText(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Keeps a text under the key; null forgets it. */
export function writeText(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* just won't be kept */ }
}

export function readJSON<T>(key: string): T | null {
  const v = readText(key);
  if (!v) return null;
  try { return JSON.parse(v) as T; } catch { return null; }
}

export function writeJSON(key: string, value: unknown): void {
  writeText(key, JSON.stringify(value));
}

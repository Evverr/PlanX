/**
 * "Доски извне" (src/labs): on the shelf page, a board from elsewhere: from a .plnt file (picked in
 * the new board's dialog, or dropped on the page from the Finder) or by its address, shared by
 * someone (the whole address, or just the board's code).
 */

/** The board's code in what was pasted, or null when there's none. */
export function boardIdIn(pasted: string): string | null {
  const t = pasted.trim();
  if (/^[A-Za-z0-9_-]{1,64}$/.test(t)) return t;
  try {
    const id = new URL(t).searchParams.get('board');
    return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
  } catch {
    const m = t.match(/[?&]board=([A-Za-z0-9_-]{1,64})/);
    return m ? m[1] : null;
  }
}

/** Whether a drag brings files from outside the page (not the shelf's own boards and folders). */
export const bringsFiles = (e: DragEvent | React.DragEvent): boolean => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

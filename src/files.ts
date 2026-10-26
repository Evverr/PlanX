import type { Editor } from './editor/editor';

/** Files handed to the browser to save: pictures, PDFs, the board itself. */

/** A file name after the board's title, with this ending. */
export const fileName = (ed: Editor, ext: string) => `${(ed.board.title.trim() || 'Доска').replace(/[\\/:*?"<>|]+/g, ' ')}.${ext}`;

/** Hands the browser a file to save. */
export function saveFile(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

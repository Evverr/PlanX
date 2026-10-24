/** Cursors for turning: a curved double arrow around the top left corner, turned by deg. Kept by
 *  the degree. */
const rotateCursors = new Map<number, string>();

export function rotateCursor(deg: number): string {
  const d = Math.round(deg);
  let c = rotateCursors.get(d);
  if (!c) {
    // Drawn twice, white and wide under dark, so it shows on any background.
    const arrow = (ink: string, width: number) => `<path fill="none" stroke="${ink}" stroke-width="${width}" d="M6.5 17.5A11 11 0 0 1 17.5 6.5"/>`
      + `<path fill="${ink}" stroke="${ink}" stroke-width="${width - 1.6}" stroke-linejoin="round" d="M3.5 16.5 6.5 21 9.5 16.5Z M16.5 3.5 21 6.5 16.5 9.5Z"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(${d} 12 12)">${arrow('#fff', 4.4)}${arrow('#1A1A1A', 1.8)}</g></svg>`;
    c = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
    rotateCursors.set(d, c);
  }
  return c;
}

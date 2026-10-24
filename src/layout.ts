/** How far every panel stands from the screen's edges, and at least from one another. */
export const EDGE = 12;

/** A box on screen. */
export interface Box { left: number; top: number; width: number; height: number }

/** The boxes on screen of what matches the selector and is showing (but `except`). */
export function shownRects(selector: string, except?: Element | null): DOMRect[] {
  return [...document.querySelectorAll(selector)].filter((el) => el !== except).map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);
}

/** Whether a box comes within `gap` of another (or over it). */
export function crowds(a: Box, b: Box, gap = EDGE): boolean {
  return a.left < b.left + b.width + gap && a.left + a.width > b.left - gap && a.top < b.top + b.height + gap && a.top + a.height > b.top - gap;
}

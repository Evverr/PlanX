/**
 * "Боковая панель" over a board: the board pushed over by it, not under it. The board and all that
 * pops up over it lie in their own area right of the side (.app-content, its own frame for what's fixed
 * in it: see labs.css), and what they measure of the window is measured of that area: its width
 * (innerWidth), where the pointer is (clientX), where things are (getBoundingClientRect), what's at a
 * point (elementFromPoint). So everything placed by those (the panels, the menus, the hints, the text
 * typed in) keeps working as is, only `side` further right. Off (side 0) with the side closed or no
 * board beside it: the window as it is.
 */

let side = 0;

/** How far the board's area starts from the window's left edge now. */
export const sideOffset = (): number => side;

/** Where what pops up over the board goes, so it's in the board's area (see above). */
export const layerRoot = (): HTMLElement => (side && document.querySelector<HTMLElement>('.app-content')) || document.body;

const inArea = (el: Element | null): boolean => !!el?.closest?.('.app-content');

let patched = false;
function patch(): void {
  if (patched) return;
  patched = true;
  const getter = (proto: object, key: string) => Object.getOwnPropertyDescriptor(proto, key)?.get;
  // The pointer, wherever it's measured from: left of the area, as from the window's edge.
  for (const [proto, keys] of [[MouseEvent.prototype, ['clientX', 'x', 'pageX']], [Touch.prototype, ['clientX', 'pageX']]] as const) {
    for (const key of keys) {
      const get = getter(proto, key);
      if (get) Object.defineProperty(proto, key, { configurable: true, get(this: unknown) { return (get.call(this) as number) - side; } });
    }
  }
  // Where things in the area are (not the side's own).
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const r = rect.call(this);
    return side && inArea(this) ? new DOMRect(r.x - side, r.y, r.width, r.height) : r;
  };
  const at = Document.prototype.elementFromPoint, all = Document.prototype.elementsFromPoint;
  Document.prototype.elementFromPoint = function (this: Document, x: number, y: number) { return at.call(this, x + side, y); };
  Document.prototype.elementsFromPoint = function (this: Document, x: number, y: number) { return all.call(this, x + side, y); };
  // The window as wide as the area.
  const width = getter(Window.prototype, 'innerWidth') ?? Object.getOwnPropertyDescriptor(window, 'innerWidth')?.get;
  if (width) Object.defineProperty(window, 'innerWidth', { configurable: true, get() { return (width.call(window) as number) - side; } });
}

/** The board's area this far from the window's left edge (0: none), what's in it laid out afresh. */
export function setSideOffset(px: number): void {
  if (px === side) return;
  patch();
  side = px;
  window.dispatchEvent(new Event('resize'));
}

import type { Item, Link } from './types';
import { descendants } from './mind';

/**
 * Components, as in Figma: a frame made a component (`comp`), and instances of it (frames with `inst`
 * its id) holding a copy of everything in it, kept the same as it whatever is done to it — moved,
 * resized, recoloured, typed in, added to, taken from. A copy's text and colours can be changed in its
 * instance (`ovr` lists what was), and those stay as they are; the rest follows the component.
 *
 * The copies are worked out afresh from the component after any change (see syncOps) and written
 * outside the undo history, so undoing a change to the component puts its instances back too. A copy's
 * id is its instance's and its original's together, the same for everyone working on the board.
 */

/** Fields a copy can have changed in its instance: its text and how it looks, not where it is. */
export const OVERRIDES = new Set(['text', 'cells', 'cellFmt', 'color', 'fc', 'sc', 'fo', 'so', 'tc', 'mk', 'fs', 'fw', 'ff', 'fi', 'fu', 'fx', 'ta', 'va', 'ls', 'done', 'icon', 'emoji', 'type', 'shape', 'dy']);
/** Items sized by their text: a copy with its own text keeps its own size. */
const SIZED_BY_TEXT = new Set(['text', 'mind', 'task']);

export const copyId = (host: string, of: string) => `${host}~${of}`;

/** The red of components and their instances. */
export const COMPONENT_COLOR = '#E5484D';

/** The hollow diamond before a picked instance's title, at the top left of its contents `b`, that
 *  leads to its component: where it takes the pointer, a little round it. */
export const instanceGlyph = (b: { x: number; y: number }) => ({ x: b.x - 6, y: b.y - 28, w: 26, h: 28 });

/** The "+" right of a picked component that makes an instance of it, past its blue dot for links: its
 *  middle and radius, the same size on screen whatever the zoom. */
export const instancePlus = (it: Item, zoom: number) => ({ x: it.x + it.w + 40 / zoom, y: it.y + it.h / 2, r: 10 / zoom });

/** Rectangles: the board-aligned box around them all. */
const around = (rs: Item[]) => {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};

/**
 * Where an item of a component goes in an instance stretched by `grow` beyond `box`, what the
 * component holds: one taking more than half of that stretches with it, keeping its distance to every
 * side (but tables and mind maps, laid out by what's in them); the others keep to the corner or side they're nearest to (by the thirds of the box), or to
 * its middle, keeping their size.
 */
export function stretched(it: Item, box: { x: number; y: number; w: number; h: number }, grow: { w: number; h: number }): Pick<Item, 'x' | 'y' | 'w' | 'h'> {
  if (it.w * it.h > box.w * box.h / 2 && it.type !== 'table' && it.type !== 'mind') return { x: it.x, y: it.y, w: Math.max(10, it.w + grow.w), h: Math.max(10, it.h + grow.h) };
  const along = (at: number, size: number, from: number, all: number, more: number) => {
    const c = at + size / 2 - from;
    return at + (c < all / 3 ? 0 : c > (all * 2) / 3 ? more : more / 2);
  };
  return { x: along(it.x, it.w, box.x, box.w, grow.w), y: along(it.y, it.h, box.y, box.h, grow.h), w: it.w, h: it.h };
}

/** Everything in a frame: what it holds, what frames in it hold, and mind map branches of all that. */
export function contents(f: Item, byId: Map<string, Item>, items: Item[]): Item[] {
  const out = new Map<string, Item>(), todo = [f];
  while (todo.length) {
    for (const id of todo.pop()!.members ?? []) {
      const i = byId.get(id);
      if (!i || out.has(id) || id === f.id) continue;
      out.set(id, i);
      if (i.type === 'frame') todo.push(i);
    }
  }
  for (const id of descendants(out.keys(), items)) { const i = byId.get(id); if (i) out.set(id, i); }
  return [...out.values()];
}

export interface SyncOps {
  /** New items, whole. */
  add: Item[];
  /** Changes to items there are, by id (undefined: the field goes). */
  change: Map<string, Partial<Item>>;
  remove: string[];
  addLinks: Link[];
  removeLinks: string[];
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** What it takes for every instance to be what its component is now; nothing when they are. */
export function syncOps(items: Item[], links: Link[]): SyncOps {
  const ops: SyncOps = { add: [], change: new Map(), remove: [], addLinks: [], removeLinks: [] };
  const byId = new Map(items.map((i) => [i.id, i]));
  const patch = (id: string, p: Partial<Item>) => {
    const it = byId.get(id)!, diff: Partial<Item> = {};
    for (const [k, v] of Object.entries(p)) if (!same((it as unknown as Record<string, unknown>)[k], v)) (diff as Record<string, unknown>)[k] = v;
    if (Object.keys(diff).length) ops.change.set(id, { ...ops.change.get(id), ...diff });
  };
  const wanted = new Set<string>(), wantedLinks = new Set<string>();
  for (const inst of items.filter((i) => i.inst)) {
    const comp = byId.get(inst.inst!);
    // With its component gone, an instance is left an ordinary frame, its copies ordinary items.
    if (!comp?.comp) {
      patch(inst.id, { inst: undefined });
      for (const c of items.filter((i) => i.host === inst.id)) { patch(c.id, { from: undefined, host: undefined, ovr: undefined }); wanted.add(c.id); }
      continue;
    }
    // An instance put inside its own component (or copies of copies of copies) would never end.
    const inside = contents(comp, byId, items).filter((i) => i.id.split('~').length < 4), ids = new Set(inside.map((i) => i.id));
    if (ids.has(inst.id)) continue;
    // A folded component keeps where it was and its size unfolded.
    const dx = inst.x - comp.x, dy = inst.y - comp.y, cw = comp.fold?.w ?? comp.w, ch = comp.fold?.h ?? comp.h;
    const map = (id: string) => copyId(inst.id, id);
    const grow = inst.grow ?? { w: 0, h: 0 }, box = inside.length ? around(inside) : null;
    patch(inst.id, { w: cw + grow.w, h: ch + grow.h, text: comp.text, members: (comp.members ?? []).filter((m) => ids.has(m)).map(map), fold: undefined });
    for (const src of inside) {
      const id = map(src.id), old = byId.get(id), at = box && (grow.w || grow.h) ? stretched(src, box, grow) : src;
      const want: Item = { ...src, id, x: at.x + dx, y: at.y + dy, w: at.w, h: at.h, from: src.id, host: inst.id, comp: undefined, inst: undefined, rx: old?.rx };
      if (src.parent) want.parent = ids.has(src.parent) ? map(src.parent) : undefined;
      if (src.members) want.members = src.members.filter((m) => ids.has(m)).map(map);
      const kept = old?.ovr ?? [];
      for (const k of kept) (want as unknown as Record<string, unknown>)[k] = (old as unknown as Record<string, unknown>)[k];
      if (old && kept.includes('text') && SIZED_BY_TEXT.has(src.type)) { want.w = old.w; want.h = old.h; }
      // Pushed down by text above it that grew in the instance (see labs/textPush.ts).
      if (want.dy) want.y += want.dy;
      want.ovr = kept.length ? kept : undefined;
      wanted.add(id);
      if (!old) { ops.add.push(Object.fromEntries(Object.entries(want).filter(([, v]) => v !== undefined)) as unknown as Item); continue; }
      // Fields it has that its original no longer does go too.
      const gone = Object.fromEntries(Object.keys(old).filter((k) => !(k in want) || (want as unknown as Record<string, unknown>)[k] === undefined).map((k) => [k, undefined]));
      patch(id, { ...gone, ...want });
    }
    for (const l of links) {
      if (!ids.has(l.from) || !ids.has(l.to)) continue;
      const id = map(l.id);
      wantedLinks.add(id);
      if (!links.some((k) => k.id === id)) ops.addLinks.push({ ...l, id, from: map(l.from), to: map(l.to) });
    }
  }
  // Copies of what's no longer in a component, or in an instance that's gone.
  for (const i of items) if (i.host && !wanted.has(i.id)) ops.remove.push(i.id);
  // Copies of links no longer wanted in an instance (those of one detached stay, as its own).
  for (const l of links) if (l.id.includes('~') && byId.get(l.id.split('~')[0])?.inst && !wantedLinks.has(l.id)) ops.removeLinks.push(l.id);
  return ops;
}

/** Whether there's anything to keep in step (a quick look before working it out). */
export const hasComponents = (items: Item[]): boolean => items.some((i) => i.comp || i.inst || i.host);

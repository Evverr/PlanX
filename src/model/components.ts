import type { Item, Link } from './types';
import { alignOf } from './types';
import { BUILTINS } from './builtins';
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
export const OVERRIDES = new Set(['text', 'cells', 'cellFmt', 'color', 'fc', 'sc', 'fo', 'so', 'tc', 'mk', 'fs', 'fw', 'ff', 'fi', 'fu', 'fx', 'ta', 'va', 'ls', 'done', 'icon', 'emoji', 'type', 'shape', 'url', 'links', 'to', 'mo']);
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
export const around = (rs: Item[]) => {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};

/**
 * Where an item of a component goes in an instance stretched by `grow` beyond `box`, what the
 * component holds. One more than half as wide as that stretches across with it, keeping its distance
 * to both sides (text too, wrapping anew); more than half as tall, up and down (but text, tasks, tables
 * and mind maps, sized by what's in them). Otherwise it keeps its size and keeps to a side: text to
 * the one it's aligned to, anything else to the side or middle it's nearest to (by the thirds of the box).
 */
export function stretched(it: Item, box: { x: number; y: number; w: number; h: number }, grow: { w: number; h: number }): Pick<Item, 'x' | 'y' | 'w' | 'h'> {
  // Text stretches across (wrapping anew), not down.
  const fixed = it.type === 'task' || it.type === 'table' || it.type === 'mind', fixedDown = fixed || it.type === 'text';
  const along = (at: number, size: number, from: number, all: number, more: number) => {
    const c = at + size / 2 - from;
    return at + (c < all / 3 ? 0 : c > (all * 2) / 3 ? more : more / 2);
  };
  const across = (): { x: number; w: number } => {
    if (!fixed && it.w > box.w / 2) return { x: it.x, w: Math.max(10, it.w + grow.w) };
    if (it.type === 'text') {
      const a = alignOf(it);
      return { x: it.x + (a === 'left' ? 0 : a === 'right' ? grow.w : grow.w / 2), w: it.w };
    }
    return { x: along(it.x, it.w, box.x, box.w, grow.w), w: it.w };
  };
  const down = (): { y: number; h: number } =>
    !fixedDown && it.h > box.h / 2 ? { y: it.y, h: Math.max(10, it.h + grow.h) } : { y: along(it.y, it.h, box.y, box.h, grow.h), h: it.h };
  return { ...across(), ...down() };
}

/** How far apart text items may lie, one under the other, and still go together. */
export const TEXT_NEAR = 16;

/** The text items lying just under `top` (no more than TEXT_NEAR apart, side by side with it). */
export const textsUnder = (top: Item, items: Item[]): Item[] => items.filter((t) => t.type === 'text' && !t.rot && t.id !== top.id
  && t.x < top.x + top.w && top.x < t.x + t.w && t.y - (top.y + top.h) >= 0 && t.y - (top.y + top.h) <= TEXT_NEAR);

/** How far each text item goes down for those over it that grew by so much (`grew`, by id): along
 *  with the one just over it, and so on down. */
export function textShifts(items: Item[], grew: Map<string, number>): Map<string, number> {
  const shifts = new Map<string, number>();
  for (const [id, dh] of grew) {
    const from = items.find((i) => i.id === id);
    if (!from || from.rot) continue;
    const seen = new Set([id]), queue = [from];
    while (queue.length) {
      for (const t of textsUnder(queue.shift()!, items)) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        shifts.set(t.id, (shifts.get(t.id) ?? 0) + dh);
        queue.push(t);
      }
    }
  }
  return shifts;
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
export function syncOps(items: Item[], links: Link[], fit?: (it: Item) => number | null, push = false): SyncOps {
  const ops: SyncOps = { add: [], change: new Map(), remove: [], addLinks: [], removeLinks: [] };
  const byId = new Map(items.map((i) => [i.id, i]));
  const patch = (id: string, p: Partial<Item>) => {
    const it = byId.get(id)!, diff: Partial<Item> = {};
    for (const [k, v] of Object.entries(p)) if (!same((it as unknown as Record<string, unknown>)[k], v)) (diff as Record<string, unknown>)[k] = v;
    if (Object.keys(diff).length) ops.change.set(id, { ...ops.change.get(id), ...diff });
  };
  const wanted = new Set<string>(), wantedLinks = new Set<string>();
  for (const inst of items.filter((i) => i.inst)) {
    // One that comes with PlanX (see model/builtins.ts) is laid out from its frame at 0, 0, its copies
    // stacked over the instance (just above it, in their order).
    const builtin = BUILTINS.get(inst.inst!);
    const comp = builtin?.frame ?? byId.get(inst.inst!);
    // With its component gone, an instance is left an ordinary frame, its copies ordinary items.
    if (!comp?.comp) {
      patch(inst.id, { inst: undefined });
      for (const c of items.filter((i) => i.host === inst.id)) { patch(c.id, { from: undefined, host: undefined, ovr: undefined }); wanted.add(c.id); }
      continue;
    }
    // An instance put inside its own component (or copies of copies of copies) would never end.
    const inside = builtin ? builtin.items.map((i) => ({ ...i, z: inst.z + (i.z + 1) / 100 }))
      : contents(comp, byId, items).filter((i) => i.id.split('~').length < 4), ids = new Set(inside.map((i) => i.id));
    if (ids.has(inst.id)) continue;
    // A folded component keeps where it was and its size unfolded.
    const dx = inst.x - comp.x, dy = inst.y - comp.y, cw = comp.fold?.w ?? comp.w, ch = comp.fold?.h ?? comp.h;
    const map = (id: string) => copyId(inst.id, id);
    const grow = inst.grow ?? { w: 0, h: 0 }, box = inside.length ? around(inside) : null;
    patch(inst.id, { w: cw + grow.w, h: ch + grow.h, text: comp.text, members: (comp.members ?? []).filter((m) => ids.has(m)).map(map), fold: undefined });
    const made: Array<{ src: Item; old: Item | undefined; want: Item }> = [];
    for (const src of inside) {
      const id = map(src.id), old = byId.get(id), at = box && (grow.w || grow.h) ? stretched(src, box, grow) : src;
      const want: Item = { ...src, id, x: at.x + dx, y: at.y + dy, w: at.w, h: at.h, from: src.id, host: inst.id, comp: undefined, inst: undefined, rx: old?.rx };
      if (src.parent) want.parent = ids.has(src.parent) ? map(src.parent) : undefined;
      if (src.members) want.members = src.members.filter((m) => ids.has(m)).map(map);
      // (What's no longer kept, as boards from before may have, goes.)
      const kept = (old?.ovr ?? []).filter((k) => OVERRIDES.has(k) || k === 'h');
      for (const k of kept) (want as unknown as Record<string, unknown>)[k] = (old as unknown as Record<string, unknown>)[k];
      // Text made wider or narrower (stretched with the instance) is measured again, by `fit` (the
      // editor's, which knows the fonts), its own text if it has one.
      if (old && kept.includes('text') && SIZED_BY_TEXT.has(src.type)) {
        want.w = src.type === 'text' ? at.w : old.w;
        want.h = want.w !== old.w ? fit?.(want) ?? old.h : old.h;
      } else if (src.type === 'text' && at.w !== src.w) want.h = fit?.(want) ?? want.h;
      want.ovr = kept.length ? kept : undefined;
      made.push({ src, old, want });
    }
    // Text grown or shrunk here (typed in, or wrapping anew as the instance is stretched) takes the
    // text just under it (as it lies in the component) along ("Текст не слипается", src/labs).
    if (push) {
      const grew = new Map(made.filter(({ src, want }) => src.type === 'text' && want.h !== src.h).map(({ src, want }) => [src.id, want.h - src.h]));
      const shifts = textShifts(inside, grew);
      for (const m of made) m.want.y += shifts.get(m.src.id) ?? 0;
    }
    for (const { old, want } of made) {
      const id = want.id;
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

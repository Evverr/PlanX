import * as Y from 'yjs';
import type { Item, Link, LinkStyle, Side } from './types';
import { OVERRIDES, type SyncOps } from './components';

/** Transaction origin for changes made by this client. Only these are undoable. */
export const LOCAL = { local: true };
/** Transaction origin for instances kept in step with their components: never undone themselves. */
const SYNC = { sync: true };

type YItem = Y.Map<unknown>;

/**
 * The board's data, kept in a Yjs document so it can be shared between people.
 * Each item and link is its own Y.Map, so two people changing different fields
 * of the same sticker (one moves it, the other recolours it) both win.
 */
export class Board {
  readonly doc: Y.Doc;
  readonly items: Y.Map<YItem>;
  readonly links: Y.Map<YItem>;
  readonly meta: Y.Map<unknown>;
  readonly undoManager: Y.UndoManager;

  private itemCache: Item[] | null = null;
  private itemIndex = new Map<string, Item>();
  private linkCache: Link[] | null = null;
  private listeners = new Set<() => void>();
  private version = 0;

  constructor(doc: Y.Doc = new Y.Doc()) {
    this.doc = doc;
    this.items = doc.getMap('items');
    this.links = doc.getMap('links');
    this.meta = doc.getMap('meta');
    this.undoManager = new Y.UndoManager([this.items, this.links, this.meta], {
      trackedOrigins: new Set([LOCAL]),
      captureTimeout: 0,
    });
    const changed = () => {
      this.itemCache = null;
      this.linkCache = null;
      this.version++;
      this.listeners.forEach((fn) => fn());
    };
    this.items.observeDeep(changed);
    this.links.observeDeep(changed);
    this.meta.observe(changed);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  /** All items, bottom to top. */
  list(): Item[] {
    if (!this.itemCache) {
      const out: Item[] = [];
      this.itemIndex.clear();
      this.items.forEach((m, id) => {
        const it = { ...(m.toJSON() as Omit<Item, 'id'>), id } as Item;
        out.push(it);
        this.itemIndex.set(id, it);
      });
      out.sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
      this.itemCache = out;
    }
    return this.itemCache;
  }

  get(id: string): Item | undefined {
    this.list();
    return this.itemIndex.get(id);
  }

  linkList(): Link[] {
    if (!this.linkCache) {
      const out: Link[] = [];
      this.links.forEach((m, id) => {
        const from = m.get('from') as string, to = m.get('to') as string;
        if (!this.items.has(from) || !this.items.has(to)) return;
        const fromSide = m.get('fromSide') as Side | undefined, toSide = m.get('toSide') as Side | undefined, style = m.get('style') as LinkStyle | undefined;
        const look: Partial<Link> = {};
        for (const k of ['color', 'lo', 'dash', 'heads', 'via'] as const) if (m.has(k)) (look as Record<string, unknown>)[k] = m.get(k);
        out.push({ id, from, to, ...(fromSide && toSide && { fromSide, toSide }), ...(style && { style }), ...look });
      });
      this.linkCache = out;
    }
    return this.linkCache;
  }

  getLink(id: string): Link | undefined {
    return this.linkList().find((l) => l.id === id);
  }

  get title(): string {
    return (this.meta.get('title') as string) ?? '';
  }

  setTitle(title: string): void {
    this.transact(() => this.meta.set('title', title));
  }

  transact(fn: () => void): void {
    this.lastLocal = Date.now();
    this.doc.transact(fn, LOCAL);
  }

  /** When this client last changed the board (see sync). */
  private lastLocal = 0;

  maxZ(): number {
    const l = this.list();
    return l.length ? l[l.length - 1].z : 0;
  }

  minZ(): number {
    const l = this.list();
    return l.length ? l[0].z : 0;
  }

  add(item: Item): void {
    this.transact(() => {
      const m = new Y.Map<unknown>();
      for (const [k, v] of Object.entries(item)) if (k !== 'id' && v !== undefined) m.set(k, v);
      this.items.set(item.id, m);
    });
  }

  update(id: string, patch: Partial<Item>): void {
    const m = this.items.get(id);
    if (!m) return;
    this.transact(() => {
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'id') continue;
        if (v === undefined) m.delete(k);
        else if (m.get(k) !== v) m.set(k, v);
      }
      // A copy in an instance keeps what's changed on it (see model/components.ts).
      if (m.get('host')) {
        const was = (m.get('ovr') as string[] | undefined) ?? [], now = [...new Set([...was, ...Object.keys(patch).filter((k) => OVERRIDES.has(k))])];
        if (now.length > was.length) m.set('ovr', now);
      }
    });
  }

  /**
   * Brings instances in step with their components (see model/components.ts). After a change made here a
   * moment ago, as part of its undo step (so undoing it brings back what that took from the instances,
   * their copies as they were); after anyone else's, or an undo, outside the undo history.
   */
  sync(ops: SyncOps): void {
    const um = this.undoManager as unknown as { lastChange: number };
    const along = um.lastChange > 0 && Date.now() - this.lastLocal < 250;
    const was = this.undoManager.captureTimeout;
    if (along) this.undoManager.captureTimeout = Number.MAX_SAFE_INTEGER;
    this.doc.transact(() => {
      for (const it of ops.add) {
        const m = new Y.Map<unknown>();
        for (const [k, v] of Object.entries(it)) if (k !== 'id' && v !== undefined) m.set(k, v);
        this.items.set(it.id, m);
      }
      ops.change.forEach((p, id) => {
        const m = this.items.get(id);
        if (m) for (const [k, v] of Object.entries(p)) if (k !== 'id') { if (v === undefined) m.delete(k); else m.set(k, v); }
      });
      ops.remove.forEach((id) => this.items.delete(id));
      for (const l of ops.addLinks) {
        const m = new Y.Map<unknown>();
        m.set('from', l.from);
        m.set('to', l.to);
        if (l.fromSide && l.toSide) { m.set('fromSide', l.fromSide); m.set('toSide', l.toSide); }
        if (l.style) m.set('style', l.style);
        this.links.set(l.id, m);
      }
      ops.removeLinks.forEach((id) => this.links.delete(id));
    }, along ? LOCAL : SYNC);
    this.undoManager.captureTimeout = was;
  }

  /** Removes items and links by id, plus any link left without an end. */
  remove(ids: Iterable<string>): void {
    const gone = new Set(ids);
    this.transact(() => {
      gone.forEach((id) => {
        this.items.delete(id);
        this.links.delete(id);
      });
      this.links.forEach((m, id) => {
        if (gone.has(m.get('from') as string) || gone.has(m.get('to') as string)) this.links.delete(id);
      });
    });
  }

  addLink(link: Link): void {
    this.transact(() => {
      const m = new Y.Map<unknown>();
      m.set('from', link.from);
      m.set('to', link.to);
      if (link.fromSide && link.toSide) { m.set('fromSide', link.fromSide); m.set('toSide', link.toSide); }
      if (link.style) m.set('style', link.style);
      for (const k of ['color', 'lo', 'dash', 'heads', 'via'] as const) if (link[k] !== undefined) m.set(k, link[k]);
      this.links.set(link.id, m);
    });
  }

  /** Leads a link to another item, by the side it now meets it at (none for a straight one). */
  retarget(id: string, to: string, toSide: Side | undefined): void {
    const m = this.links.get(id);
    if (!m) return;
    this.transact(() => {
      m.set('to', to);
      if (toSide && m.get('fromSide')) m.set('toSide', toSide);
    });
  }

  /** Changes how a link runs (see LinkStyle); unset is a smooth curve. Its nodes go: it starts afresh
   *  the new way. */
  setLinkStyle(id: string, style: LinkStyle | undefined): void {
    const m = this.links.get(id);
    if (!m) return;
    this.transact(() => {
      if ((m.get('style') ?? null) === (style ?? null)) return;
      if (style) m.set('style', style); else m.delete('style');
      m.delete('via');
    });
  }

  /** Changes how a link looks: its colour, opacity, dashes, arrowheads (an undefined field goes back
   *  to the usual). */
  updateLink(id: string, patch: Pick<Link, 'color' | 'lo' | 'dash' | 'heads' | 'via' | 'fromSide' | 'toSide'>): void {
    const m = this.links.get(id);
    if (!m) return;
    this.transact(() => {
      for (const [k, v] of Object.entries(patch)) { if (v === undefined) m.delete(k); else m.set(k, v); }
    });
  }

  hasLink(from: string, to: string): boolean {
    return this.linkList().some((l) => l.from === from && l.to === to);
  }

  /** Replaces the whole board, used for "clear" and seeding. */
  replaceAll(items: Item[], links: Link[], title?: string): void {
    this.transact(() => {
      this.items.clear();
      this.links.clear();
      items.forEach((it) => this.add(it));
      links.forEach((l) => this.addLink(l));
      if (title !== undefined) this.meta.set('title', title);
    });
  }

  /** Merges every change until endGesture() into one undo step (a drag, a resize). Gestures can
   *  nest (a colour picked while a picker is dragged): the outermost one makes the step. */
  beginGesture(): void {
    if (this.gestures++ > 0) return;
    this.undoManager.stopCapturing();
    this.undoManager.captureTimeout = Number.MAX_SAFE_INTEGER;
  }

  endGesture(): void {
    if (this.gestures > 1) { this.gestures--; return; }
    this.gestures = 0;
    this.undoManager.captureTimeout = 0;
    this.undoManager.stopCapturing();
  }

  private gestures = 0;

  undo(): void {
    this.undoManager.undo();
  }

  redo(): void {
    this.undoManager.redo();
  }
}

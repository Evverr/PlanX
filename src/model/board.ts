import * as Y from 'yjs';
import type { Item, Link } from './types';

/** Transaction origin for changes made by this client. Only these are undoable. */
export const LOCAL = { local: true };

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
        if (this.items.has(from) && this.items.has(to)) out.push({ id, from, to });
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
    this.doc.transact(fn, LOCAL);
  }

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
    });
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
      this.links.set(link.id, m);
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

  /** Merges every change until endGesture() into one undo step (a drag, a resize). */
  beginGesture(): void {
    this.undoManager.stopCapturing();
    this.undoManager.captureTimeout = Number.MAX_SAFE_INTEGER;
  }

  endGesture(): void {
    this.undoManager.captureTimeout = 0;
    this.undoManager.stopCapturing();
  }

  undo(): void {
    this.undoManager.undo();
  }

  redo(): void {
    this.undoManager.redo();
  }
}

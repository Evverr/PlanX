import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import { defaultServerUrl } from '../collab/connection';
import { readJSON } from '../storage';
import { myId } from './labs';
import { REACTIONS } from './overlays';

/**
 * "Wishlist": what people wish PlanX had, one list for everyone, kept on the sync server as a document
 * of its own (and in this browser, to show at once and work offline). Each wish is its own Y.Map, its
 * reactions (those on the board's items) each a Y.Map by browser id: one of each from each, and two people
 * reacting at once both count. The first, the like, is in `likes` (as the likes of before); the others in
 * `rx`, by emoji. Hidden (`hid`), it's shown faintly.
 */
export interface Wish { id: string; text: string; at: number; by: string; likes: number; rx: Array<{ emoji: string; n: number; mine: boolean }>; hidden: boolean }
export type WishSort = 'likes' | 'new';

const ROOM = 'wishlist';

export class Wishes {
  private readonly doc = new Y.Doc();
  private readonly local: IndexeddbPersistence;
  private readonly remote: WebsocketProvider;
  private readonly all = this.doc.getMap<Y.Map<unknown>>('wishes');

  constructor() {
    // Not "planx-…", where the shelf looks for boards.
    this.local = new IndexeddbPersistence(`${ROOM}-planx`, this.doc);
    this.remote = new WebsocketProvider(defaultServerUrl(), ROOM, this.doc);
  }

  subscribe(fn: () => void): () => void {
    const on = () => fn();
    this.all.observeDeep(on);
    return () => this.all.unobserveDeep(on);
  }

  /** Who put a reaction on a wish (the like: its likes). */
  private who(m: Y.Map<unknown>, emoji: string): Y.Map<boolean> | undefined {
    if (emoji === REACTIONS[0]) return m.get('likes') as Y.Map<boolean> | undefined;
    return (m.get('rx') as Y.Map<Y.Map<boolean>> | undefined)?.get(emoji);
  }

  list(sort: WishSort): Wish[] {
    const me = myId();
    const wishes = [...this.all.entries()].map(([id, m]) => {
      const rx = REACTIONS.map((emoji) => { const w = this.who(m, emoji); return { emoji, n: w?.size ?? 0, mine: !!w?.has(me) }; }).filter((r) => r.n > 0);
      return { id, text: String(m.get('text') ?? ''), at: Number(m.get('at') ?? 0), by: String(m.get('by') ?? ''), likes: rx.reduce((s, r) => s + r.n, 0), rx, hidden: !!m.get('hid') };
    });
    return wishes.sort((a, b) => (sort === 'likes' ? b.likes - a.likes || b.at - a.at : b.at - a.at));
  }

  add(text: string): void {
    const t = text.trim().slice(0, 1000);
    if (!t) return;
    const m = new Y.Map<unknown>();
    this.doc.transact(() => {
      this.all.set(Math.random().toString(36).slice(2, 12), m);
      m.set('text', t);
      m.set('at', Date.now());
      m.set('by', readJSON<{ name: string }>('planx-me')?.name ?? '');
      m.set('likes', new Y.Map<boolean>());
    });
  }

  /** Puts this browser's reaction on the wish, or takes it back. */
  react(id: string, emoji: string): void {
    const m = this.all.get(id), me = myId();
    if (!m) return;
    this.doc.transact(() => {
      let w = this.who(m, emoji);
      if (!w) {
        w = new Y.Map<boolean>();
        if (emoji === REACTIONS[0]) m.set('likes', w);
        else {
          let rx = m.get('rx') as Y.Map<Y.Map<boolean>> | undefined;
          if (!rx) m.set('rx', (rx = new Y.Map<Y.Map<boolean>>()));
          rx.set(emoji, w);
        }
      }
      if (w.has(me)) w.delete(me); else w.set(me, true);
    });
  }

  /** Gone for everyone. */
  remove(id: string): void {
    this.all.delete(id);
  }

  /** Shown faintly (for everyone), or as before. */
  hide(id: string): void {
    const m = this.all.get(id);
    if (!m) return;
    if (m.get('hid')) m.delete('hid'); else m.set('hid', true);
  }

  destroy(): void {
    this.remote.destroy();
    void this.local.destroy();
    this.doc.destroy();
  }
}

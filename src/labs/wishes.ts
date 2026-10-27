import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import { defaultServerUrl } from '../collab/connection';
import { readJSON } from '../storage';
import { myId } from './labs';

/**
 * "Wishlist": what people wish PlanX had, one list for everyone, kept on the sync server as a document
 * of its own (and in this browser, to show at once and work offline). Each wish is its own Y.Map, its
 * likes a Y.Map by browser id: one like from each, and two people liking at once both count.
 */
export interface Wish { id: string; text: string; at: number; by: string; likes: number; mine: boolean }
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

  list(sort: WishSort): Wish[] {
    const me = myId();
    const wishes = [...this.all.entries()].map(([id, m]) => {
      const likes = m.get('likes') as Y.Map<boolean> | undefined;
      return { id, text: String(m.get('text') ?? ''), at: Number(m.get('at') ?? 0), by: String(m.get('by') ?? ''), likes: likes?.size ?? 0, mine: !!likes?.has(me) };
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

  /** Likes the wish, or takes the like back. */
  like(id: string): void {
    const likes = this.all.get(id)?.get('likes') as Y.Map<boolean> | undefined, me = myId();
    if (!likes) return;
    if (likes.has(me)) likes.delete(me); else likes.set(me, true);
  }

  destroy(): void {
    this.remote.destroy();
    void this.local.destroy();
    this.doc.destroy();
  }
}

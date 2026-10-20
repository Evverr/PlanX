import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { Point } from '../canvas/geometry';
import type { Peer } from '../canvas/renderer';
import type { Presence } from '../editor/editor';

export type Status = 'connecting' | 'online' | 'offline';

export interface Me { name: string; color: string }

const PEER_COLORS = ['#E5484D', '#F76B15', '#2F9E44', '#1C7ED6', '#7048E8', '#D6409F', '#0C8599', '#AD7F00'];
const ANIMALS = ['Ёж', 'Лис', 'Барсук', 'Сова', 'Енот', 'Бобр', 'Кит', 'Рысь', 'Выдра', 'Лось', 'Тюлень', 'Сокол'];

/** Board id from the address (?board=…), "demo" when there is none. */
export function boardIdFromUrl(): string {
  const id = new URLSearchParams(location.search).get('board') ?? 'demo';
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : 'demo';
}

export function newBoardId(): string {
  return Math.random().toString(36).slice(2, 12);
}

function loadMe(): Me {
  try {
    const saved = JSON.parse(localStorage.getItem('planx-me') ?? 'null') as Me | null;
    if (saved?.name && saved.color) return saved;
  } catch { /* fall through */ }
  const me = {
    name: ANIMALS[Math.floor(Math.random() * ANIMALS.length)],
    color: PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)],
  };
  try { localStorage.setItem('planx-me', JSON.stringify(me)); } catch { /* not remembered */ }
  return me;
}

/**
 * Connects a board document to the sync server and to this browser's IndexedDB,
 * so the board loads instantly, works offline and catches up when back online.
 */
export class Connection implements Presence {
  readonly doc = new Y.Doc();
  readonly provider: WebsocketProvider;
  readonly local: IndexeddbPersistence;
  me: Me;
  status: Status = 'connecting';
  private listeners = new Set<() => void>();
  private peerCache: Peer[] = [];

  constructor(readonly boardId: string, serverUrl = defaultServerUrl()) {
    this.me = loadMe();
    this.local = new IndexeddbPersistence(`planx-${boardId}`, this.doc);
    this.provider = new WebsocketProvider(serverUrl, boardId, this.doc);
    const aw = this.provider.awareness;
    aw.setLocalState({ user: this.me, cursor: null, selection: [] });
    this.provider.on('status', ({ status }: { status: string }) => {
      this.status = status === 'connected' ? 'online' : status === 'connecting' ? 'connecting' : 'offline';
      this.notify();
    });
    this.provider.on('connection-close', () => { this.status = 'offline'; this.notify(); });
    aw.on('change', () => {
      this.peerCache = [];
      aw.getStates().forEach((st, id) => {
        if (id === aw.clientID || !st.user) return;
        this.peerCache.push({ id, name: st.user.name, color: st.user.color, cursor: st.cursor ?? null, selection: st.selection ?? [] });
      });
      this.notify();
    });
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  peers(): Peer[] {
    return this.peerCache;
  }

  setCursor(p: Point | null): void {
    this.provider.awareness.setLocalStateField('cursor', p);
  }

  setSelection(ids: string[]): void {
    this.provider.awareness.setLocalStateField('selection', ids);
  }

  rename(name: string): void {
    this.me = { ...this.me, name: name.trim().slice(0, 24) || this.me.name };
    try { localStorage.setItem('planx-me', JSON.stringify(this.me)); } catch { /* not remembered */ }
    this.provider.awareness.setLocalStateField('user', this.me);
    this.notify();
  }

  destroy(): void {
    this.provider.destroy();
    this.local.destroy();
    this.doc.destroy();
  }
}

function defaultServerUrl(): string {
  const env = import.meta.env.VITE_SYNC_URL as string | undefined;
  if (env) return env;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

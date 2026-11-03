import { useSyncExternalStore } from 'react';
import type { Board } from '../model/board';
import type { Editor } from '../editor/editor';
import { uid, type Item } from '../model/types';
import { boardIdFromUrl } from '../collab/connection';
import { readJSON, writeJSON } from '../storage';
import { labOn } from './labs';

/**
 * Layers (src/labs): the board's items in named sets, shared with everyone; each shown or hidden for
 * oneself alone (kept per board in this browser), the hidden ones neither seen nor picked. New items
 * go in the layer picked (shown again if it was hidden); "Сюда" puts the picked items in a layer.
 * The first layer holds everything not put in another (items without `ly`, or with a layer since gone).
 */
export interface Layer { id: string; name: string; n: number }
export const BASE = 'base';

const map = (b: Board) => b.doc.getMap<{ name: string; n: number }>('layers');

/** The layers in the order they were made, the first one always among them. */
export function layersOf(b: Board): Layer[] {
  const out: Layer[] = [];
  map(b).forEach((l, id) => out.push({ id, ...l }));
  if (!out.some((l) => l.id === BASE)) out.push({ id: BASE, name: 'Слой 1', n: 1 });
  return out.sort((a, c) => a.n - c.n);
}

/** A new layer, "Слой" with the next number; gives back its id. */
export function addLayer(b: Board): string {
  const n = Math.max(...layersOf(b).map((l) => l.n)) + 1, id = uid();
  map(b).set(id, { name: `Слой ${n}`, n });
  return id;
}

export function renameLayer(b: Board, id: string, name: string): void {
  const l = layersOf(b).find((l) => l.id === id);
  if (l && name.trim()) map(b).set(id, { name: name.trim(), n: l.n });
}

/** Which layer an item is in. */
const layerOf = (it: Item, ids: Set<string>) => (it.ly && ids.has(it.ly) ? it.ly : BASE);

/* What's hidden and which layer is picked, here alone. */
const KEY = `planx-layers-${boardIdFromUrl() ?? ''}`;
let mine = readJSON<{ hidden: string[]; active: string }>(KEY) ?? { hidden: [], active: BASE };
let version = 0;
const listeners = new Set<() => void>();
function setMine(next: typeof mine) {
  mine = next;
  writeJSON(KEY, mine);
  version++;
  listeners.forEach((fn) => fn());
}
export const subscribeLayers = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useLayersMine = () => useSyncExternalStore(subscribeLayers, () => mine);
/** Changes whenever what's hidden does (the feature switched off or on too). */
export const layersVersion = () => (labOn('layers') ? version : -1);

export function setLayerShown(ed: Editor, id: string, shown: boolean): void {
  const hidden = mine.hidden.filter((h) => h !== id);
  setMine({ ...mine, hidden: shown ? hidden : [...hidden, id] });
  // Hidden: not picked any more.
  if (!shown) { const gone = hiddenByLayers(ed.board, ed.board.list()); ed.setSelection([...ed.selection].filter((s) => !gone.has(s))); }
  ed.requestRender();
}

export function pickLayer(id: string): void { setMine({ ...mine, active: id }); }

/** The items in hidden layers. */
export function hiddenByLayers(b: Board, items: Item[]): Set<string> {
  if (!labOn('layers') || !mine.hidden.length) return new Set();
  const ids = new Set(layersOf(b).map((l) => l.id)), hidden = new Set(mine.hidden);
  return new Set(items.filter((it) => hidden.has(layerOf(it, ids))).map((it) => it.id));
}

/** The layer a new item goes in (none for the first), shown if it was hidden. */
export function newItemLayer(b: Board): string | undefined {
  if (!labOn('layers')) return undefined;
  const id = layersOf(b).some((l) => l.id === mine.active) ? mine.active : BASE;
  if (mine.hidden.includes(id)) setMine({ ...mine, hidden: mine.hidden.filter((h) => h !== id) });
  return id === BASE ? undefined : id;
}

/** The picked items, with what they carry, put in a layer. */
export function moveToLayer(ed: Editor, id: string): void {
  const ids = [...ed.carried(ed.selectedItems()).keys()];
  ed.board.transact(() => { for (const i of ids) ed.board.update(i, { ly: id === BASE ? undefined : id }); });
}

/** How many items each layer holds. */
export function layerCounts(b: Board): Map<string, number> {
  const ids = new Set(layersOf(b).map((l) => l.id)), out = new Map<string, number>();
  for (const it of b.list()) { const l = layerOf(it, ids); out.set(l, (out.get(l) ?? 0) + 1); }
  return out;
}

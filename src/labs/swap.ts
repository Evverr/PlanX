import type { Item } from '../model/types';
import { isPoly, type Tool } from '../editor/tools';
import { shapeStyle } from '../editor/shapeStyle';
import { isLocked, labOn } from './labs';

/**
 * "Замена двойным кликом": an emoji, an icon, a shape or a game sticker double-clicked on the board opens its
 * neighbours (the other emoji, icons, shapes) to put one in its place, keeping where it is, its
 * size and colours. In an instance that's a change of the copy, kept as the rest of its changes.
 */
export type SwapKind = 'emoji' | 'icon' | 'shape' | 'doodle';

/** What's opened with: the item, through the "planx:swap" event. */
export const SWAP_EVENT = 'planx:swap';

export function swapKind(it: Item | undefined): SwapKind | null {
  // Not in a component that comes with PlanX (a task's ring is clicked through its states instead).
  if (!it || !labOn('swap') || isLocked(it) || it.from?.startsWith('@')) return null;
  if (it.type === 'emoji') return 'emoji';
  if (it.type === 'icon') return 'icon';
  if (it.type === 'image' && it.doodle) return 'doodle';
  if (it.type === 'rect' || it.type === 'ellipse' || it.type === 'polygon') return 'shape';
  return null;
}

/** The shape tool an item is drawn as. */
export const shapeOf = (it: Item): Tool => (it.type === 'polygon' ? (it.shape ?? 'triangle') : it.type as Tool);

/** What turns the item into neighbour `id` (an emoji, an icon or a shape tool). */
export function swapPatch(it: Item, kind: SwapKind, id: string): Partial<Item> {
  if (kind === 'emoji') return { emoji: id };
  if (kind === 'icon') return { icon: id };
  if (kind === 'doodle') return { doodle: id };
  const t = id as Tool;
  const p: Partial<Item> = isPoly(t) ? { type: 'polygon', shape: t } : { type: t as Item['type'], shape: undefined };
  // Out of an ellipse, corners come rounded as new shapes do.
  if (t !== 'ellipse' && it.rad === undefined) p.rad = shapeStyle().rad;
  return p;
}

export function openSwap(id: string): void {
  window.dispatchEvent(new CustomEvent(SWAP_EVENT, { detail: id }));
}

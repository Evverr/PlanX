import type { Item } from '../model/types';
import { uid } from '../model/types';

/**
 * «Группы»: groups in groups, as in Figma and Miro. Each item holds the groups it's in, the outermost
 * first (`gp`). Something in one is picked with all of the outermost; a double click goes a level in
 * (the group within it the item's in, then the item itself); undoing a group takes that level away.
 */

/** The groups it's in, the outermost first. */
export const pathOf = (it: Item | undefined): string[] => it?.gp ?? [];

/** All that's in a group, at any depth. */
export const membersOf = (items: Item[], g: string): Item[] => items.filter((i) => pathOf(i).includes(g));

/** These with all of the outermost group each is in. */
export function withGroups(items: Item[], ids: Set<string>): Set<string> {
  const outer = new Set([...ids].map((id) => pathOf(items.find((i) => i.id === id))[0]).filter(Boolean));
  if (!outer.size) return ids;
  const out = new Set(ids);
  for (const it of items) if (outer.has(pathOf(it)[0])) out.add(it.id);
  return out;
}

const same = (a: Item[], ids: Set<string>) => a.length === ids.size && a.every((i) => ids.has(i.id));

/** The group picked, all of it and nothing else: it, how deep it is in `gp`, and how many it holds
 *  (the groups and the items right in it). */
export function pickedGroup(items: Item[], ids: Set<string>): { g: string; level: number; count: number } | null {
  const first = items.find((i) => ids.has(i.id)), path = pathOf(first);
  for (let level = path.length - 1; level >= 0; level--) {
    const g = path[level], all = membersOf(items, g);
    if (!same(all, ids)) continue;
    return { g, level, count: new Set(all.map((i) => pathOf(i)[level + 1] ?? i.id)).size };
  }
  return null;
}

/** A double click on `it` with these picked: what's picked a level in (the group it's in within the one
 *  picked, or it alone), or null when that isn't a group of it picked. */
export function levelIn(items: Item[], ids: Set<string>, it: Item): string[] | null {
  if (!ids.has(it.id) || ids.size < 2) return null;
  const path = pathOf(it);
  for (let level = 0; level < path.length; level++) {
    if (!same(membersOf(items, path[level]), ids)) continue;
    const next = path[level + 1];
    return next ? membersOf(items, next).map((i) => i.id) : [it.id];
  }
  return null;
}

/** These (of `items`) made one group, within the group they're all in (if they are; all of a group
 *  picked is that group, not what's in it): the new `gp` of each, or null when there aren't two or more
 *  things to put in it. */
export function grouped(items: Item[], picked: Item[]): Map<string, string[]> | null {
  const paths = picked.map(pathOf), ids = new Set(picked.map((i) => i.id));
  let common = 0;
  while (paths.every((p) => p.length > common && p[common] === paths[0][common])) common++;
  while (common > 0 && same(membersOf(items, paths[0][common - 1]), ids)) common--;
  // (Two or more in it: groups or items right under where it goes.)
  if (new Set(picked.map((i, k) => paths[k][common] ?? i.id)).size < 2) return null;
  const g = uid();
  return new Map(picked.map((i, k) => [i.id, [...paths[k].slice(0, common), g, ...paths[k].slice(common)]]));
}

/** The group picked undone: the new `gp` of what was in it (what was in it is what's in the groups
 *  within it, or on its own). */
export function ungrouped(items: Item[], ids: Set<string>): Map<string, string[] | undefined> | null {
  const p = pickedGroup(items, ids);
  if (!p) return null;
  return new Map(membersOf(items, p.g).map((i) => {
    const path = pathOf(i).filter((g) => g !== p.g);
    return [i.id, path.length ? path : undefined];
  }));
}

/** Copies' groups: each a new one, the same for all copied from one. */
export function copyGroups(src: Item[]): (path: string[] | undefined) => string[] | undefined {
  const ids = new Map<string, string>();
  for (const it of src) for (const g of pathOf(it)) if (!ids.has(g)) ids.set(g, uid());
  return (path) => path?.map((g) => ids.get(g)!);
}

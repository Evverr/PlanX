import type { Item, Link } from '../model/types';
import { uid } from '../model/types';

/**
 * Copies of items, and of the links among them, with fresh ids, `offset` along both axes: they keep
 * their order and go on top of `maxZ` (frames keep theirs, staying under what they hold). Copied mind
 * map nodes hang from the copies of their parents (or still from the originals), copied frames hold
 * the copies of what they held.
 */
export function copiesOf(src: Item[], srcLinks: Link[], offset: number, maxZ: number): { items: Item[]; links: Link[]; map: Map<string, string> } {
  const map = new Map<string, string>();
  let z = maxZ;
  const items = [...src].sort((a, b) => a.z - b.z).map((it) => {
    const id = uid();
    map.set(it.id, id);
    return { ...it, id, x: it.x + offset, y: it.y + offset, z: it.type === 'frame' ? it.z : ++z };
  }).map((it) => {
    if (it.parent && map.has(it.parent)) it.parent = map.get(it.parent);
    if (it.members) it.members = it.members.map((m) => map.get(m)).filter((m): m is string => !!m);
    return it;
  });
  const links = srcLinks.map((l) => ({ ...l, id: uid(), from: map.get(l.from)!, to: map.get(l.to)! }));
  return { items, links, map };
}

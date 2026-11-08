import type { Item, Link } from '../model/types';
import { uid } from '../model/types';
import { copyId } from '../model/components';

/**
 * Copies of items, and of the links among them, with fresh ids, `offset` along both axes: they keep
 * their order and go on top of `maxZ` (frames keep theirs, staying under what they hold). Copied mind
 * map nodes hang from the copies of their parents (or still from the originals), copied frames hold
 * the copies of what they held. A copied instance keeps what was changed in it: its copies are made
 * under its new id, as its sync would make them; copies taken without their instance become items
 * of their own. `whole`: what's copied goes on its own (to another board, see Editor.placeMyObject), so
 * instances among them are of the copies of their components there, when those are copied too.
 */
export function copiesOf(src: Item[], srcLinks: Link[], offset: number, maxZ: number, whole = false): { items: Item[]; links: Link[]; map: Map<string, string> } {
  const map = new Map<string, string>();
  let z = maxZ;
  for (const it of src) if (!it.host) map.set(it.id, uid());
  const mapped = (id: string | undefined) => (whole && id && map.has(id) ? map.get(id)! : id);
  const hosted = (it: Item) => !!it.host && map.has(it.host) && !!it.from;
  for (const it of src) if (it.host) map.set(it.id, hosted(it) ? copyId(map.get(it.host)!, mapped(it.from)!) : uid());
  // Copies of a group in a group of their own.
  const grps = new Map<string, string>();
  for (const it of src) if (it.grp && !grps.has(it.grp)) grps.set(it.grp, uid());
  const items = [...src].sort((a, b) => a.z - b.z).map((it) => {
    const id = map.get(it.id)!, hold = it.host ? (hosted(it) ? { host: map.get(it.host) } : { from: undefined, host: undefined, ovr: undefined }) : {};
    // A copy starts with no reactions of its own.
    return { ...it, ...hold, id, x: it.x + offset, y: it.y + offset, z: it.type === 'frame' ? it.z : ++z, rx: undefined, ...(it.inst && { born: Date.now() }) };
  }).map((it) => {
    if (it.parent && map.has(it.parent)) it.parent = map.get(it.parent);
    if (whole) { it.inst = mapped(it.inst); it.from = mapped(it.from); }
    if (it.members) it.members = it.members.map((m) => map.get(m)).filter((m): m is string => !!m);
    if (it.grp) it.grp = grps.get(it.grp);
    return it;
  });
  // A link copied with its instance is named as the instance's sync names it.
  const insts = src.filter((i) => i.inst);
  const linkId = (l: Link) => {
    const inst = insts.find((i) => l.id.startsWith(`${i.id}~`));
    return inst ? `${map.get(inst.id)}~${l.id.slice(inst.id.length + 1)}` : uid();
  };
  const links = srcLinks.map((l) => ({ ...l, id: linkId(l), from: map.get(l.from)!, to: map.get(l.to)!, ...(l.via && { via: l.via.map((p) => ({ x: p.x + offset, y: p.y + offset })) }) }));
  return { items, links, map };
}

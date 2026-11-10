/**
 * PlanX for Claude: an MCP server (Streamable HTTP, stateless, plain JSON answers) at /mcp/<MCP_KEY>, so
 * Claude can read a board and change it as one more person on it: what it does goes to everyone on the
 * board at once. Off unless MCP_KEY is set (see index.ts).
 */
import { Board } from '../src/model/board';
import { addChild, childPlace, type Toward } from '../src/model/mind';
import { mindSize } from '../src/canvas/text';
import { DEFAULTS, FILLS, STROKE_COLORS, TEXT_COLORS, uid, type Item, type ItemType, type LinkStyle, type Side } from '../src/model/types';

/** A board by its id, for `fn` to read or change; null if there's no such board. */
export type UseBoard = <T>(id: string, fn: (b: Board) => T) => T | null;

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const ADDABLE: ItemType[] = ['sticky', 'text', 'rect', 'ellipse', 'polygon', 'frame', 'task'];
const SHAPES = ['triangle', 'rhombus', 'pentagon', 'star', 'hexagon', 'parallelogram', 'trapezoid', 'arrow', 'cross'];
const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const STYLES: LinkStyle[] = ['straight', 'elbow', 'arc'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const names = (o: Record<string, string>) => Object.keys(o).filter(Boolean).join(', ');

/** A board's id from its link (…?board=<id>) or the id itself. */
export function boardId(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const m = /[?&]board=([A-Za-z0-9_-]{1,64})/.exec(s) ?? /^([A-Za-z0-9_-]{1,64})$/.exec(s.trim());
  return m ? m[1] : null;
}

class Bad extends Error {}

/** What can be set on an item, checked: a value, or null to take it off (back to the usual). */
const FIELDS: Record<string, (v: unknown) => boolean> = {
  x: (v) => typeof v === 'number' && Number.isFinite(v),
  y: (v) => typeof v === 'number' && Number.isFinite(v),
  w: (v) => typeof v === 'number' && v >= 1,
  h: (v) => typeof v === 'number' && v >= 1,
  fs: (v) => typeof v === 'number' && v >= 4 && v <= 400,
  rot: (v) => typeof v === 'number' && Number.isFinite(v),
  fo: (v) => typeof v === 'number' && v >= 0 && v <= 1,
  text: (v) => typeof v === 'string',
  desc: (v) => typeof v === 'string',
  color: (v) => typeof v === 'string' && (v in FILLS || HEX.test(v)),
  sc: (v) => typeof v === 'string' && (v in STROKE_COLORS || v === 'none' || HEX.test(v)),
  tc: (v) => typeof v === 'string' && (v in TEXT_COLORS || HEX.test(v)),
  ta: (v) => v === 'left' || v === 'center' || v === 'right',
  st: (v) => v === 'todo' || v === 'doing' || v === 'done',
  shape: (v) => typeof v === 'string' && SHAPES.includes(v),
};

function patchOf(o: Record<string, unknown>, keep: string[] = []): Partial<Item> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (keep.includes(k)) continue;
    const ok = FIELDS[k];
    if (!ok) throw new Bad(`Unknown field "${k}". Fields: ${Object.keys(FIELDS).join(', ')}`);
    if (v === null) { out[k] = undefined; continue; }
    if (!ok(v)) throw new Bad(`Bad value for "${k}": ${JSON.stringify(v)}`);
    out[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
  }
  return out as Partial<Item>;
}

const r = (n: number) => Math.round(n);
/** What each kind is called on the board (as in the parameters' list, labs/ContextMenu.tsx). */
const NAMES: Partial<Record<ItemType, string>> = {
  sticky: 'Заметка', text: 'Текст', rect: 'Прямоугольник', ellipse: 'Эллипс', polygon: 'Фигура', task: 'Задача', mind: 'Узел майнд-карты',
  icon: 'Иконка', emoji: 'Эмодзи', ink: 'Рисунок', image: 'Картинка', frame: 'Фрейм', table: 'Таблица', audio: 'Аудиозаметка',
};
/** Its usual name on the board: "Прямоугольник", the next "Прямоугольник 1" and so on (see Board.add). */
export const nameOf = (it: Item): string => `${it.tl ? 'Таймлайн' : it.doodle ? 'Стикер' : NAMES[it.type] ?? it.type}${it.nm ? ` ${it.nm}` : ''}`;
const inside = (it: Item, f: Item) => it.x >= f.x && it.y >= f.y && it.x + it.w <= f.x + f.w && it.y + it.h <= f.y + f.h;
/** The frame an item's in (the smallest, a frame of its own: what was put in it, an old one: what lies in it). */
function frameOf(it: Item, frames: Item[]): Item | undefined {
  const hold = frames.filter((f) => f.id !== it.id && (f.members ? f.members.includes(it.id) : inside(it, f)));
  return hold.sort((a, b) => a.w * a.h - b.w * b.h)[0];
}
/** An item as Claude reads it: what it is, where, what's written and its colours; pictures, drawings and the like left out. */
function itemOut(it: Item, frames: Item[]) {
  const o: Record<string, unknown> = { id: it.id, name: nameOf(it), type: it.tl ? 'timeline' : it.type, x: r(it.x), y: r(it.y), w: r(it.w), h: r(it.h) };
  const f = frameOf(it, frames);
  if (f) o.frame = f.id;
  for (const k of ['text', 'color', 'sc', 'tc', 'fs', 'rot', 'shape', 'icon', 'st', 'desc', 'parent', 'cells'] as const) {
    const v = it[k];
    if (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) o[k] = v;
  }
  return o;
}

const ID = { type: 'string', description: 'The item id (from read_board)' };
const BOARD = { type: 'string', description: 'The board: its link (https://…?board=<id>) or its id' };
const FIELD_PROPS = {
  x: { type: 'number', description: 'Left edge, board units' },
  y: { type: 'number', description: 'Top edge, board units' },
  w: { type: 'number' }, h: { type: 'number' },
  text: { type: 'string', description: 'What is written in it (a frame: its title)' },
  color: { type: 'string', description: `Fill: ${names(FILLS)} or #rrggbb` },
  sc: { type: 'string', description: `Outline: ${names(STROKE_COLORS)}, none or #rrggbb` },
  tc: { type: 'string', description: `Text colour: ${names(TEXT_COLORS)} or #rrggbb` },
  fs: { type: 'number', description: 'Font size' },
  ta: { type: 'string', enum: ['left', 'center', 'right'] },
  rot: { type: 'number', description: 'Degrees clockwise' },
  fo: { type: 'number', description: 'Fill opacity 0…1' },
  st: { type: 'string', enum: ['todo', 'doing', 'done'], description: 'Tasks: status' },
  desc: { type: 'string', description: 'Tasks: description' },
  shape: { type: 'string', enum: SHAPES, description: 'Polygons: which figure' },
};

/** A tool as Claude is told of it. */
interface Tool { name: string; description: string; inputSchema: object }

const TOOLS: Tool[] = [
  {
    name: 'read_board',
    description: 'Everything on a PlanX board: its title, items (id, type, position and size in board units, text, colours) and links between them. Read it before changing anything.',
    inputSchema: { type: 'object', properties: { board: BOARD }, required: ['board'] },
  },
  {
    name: 'update_items',
    description: 'Changes items on a board: recolour, rewrite, move, resize. Each change names an item by id and the fields to set; null takes a field off (back to the usual). Everyone on the board sees it at once.',
    inputSchema: {
      type: 'object', required: ['board', 'changes'],
      properties: { board: BOARD, changes: { type: 'array', items: { type: 'object', required: ['id'], properties: { id: ID, ...FIELD_PROPS } } } },
    },
  },
  {
    name: 'add_items',
    description: `Adds items to a board, over what is there; returns their ids. Types: ${ADDABLE.join(', ')}. Unset size and colour are the usual for the type (a sticky 160×160 yellow).`,
    inputSchema: {
      type: 'object', required: ['board', 'items'],
      properties: { board: BOARD, items: { type: 'array', items: { type: 'object', required: ['type', 'x', 'y'], properties: { type: { type: 'string', enum: ADDABLE }, ...FIELD_PROPS } } } },
    },
  },
  {
    name: 'delete_items',
    description: 'Removes items or links from a board by id (an item takes its links with it).',
    inputSchema: { type: 'object', required: ['board', 'ids'], properties: { board: BOARD, ids: { type: 'array', items: { type: 'string' } } } },
  },
  {
    name: 'add_links',
    description: 'Connects items with lines (an arrowhead at the "to" end); returns their ids.',
    inputSchema: {
      type: 'object', required: ['board', 'links'],
      properties: {
        board: BOARD,
        links: {
          type: 'array',
          items: {
            type: 'object', required: ['from', 'to'],
            properties: {
              from: ID, to: ID,
              style: { type: 'string', enum: STYLES, description: 'Unset: a smooth curve' },
              fromSide: { type: 'string', enum: SIDES }, toSide: { type: 'string', enum: SIDES },
              color: { type: 'string', description: `${names(STROKE_COLORS)} or #rrggbb` },
            },
          },
        },
      },
    },
  },
];

const LAYOUTS = ['grid', 'row', 'column', 'left', 'center', 'right', 'top', 'middle', 'bottom'] as const;
type Layout = typeof LAYOUTS[number];
TOOLS.push(
  {
    name: 'arrange_items',
    description: 'Lays items out: in a grid, a row or a column (in the order given, a gap between, from the top left of where they are or from x, y), or lines them up by an edge or their middles. A frame moves with what is in it.',
    inputSchema: {
      type: 'object', required: ['board', 'ids', 'layout'],
      properties: {
        board: BOARD, ids: { type: 'array', items: { type: 'string' } },
        layout: { type: 'string', enum: [...LAYOUTS], description: 'grid, row, column; or left, center, right, top, middle, bottom to line them up' },
        gap: { type: 'number', description: 'Between items; unset 24' },
        columns: { type: 'number', description: 'Grid: how many across; unset about a square' },
        x: { type: 'number' }, y: { type: 'number' },
      },
    },
  },
  {
    name: 'add_mind_nodes',
    description: 'Builds a mind map (майнд-карта) as PlanX does: a central topic (no parent, at x, y) and branches, each laid out where the board\'s "+" puts it. Name a parent by an existing node id or by the key of a node earlier in the same list. Returns ids by key.',
    inputSchema: {
      type: 'object', required: ['board', 'nodes'],
      properties: {
        board: BOARD,
        nodes: {
          type: 'array',
          items: {
            type: 'object', required: ['text'],
            properties: {
              key: { type: 'string', description: 'A name for this node, for later ones in the list to branch from' },
              parent: { type: 'string', description: 'The node it branches from (id or key); none: a new central topic' },
              text: { type: 'string' },
              side: { type: 'string', enum: ['right', 'left', 'down', 'up'], description: 'From a central topic, which way; unset right' },
              x: { type: 'number' }, y: { type: 'number' },
            },
          },
        },
      },
    },
  },
);

/** Puts an item where `p` says, a frame taking what's in it along. */
function moveWith(b: Board, id: string, p: Partial<Item>): void {
  const it = b.get(id);
  if (!it) return;
  const dx = p.x !== undefined ? p.x - it.x : 0, dy = p.y !== undefined ? p.y - it.y : 0;
  b.update(id, p);
  if (it.type !== 'frame' || (!dx && !dy)) return;
  const held = it.members ?? b.list().filter((o) => o.id !== id && inside(o, it)).map((o) => o.id);
  for (const m of held) { const o = b.get(m); if (o) b.update(m, { x: o.x + dx, y: o.y + dy }); }
}

/** Where each of `items` goes for `layout` (see arrange_items). */
export function arranged(items: Item[], layout: Layout, gap = 24, columns?: number, x?: number, y?: number): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const left = x ?? Math.min(...items.map((i) => i.x)), top = y ?? Math.min(...items.map((i) => i.y));
  const right = Math.max(...items.map((i) => i.x + i.w)), bottom = Math.max(...items.map((i) => i.y + i.h));
  if (layout === 'row' || layout === 'column') {
    let at = layout === 'row' ? left : top;
    for (const it of items) {
      out.set(it.id, layout === 'row' ? { x: at, y: top } : { x: left, y: at });
      at += (layout === 'row' ? it.w : it.h) + gap;
    }
  } else if (layout === 'grid') {
    const n = Math.max(1, Math.round(columns ?? Math.ceil(Math.sqrt(items.length)))), cw = Math.max(...items.map((i) => i.w)), rh: number[] = [];
    items.forEach((it, k) => { const row = Math.floor(k / n); rh[row] = Math.max(rh[row] ?? 0, it.h); });
    items.forEach((it, k) => {
      const row = Math.floor(k / n), col = k % n;
      out.set(it.id, { x: left + col * (cw + gap), y: top + rh.slice(0, row).reduce((t, h) => t + h + gap, 0) });
    });
  } else {
    const mx = (left + right) / 2, my = (top + bottom) / 2;
    for (const it of items) {
      out.set(it.id, {
        x: layout === 'left' ? left : layout === 'right' ? right - it.w : layout === 'center' ? mx - it.w / 2 : it.x,
        y: layout === 'top' ? top : layout === 'bottom' ? bottom - it.h : layout === 'middle' ? my - it.h / 2 : it.y,
      });
    }
  }
  out.forEach((pt) => { pt.x = Math.round(pt.x); pt.y = Math.round(pt.y); });
  return out;
}

/** A mind map node's size for its text, near enough with no browser to measure it in (see mindSize). */
function mindFits(it: Item): { w: number; h: number } {
  const { h } = mindSize(it), fs = it.fs ?? 16, lines = (it.text || ' ').split('\n');
  const inner = Math.max(48, Math.ceil(Math.max(...lines.map((l) => l.length)) * fs * 0.5));
  return { w: inner + (it.parent ? 32 : 64), h: h + (lines.length - 1) * Math.ceil(fs * 1.28) };
}

const TOWARD: Record<string, Toward> = { right: 1, left: -1, down: 'down', up: 'up' };

const arr = (v: unknown, what: string): Record<string, unknown>[] => {
  if (!Array.isArray(v) || !v.every((x) => x && typeof x === 'object')) throw new Bad(`"${what}" must be a list of objects`);
  return v as Record<string, unknown>[];
};

function call(name: string, a: Record<string, unknown>, use: UseBoard): unknown {
  const id = boardId(a.board);
  if (!id) throw new Bad('Give the board as its link or id');
  const got = use(id, (b): unknown => {
    switch (name) {
      case 'read_board':
        const all = b.list().filter((it) => !it.pt), frames = all.filter((it) => it.type === 'frame' && !it.tl);
        return { title: b.title, items: all.map((it) => itemOut(it, frames)), links: b.linkList().map((l) => ({ id: l.id, from: l.from, to: l.to, ...(l.style && { style: l.style }), ...(l.color && { color: l.color }) })) };
      case 'update_items': {
        const changes = arr(a.changes, 'changes').map((c) => {
          if (typeof c.id !== 'string' || !b.get(c.id)) throw new Bad(`No item "${String(c.id)}" on the board`);
          return [c.id, patchOf(c, ['id'])] as const;
        });
        // (One by one: a frame moved reads where it is now, after what was moved before it.)
        changes.forEach(([i, p]) => moveWith(b, i, p));
        return { changed: changes.length };
      }
      case 'add_items': {
        const items = arr(a.items, 'items').map((o) => {
          const type = o.type as ItemType;
          if (!ADDABLE.includes(type)) throw new Bad(`Can't add "${String(o.type)}". Types: ${ADDABLE.join(', ')}`);
          const p = patchOf(o, ['type']);
          if (p.x === undefined || p.y === undefined) throw new Bad('Each item needs x and y');
          return { ...DEFAULTS[type], ...(type === 'polygon' && { shape: 'rhombus' }), ...p, type } as Omit<Item, 'id' | 'z'>;
        });
        // (Each over the one before: the board's top isn't known again till all's added.)
        const ids: string[] = [];
        let z = b.maxZ();
        b.transact(() => items.forEach((it) => { const i = uid(); ids.push(i); b.add({ ...it, id: i, z: ++z } as Item); }));
        return { ids };
      }
      case 'delete_items': {
        const ids = a.ids;
        if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) throw new Bad('"ids" must be a list of ids');
        b.remove(ids as string[]);
        return { deleted: ids.length };
      }
      case 'add_links': {
        const links = arr(a.links, 'links').map((l) => {
          for (const end of ['from', 'to'] as const) if (typeof l[end] !== 'string' || !b.get(l[end] as string)) throw new Bad(`No item "${String(l[end])}" on the board`);
          if (l.style !== undefined && !STYLES.includes(l.style as LinkStyle)) throw new Bad(`Bad style ${JSON.stringify(l.style)}`);
          if (l.color !== undefined && !(typeof l.color === 'string' && (l.color in STROKE_COLORS || HEX.test(l.color)))) throw new Bad(`Bad color ${JSON.stringify(l.color)}`);
          const sides = SIDES.includes(l.fromSide as Side) && SIDES.includes(l.toSide as Side);
          return {
            id: uid(), from: l.from as string, to: l.to as string,
            ...(sides && { fromSide: l.fromSide as Side, toSide: l.toSide as Side }),
            ...(l.style ? { style: l.style as LinkStyle } : {}), ...(l.color ? { color: l.color as string } : {}),
          };
        });
        b.transact(() => links.forEach((l) => b.addLink(l)));
        return { ids: links.map((l) => l.id) };
      }
      case 'arrange_items': {
        const ids = a.ids, layout = a.layout as Layout;
        if (!Array.isArray(ids) || !ids.length) throw new Bad('"ids" must be a list of ids');
        if (!LAYOUTS.includes(layout)) throw new Bad(`Layouts: ${LAYOUTS.join(', ')}`);
        const items = ids.map((i) => { const it = typeof i === 'string' ? b.get(i) : undefined; if (!it) throw new Bad(`No item "${String(i)}" on the board`); return it; });
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
        const at = arranged(items, layout, num(a.gap) ?? 24, num(a.columns), num(a.x), num(a.y));
        at.forEach((pt, i) => moveWith(b, i, pt));
        return { moved: at.size };
      }
      case 'add_mind_nodes': {
        const nodes = arr(a.nodes, 'nodes'), keys: Record<string, string> = {}, known = new Set<string>();
        // All checked first, so a wrong one leaves the board as it was.
        for (const n of nodes) {
          if (typeof n.text !== 'string') throw new Bad('Each node needs its text');
          if (n.parent !== undefined && !(typeof n.parent === 'string' && (known.has(n.parent) || b.get(n.parent)?.type === 'mind'))) throw new Bad(`No mind map node "${String(n.parent)}"`);
          if (typeof n.key === 'string') known.add(n.key);
        }
        // One by one, each laid out among those before it (as the board's "+" does).
        const made: Item[] = [];
        for (const n of nodes) {
          const pid = typeof n.parent === 'string' ? keys[n.parent] ?? n.parent : undefined, parent = pid ? b.get(pid) : undefined;
          const id = uid(), z = b.maxZ() + 1, text = n.text as string;
          let it: Item;
          if (!parent) {
            it = { ...DEFAULTS.mind, type: 'mind', id, z, x: Number(n.x ?? 0), y: Number(n.y ?? 0), text, fs: 18 } as Item;
            Object.assign(it, mindFits(it));
            b.add(it);
          } else {
            const depth = (m: Item): number => (m.parent ? 1 + depth(b.get(m.parent) ?? m) : 0);
            const side = typeof n.side === 'string' ? TOWARD[n.side] : undefined;
            it = { ...DEFAULTS.mind, type: 'mind', id, z, x: 0, y: 0, text, fs: depth(parent) === 0 ? 14 : 12, parent: parent.id,
              down: side === 'down' || parent.down || undefined, up: side === 'up' || parent.up || undefined } as Item;
            Object.assign(it, mindFits(it));
            Object.assign(it, childPlace(parent, b.list(), (k) => b.get(k), it.w, it.h, parent.parent ? undefined : side));
            b.add(it);
            const moves = addChild(id, b.list());
            b.transact(() => moves.forEach((pt, k) => b.update(k, pt)));
          }
          made.push(it);
          if (typeof n.key === 'string') keys[n.key] = id;
        }
        return { ids: made.map((m) => m.id), keys };
      }
      default:
        throw new Bad(`No tool "${name}"`);
    }
  });
  if (got === null) throw new Bad(`No board "${id}" on this server (open it in PlanX once first)`);
  return got;
}

const INSTRUCTIONS = `PlanX is a whiteboard like Miro; its people talk Russian. A board is named by its link (…?board=<id>). Read it before changing it: each item has its id, its name as the board shows it, where it is (board units, y down) and what's in it.

How people say it:
- стикер / заметка = sticky; прямоугольник = rect; эллипс / круг = ellipse; фигура (ромб, треугольник, звезда…) = polygon with shape; текст = text; фрейм / рамка = frame (its text is its title); задача = task (st: todo «сделать», doing «в работе», done «готово»); майнд-карта / карта мыслей = mind nodes (add them with add_mind_nodes); таймлайн = timeline; линия / стрелка / связь = link.
- Items go by their names: «Прямоугольник» is the first, «Прямоугольник 1» the next, and so on. «Второй прямоугольник» is the second of them from the top left, unless a name is said.
- «во фрейме X» = the items whose frame is X's id.
- Colours: жёлтый yellow, оранжевый orange, розовый pink, фиолетовый purple, синий / голубой blue, зелёный green, серый gray, тёмно-серый graphite, без заливки none; outlines and text also have red (красный); text black and white. Any #rrggbb works too.
- «раскидай / разложи / расставь» = arrange_items grid; «в ряд» row; «столбиком» column; «выровняй» left (or as said).

Sizes as usual: sticky 160×160, rect 180×110, frame 520×380, task 293×52. Put new things clear of what's there unless asked otherwise, and keep a 24 gap. Say back in a sentence or two what changed.`;

interface Msg { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

/** One JSON-RPC message: its answer, or null for a notification (nothing to answer). */
export function answer(msg: Msg, use: UseBoard): object | null {
  if (msg.id === undefined || msg.id === null) return null;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion as string | undefined;
      return ok({
        protocolVersion: asked && VERSIONS.includes(asked) ? asked : VERSIONS[1],
        capabilities: { tools: {} },
        serverInfo: { name: 'planx', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      const name = msg.params?.name as string, args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        return ok({ content: [{ type: 'text', text: JSON.stringify(call(name, args, use)) }] });
      } catch (e) {
        if (!(e instanceof Bad)) throw e;
        return ok({ content: [{ type: 'text', text: e.message }], isError: true });
      }
    }
    default: return err(-32601, `No method ${msg.method}`);
  }
}

/** The answer to a POST's body (one message or a batch), or null for nothing but notifications. */
export function answerAll(body: unknown, use: UseBoard): object | null {
  if (Array.isArray(body)) {
    const out = body.map((m) => answer(m as Msg, use)).filter((x): x is object => x !== null);
    return out.length ? out : null;
  }
  return answer(body as Msg, use);
}

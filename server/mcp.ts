/**
 * PlanX for Claude: an MCP server (Streamable HTTP, stateless, plain JSON answers) at /mcp/<MCP_KEY>, so
 * Claude can read a board and change it as one more person on it: what it does goes to everyone on the
 * board at once. Off unless MCP_KEY is set (see index.ts).
 */
import { Board } from '../src/model/board';
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
/** An item as Claude reads it: what it is, where, what's written and its colours; pictures, drawings and the like left out. */
function itemOut(it: Item) {
  const o: Record<string, unknown> = { id: it.id, type: it.tl ? 'timeline' : it.type, x: r(it.x), y: r(it.y), w: r(it.w), h: r(it.h) };
  for (const k of ['text', 'color', 'sc', 'tc', 'fs', 'rot', 'shape', 'icon', 'st', 'desc', 'parent', 'members', 'cells'] as const) {
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

const TOOLS = [
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
        return { title: b.title, items: b.list().filter((it) => !it.pt).map(itemOut), links: b.linkList().map((l) => ({ id: l.id, from: l.from, to: l.to, ...(l.style && { style: l.style }), ...(l.color && { color: l.color }) })) };
      case 'update_items': {
        const changes = arr(a.changes, 'changes').map((c) => {
          if (typeof c.id !== 'string' || !b.get(c.id)) throw new Bad(`No item "${String(c.id)}" on the board`);
          return [c.id, patchOf(c, ['id'])] as const;
        });
        b.transact(() => changes.forEach(([i, p]) => b.update(i, p)));
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
      default:
        throw new Bad(`No tool "${name}"`);
    }
  });
  if (got === null) throw new Bad(`No board "${id}" on this server (open it in PlanX once first)`);
  return got;
}

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
        instructions: 'PlanX is a whiteboard (like Miro), its interface in Russian. Name a board by the link the user gives. Read a board before changing it; coordinates are board units, y down.',
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

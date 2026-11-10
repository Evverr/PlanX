import { describe, expect, it } from 'vitest';
import { Board } from '../src/model/board';
import { answer, answerAll, boardId, type UseBoard } from '../server/mcp';

const setup = () => {
  const b = new Board();
  b.add({ id: 'a', type: 'rect', x: 0, y: 0, w: 100, h: 50, z: 1, color: 'blue', text: 'A' });
  b.add({ id: 'c', type: 'sticky', x: 200, y: 0, w: 160, h: 160, z: 2, color: 'yellow', text: 'C' });
  const use: UseBoard = (id, fn) => (id === 'b1' ? fn(b) : null);
  return { b, use };
};
const tool = (use: UseBoard, name: string, args: object) => {
  const r = answer({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, use) as { result: { content: { text: string }[]; isError?: boolean } };
  return { text: r.result.content[0].text, error: !!r.result.isError };
};

describe('MCP connector', () => {
  it('finds a board by its link or id', () => {
    expect(boardId('https://plan-78i6.onrender.com/?board=b1')).toBe('b1');
    expect(boardId('https://x.y/?folder=f&board=b-2_x')).toBe('b-2_x');
    expect(boardId('b1')).toBe('b1');
    expect(boardId('nope nope')).toBeNull();
  });

  it('says hello, lists its tools, answers no notification', () => {
    const { use } = setup();
    const init = answer({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, use) as { result: { protocolVersion: string } };
    expect(init.result.protocolVersion).toBe('2025-06-18');
    const list = answer({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, use) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(['read_board', 'update_items', 'add_items', 'add_mind_nodes', 'delete_items', 'add_links']);
    expect(answer({ jsonrpc: '2.0', method: 'notifications/initialized' }, use)).toBeNull();
    expect(answerAll([{ jsonrpc: '2.0', method: 'notifications/initialized' }], use)).toBeNull();
  });

  it('reads a board', () => {
    const { use } = setup();
    const out = JSON.parse(tool(use, 'read_board', { board: 'b1' }).text);
    expect(out.items).toEqual([
      { id: 'a', type: 'rect', x: 0, y: 0, w: 100, h: 50, text: 'A', color: 'blue' },
      { id: 'c', type: 'sticky', x: 200, y: 0, w: 160, h: 160, text: 'C', color: 'yellow' },
    ]);
    expect(tool(use, 'read_board', { board: 'b2' }).error).toBe(true);
  });

  it('recolours and moves, null taking a field off; refuses what it does not know, changing nothing', () => {
    const { b, use } = setup();
    expect(tool(use, 'update_items', { board: 'b1', changes: [{ id: 'a', color: 'green', x: 10.123 }, { id: 'c', text: null }] }).error).toBe(false);
    expect(b.get('a')).toMatchObject({ color: 'green', x: 10.12 });
    expect(b.get('c')!.text).toBeUndefined();
    expect(tool(use, 'update_items', { board: 'b1', changes: [{ id: 'a', color: 'red' }] }).error).toBe(true);
    expect(tool(use, 'update_items', { board: 'b1', changes: [{ id: 'a', color: 'blue' }, { id: 'zz', color: 'blue' }] }).error).toBe(true);
    expect(tool(use, 'update_items', { board: 'b1', changes: [{ id: 'a', src: 'x' }] }).error).toBe(true);
    expect(b.get('a')!.color).toBe('green');
  });

  it('adds items, each over the one before, links them and removes them', () => {
    const { b, use } = setup();
    const { ids } = JSON.parse(tool(use, 'add_items', { board: 'b1', items: [{ type: 'sticky', x: 0, y: 300, text: 'Новый' }, { type: 'polygon', x: 300, y: 300 }] }).text);
    expect(b.get(ids[0])).toMatchObject({ type: 'sticky', w: 160, color: 'yellow', text: 'Новый', z: 3 });
    expect(b.get(ids[1])).toMatchObject({ type: 'polygon', shape: 'rhombus', z: 4 });
    expect(tool(use, 'add_items', { board: 'b1', items: [{ type: 'image', x: 0, y: 0 }] }).error).toBe(true);
    const links = JSON.parse(tool(use, 'add_links', { board: 'b1', links: [{ from: 'a', to: ids[0], style: 'elbow', color: 'red' }] }).text);
    expect(b.getLink(links.ids[0])).toMatchObject({ from: 'a', to: ids[0], style: 'elbow', color: 'red' });
    tool(use, 'delete_items', { board: 'b1', ids: [ids[0]] });
    expect(b.get(ids[0])).toBeUndefined();
    expect(b.linkList()).toEqual([]);
  });
  it('grows a mind map: a central topic, its branches either way and theirs, laid out; nothing on a bad node', () => {
    const { b, use } = setup();
    const { ids } = JSON.parse(tool(use, 'add_mind_nodes', { board: 'b1', nodes: [
      { ref: 'r', text: 'Кофейня', x: 0, y: 500 },
      { ref: 'm', parent: 'r', text: 'Меню' }, { parent: 'r', text: 'Место' },
      { parent: 'r', text: 'Деньги', way: 'left' }, { parent: 'm', text: 'Кофе' },
    ] }).text);
    const [r, m, p, f, k] = ids.map((i: string) => b.get(i)!);
    expect(r).toMatchObject({ type: 'mind', text: 'Кофейня', x: 0, y: 500, fs: 18 });
    expect(r.parent).toBeUndefined();
    expect(m).toMatchObject({ type: 'mind', parent: r.id, fs: 14 });
    expect(k).toMatchObject({ parent: m.id, fs: 12 });
    expect(m.x).toBeGreaterThan(r.x + r.w);
    expect(p.y).toBeGreaterThan(m.y);
    expect(f.x + f.w).toBeLessThan(r.x);
    expect(k.x).toBeGreaterThan(m.x + m.w);
    // Onto a node already there.
    expect(tool(use, 'add_mind_nodes', { board: 'b1', nodes: [{ parent: p.id, text: 'Аренда' }] }).error).toBe(false);
    const n = b.list().length;
    expect(tool(use, 'add_mind_nodes', { board: 'b1', nodes: [{ parent: r.id, text: 'Ок' }, { parent: 'a', text: 'Не узел' }] }).error).toBe(true);
    expect(tool(use, 'add_mind_nodes', { board: 'b1', nodes: [{ text: 'Без места' }] }).error).toBe(true);
    expect(b.list().length).toBe(n);
  });
});

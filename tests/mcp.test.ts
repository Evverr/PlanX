import { describe, expect, it } from 'vitest';
import { Board } from '../src/model/board';
import { answer, answerAll, arranged, boardId, nameOf, type UseBoard } from '../server/mcp';
import type { Item } from '../src/model/types';

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
    expect(list.result.tools.map((t) => t.name)).toEqual(['read_board', 'update_items', 'add_items', 'delete_items', 'add_links', 'arrange_items', 'add_mind_nodes']);
    expect(answer({ jsonrpc: '2.0', method: 'notifications/initialized' }, use)).toBeNull();
    expect(answerAll([{ jsonrpc: '2.0', method: 'notifications/initialized' }], use)).toBeNull();
  });

  it('reads a board', () => {
    const { use } = setup();
    const out = JSON.parse(tool(use, 'read_board', { board: 'b1' }).text);
    expect(out.items).toEqual([
      { id: 'a', name: 'Прямоугольник', type: 'rect', x: 0, y: 0, w: 100, h: 50, text: 'A', color: 'blue' },
      { id: 'c', name: 'Заметка', type: 'sticky', x: 200, y: 0, w: 160, h: 160, text: 'C', color: 'yellow' },
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

  it('names items as the board does, and tells what frame they are in; a frame moved takes them along', () => {
    const { b, use } = setup();
    b.add({ id: 'r2', type: 'rect', x: 0, y: 100, w: 100, h: 50, z: 3 });
    b.add({ id: 'f', type: 'frame', x: -20, y: -20, w: 400, h: 300, z: 0, text: 'Идеи', members: ['a', 'c'] });
    expect(nameOf(b.get('r2')!)).toBe('Прямоугольник 1');
    const out = JSON.parse(tool(use, 'read_board', { board: 'b1' }).text);
    expect(out.items.find((i: { id: string }) => i.id === 'a').frame).toBe('f');
    expect(out.items.find((i: { id: string }) => i.id === 'r2').frame).toBeUndefined();
    tool(use, 'update_items', { board: 'b1', changes: [{ id: 'f', x: 80 }] });
    expect(b.get('a')!.x).toBe(100);
    expect(b.get('c')!.x).toBe(300);
    expect(b.get('r2')!.x).toBe(0);
  });

  it('lays items out in a row, a grid, lined up', () => {
    const its = [{ id: '1', x: 50, y: 10, w: 100, h: 40 }, { id: '2', x: 0, y: 90, w: 60, h: 80 }, { id: '3', x: 300, y: 0, w: 100, h: 40 }] as Item[];
    expect([...arranged(its, 'row', 10).values()]).toEqual([{ x: 0, y: 0 }, { x: 110, y: 0 }, { x: 180, y: 0 }]);
    expect([...arranged(its, 'grid', 10, 2).values()]).toEqual([{ x: 0, y: 0 }, { x: 110, y: 0 }, { x: 0, y: 90 }]);
    expect([...arranged(its, 'left').values()].map((p) => p.x)).toEqual([0, 0, 0]);
    expect([...arranged(its, 'bottom').values()].map((p) => p.y)).toEqual([130, 90, 130]);
  });

  it('builds a mind map, its branches laid out as the board does, or leaves the board as it was', () => {
    const { b, use } = setup();
    const bad = tool(use, 'add_mind_nodes', { board: 'b1', nodes: [{ key: 'r', text: 'План' }, { parent: 'nope', text: 'X' }] });
    expect(bad.error).toBe(true);
    expect(b.list().length).toBe(2);
    const { keys } = JSON.parse(tool(use, 'add_mind_nodes', { board: 'b1', nodes: [
      { key: 'r', text: 'План', x: 0, y: 400 }, { key: 'g', parent: 'r', text: 'Цели' }, { parent: 'r', text: 'Риски', side: 'left' }, { parent: 'g', text: 'Запуститься' }, { parent: 'r', text: 'Задачи' },
    ] }).text);
    const root = b.get(keys.r)!, goals = b.get(keys.g)!, kids = b.list().filter((i) => i.parent === root.id);
    expect(root).toMatchObject({ type: 'mind', fs: 18, x: 0, y: 400 });
    expect(goals).toMatchObject({ parent: root.id, fs: 14 });
    expect(kids.map((k) => k.text).sort()).toEqual(['Задачи', 'Риски', 'Цели']);
    const right = kids.filter((k) => k.x > root.x + root.w), left = kids.filter((k) => k.x + k.w < root.x);
    expect(right.map((k) => k.text).sort()).toEqual(['Задачи', 'Цели']);
    expect(left.map((k) => k.text)).toEqual(['Риски']);
    // One under the other, not on top of each other.
    const [p, q] = right.sort((m, n) => m.y - n.y);
    expect(q.y).toBeGreaterThanOrEqual(p.y + p.h);
    expect(b.list().find((i) => i.text === 'Запуститься')).toMatchObject({ parent: goals.id, fs: 12 });
  });
});

import { describe, expect, it } from 'vitest';
import { kanban, projectPlan, retro, TEMPLATES } from '../src/shelf/templates';
import { DEFAULTS } from '../src/model/types';

describe('the ready-made boards', () => {
  it('are three, each named and made only of what boards have', () => {
    expect(TEMPLATES).toHaveLength(3);
    for (const make of TEMPLATES) {
      const t = make();
      expect(t.title).not.toBe('');
      expect(t.items.length).toBeGreaterThan(5);
      for (const it of t.items) expect(Object.keys(DEFAULTS)).toContain(it.type);
      expect(new Set(t.items.map((i) => i.id)).size).toBe(t.items.length);
    }
  });

  it('keep what lies in their frames in them', () => {
    for (const t of [kanban(), retro(), projectPlan()]) {
      const ids = new Set(t.items.map((i) => i.id));
      for (const f of t.items.filter((i) => i.type === 'frame')) {
        expect(f.members?.length).toBeGreaterThan(0);
        for (const m of f.members!) {
          expect(ids.has(m)).toBe(true);
          const it = t.items.find((i) => i.id === m)!;
          expect(it.x >= f.x && it.y >= f.y && it.x + it.w <= f.x + f.w && it.y + it.h <= f.y + f.h).toBe(true);
        }
      }
    }
  });

  it('grow the project plan as one mind map from its central topic', () => {
    const nodes = projectPlan().items.filter((i) => i.type === 'mind');
    const roots = nodes.filter((n) => !n.parent);
    expect(roots).toHaveLength(1);
    for (const n of nodes) if (n.parent) expect(nodes.some((p) => p.id === n.parent)).toBe(true);
  });
});

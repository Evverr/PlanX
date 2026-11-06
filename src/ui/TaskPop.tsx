import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import type { Item, Person } from '../model/types';
import type { TaskPick, TaskTip } from '../editor/tasks';
import { PEER_COLORS, type Me } from '../collab/connection';
import { fitTask } from '../model/task';

/** A colour for someone typed in by hand: the same for the same name. */
const colorFor = (name: string) => PEER_COLORS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PEER_COLORS.length];

/**
 * A task's popup for who set it and who does it (whoever's on the board, has been named on its tasks,
 * or is typed in), or by when (a date and a time); opened by a press on that row (see editor/tasks.ts).
 */
/** A word on a task over its ring, as the panels' hints look (.tip.above): gone after a few seconds, or
 *  with the next press, key or wheel. */
export function TaskTipBubble() {
  const [tip, setTip] = useState<(TaskTip & { at: number }) | null>(null);
  useEffect(() => {
    const on = (e: Event) => setTip({ ...(e as CustomEvent<TaskTip>).detail, at: performance.now() });
    window.addEventListener('planx:task-tip', on);
    return () => window.removeEventListener('planx:task-tip', on);
  }, []);
  useEffect(() => {
    if (!tip) return;
    const off = () => setTip(null), t = setTimeout(off, 3000);
    window.addEventListener('pointerdown', off, true);
    window.addEventListener('keydown', off, true);
    window.addEventListener('wheel', off, true);
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', off, true); window.removeEventListener('keydown', off, true); window.removeEventListener('wheel', off, true); };
  }, [tip]);
  if (!tip) return null;
  // Its pointer's tip 4 over the point (the pointer 6 tall under the 37 tall bubble).
  return <div key={tip.at} className="tip above task-tip" role="tooltip" style={{ left: tip.x, top: tip.y - 37 - 10 }}>{tip.text}</div>;
}

export function TaskPop({ editor, me, peers }: { editor: Editor; me: Me; peers: Array<{ name: string; color: string }> }) {
  const [pick, setPick] = useState<TaskPick | null>(null);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const open = (e: Event) => { setPick((e as CustomEvent<TaskPick>).detail); setName(''); };
    window.addEventListener('planx:task-pick', open);
    return () => window.removeEventListener('planx:task-pick', open);
  }, []);
  useEffect(() => {
    if (!pick) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setPick(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPick(null); };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', esc); };
  }, [pick]);
  const it = pick ? editor.board.get(pick.id) : undefined;
  if (!pick || !it) return null;
  const set = (patch: Partial<Item>) => { editor.board.update(it.id, { ...patch, h: fitTask(it, patch) }); setPick(null); };
  const style = { left: Math.min(pick.x, innerWidth - 260), top: Math.min(pick.y + 16, innerHeight - 320) };

  if (pick.field === 'due') {
    return (
      <div ref={ref} className="board-menu task-pop" role="dialog" aria-label="Крайний срок" style={style}>
        <input className="task-due" type="datetime-local" defaultValue={it.due ?? ''} autoFocus
          onChange={(e) => { if (e.currentTarget.value) editor.board.update(it.id, { due: e.currentTarget.value }); }} />
        {it.due && <div className="menu-item"><button className="menu-row" onClick={() => set({ due: undefined })}><span>Убрать срок</span></button></div>}
      </div>
    );
  }
  // Whoever's here, then whoever's been named on a task, each once.
  const people: Person[] = [];
  const add = (p: Person) => { if (p.n && !people.some((q) => q.n === p.n)) people.push(p); };
  add({ n: me.name, c: me.color });
  peers.forEach((p) => add({ n: p.name, c: p.color }));
  editor.board.list().forEach((t) => { if (t.boss) add(t.boss); if (t.doer) add(t.doer); });
  const now = it[pick.field];
  return (
    <div ref={ref} className="board-menu task-pop" role="menu" aria-label={pick.field === 'boss' ? 'Постановщик' : 'Исполнитель'} style={style}>
      {people.map((p) => (
        <div key={p.n} className="menu-item">
          <button className={`menu-row ${now?.n === p.n ? 'on' : ''}`} role="menuitemradio" aria-checked={now?.n === p.n} onClick={() => set({ [pick.field]: p })}>
            <i className="task-avatar" style={{ background: p.c }}>{p.n.slice(0, 1).toUpperCase()}</i><span>{p.n}{p.n === me.name ? ' (вы)' : ''}</span>
          </button>
        </div>
      ))}
      <input className="task-name" placeholder="Другое имя" aria-label="Другое имя" value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { const n = name.trim(); if (e.key === 'Enter' && n) set({ [pick.field]: { n: n.slice(0, 40), c: colorFor(n) } }); }} />
      {now && <div className="menu-item"><button className="menu-row" onClick={() => set({ [pick.field]: undefined })}><span>Убрать</span></button></div>}
    </div>
  );
}

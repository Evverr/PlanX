import { useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor';
import type { Point } from '../canvas/geometry';
import { Glyph } from '../ui/glyphs';
import { ago } from '../shelf/boards';
import { addComment, catOf, comments, mine, onComments, pinAt, removeComment, updateComment, type Comment, type Note } from './comments';
import { myId } from './labs';

/** A new comment being written: where, and on what. */
interface Draft { at: Point; on?: string }

/**
 * "Комментарии": every comment's pin over the board (its author's cat, a tick once solved), and the one
 * opened: what it says, its answer or a way to write one, solved or not; a new one being written.
 * Esc or a press elsewhere closes it.
 */
export function CommentsLayer({ editor, name }: { editor: Editor; name: string }) {
  const board = editor.board;
  useSyncExternalStore(editor.subscribeUI, editor.getUI);
  useSyncExternalStore(board.subscribe, board.getVersion);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onComments(board, redraw), [board]);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    const start = (e: Event) => { const d = (e as CustomEvent<Draft>).detail; setOpen(null); setDraft(d); };
    window.addEventListener('planx:comment', start);
    return () => window.removeEventListener('planx:comment', start);
  }, []);
  useEffect(() => {
    if (!open && !draft) return;
    const away = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('.comment-card, .comment-pin')) { setOpen(null); setDraft(null); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(null); setDraft(null); } };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key); };
  }, [open, draft]);

  const canvas = editor.canvas?.getBoundingClientRect();
  if (!canvas) return null;
  const get = (id: string) => board.get(id);
  const screen = (p: Point) => { const s = editor.toScreen(p); return { x: canvas.left + s.x, y: canvas.top + s.y }; };
  const list = comments(board), opened = list.find((c) => c.id === open);
  const card = (p: Point) => ({ left: Math.min(p.x + 44, innerWidth - 300), top: Math.max(8, Math.min(p.y - 40, innerHeight - 260)) });

  return (
    <div className="comments-layer">
      {list.map((c) => {
        const p = screen(pinAt(c, get));
        if (p.x < -40 || p.y < -40 || p.x > innerWidth + 40 || p.y > innerHeight + 40) return null;
        return (
          <button key={c.id} className={`comment-pin ${open === c.id ? 'on' : ''}`} style={{ left: p.x, top: p.y }} title={c.by}
            aria-label={`Комментарий: ${c.by}`} onClick={() => { setDraft(null); setOpen(open === c.id ? null : c.id); }}>
            <img src={catOf(c)} alt="" draggable={false} />
            {c.done && <i className="comment-done" aria-hidden="true" />}
          </button>
        );
      })}
      {draft && (() => {
        const p = screen(draft.at);
        return (
          <>
            <span className="comment-pin ghost" style={{ left: p.x, top: p.y }} aria-hidden="true" />
            <div className="comment-card" style={card(p)} role="dialog" aria-label="Новый комментарий">
              <Writer placeholder="Комментарий" action="Отправить" onCancel={() => setDraft(null)} onSend={(text) => {
                const on = draft.on ? board.get(draft.on) : undefined;
                setOpen(addComment(board, draft.at, on, text, name));
                setDraft(null);
              }} />
            </div>
          </>
        );
      })()}
      {opened && <Card key={opened.id} c={opened} style={card(screen(pinAt(opened, get)))} name={name} editor={editor} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** A comment opened: it, solved or not, and its one answer (or the way to write it). */
function Card({ c, style, name, editor, onClose }: { c: Comment; style: React.CSSProperties; name: string; editor: Editor; onClose: () => void }) {
  const board = editor.board;
  const [answering, setAnswering] = useState(false);
  return (
    <div className="comment-card" style={style} role="dialog" aria-label="Комментарий">
      <Entry note={c} solved={c.done} onSolved={() => updateComment(board, c.id, { done: c.done ? undefined : true })}
        onEdit={(text) => updateComment(board, c.id, { text })} onDelete={() => { removeComment(board, c.id); onClose(); }} />
      {c.reply ? (
        <>
          <div className="comment-line" />
          <Entry note={c.reply} onEdit={(text) => updateComment(board, c.id, { reply: { ...c.reply!, text } })} onDelete={() => updateComment(board, c.id, { reply: undefined })} />
        </>
      ) : answering ? (
        <>
          <div className="comment-line" />
          <Writer placeholder="Ответ" action="Ответить" onCancel={() => setAnswering(false)} onSend={(text) => {
            updateComment(board, c.id, { reply: { text, author: myId(), by: name, at: Date.now() } });
            setAnswering(false);
          }} />
        </>
      ) : (
        <button className="comment-answer" onClick={() => setAnswering(true)}>Ответить</button>
      )}
    </div>
  );
}

/** One note: who, when, what; solved (a tick, on the comment itself); its "…" for its own author. */
function Entry({ note, solved, onSolved, onEdit, onDelete }: {
  note: Note; solved?: boolean; onSolved?: () => void; onEdit: (text: string) => void; onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <div className="comment-entry">
      <div className="comment-head">
        <img className="comment-cat" src={catOf(note)} alt="" draggable={false} />
        <b>{note.by || 'Гость'}</b>
        <span className="comment-when">{ago(note.at)}</span>
        {onSolved && (
          <button className={`comment-solve ${solved ? 'on' : ''}`} title={solved ? 'Решено (снять)' : 'Отметить решённым'} aria-label="Решено" aria-pressed={!!solved} onClick={onSolved}>
            <Glyph id={solved ? 'circle-check-solid' : 'circle-check'} />
          </button>
        )}
        {mine(note) && (
          <span className="comment-more-wrap">
            <button className="comment-more" title="Ещё" aria-label="Ещё" onClick={() => setMenu(!menu)}><Glyph id="more-l" /></button>
            {menu && (
              <span className="comment-menu" role="menu">
                <button role="menuitem" onClick={() => { setMenu(false); setEditing(true); }}>Изменить</button>
                <button role="menuitem" onClick={() => { setMenu(false); onDelete(); }}>Удалить</button>
              </span>
            )}
          </span>
        )}
      </div>
      {editing
        ? <Writer initial={note.text} placeholder="Комментарий" action="Сохранить" onCancel={() => setEditing(false)} onSend={(text) => { onEdit(text); setEditing(false); }} />
        : <p className="comment-text">{note.text}</p>}
    </div>
  );
}

/** A field to write in: Enter sends (Shift+Enter, a new line), Esc gives up. */
function Writer({ initial = '', placeholder, action, onSend, onCancel }: { initial?: string; placeholder: string; action: string; onSend: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const send = () => { if (text.trim()) onSend(text.trim()); };
  return (
    <div className="comment-writer">
      <textarea autoFocus rows={2} placeholder={placeholder} aria-label={placeholder} value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }} />
      <div className="comment-actions">
        <button className="btn" onClick={onCancel}>Отмена</button>
        <button className="btn primary" disabled={!text.trim()} onClick={send}>{action}</button>
      </div>
    </div>
  );
}

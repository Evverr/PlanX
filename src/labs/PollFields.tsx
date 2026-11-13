import { createPortal } from 'react-dom';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { POLL_FIELD_PAD, POLL_FIELD_RAD, POLL_FS, answersOf, pollLayout, setAnswers } from './poll';

/**
 * «Голосование» (poll.ts) being set up: its question's field and its answers', laid over where it draws
 * them while it's picked, as the board's zoomed. What's typed goes to the board at once; Enter in the last
 * answer adds another.
 */
export function PollFields({ editor, item, zoom }: { editor: Editor; item: Item; zoom: number }) {
  const r = editor.canvas?.getBoundingClientRect(), cam = editor.cam, l = pollLayout(item), answers = answersOf(item);
  if (!r || !l.draft) return null;
  const set = (i: number, v: string) => {
    if (i === 0) { editor.board.update(item.id, { pq: v }); return; }
    const next = [...answers];
    next[i - 1] = v;
    setAnswers(editor.board, item, next);
  };
  return createPortal(
    <>
      {l.fields.map((f, i) => {
        const hint = i === 0 ? 'Вопрос' : `Вариант ${i}`;
        return (
          <input key={i} className={`form-field ${i === 0 ? 'poll-question' : ''}`} value={i === 0 ? item.pq ?? '' : answers[i - 1]} placeholder={hint} aria-label={hint}
            autoFocus={i === 0 && !item.pq} onChange={(e) => set(i, e.target.value)} onFocus={() => editor.beginChange()} onBlur={() => editor.endChange()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && i === answers.length && answers[i - 1]) setAnswers(editor.board, item, [...answers, '']);
              else if (e.key === 'Escape' || e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              left: r.left + cam.x + f.x * zoom, top: r.top + cam.y + f.y * zoom, width: f.w * zoom, height: f.h * zoom,
              fontSize: POLL_FS * zoom, borderRadius: POLL_FIELD_RAD * zoom, padding: `0 ${POLL_FIELD_PAD * zoom}px`,
            }} />
        );
      })}
    </>,
    document.body,
  );
}

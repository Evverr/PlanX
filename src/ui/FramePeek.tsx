import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '../editor/editor';
import type { Board } from '../model/board';
import { drawScene } from '../canvas/renderer';
import { onEmojiLoad } from '../emoji/emoji';
import { onPictureLoad } from '../canvas/pictures';
import { PanelIcon } from './PanelIcon';

/** How much of the screen the look may take, and the height of its title row. */
const MAX_W = 0.86, MAX_H = 0.8, HEAD = 56;

/**
 * A look into a folded frame (opened by its eye button, through the "planx:peek" event): the frame
 * as it is unfolded, with all it holds, in a popup over the dimmed board. It only shows; Esc, the
 * cross or a click beside it closes it, and "Развернуть" unfolds the frame on the board.
 */
export function FramePeek({ editor, board }: { editor: Editor; board: Board }) {
  const [id, setId] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const open = (e: Event) => setId((e as CustomEvent<string>).detail);
    window.addEventListener('planx:peek', open);
    return () => window.removeEventListener('planx:peek', open);
  }, []);
  // While it's open, keys are its own: Esc closes it, and nothing reaches the board.
  useEffect(() => {
    if (!id) return;
    const key = (e: KeyboardEvent) => { e.stopPropagation(); if (e.key === 'Escape') setId(null); };
    const again = () => redraw((n) => n + 1);
    window.addEventListener('keydown', key, true);
    window.addEventListener('resize', again);
    const offs = [board.subscribe(again), onPictureLoad(again), onEmojiLoad(again)];
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', again);
      offs.forEach((off) => off());
    };
  }, [id, board]);

  const f = id ? board.get(id) : undefined;
  const full = f ? f.fold ?? f : null;
  const k = full ? Math.min((innerWidth * MAX_W) / full.w, (innerHeight * MAX_H - HEAD) / full.h) : 1;
  const w = full ? Math.max(320, Math.round(full.w * k)) : 0, h = full ? Math.max(200, Math.round(full.h * k)) : 0;
  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c || !id) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d'), scene = editor.peekScene(id, w, h, dpr);
    if (ctx && scene) drawScene(ctx, scene);
  });
  useEffect(() => { if (id && !f) setId(null); }, [id, f]);
  if (!id || !f) return null;

  const title = f.text || 'Фрейм';
  return createPortal(
    <div className="peek-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) setId(null); }}>
      <div className="peek" role="dialog" aria-label={title}>
        <div className="peek-head">
          <span className="peek-title">{title}</span>
          {f.fold && <button className="btn" onClick={() => { editor.setFolded(id, false); setId(null); }}>Развернуть</button>}
          <button className="ib" title="Закрыть" aria-label="Закрыть" onClick={() => setId(null)}><PanelIcon name="cross" /></button>
        </div>
        <canvas ref={canvas} style={{ width: w, height: h }} />
      </div>
    </div>,
    document.body,
  );
}

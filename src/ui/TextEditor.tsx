import { useLayoutEffect, useRef } from 'react';
import type { Editor } from '../editor/editor';
import { alignOf, TEXT_COLORS, textPad, textPadY, type Item } from '../model/types';
import { fontOf, FONTS, LINE_HEIGHT, textBlockHeight } from '../canvas/text';
import { FOLD_FS, FOLD_GAP, FOLD_ICON, FOLD_PAD, FOLD_RIGHT, FOLD_TITLE_GAP } from '../model/frame';
import { center, TASK_INSET } from '../canvas/geometry';

/**
 * A textarea laid over the item being edited, scaled with the board so the
 * text stays where it will be drawn.
 */
export function TextEditor({ editor, item }: { editor: Editor; item: Item }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const id = item.id;

  const commit = () => {
    if (done.current || !ref.current) return;
    done.current = true;
    editor.commitText(id, ref.current.value);
  };

  // Filled in before the overlay is sized below, so it opens as tall as its text.
  useLayoutEffect(() => {
    const el = ref.current!;
    el.value = item.text ?? '';
    el.focus();
    if (editor.editCaret === 'end') el.setSelectionRange(el.value.length, el.value.length);
    else el.select();
    const onCommit = () => commit();
    window.addEventListener('planx:commit-edit', onCommit);
    return () => {
      window.removeEventListener('planx:commit-edit', onCommit);
      commit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const z = editor.cam.z;
  const isFrame = item.type === 'frame';
  // A folded frame's title is typed in where it stands, inside the bar.
  const folded = isFrame && !!item.fold;
  const fs = folded ? FOLD_FS : isFrame ? 15 : item.fs ?? 16;
  const pad = textPad(item), padY = textPadY(item);
  // A task's text starts right of its checkbox.
  const inset = item.type === 'task' ? TASK_INSET : 0;  // a task's text keeps clear of its checkbox
  const width = folded ? Math.max(160, item.w - FOLD_PAD - FOLD_TITLE_GAP - FOLD_ICON * 2 - FOLD_GAP - FOLD_RIGHT)
    : isFrame ? Math.max(160, item.w * 0.6) : item.w - inset * 2 - pad * 2;
  const top = folded ? item.y + (item.h - 26) / 2 : isFrame ? item.y - 30 : item.y + padY;
  const p = editor.toScreen({ x: item.x + (folded ? FOLD_PAD : isFrame ? 0 : inset + pad), y: top });

  // Centre the text vertically in stickers and shapes, like the canvas does; and turn it with a
  // turned item, about the item's centre.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let top = 0;
    if (item.type !== 'text' && !isFrame) {
      // As tall as the canvas lays the lines out (exactly, not rounded), so they land where it drew them.
      const content = Math.min(textBlockHeight(el.value, width, fs, fontOf(item)), item.h - padY * 2);
      el.style.height = `${content}px`;
      top = item.va === 'top' ? 0 : ((item.h - padY * 2 - content) / 2) * z;
      el.style.marginTop = `${top}px`;
    }
    const c = editor.toScreen(center(item)), dx = c.x - p.x, dy = c.y - p.y - top;
    el.style.transform = item.rot ? `translate(${dx}px, ${dy}px) rotate(${item.rot}deg) translate(${-dx}px, ${-dy}px) scale(${z})` : `scale(${z})`;
  });

  return (
    <textarea
      ref={ref}
      className={`text-edit ${item.type} ${folded ? 'folded' : ''} ${item.color === 'none' ? 'nofill' : ''}`}
      aria-label="Текст"
      spellCheck={false}
      style={{
        left: p.x, top: p.y, width,
        height: item.type === 'text' ? item.h : isFrame ? 26 : undefined,
        transform: `scale(${z})`,
        fontSize: fs,
        lineHeight: isFrame ? '26px' : LINE_HEIGHT,
        fontWeight: isFrame ? 600 : fontOf(item).weight,
        ...(!isFrame && {
          fontFamily: item.ff ? FONTS[item.ff]?.css : undefined,
          fontStyle: item.fi ? 'italic' : undefined,
          textAlign: alignOf(item),
          textDecoration: [item.fu && 'underline', item.fx && 'line-through'].filter(Boolean).join(' ') || undefined,
          color: item.tc && (item.tc.startsWith('#') ? item.tc : TEXT_COLORS[item.tc]) || undefined,
        }),
        padding: isFrame ? '0 4px' : 0,
      }}
      // A mind map node dragged by its text moves, as it would anywhere else on it.
      onPointerDown={item.type === 'mind' ? (e) => {
        const from = { x: e.clientX, y: e.clientY }, id0 = e.pointerId;
        const move = (ev: PointerEvent) => {
          if (ev.pointerId !== id0 || Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 4) return;
          stop();
          editor.dragFromText(id, from, ev);
        };
        const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
      } : undefined}
      onInput={(e) => {
        if (item.type === 'text' || item.type === 'task' || item.type === 'mind') editor.previewText(id, e.currentTarget.value);
        if (item.type !== 'text' && !isFrame) {
          const el = e.currentTarget, content = Math.min(textBlockHeight(el.value, width, fs, fontOf(item)), item.h - padY * 2);
          el.style.height = `${content}px`;
          if (item.va !== 'top') el.style.marginTop = `${((item.h - padY * 2 - content) / 2) * z}px`;
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey || isFrame))) {
          e.preventDefault();
          commit();
        } else if (item.type === 'mind' && item.parent && (e.key === 'Backspace' || e.key === 'Delete') && !e.currentTarget.value) {
          // An empty mind map node goes on Delete or Backspace.
          e.preventDefault();
          done.current = true;
          editor.removeMindNode(id);
        } else if (item.type === 'mind' && e.key === 'Tab') {
          // In a mind map, Tab goes on typing in a new branch of this node; Enter starts a new line.
          e.preventDefault();
          commit();
          editor.addMindNode(id, 'child');
        }
      }}
    />
  );
}

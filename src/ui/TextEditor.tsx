import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Editor } from '../editor/editor';
import { alignOf, TEXT_COLORS, textPad, type Item } from '../model/types';
import { fontOf, FONTS, LINE_HEIGHT } from '../canvas/text';
import { TASK_INSET } from '../canvas/geometry';

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

  useEffect(() => {
    const el = ref.current!;
    el.value = item.text ?? '';
    el.focus();
    el.select();
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
  const fs = isFrame ? 15 : item.fs ?? 16;
  const pad = textPad(item);
  // A task's text starts right of its checkbox.
  const inset = item.type === 'task' ? TASK_INSET : 0;  // a task's text keeps clear of its checkbox
  const width = isFrame ? Math.max(160, item.w * 0.6) : item.w - inset * 2 - pad * 2;
  const top = isFrame ? item.y - 30 : item.y + pad;
  const p = editor.toScreen({ x: item.x + (isFrame ? 0 : inset + pad), y: top });

  // Centre the text vertically in stickers and shapes, like the canvas does.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || isFrame || item.type === 'text') return;
    el.style.height = '0px';
    const content = Math.min(el.scrollHeight, item.h - pad * 2);
    el.style.height = `${content}px`;
    el.style.marginTop = `${((item.h - pad * 2 - content) / 2) * z}px`;
  });

  return (
    <textarea
      ref={ref}
      className={`text-edit ${item.type} ${item.color === 'none' ? 'nofill' : ''}`}
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
          color: item.tc && (item.tc.startsWith('#') ? item.tc : TEXT_COLORS[item.tc]) || (item.type === 'mind' && !item.parent ? 'var(--surface)' : undefined),
        }),
        padding: isFrame ? '0 4px' : 0,
      }}
      onInput={(e) => {
        if (item.type === 'text' || item.type === 'task') editor.previewText(id, e.currentTarget.value);
        if (item.type !== 'text' && !isFrame) {
          const el = e.currentTarget;
          el.style.height = '0px';
          el.style.height = `${Math.min(el.scrollHeight, item.h - pad * 2)}px`;
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey || isFrame))) {
          e.preventDefault();
          commit();
        } else if (item.type === 'mind' && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) {
          // In a mind map, typing goes on in a new node: Tab a branch of this one, Enter one beside it.
          e.preventDefault();
          commit();
          editor.addMindNode(id, e.key === 'Enter' && item.parent ? 'sibling' : 'child');
        }
      }}
    />
  );
}

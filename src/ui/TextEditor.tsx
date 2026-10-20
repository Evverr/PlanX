import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { LINE_HEIGHT } from '../canvas/text';

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
  const pad = item.type === 'sticky' ? 14 : item.type === 'rect' ? 10 : item.type === 'ellipse' ? Math.min(item.w, item.h) * 0.15 + 6 : 0;
  const width = isFrame ? Math.max(160, item.w * 0.6) : item.w - pad * 2;
  const top = isFrame ? item.y - 30 : item.y + pad;
  const p = editor.toScreen({ x: item.x + (isFrame ? 0 : pad), y: top });

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
        fontWeight: isFrame ? 600 : item.type === 'text' ? item.fw ?? 400 : item.type === 'sticky' ? 500 : 600,
        padding: isFrame ? '0 4px' : 0,
      }}
      onInput={(e) => {
        if (item.type === 'text') editor.previewText(id, e.currentTarget.value);
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
        }
      }}
    />
  );
}

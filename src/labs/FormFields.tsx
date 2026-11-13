import { createPortal } from 'react-dom';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { FIELD_PAD, FIELD_RAD, FORM_FS, HINTS, fieldBox, valuesOf } from './formObject';

/**
 * «Форма» (formObject.ts): its two fields to type into, laid over where it draws them while it's picked
 * and not filled, as the board's zoomed. What's typed goes to the board at once (everyone sees it); one
 * field's typing is one step to undo.
 */
export function FormFields({ editor, item, zoom }: { editor: Editor; item: Item; zoom: number }) {
  const r = editor.canvas?.getBoundingClientRect(), cam = editor.cam, values = valuesOf(item);
  if (!r) return null;
  const set = (i: number, v: string) => {
    const next = [...values];
    next[i] = v;
    editor.board.update(item.id, { fv: next });
  };
  return createPortal(
    <>
      {[0, 1].map((i) => {
        const f = fieldBox(item, i);
        return (
          <input key={i} className="form-field" value={values[i]} placeholder={HINTS[i]} aria-label={HINTS[i]}
            onChange={(e) => set(i, e.target.value)} onFocus={() => editor.beginChange()} onBlur={() => editor.endChange()}
            onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              left: r.left + cam.x + f.x * zoom, top: r.top + cam.y + f.y * zoom, width: f.w * zoom, height: f.h * zoom,
              fontSize: FORM_FS * zoom, borderRadius: FIELD_RAD * zoom, padding: `0 ${FIELD_PAD * zoom}px`,
            }} />
        );
      })}
    </>,
    document.body,
  );
}

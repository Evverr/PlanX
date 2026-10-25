import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { emojiSrc } from '../emoji/emoji';
import { PanelIcon } from '../ui/PanelIcon';
import { myId } from './labs';
import { REACTIONS, toggleReaction } from './overlays';

/** "Замок" on the selection panel: locks what's selected in place, or unlocks it if it all is. */
export function LockButton({ editor, items }: { editor: Editor; items: Item[] }) {
  const locked = items.every((i) => i.lock);
  const title = locked ? 'Открепить' : 'Закрепить (не сдвинуть и не удалить)';
  return (
    <button className={`ib ${locked ? 'on' : ''}`} title={title} aria-label={title} aria-pressed={locked}
      onClick={() => editor.board.transact(() => items.forEach((i) => editor.board.update(i.id, { lock: locked ? undefined : true })))}>
      <PanelIcon name={locked ? 'lock-l' : 'unlock-l'} />
    </button>
  );
}

/** "Реакции" on the selection panel: a button opening a row of emoji to put on what's selected
 *  (or take yours off), each with how many have put it on all of it. */
export function ReactButton({ editor, items }: { editor: Editor; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);
  const me = myId();
  return (
    <div ref={ref} className="op-wrap">
      <button className={`ib ${open ? 'on' : ''}`} title="Реакция" aria-label="Реакция" aria-expanded={open} onClick={() => setOpen(!open)}>
        <PanelIcon name="like" />
      </button>
      {open && (
        <div className="op-pop react-pop" data-nosort role="menu" aria-label="Реакции">
          {REACTIONS.map((emoji) => {
            const mine = items.every((i) => i.rx?.[emoji]?.includes(me));
            const n = items.length === 1 ? items[0].rx?.[emoji]?.length ?? 0 : 0;
            return (
              <button key={emoji} className={`react-btn ${mine ? 'on' : ''}`} role="menuitemcheckbox" aria-checked={mine}
                onClick={() => toggleReaction(editor, items.map((i) => i.id), emoji)}>
                <img src={emojiSrc(emoji)} alt="" draggable={false} />
                {n > 0 && <span>{n}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor';
import type { Item } from '../model/types';
import { emojiSrc } from '../emoji/emoji';
import { PanelIcon } from '../ui/PanelIcon';
import { myId } from './labs';
import { REACTIONS, toggleReaction } from './overlays';
import { shapeCols, startTidy, stopTidy, subscribeTidy, tidyMatches, tidyNow, type TidyShape } from './tidy';
import { holds } from './tidyMind';
import { alignItems, type AlignTo } from './align';

/** "Авторасположение" on the selection panel: lays what's selected out in a grid, and stays lit (the
 *  gaps' handles showing) while that's what's selected; pressed again, it's off. For one mind map node,
 *  everything growing from it laid out afresh as a mind map lays it out. */
export function TidyButton({ editor, mind }: { editor: Editor; mind?: string }) {
  const t = useSyncExternalStore(subscribeTidy, tidyNow), on = mind ? holds(editor) : !!t && tidyMatches(editor);
  return (
    <button className={`ib ${on ? 'on' : ''}`} title="Авторасположение" aria-label="Авторасположение" aria-pressed={on}
      onClick={() => { if (mind) editor.tidyMind(mind); else if (on) stopTidy(); else startTidy(editor); editor.requestRender(); }}>
      <PanelIcon name="apps" />
    </button>
  );
}

const ALIGNS: Array<[AlignTo, 'align-items-left' | 'align-items-center' | 'align-items-right' | 'align-items-top' | 'align-items-middle' | 'align-items-bottom', string]> = [
  ['left', 'align-items-left', 'По левому краю'], ['center', 'align-items-center', 'По центру'], ['right', 'align-items-right', 'По правому краю'],
  ['top', 'align-items-top', 'По верхнему краю'], ['middle', 'align-items-middle', 'По середине'], ['bottom', 'align-items-bottom', 'По нижнему краю'],
];

/** «Авторасположение» in the three ways (as near square as they come, in a row, in a column), with the
 *  ways to line up: each lit while what's picked is laid out so, a press again turning it off. */
const TIDIES: Array<[TidyShape, 'apps' | 'columns', string, React.CSSProperties?]> = [
  ['grid', 'apps', 'Авторасположение квадратом'], ['row', 'columns', 'Авторасположение по горизонтали'], ['col', 'columns', 'Авторасположение по вертикали', { transform: 'rotate(90deg)' }],
];

/** "Выравнивание" on the selection panel: a button opening the six ways to line what's selected up,
 *  across and down, and, with «Авторасположение» on, the three ways to lay it out; it stays open to try
 *  one after another. */
export function AlignButton({ editor, tidy: withTidy }: { editor: Editor; tidy?: boolean }) {
  const t = useSyncExternalStore(subscribeTidy, tidyNow), on = !!t && tidyMatches(editor);
  // (Its left edge level with the panel's it opens from.)
  const popRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const pop = popRef.current, wrap = pop?.parentElement, bar = wrap?.closest('.bar');
    if (!pop || !wrap || !bar) return;
    pop.style.transform = 'none';
    pop.style.left = `${Math.round(bar.getBoundingClientRect().left - wrap.getBoundingClientRect().left)}px`;
  });
  const n = t?.ids.length ?? 0, shapeOn = (s: TidyShape) => on && t!.cols === shapeCols(s, n) && (s !== 'grid' || (t!.cols !== 1 && t!.cols !== n));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);
  return (
    <div ref={ref} className="op-wrap">
      <button className={`ib ${open ? 'on' : ''}`} title="Выравнивание" aria-label="Выравнивание" aria-expanded={open} onClick={() => setOpen(!open)}>
        <PanelIcon name="align-items-left" />
      </button>
      {open && (
        <div ref={popRef} className="op-pop align-pop" data-nosort role="toolbar" aria-label="Выравнивание">
          {withTidy && TIDIES.map(([shape, icon, title, style]) => (
            <button key={shape} className={`ib ${shapeOn(shape) ? 'on' : ''}`} title={title} aria-label={title} aria-pressed={shapeOn(shape)}
              onClick={() => { if (shapeOn(shape)) stopTidy(); else { stopTidy(); startTidy(editor, shape); } editor.requestRender(); }}><PanelIcon name={icon} style={style} /></button>
          ))}
          {withTidy && <span className="align-cell"><span className="sep" /></span>}
          {ALIGNS.map(([to, icon, title], i) => <span key={to} className="align-cell">
            {i === 3 && <span className="sep" />}
            <button className="ib" title={title} aria-label={title} onClick={() => alignItems(editor, to)}><PanelIcon name={icon} /></button>
          </span>)}
        </div>
      )}
    </div>
  );
}

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
        <PanelIcon name="heart" />
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

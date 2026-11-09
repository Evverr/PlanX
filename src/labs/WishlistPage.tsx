import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ago } from '../shelf/boards';
import { readText, writeText } from '../storage';
import { emojiSrc } from '../emoji/emoji';
import { PanelIcon } from '../ui/PanelIcon';
import { REACTIONS } from './overlays';
import { Wishes, type Wish, type WishSort } from './wishes';

/** A wish's menu: under the three dots at its right (shown with the pointer on it), «Удалить» and
 *  «Скрыть» (shown faintly; for now anyone's, later the admins' alone). */
function WishMenu({ wishes, w }: { wishes: Wishes; w: Wish }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);
  const row = (label: string, run: () => void) => (
    <div className="menu-item"><button className="menu-row" role="menuitem" onClick={() => { setOpen(false); run(); }}><span>{label}</span></button></div>
  );
  return (
    <div ref={ref} className={`wish-more-wrap ${open ? 'open' : ''}`}>
      <button className="wish-more" title="Ещё" aria-label="Ещё" aria-expanded={open} onClick={() => setOpen(!open)}><PanelIcon name="more-vertical" /></button>
      {open && (
        <div className="board-menu wish-menu" role="menu" aria-label="Пожелание">
          {row('Удалить', () => wishes.remove(w.id))}
          {row(w.hidden ? 'Показать' : 'Скрыть', () => wishes.hide(w.id))}
        </div>
      )}
    </div>
  );
}

/** A wish's reactions, as those on the board's items: those put on it, each with how many; and, with the
 *  pointer on the wish, a faint one, all of them coming out with the pointer on it. */
function WishReactions({ wishes, w }: { wishes: Wishes; w: Wish }) {
  const img = (emoji: string) => <img src={emojiSrc(emoji)} alt="" draggable={false} />;
  return (
    <div className="wish-rx">
      {w.rx.map((r) => (
        <button key={r.emoji} className={`wish-pill ${r.mine ? 'mine' : ''}`} aria-pressed={r.mine} aria-label={`Реакция, ${r.n}`} onClick={() => wishes.react(w.id, r.emoji)}>
          {img(r.emoji)}<span>{r.n}</span>
        </button>
      ))}
      <span className="wish-react">
        <span className="wish-react-faint" aria-hidden="true">{img(REACTIONS[0])}</span>
        <span className="wish-react-all" role="menu" aria-label="Реакции">
          {REACTIONS.map((emoji) => (
            <button key={emoji} className="wish-react-btn" role="menuitemcheckbox" aria-checked={!!w.rx.find((r) => r.emoji === emoji)?.mine}
              aria-label={`Реакция ${emoji}`} onClick={() => wishes.react(w.id, emoji)}>{img(emoji)}</button>
          ))}
        </span>
      </span>
    </div>
  );
}

const SORT_KEY = 'planx-wish-sort';
/** Wishes on a page; with more, page numbers under them. */
const PAGE = 25;

/** "Wishlist" on the shelf page: a wish written in at the top, everyone's below, liked one each. */
export function WishlistPage() {
  const wishes = useMemo(() => new Wishes(), []);
  useEffect(() => () => wishes.destroy(), [wishes]);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => wishes.subscribe(redraw), [wishes]);
  const [text, setText] = useState('');
  const [sort, setSort] = useState<WishSort>(() => (readText(SORT_KEY) === 'new' ? 'new' : 'likes'));
  useEffect(() => writeText(SORT_KEY, sort), [sort]);
  const [page, setPage] = useState(0);

  // A new wish is on the first page (by date, at its top).
  const add = () => { wishes.add(text); setText(''); setPage(0); };
  const list = wishes.list(sort), pages = Math.ceil(list.length / PAGE), at = Math.min(page, Math.max(0, pages - 1));
  const turn = (n: number) => { setPage(n); document.querySelector('.wish-head')?.scrollIntoView({ block: 'start' }); };
  return (
    <div className="wishlist">
      <form className="wish-form" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <textarea value={text} placeholder="Чего не хватает в PlanX?" aria-label="Пожелание" rows={3} maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }} />
        <button className="btn primary" type="submit" disabled={!text.trim()}>Отправить</button>
      </form>
      <div className="wish-head">
        <h2>Пожелания{list.length ? ` · ${list.length}` : ''}</h2>
        <select className="shelf-sort" aria-label="Порядок" value={sort} onChange={(e) => { setSort(e.target.value as WishSort); setPage(0); }}>
          <option value="likes">По реакциям</option>
          <option value="new">По дате</option>
        </select>
      </div>
      {!list.length && <p className="wish-empty">Пока пусто. Напишите первое пожелание.</p>}
      <ul className="wish-list">
        {list.slice(at * PAGE, (at + 1) * PAGE).map((w) => (
          <li key={w.id} className={`wish ${w.hidden ? 'hidden' : ''}`}>
            <div className="wish-body">
              <p>{w.text}</p>
              <span className="wish-meta">{w.by ? `${w.by} · ` : ''}{ago(w.at)}</span>
              <WishReactions wishes={wishes} w={w} />
            </div>
            <WishMenu wishes={wishes} w={w} />
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav className="wish-pages" aria-label="Страницы">
          <button disabled={at === 0} aria-label="Назад" onClick={() => turn(at - 1)}>‹</button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} className={i === at ? 'on' : ''} aria-current={i === at ? 'page' : undefined} onClick={() => turn(i)}>{i + 1}</button>
          ))}
          <button disabled={at === pages - 1} aria-label="Дальше" onClick={() => turn(at + 1)}>›</button>
        </nav>
      )}
    </div>
  );
}

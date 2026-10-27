import { useEffect, useMemo, useReducer, useState } from 'react';
import { ago } from '../shelf/boards';
import { Glyph } from '../ui/glyphs';
import { readText, writeText } from '../storage';
import { Wishes, type WishSort } from './wishes';

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
          <option value="likes">По лайкам</option>
          <option value="new">По дате</option>
        </select>
      </div>
      {!list.length && <p className="wish-empty">Пока пусто. Напишите первое пожелание.</p>}
      <ul className="wish-list">
        {list.slice(at * PAGE, (at + 1) * PAGE).map((w) => (
          <li key={w.id} className="wish">
            <div className="wish-body">
              <p>{w.text}</p>
              <span className="wish-meta">{w.by ? `${w.by} · ` : ''}{ago(w.at)}</span>
            </div>
            <button className={`wish-like ${w.mine ? 'on' : ''}`} aria-pressed={w.mine} title={w.mine ? 'Убрать лайк' : 'Нравится'}
              aria-label={`Лайк, ${w.likes}`} onClick={() => wishes.like(w.id)}>
              <Glyph id="like" />
              <span>{w.likes}</span>
            </button>
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

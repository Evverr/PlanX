import { useEffect, useMemo, useRef, useState } from 'react';
import { newBoardId } from '../collab/connection';
import { PanelIcon } from '../ui/PanelIcon';
import { readText, writeText } from '../storage';
import { Notebook } from './Notebook';
import {
  COVER_COLORS, PATTERNS, SORTS, ago, arrange, boardUrl, idFromLink, plural, randomCover, readShelf, readThumb,
  removeEntry, updateEntry, writeShelf, type BoardEntry, type Cover, type SortBy,
} from './boards';
import { loadShelf, renameBoard } from './docs';
import './shelf.css';

type Dialog =
  | { kind: 'create' }
  | { kind: 'link' }
  | { kind: 'rename'; board: BoardEntry }
  | { kind: 'cover'; board: BoardEntry }
  | { kind: 'remove'; board: BoardEntry }
  | null;

interface Toast { text: string; undo?: () => void }

const SORT_KEY = 'planx-shelf-sort';

/**
 * The start page: every board this browser knows, standing on shelves like notebooks.
 * From here boards are made, found, sorted, renamed, given covers, starred and taken off the shelf.
 */
export function ShelfPage() {
  const [boards, setBoards] = useState<BoardEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortBy>(() => (SORTS.some((s) => s.id === readText(SORT_KEY)) ? readText(SORT_KEY) as SortBy : 'opened'));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Мои доски · PlanX';
    void loadShelf().then(setBoards);
    // Another tab (a board open next to this page) changes the shelf: show it here too.
    const reread = () => setBoards(readShelf() ?? []);
    const storage = (e: StorageEvent) => { if (e.key === 'planx-boards') reread(); };
    window.addEventListener('planx:shelf', reread);
    window.addEventListener('storage', storage);
    window.addEventListener('focus', reread);
    return () => {
      window.removeEventListener('planx:shelf', reread);
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', reread);
    };
  }, []);

  useEffect(() => writeText(SORT_KEY, sort), [sort]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // "/" goes to the search, Escape closes what's open.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as Element | null)?.closest?.('input, textarea');
      if (e.key === '/' && !typing && !dialog) { e.preventDefault(); search.current?.focus(); }
      if (e.key === 'Escape') { setMenu(null); setDialog(null); }
    };
    const away = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('.book-menu, .book-more')) setMenu(null); };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', away, true);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', away, true); };
  }, [dialog]);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = readText('planx-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    writeText('planx-theme', next);
  };

  const shown = useMemo(() => arrange(boards ?? [], query, sort), [boards, query, sort]);
  const pinned = shown.filter((b) => b.pinned);
  const searching = query.trim() !== '';

  const change = (id: string, patch: Partial<BoardEntry>) => {
    updateEntry(id, patch);
    setBoards(readShelf() ?? []);
  };

  const create = (title: string, cover: Cover) => {
    const id = newBoardId();
    updateEntry(id, { title, cover });
    location.href = `${boardUrl(id)}${title ? `&title=${encodeURIComponent(title)}` : ''}`;
  };

  const copyLink = async (b: BoardEntry) => {
    const url = `${location.origin}${boardUrl(b.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast({ text: 'Ссылка на доску скопирована' });
    } catch {
      setToast({ text: url });
    }
  };

  const remove = (b: BoardEntry) => {
    const before = readShelf() ?? [];
    removeEntry(b.id);
    setBoards(readShelf() ?? []);
    setToast({ text: `«${b.title || 'Без названия'}» убрана с полки`, undo: () => { writeShelf(before); setBoards(before); setToast(null); } });
  };

  // A pinned board stands on two shelves; its menu opens on the one it was asked on.
  const book = (shelf: string) => (b: BoardEntry) => {
    const key = `${shelf}:${b.id}`;
    return (
      <div className="book" key={b.id}>
        <a className="book-cover" href={boardUrl(b.id)} title={`Открыть «${b.title || 'Без названия'}»`}>
          <Notebook title={b.title} cover={b.cover} thumb={b.cover.peek ? readThumb(b.id) : null} pinned={b.pinned} />
        </a>
        <div className="book-name" title={b.title || 'Без названия'}>{b.title || 'Без названия'}</div>
        <div className="book-meta">
          {b.opened ? ago(sort === 'edited' ? b.edited : sort === 'created' ? b.created : b.opened) : 'открыта раньше'}
          {b.items > 0 && ` · ${b.items} ${plural(b.items, 'элемент', 'элемента', 'элементов')}`}
        </div>
        <button className={`book-more ${menu === key ? 'on' : ''}`} title="Действия с доской" aria-label="Действия с доской" aria-expanded={menu === key}
          onClick={() => setMenu(menu === key ? null : key)}><PanelIcon name="more" /></button>
        {menu === key && (
          <div className="book-menu" role="menu">
            <a role="menuitem" href={boardUrl(b.id)}>Открыть</a>
            <a role="menuitem" href={boardUrl(b.id)} target="_blank" rel="noreferrer" onClick={() => setMenu(null)}>Открыть в новой вкладке</a>
            <hr />
            <button role="menuitem" onClick={() => { setMenu(null); setDialog({ kind: 'rename', board: b }); }}>Переименовать</button>
            <button role="menuitem" onClick={() => { setMenu(null); setDialog({ kind: 'cover', board: b }); }}>Обложка…</button>
            <button role="menuitem" onClick={() => { setMenu(null); change(b.id, { pinned: !b.pinned }); }}>{b.pinned ? 'Убрать из избранного' : 'В избранное'}</button>
            <button role="menuitem" onClick={() => { setMenu(null); void copyLink(b); }}>Скопировать ссылку</button>
            <hr />
            <button role="menuitem" className="danger" onClick={() => { setMenu(null); setDialog({ kind: 'remove', board: b }); }}>Убрать с полки</button>
          </div>
        )}
      </div>
    );
  };

  const newBook = (
    <div className="book" key="new">
      <button className="book-cover new-book" onClick={() => setDialog({ kind: 'create' })} title="Новая доска">
        <span className="nb nb-new"><PanelIcon name="plus" /></span>
      </button>
      <div className="book-name">Новая доска</div>
      <div className="book-meta">пустая, с чистого листа</div>
    </div>
  );

  return (
    <div className="shelf-page">
      <header className="shelf-head">
        <div className="shelf-brand">
          <span className="shelf-logo">Plan</span>
          <h1>Мои доски</h1>
          {boards && boards.length > 0 && <span className="shelf-count">{boards.length}</span>}
        </div>
        <div className="shelf-tools">
          <label className="shelf-search">
            <PanelIcon name="search" />
            <input ref={search} type="search" placeholder="Найти доску" aria-label="Найти доску" value={query} onChange={(e) => setQuery(e.target.value)} />
            {!query && <kbd>/</kbd>}
          </label>
          <select className="shelf-sort" aria-label="Порядок" value={sort} onChange={(e) => setSort(e.target.value as SortBy)}>
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button className="ib" title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            onClick={toggleTheme}><PanelIcon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          <button className="btn" onClick={() => setDialog({ kind: 'link' })}>Открыть по ссылке</button>
          <button className="btn primary" onClick={() => setDialog({ kind: 'create' })}>Новая доска</button>
        </div>
      </header>

      <main className="shelf-main">
        {boards === null ? null : boards.length === 0 ? (
          <div className="shelf-empty">
            <div className="shelf solo">{newBook}</div>
            <h2>Здесь будут ваши доски</h2>
            <p>Каждая доска встаёт на полку, как ежедневник. Начните с новой или загляните в демо-доску.</p>
            <div className="row">
              <a className="btn" href={boardUrl('demo')}>Открыть демо-доску</a>
              <button className="btn primary" onClick={() => setDialog({ kind: 'create' })}>Создать доску</button>
            </div>
          </div>
        ) : searching ? (
          <section>
            <h2 className="shelf-title">Найдено: {shown.length}</h2>
            {shown.length ? <div className="shelf">{shown.map(book('found'))}</div> : <p className="shelf-none">Ничего не нашлось по «{query.trim()}»</p>}
          </section>
        ) : (
          <>
            {pinned.length > 0 && (
              <section>
                <h2 className="shelf-title">Избранное</h2>
                <div className="shelf">{pinned.map(book('pinned'))}</div>
              </section>
            )}
            <section>
              <h2 className="shelf-title">Все доски</h2>
              <div className="shelf">{newBook}{shown.map(book('all'))}</div>
            </section>
          </>
        )}
      </main>

      {dialog?.kind === 'create' && <CreateDialog onClose={() => setDialog(null)} onCreate={create} />}
      {dialog?.kind === 'link' && <LinkDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'rename' && <RenameDialog board={dialog.board} onClose={() => setDialog(null)} onRename={(title) => {
        change(dialog.board.id, { title });
        setDialog(null);
        void renameBoard(dialog.board.id, title).catch(() => setToast({ text: 'Не удалось переименовать саму доску, только на полке' }));
      }} />}
      {dialog?.kind === 'cover' && <CoverDialog board={dialog.board} onClose={() => setDialog(null)} onSave={(cover) => { change(dialog.board.id, { cover }); setDialog(null); }} />}
      {dialog?.kind === 'remove' && (
        <Modal label="Убрать доску с полки" onClose={() => setDialog(null)}>
          <h3>Убрать «{dialog.board.title || 'Без названия'}» с полки?</h3>
          <p>Доска пропадёт из списка, но не удалится: по ссылке её можно открыть снова, и она вернётся на полку.</p>
          <div className="row">
            <button className="btn" onClick={() => setDialog(null)}>Отмена</button>
            <button className="btn primary danger" onClick={() => { remove(dialog.board); setDialog(null); }}>Убрать</button>
          </div>
        </Modal>
      )}

      {toast && (
        <div className="pop toast shelf-toast" role="status">
          {toast.text}
          {toast.undo && <button className="toast-undo" onClick={toast.undo}>Вернуть</button>}
        </div>
      )}
    </div>
  );
}

function Modal({ label, onClose, children, wide }: { label: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="shelf-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`shelf-dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>
  );
}

/** Colours, paper and the window, next to a notebook showing how it'll look. */
function CoverPicker({ title, cover, onChange, thumb }: { title: string; cover: Cover; onChange: (c: Cover) => void; thumb?: string | null }) {
  return (
    <div className="cover-picker">
      <div className="cover-preview"><Notebook title={title} cover={cover} thumb={thumb} /></div>
      <div className="cover-options">
        <div className="cover-label">Цвет обложки</div>
        <div className="cover-colors">
          {COVER_COLORS.map((c) => (
            <button key={c.color} type="button" className={`swatch ${cover.color === c.color ? 'on' : ''}`} style={{ background: c.color }}
              title={c.name} aria-label={c.name} aria-pressed={cover.color === c.color} onClick={() => onChange({ ...cover, color: c.color })} />
          ))}
        </div>
        <div className="cover-label">Узор</div>
        <div className="cover-patterns">
          {PATTERNS.map((p) => (
            <button key={p.id} type="button" className={`seg ${cover.pattern === p.id ? 'on' : ''}`} aria-pressed={cover.pattern === p.id}
              onClick={() => onChange({ ...cover, pattern: p.id })}>{p.label}</button>
          ))}
        </div>
        {thumb !== undefined && (
          <label className="cover-peek" title={thumb ? '' : 'Картинка появится, когда доску откроют'}>
            <input type="checkbox" checked={cover.peek} disabled={!thumb} onChange={(e) => onChange({ ...cover, peek: e.target.checked })} />
            Окошко с картинкой доски
          </label>
        )}
      </div>
    </div>
  );
}

function CreateDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string, cover: Cover) => void }) {
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState(randomCover);
  return (
    <Modal label="Новая доска" onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); onCreate(title.trim(), cover); }}>
        <h3>Новая доска</h3>
        <input className="shelf-input" autoFocus placeholder="Название, например «План на неделю»" aria-label="Название доски" maxLength={30}
          value={title} onChange={(e) => setTitle(e.target.value)} />
        <CoverPicker title={title.trim()} cover={cover} onChange={setCover} />
        <div className="row">
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary">Создать</button>
        </div>
      </form>
    </Modal>
  );
}

function RenameDialog({ board, onClose, onRename }: { board: BoardEntry; onClose: () => void; onRename: (title: string) => void }) {
  const [title, setTitle] = useState(board.title);
  return (
    <Modal label="Переименовать доску" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onRename(title.trim()); }}>
        <h3>Переименовать доску</h3>
        <input className="shelf-input" autoFocus placeholder="Без названия" aria-label="Название доски" maxLength={30}
          value={title} onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
        <div className="row">
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary">Сохранить</button>
        </div>
      </form>
    </Modal>
  );
}

function CoverDialog({ board, onClose, onSave }: { board: BoardEntry; onClose: () => void; onSave: (cover: Cover) => void }) {
  const [cover, setCover] = useState(board.cover);
  const thumb = useMemo(() => readThumb(board.id), [board.id]);
  return (
    <Modal label="Обложка" onClose={onClose} wide>
      <h3>Обложка</h3>
      <CoverPicker title={board.title} cover={cover} onChange={setCover} thumb={thumb} />
      <div className="row">
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={() => onSave(cover)}>Сохранить</button>
      </div>
    </Modal>
  );
}

/** A board someone shared: its link (or id) puts it on the shelf and opens it. */
function LinkDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const id = idFromLink(text);
  return (
    <Modal label="Открыть по ссылке" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (id) location.href = boardUrl(id); }}>
        <h3>Открыть по ссылке</h3>
        <p>Вставьте ссылку на доску, которой с вами поделились. Она откроется и встанет на полку.</p>
        <input className="shelf-input" autoFocus placeholder="https://…?board=…" aria-label="Ссылка на доску" value={text} onChange={(e) => setText(e.target.value)} />
        {text.trim() && !id && <div className="shelf-error">Это не похоже на ссылку на доску</div>}
        <div className="row">
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary" disabled={!id}>Открыть</button>
        </div>
      </form>
    </Modal>
  );
}

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { newBoardId } from '../collab/connection';
import { PanelIcon } from '../ui/PanelIcon';
import { readText, writeText } from '../storage';
import { Folder } from './Folder';
import {
  FOLDER_COLORS, SORTS, addFolder, ago, arrange, boardUrl, boardsInside, folderUrl, nameOf, pathTo, placeOf, plural,
  randomColor, readFolders, readShelf, readThumb, removeEntry, removeFolder, updateEntry, updateFolder, withInside, writeFolders, writeShelf,
  type BoardEntry, type FolderEntry, type SortBy,
} from './boards';
import { loadShelf, refreshPreviews, renameBoard } from './docs';
import './shelf.css';

type Thing = { kind: 'board'; id: string } | { kind: 'folder'; id: string };

type Dialog =
  | { kind: 'new-board' }
  | { kind: 'folder'; folder?: FolderEntry }
  | { kind: 'rename'; board: BoardEntry }
  | { kind: 'move'; what: Thing }
  | { kind: 'remove'; board: BoardEntry }
  | { kind: 'delete-folder'; folder: FolderEntry }
  | null;

interface Toast { text: string; undo?: () => void }

const SORT_KEY = 'planx-shelf-sort';
const UNTITLED_FOLDER = 'Без названия';

const folderFromUrl = () => new URLSearchParams(location.search).get('folder');

/**
 * The start page. Folders stand on shelves; inside a folder are its boards, as square tiles showing
 * everything on them, and the folders inside it. From here boards and folders are made, found, sorted,
 * renamed, moved (by the menu or by dragging onto a folder), starred and taken off the shelf.
 */
export function ShelfPage() {
  const [boards, setBoards] = useState<BoardEntry[] | null>(null);
  const [folders, setFolders] = useState<FolderEntry[]>(readFolders);
  const [here, setHere] = useState<string | null>(folderFromUrl);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortBy>(() => (SORTS.some((s) => s.id === readText(SORT_KEY)) ? readText(SORT_KEY) as SortBy : 'opened'));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // Bumped as the tiles' pictures are drawn afresh, to show them.
  const [, pictured] = useReducer((n: number) => n + 1, 0);
  const search = useRef<HTMLInputElement>(null);

  const reread = () => { setBoards(readShelf() ?? []); setFolders(readFolders()); };

  useEffect(() => {
    void loadShelf().then((list) => {
      setBoards(list);
      setFolders(readFolders());
      void refreshPreviews(list.filter((b) => b.items > 0).map((b) => b.id), pictured);
    });
    // Another tab (a board open next to this page) changes the shelf: show it here too.
    const storage = (e: StorageEvent) => { if (e.key === 'planx-boards' || e.key === 'planx-folders') reread(); };
    const back = () => setHere(folderFromUrl());
    window.addEventListener('planx:shelf', reread);
    window.addEventListener('storage', storage);
    window.addEventListener('focus', reread);
    window.addEventListener('popstate', back);
    return () => {
      window.removeEventListener('planx:shelf', reread);
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', reread);
      window.removeEventListener('popstate', back);
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
    const away = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('.tile-menu, .tile-more')) setMenu(null); };
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

  // A folder that's gone (deleted in another tab) leaves you at the top.
  const current = folders.find((f) => f.id === here) ?? null;
  const path = useMemo(() => pathTo(current?.id ?? null, folders), [current, folders]);
  useEffect(() => { document.title = current ? `${nameOf(current, UNTITLED_FOLDER)} · PlanX` : 'Мои доски · PlanX'; }, [current]);

  const go = (id: string | null) => {
    setMenu(null);
    setQuery('');
    if (id) updateFolder(id, { opened: Date.now() });
    history.pushState(null, '', folderUrl(id));
    setHere(id);
    document.querySelector('.shelf-page')?.scrollTo(0, 0);
  };

  const all = boards ?? [];
  const where = (b: BoardEntry) => placeOf(b.folder, folders);
  const parentOf = (f: FolderEntry) => placeOf(f.parent, folders);
  const inside = (f: FolderEntry) => ({ boards: boardsInside(f.id, all, folders), own: all.filter((b) => b.folder === f.id), folders: folders.filter((x) => x.parent === f.id) });
  const boardTime = (b: BoardEntry, by: Exclude<SortBy, 'title'>) => b[by];
  const folderTime = (f: FolderEntry, by: Exclude<SortBy, 'title'>) =>
    by === 'edited' ? Math.max(f.created, ...inside(f).boards.map((b) => b.edited)) : f[by];

  const searching = query.trim() !== '';
  const shownFolders = arrange(searching ? folders : folders.filter((f) => parentOf(f) === (current?.id ?? null)), query, sort, folderTime);
  const shownBoards = arrange(searching ? all : all.filter((b) => where(b) === (current?.id ?? null)), query, sort, boardTime);
  const pinned = !current && !searching ? arrange(all.filter((b) => b.pinned), '', sort, boardTime) : [];

  const placeName = (id: string | null) => (id ? nameOf(folders.find((f) => f.id === id) ?? { title: '' }, UNTITLED_FOLDER) : 'Мои доски');
  const pathText = (id: string | null) => ['Мои доски', ...pathTo(id, folders).map((f) => nameOf(f, UNTITLED_FOLDER))].join(' › ');

  const changeBoard = (id: string, patch: Partial<BoardEntry>) => { updateEntry(id, patch); reread(); };

  const createBoard = (title: string) => {
    const id = newBoardId();
    updateEntry(id, { title, folder: current?.id ?? null });
    location.href = `${boardUrl(id)}${title ? `&title=${encodeURIComponent(title)}` : ''}`;
  };

  /** Puts a board or folder into a folder (or at the top); a folder can't go into itself. */
  const move = (what: Thing, to: string | null) => {
    if (what.kind === 'folder') {
      if (to && withInside(what.id, folders).has(to)) return;
      updateFolder(what.id, { parent: to });
    } else {
      updateEntry(what.id, { folder: to });
    }
    reread();
    setToast({ text: `Перемещено в «${placeName(to)}»` });
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

  const removeBoard = (b: BoardEntry) => {
    const before = readShelf() ?? [];
    removeEntry(b.id);
    reread();
    setToast({ text: `«${nameOf(b)}» убрана с полки`, undo: () => { writeShelf(before); reread(); setToast(null); } });
  };

  const deleteFolder = (f: FolderEntry) => {
    const beforeBoards = readShelf() ?? [], beforeFolders = readFolders();
    removeFolder(f.id);
    reread();
    setToast({ text: `Папка «${nameOf(f, UNTITLED_FOLDER)}» удалена`, undo: () => { writeShelf(beforeBoards); writeFolders(beforeFolders); reread(); setToast(null); } });
  };

  // Dragging a board or folder onto a folder (or onto a step of the path above) moves it there.
  const dragging = useRef<Thing | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const canDrop = (to: string | null) => {
    const d = dragging.current;
    if (!d) return false;
    if (d.kind === 'folder') return !(to && withInside(d.id, folders).has(to)) && to !== parentOf(folders.find((f) => f.id === d.id)!);
    return to !== where(all.find((b) => b.id === d.id)!);
  };
  const dragFrom = (what: Thing) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { dragging.current = what; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', what.id); setMenu(null); },
    onDragEnd: () => { dragging.current = null; setDropOn(null); },
  });
  const dropInto = (to: string | null) => ({
    onDragOver: (e: React.DragEvent) => { if (canDrop(to)) { e.preventDefault(); setDropOn(to ?? 'top'); } },
    onDragLeave: () => setDropOn((cur) => (cur === (to ?? 'top') ? null : cur)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragging.current && canDrop(to)) move(dragging.current, to); dragging.current = null; setDropOn(null); },
  });

  const moreButton = (key: string) => (
    <button className={`tile-more ${menu === key ? 'on' : ''}`} title="Действия" aria-label="Действия" aria-expanded={menu === key}
      onClick={(e) => { e.preventDefault(); setMenu(menu === key ? null : key); }}><PanelIcon name="more" /></button>
  );

  const folderTile = (f: FolderEntry) => {
    const key = `folder:${f.id}`, inner = inside(f);
    const sheets = arrange(inner.own, '', 'edited', boardTime).slice(0, 3).map((b) => readThumb(b.id));
    const parts = [
      inner.own.length ? `${inner.own.length} ${plural(inner.own.length, 'доска', 'доски', 'досок')}` : '',
      inner.folders.length ? `${inner.folders.length} ${plural(inner.folders.length, 'папка', 'папки', 'папок')}` : '',
    ].filter(Boolean);
    return (
      <div className={`book ${dropOn === f.id ? 'drop' : ''}`} key={key} {...dropInto(f.id)}>
        <a className="book-cover" href={folderUrl(f.id)} title={`Открыть папку «${nameOf(f, UNTITLED_FOLDER)}»`} {...dragFrom({ kind: 'folder', id: f.id })}
          onClick={(e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); go(f.id); } }}>
          <Folder color={f.color} sheets={sheets.length ? sheets : []} count={parts.join(', ') || 'пустая'} />
        </a>
        <div className="book-name" title={nameOf(f, UNTITLED_FOLDER)}>{nameOf(f, UNTITLED_FOLDER)}</div>
        <div className="book-meta">{searching ? pathText(parentOf(f)) : `открыта ${ago(f.opened)}`}</div>
        {moreButton(key)}
        {menu === key && (
          <div className="tile-menu" role="menu">
            <button role="menuitem" onClick={() => go(f.id)}>Открыть</button>
            <hr />
            <button role="menuitem" onClick={() => { setMenu(null); setDialog({ kind: 'folder', folder: f }); }}>Название и цвет…</button>
            <button role="menuitem" onClick={() => { setMenu(null); setDialog({ kind: 'move', what: { kind: 'folder', id: f.id } }); }}>Переместить…</button>
            <hr />
            <button role="menuitem" className="danger" onClick={() => { setMenu(null); setDialog({ kind: 'delete-folder', folder: f }); }}>Удалить папку</button>
          </div>
        )}
      </div>
    );
  };

  // A pinned board shows twice at the top; its menu opens where it was asked.
  const boardTile = (shelf: string) => (b: BoardEntry) => {
    const key = `${shelf}:${b.id}`, thumb = readThumb(b.id);
    return (
      <div className="card" key={key}>
        <a className="card-cover" href={boardUrl(b.id)} title={`Открыть «${nameOf(b)}»`} {...dragFrom({ kind: 'board', id: b.id })}>
          {thumb ? <img src={thumb} alt="" draggable={false} /> : <span className="card-empty">{b.items ? 'Откройте доску, чтобы увидеть' : 'Пустая доска'}</span>}
          {b.pinned && <span className="card-star" title="В избранном">★</span>}
        </a>
        <div className="book-name" title={nameOf(b)}>{nameOf(b)}</div>
        <div className="book-meta">
          {searching ? pathText(where(b)) : <>
            {b.opened ? ago(sort === 'edited' ? b.edited : sort === 'created' ? b.created : b.opened) : 'открыта раньше'}
            {b.items > 0 && ` · ${b.items} ${plural(b.items, 'элемент', 'элемента', 'элементов')}`}
          </>}
        </div>
        {moreButton(key)}
        {menu === key && (
          <div className="tile-menu" role="menu">
            <a role="menuitem" href={boardUrl(b.id)}>Открыть</a>
            <a role="menuitem" href={boardUrl(b.id)} target="_blank" rel="noreferrer" onClick={() => setMenu(null)}>Открыть в новой вкладке</a>
            <hr />
            <button role="menuitem" onClick={() => { setMenu(null); setDialog({ kind: 'rename', board: b }); }}>Переименовать</button>
            <button role="menuitem" onClick={() => { setMenu(null); setDialog({ kind: 'move', what: { kind: 'board', id: b.id } }); }}>Переместить…</button>
            <button role="menuitem" onClick={() => { setMenu(null); changeBoard(b.id, { pinned: !b.pinned }); }}>{b.pinned ? 'Убрать из избранного' : 'В избранное'}</button>
            <button role="menuitem" onClick={() => { setMenu(null); void copyLink(b); }}>Скопировать ссылку</button>
            <hr />
            <button role="menuitem" className="danger" onClick={() => { setMenu(null); setDialog({ kind: 'remove', board: b }); }}>Убрать с полки</button>
          </div>
        )}
      </div>
    );
  };

  const newFolderTile = (
    <div className="book" key="new-folder">
      <button className="book-cover" onClick={() => setDialog({ kind: 'folder' })} title="Новая папка">
        <span className="fd fd-new"><PanelIcon name="plus" /></span>
      </button>
      <div className="book-name">Новая папка</div>
      <div className="book-meta">для досок по теме</div>
    </div>
  );

  const newBoardTile = (
    <div className="card" key="new-board">
      <button className="card-cover card-new" onClick={() => setDialog({ kind: 'new-board' })} title="Новая доска"><PanelIcon name="plus" /></button>
      <div className="book-name">Новая доска</div>
      <div className="book-meta">{current ? `в папке «${nameOf(current, UNTITLED_FOLDER)}»` : 'с чистого листа'}</div>
    </div>
  );

  const nothingAtAll = boards !== null && all.length === 0 && folders.length === 0;

  return (
    <div className="shelf-page">
      <header className="shelf-head">
        <div className="shelf-brand">
          <h1>Мои доски</h1>
        </div>
        <div className="shelf-tools">
          <label className="shelf-search">
            <PanelIcon name="search" />
            <input ref={search} type="search" placeholder="Найти доску или папку" aria-label="Найти доску или папку" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <select className="shelf-sort" aria-label="Порядок" value={sort} onChange={(e) => setSort(e.target.value as SortBy)}>
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button className="ib" title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            onClick={toggleTheme}><PanelIcon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          {/* On a phone they're just "+ Папка" and "+ Доска". */}
          <button className="btn" onClick={() => setDialog({ kind: 'folder' })}><span className="wide-only">Новая папка</span><span className="narrow-only">+ Папка</span></button>
          <button className="btn primary" onClick={() => setDialog({ kind: 'new-board' })}><span className="wide-only">Новая доска</span><span className="narrow-only">+ Доска</span></button>
        </div>
      </header>

      <main className="shelf-main">
        {/* Where you are: each step leads back up, and takes what's dropped on it. */}
        {current && !searching && (
          <nav className="crumbs" aria-label="Путь">
            <a href={folderUrl(null)} className={dropOn === 'top' ? 'drop' : ''} onClick={(e) => { e.preventDefault(); go(null); }} {...dropInto(null)}>Мои доски</a>
            {path.map((f, i) => (
              <span key={f.id}>
                <span className="crumb-sep">›</span>
                {i === path.length - 1
                  ? <b><i className="crumb-dot" style={{ background: f.color }} />{nameOf(f, UNTITLED_FOLDER)}</b>
                  : <a href={folderUrl(f.id)} className={dropOn === f.id ? 'drop' : ''} onClick={(e) => { e.preventDefault(); go(f.id); }} {...dropInto(f.id)}>{nameOf(f, UNTITLED_FOLDER)}</a>}
              </span>
            ))}
          </nav>
        )}

        {boards === null ? null : nothingAtAll ? (
          <div className="shelf-empty">
            <div className="shelf solo">{newFolderTile}</div>
            <h2>Здесь будут ваши папки и доски</h2>
            <p>Папки стоят на полках, как ежедневники. Внутри папки лежат доски и другие папки.</p>
            <div className="row">
              <a className="btn" href={boardUrl('demo')}>Открыть демо-доску</a>
              <button className="btn" onClick={() => setDialog({ kind: 'new-board' })}>Создать доску</button>
              <button className="btn primary" onClick={() => setDialog({ kind: 'folder' })}>Создать папку</button>
            </div>
          </div>
        ) : searching ? (
          <>
            {!shownFolders.length && !shownBoards.length && <p className="shelf-none">Ничего не нашлось по «{query.trim()}»</p>}
            {shownFolders.length > 0 && (
              <section>
                <h2 className="shelf-title">Папки: {shownFolders.length}</h2>
                <div className="shelf">{shownFolders.map(folderTile)}</div>
              </section>
            )}
            {shownBoards.length > 0 && (
              <section>
                <h2 className="shelf-title">Доски: {shownBoards.length}</h2>
                <div className="cards">{shownBoards.map(boardTile('found'))}</div>
              </section>
            )}
          </>
        ) : (
          <>
            {pinned.length > 0 && (
              <section>
                <h2 className="shelf-title">Избранное</h2>
                <div className="cards">{pinned.map(boardTile('pinned'))}</div>
              </section>
            )}
            {(!current || shownFolders.length > 0) && (
              <section>
                <h2 className="shelf-title">Папки</h2>
                <div className="shelf">{shownFolders.map(folderTile)}{newFolderTile}</div>
              </section>
            )}
            <section>
              <h2 className="shelf-title">{current ? 'Доски' : 'Доски без папки'}</h2>
              <div className="cards">{newBoardTile}{shownBoards.map(boardTile('here'))}</div>
            </section>
          </>
        )}
      </main>

      {dialog?.kind === 'new-board' && <NameDialog heading={current ? `Новая доска в «${nameOf(current, UNTITLED_FOLDER)}»` : 'Новая доска'}
        placeholder="Название, например «План на неделю»" action="Создать" onClose={() => setDialog(null)} onSave={createBoard} />}
      {dialog?.kind === 'folder' && <FolderDialog folder={dialog.folder} inside={dialog.folder ? undefined : current} onClose={() => setDialog(null)} onSave={(title, color) => {
        if (dialog.folder) updateFolder(dialog.folder.id, { title, color });
        else addFolder(newBoardId(), { title, color, parent: current?.id ?? null });
        reread();
        setDialog(null);
      }} />}
      {dialog?.kind === 'rename' && <NameDialog heading="Переименовать доску" initial={dialog.board.title} placeholder="Без названия" action="Сохранить"
        onClose={() => setDialog(null)} onSave={(title) => {
          changeBoard(dialog.board.id, { title });
          setDialog(null);
          void renameBoard(dialog.board.id, title).catch(() => setToast({ text: 'Не удалось переименовать саму доску, только на полке' }));
        }} />}
      {dialog?.kind === 'move' && <MoveDialog what={dialog.what} folders={folders}
        from={dialog.what.kind === 'board' ? where(all.find((b) => b.id === dialog.what.id)!) : parentOf(folders.find((f) => f.id === dialog.what.id)!)}
        onClose={() => setDialog(null)} onMove={(to) => { move(dialog.what, to); setDialog(null); }} />}
      {dialog?.kind === 'remove' && (
        <Modal label="Убрать доску с полки" onClose={() => setDialog(null)}>
          <h3>Убрать «{nameOf(dialog.board)}» с полки?</h3>
          <p>Доска пропадёт из списка, но не удалится: по ссылке её можно открыть снова, и она вернётся на полку.</p>
          <div className="row">
            <button className="btn" onClick={() => setDialog(null)}>Отмена</button>
            <button className="btn primary danger" onClick={() => { removeBoard(dialog.board); setDialog(null); }}>Убрать</button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'delete-folder' && (
        <Modal label="Удалить папку" onClose={() => setDialog(null)}>
          <h3>Удалить папку «{nameOf(dialog.folder, UNTITLED_FOLDER)}»?</h3>
          <p>Доски и папки из неё не удалятся, а переедут в «{placeName(parentOf(dialog.folder))}».</p>
          <div className="row">
            <button className="btn" onClick={() => setDialog(null)}>Отмена</button>
            <button className="btn primary danger" onClick={() => { const f = dialog.folder; setDialog(null); if (here === f.id) go(parentOf(f)); deleteFolder(f); }}>Удалить</button>
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

function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="shelf-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="shelf-dialog" role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>
  );
}

function NameDialog({ heading, initial = '', placeholder, action, onClose, onSave }:
  { heading: string; initial?: string; placeholder: string; action: string; onClose: () => void; onSave: (title: string) => void }) {
  const [title, setTitle] = useState(initial);
  return (
    <Modal label={heading} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(title.trim()); }}>
        <h3>{heading}</h3>
        <input className="shelf-input" autoFocus placeholder={placeholder} aria-label="Название" maxLength={30}
          value={title} onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
        <div className="row">
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary">{action}</button>
        </div>
      </form>
    </Modal>
  );
}

/** A new folder, or a folder's name and colour, next to the folder as it'll look. */
function FolderDialog({ folder, inside, onClose, onSave }: { folder?: FolderEntry; inside?: FolderEntry | null; onClose: () => void; onSave: (title: string, color: string) => void }) {
  const [title, setTitle] = useState(folder?.title ?? '');
  const [color, setColor] = useState(folder?.color ?? randomColor);
  const heading = folder ? 'Папка' : inside ? `Новая папка в «${nameOf(inside, UNTITLED_FOLDER)}»` : 'Новая папка';
  return (
    <Modal label={heading} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(title.trim(), color); }}>
        <h3>{heading}</h3>
        <div className="folder-edit">
          <div className="folder-preview"><Folder color={color} sheets={[]} count={title.trim() || UNTITLED_FOLDER} /></div>
          <div className="folder-fields">
            <input className="shelf-input" autoFocus placeholder="Название, например «Работа»" aria-label="Название папки" maxLength={30}
              value={title} onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
            <div className="cover-label">Цвет</div>
            <div className="cover-colors">
              {FOLDER_COLORS.map((c) => (
                <button key={c.color} type="button" className={`swatch ${color === c.color ? 'on' : ''}`} style={{ background: c.color }}
                  title={c.name} aria-label={c.name} aria-pressed={color === c.color} onClick={() => setColor(c.color)} />
              ))}
            </div>
          </div>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn primary">{folder ? 'Сохранить' : 'Создать'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Where to move a board or folder: the folders as a tree, with the top of the shelf first. */
function MoveDialog({ what, folders, from, onClose, onMove }:
  { what: Thing; folders: FolderEntry[]; from: string | null; onClose: () => void; onMove: (to: string | null) => void }) {
  const barred = what.kind === 'folder' ? withInside(what.id, folders) : new Set<string>();
  const rows: { f: FolderEntry; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of arrange(folders.filter((x) => placeOf(x.parent, folders) === parent), '', 'title', () => 0)) {
      rows.push({ f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 1);
  return (
    <Modal label="Переместить" onClose={onClose}>
      <h3>Переместить {what.kind === 'folder' ? 'папку' : 'доску'}</h3>
      <div className="move-list">
        <button className="move-row" disabled={from === null} onClick={() => onMove(null)}>Мои доски (верхняя полка)</button>
        {rows.map(({ f, depth }) => (
          <button key={f.id} className="move-row" style={{ paddingLeft: 12 + depth * 18 }} disabled={barred.has(f.id) || from === f.id} onClick={() => onMove(f.id)}>
            <i className="crumb-dot" style={{ background: f.color }} />{nameOf(f, UNTITLED_FOLDER)}
          </button>
        ))}
        {!rows.length && <p className="move-none">Папок пока нет: создайте папку, и сюда можно будет перемещать.</p>}
      </div>
      <div className="row"><button className="btn" onClick={onClose}>Отмена</button></div>
    </Modal>
  );
}


import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Board } from './model/board';
import { Editor } from './editor/editor';
import { Connection, newBoardId } from './collab/connection';
import { Toolbar } from './ui/Toolbar';
import { IconPicker } from './ui/IconPicker';
import { SelectionPanel } from './ui/SelectionPanel';
import { TextEditor } from './ui/TextEditor';
import { TextPanel } from './ui/FormatPanel';
import { PanelIcon } from './ui/PanelIcon';
import { DockButton, useDock } from './ui/panels/dock';
import { Minimap } from './ui/Minimap';
import { AudioRecorder } from './ui/AudioRecorder';
import { catFor } from './emoji/emoji';
import { readPictures } from './canvas/pictures';
import { cellItem } from './model/table';
import { useSortable } from './ui/sortable';
import { Tooltips } from './ui/Tooltips';
import { FramePeek } from './ui/FramePeek';
import { ClearFx } from './ui/ClearFx';
import { BoardMenu } from './ui/BoardMenu';
import { resetPanels, savePanels } from './ui/panels/store';
import { useBar } from './ui/panels/bar';
import type { Item, Link } from './model/types';
import { readJSON, readText, writeJSON, writeText } from './storage';

/** Where a board copied into a new tab waits for it, followed by the new board's id. */
const COPY_KEY = 'planx-copy:';

type Pop = 'clear' | 'icons' | 'help' | 'name' | null;


export function App({ boardId }: { boardId: string }) {
  const conn = useMemo(() => new Connection(boardId), [boardId]);
  const board = useMemo(() => new Board(conn.doc), [conn]);
  const editor = useMemo(() => new Editor(board, { presence: conn, storageKey: `planx-cam-${boardId}` }), [board, conn, boardId]);
  useEffect(() => () => conn.destroy(), [conn]);
  // Handy in the browser console and for end-to-end checks.
  useEffect(() => { Object.assign(window, { planx: { board, editor, conn } }); }, [board, editor, conn]);

  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => editor.mount(canvas.current!), [editor]);

  const ui = useSyncExternalStore(editor.subscribeUI, editor.getUI);
  useSyncExternalStore(board.subscribe, board.getVersion);
  useSyncExternalStore(conn.subscribe, () => `${conn.status}|${conn.peers().length}|${conn.me.name}`);

  const [pop, setPop] = useState<Pop>(null);
  const [toast, setToast] = useState<string | null>(null);
  // The picture after the board's been cleared, while it plays (keyed by when, to play again).
  const [cleared, setCleared] = useState<number | null>(null);
  const endCleared = useCallback(() => setCleared(null), []);
  const toggle = (p: Pop) => setPop((cur) => (cur === p ? null : p));

  useEffect(() => {
    const close = () => setPop(null);
    const icons = () => toggle('icons');
    window.addEventListener('planx:close-popovers', close);
    window.addEventListener('planx:toggle-icons', icons);
    return () => {
      window.removeEventListener('planx:close-popovers', close);
      window.removeEventListener('planx:toggle-icons', icons);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = readText('planx-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    writeText('planx-theme', next);
  };
  // The canvas watches data-theme and redraws itself.
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  // One chevron, in the zoom panel, sticks every panel around the edge of the screen to it.
  const [docked, toggleDock] = useDock('panels');
  const [minimap, setMinimap] = useState(false);
  // Your cat clears the screen: every panel hides (styles.css, [data-ui="bare"]) but the cat itself,
  // in a small square in the bottom right corner that brings them back.
  const [bare, setBare] = useState(false);
  useEffect(() => { document.documentElement.dataset.ui = bare ? 'bare' : ''; }, [bare]);
  const [recorder, setRecorder] = useState(false);
  // Buttons in the top bar and the zoom panel can be rearranged by holding them.
  const topSort = useSortable('planx-order-top2', ['logo', 'sep', 'title', 'menu', 'new', 'clear', 'sep3', 'undo', 'redo'], 'x');
  const zoomSort = useSortable('planx-order-zoom', ['zoom', 'zoom-out', 'zoom-in', 'map', 'sep', 'share', 'help', 'theme', 'fit', 'dock', 'people'], 'x');

  // The top bar and the zoom bar can be moved and made shorter by hand (see panels/bar.ts).
  const topBar = useBar(topSort.ref, { name: 'topbar', home: 'top', from: 'left', docked, keys: { x: 'planx-topbar-x', w: 'planx-topbar-w', far: 'planx-topbar-low' } });
  const zoomBar = useBar(zoomSort.ref, { name: 'zoom', home: 'bottom', from: 'right', docked, keys: { x: 'planx-zoom-x', w: 'planx-zoom-w', far: 'planx-zoom-high' } });
  const closeMinimap = useCallback(() => setMinimap(false), []);

  // A copy of this board opens in a new tab, named after it with a number added ("План" → "План 2"
  // → "План 3"). What's on it is handed over through the browser's storage, for the new tab to take.
  const openNewBoard = () => {
    const t = board.title.trim() || 'Доска', m = t.match(/^(.*?)(\d+)$/);
    const name = m ? `${m[1]}${Number(m[2]) + 1}` : `${t} 2`, id = newBoardId();
    // Too big for the storage, or none: it opens empty.
    writeJSON(`${COPY_KEY}${id}`, { items: board.list(), links: board.linkList() });
    window.open(`${location.pathname}?board=${id}&title=${encodeURIComponent(name)}`, '_blank');
  };
  // Opened that way, the board takes the copy and the name from the address, which is then tidied away.
  useEffect(() => {
    const params = new URLSearchParams(location.search), name = params.get('title'), key = `${COPY_KEY}${params.get('board')}`;
    const copy = readJSON<{ items: Item[]; links: Link[] }>(key);
    if (copy) {
      writeText(key, null);
      board.replaceAll(copy.items, copy.links);
    }
    if (!name) return;
    if (!board.title) board.setTitle(name.slice(0, 30));
    board.undoManager.clear();  // the copy and its name are where this board starts, not something to undo
    params.delete('title');
    history.replaceState(null, '', `${location.pathname}?${params}`);
  }, [board]);

  const [title, setTitle] = useState(board.title);
  const [menuOpen, setMenuOpen] = useState(false);
  // The menu closes on a press anywhere else, and on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    // (By its class: the panel puts its own ref on the wrapper.)
    const close = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('.menu-wrap')) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', esc); };
  }, [menuOpen]);
  useEffect(() => setTitle(board.title), [board.title]);
  useEffect(() => { document.title = board.title ? `${board.title} · PlanX` : 'PlanX'; }, [board.title]);

  const selItems = ui.selection.map((id) => board.get(id)).filter((i) => !!i);
  const linkCount = ui.selection.filter((id) => board.getLink(id)).length;
  const editing = ui.editingId ? board.get(ui.editingId) : undefined;
  const textItem = selItems.length === 1 && ['text', 'sticky', 'task', 'table'].includes(selItems[0].type) ? selItems[0] : undefined;
  // The text panel shows up 0.6 s after the item is picked, or after it's let go when moved;
  // it stays away while the item is being moved or resized.
  const [textShown, setTextShown] = useState<string | null>(null);
  useEffect(() => {
    setTextShown(null);
    if (!textItem || ui.moving) return;
    const t = setTimeout(() => setTextShown(textItem.id), 600);
    return () => clearTimeout(t);
  }, [textItem?.id, ui.moving]); // eslint-disable-line react-hooks/exhaustive-deps
  const peers = conn.peers();

  const share = async () => {
    const url = `${location.origin}${location.pathname}?board=${boardId}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast('Ссылка на доску скопирована');
    } catch {
      setToast(url);
    }
  };

  return (
    <>
      {/* Image files dropped on the board land where they were let go. */}
      <canvas ref={canvas} className="board-canvas" data-tool={ui.tool} aria-label="Доска" onPointerDown={() => setPop(null)}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          const at = { x: e.clientX, y: e.clientY };
          void readPictures(e.dataTransfer.files).then((pics) => editor.addPictures(pics, at));
        }} />

      <header ref={topSort.ref} className={`bar topbar sortable ${docked ? 'docked' : ''} ${topSort.sorting ? 'sorting' : ''}`} {...topSort.container}
        style={topBar.style}
        onPointerDown={(e) => { if (!topBar.grip.onPointerDown(e)) topSort.container.onPointerDown(e); }}
        onPointerMove={(e) => { if (!topSort.sorting) topBar.grip.onPointerMove(e); topSort.container.onPointerMove(e); }}
        onPointerLeave={topBar.grip.onPointerLeave}>
        {topSort.renderFit({
          logo: <div className="logo" title="Plan — место, где строятся планы">Plan</div>,
          sep: <div className="sep" />,
          // The field is as wide as its text (the copy in data-text sizes it), up to 30 characters.
          title: (
            <div className="title-fit" title="Название доски, можно изменить" data-text={(title || 'Без названия').slice(0, 30)}>
              <input className="title-input" id="board-title" aria-label="Название доски" spellCheck={false} placeholder="Без названия" data-nosort
                size={1} maxLength={30} value={title} onChange={(e) => setTitle(e.target.value)}
                onBlur={() => { if (title.trim() !== board.title) board.setTitle(title.trim()); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
            </div>
          ),
          // The board's menu, after its name; a click opens it under the button.
          menu: (
            <div className="menu-wrap">
              <button className={`ib ${menuOpen ? 'on' : ''}`} title="Меню" aria-label="Меню" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
                <PanelIcon name="burger" />
              </button>
              {menuOpen && <BoardMenu
                onSave={() => { savePanels(); setMenuOpen(false); setToast('Панели сохранены'); }}
                onReset={() => { editor.addOutsideStep(resetPanels()); setMenuOpen(false); setToast('Панели сброшены. Вернуть: Ctrl+Z'); }} />}
            </div>
          ),
          sep3: <div className="sep" />,
          // Light grey, and not pressable, while there's nothing to undo or redo.
          undo: <button className="ib" title="Отменить (Ctrl+Z)" aria-label="Отменить" disabled={!ui.canUndo} onClick={() => editor.undo()}><PanelIcon name="undo-on" /></button>,
          redo: <button className="ib" title="Вернуть (Ctrl+Shift+Z)" aria-label="Вернуть" disabled={!ui.canRedo} onClick={() => editor.redo()}><PanelIcon name="redo-on" /></button>,
          new: <button className="ib" title="Копия доски в новой вкладке" aria-label="Копия доски" onClick={openNewBoard}><PanelIcon name="plus" /></button>,
          clear: <button className={`ib ${pop === 'clear' ? 'on' : ''}`} title="Очистить доску" aria-label="Очистить доску" onClick={() => toggle('clear')}><PanelIcon name="cross" /></button>,
        }, topBar.space, topBar.place)}
      </header>

      <Toolbar editor={editor} tool={ui.tool} pens={ui.pens} zoom={ui.cam.z} guides={ui.guides} docked={docked} iconsOpen={pop === 'icons'} onToggleIcons={() => { toggle('icons'); setRecorder(false); }}
        recorderOpen={recorder} onToggleRecorder={() => { setRecorder(!recorder); setPop(null); }} />
      {/* Not a popover: a click on the board mustn't cut a recording short. */}
      {recorder && <AudioRecorder onClose={() => setRecorder(false)} onAdd={(note) => { editor.addAudio(note); setRecorder(false); }} />}
      {pop === 'icons' && <IconPicker zoom={ui.cam.z} onPick={(kind, id, at) => {
        setPop(null);
        if (kind === 'emoji') editor.addEmoji(id, at);
        else if (kind === 'sticky') editor.addSticky(id, at);
        else editor.addIcon(id, at);
      }} />}

      <div ref={zoomSort.ref as React.RefObject<HTMLDivElement>} className={`bar zoom sortable ${docked ? 'docked' : ''} ${zoomSort.sorting ? 'sorting' : ''}`} {...zoomSort.container}
        style={zoomBar.style}
        onPointerDown={(e) => { if (!zoomBar.grip.onPointerDown(e)) zoomSort.container.onPointerDown(e); }}
        onPointerMove={(e) => { if (!zoomSort.sorting) zoomBar.grip.onPointerMove(e); zoomSort.container.onPointerMove(e); }}
        onPointerLeave={zoomBar.grip.onPointerLeave}>
        {zoomSort.renderFit({
        people: <div className="avatars">
          <button className="avatar me" title={`${conn.me.name} (вы). Нажмите, чтобы убрать все панели`}
            aria-label="Убрать панели" onClick={() => setBare(true)}>
            <img src={catFor()} alt="" draggable={false} />
          </button>
          {peers.slice(0, 4).map((p) => (
            <span key={p.id} className="avatar" title={p.name}><img src={catFor(p.id)} alt="" draggable={false} /></span>
          ))}
          {peers.length > 4 && <span className="more">+{peers.length - 4}</span>}
        </div>,
        share: <button className="ib" title="Скопировать ссылку на доску" aria-label="Поделиться" onClick={share}><PanelIcon name="link" /></button>,
        sep: <div className="sep" />,
        map: <button className={`ib ${minimap ? 'on' : ''}`} title="Карта доски" aria-label="Карта доски" aria-pressed={minimap} data-minimap-toggle
          onClick={() => { setMinimap(!minimap); setPop(null); }}><PanelIcon name="map" /></button>,
        'zoom-out': <button className="ib" title="Отдалить (−)" aria-label="Отдалить" onClick={() => editor.zoomCenter(1 / 1.25)}><PanelIcon name="zoom-out" /></button>,
        zoom: <button className="zpct" title="Масштаб 100%" onClick={() => editor.zoomCenter(1 / editor.cam.z)}>{Math.round(ui.cam.z * 100)}%</button>,
        'zoom-in': <button className="ib" title="Приблизить (+)" aria-label="Приблизить" onClick={() => editor.zoomCenter(1.25)}><PanelIcon name="zoom-in" /></button>,
        theme: <button className="ib" title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          onClick={toggleTheme}><PanelIcon name={theme === 'dark' ? 'sun' : 'moon'} /></button>,
        fit: <button className="ib fit" title="Показать всё (Shift+1)" aria-label="Показать всё" onClick={() => editor.fit()}><PanelIcon name="screen" /></button>,
        help: <button className={`ib ${pop === 'help' ? 'on' : ''}`} title="Подсказки" aria-label="Подсказки" onClick={() => { toggle('help'); setMinimap(false); }}><PanelIcon name="question" /></button>,
        // A component can't take the ref, so the dock button sits in a wrapper.
        dock: <span className="sort-wrap"><DockButton edge="bottom" docked={docked} onToggle={toggleDock} /></span>,
        }, zoomBar.space, zoomBar.place)}
      </div>

      {minimap && <Minimap editor={editor} items={editor.shown()} docked={docked} onClose={closeMinimap} />}
      <FramePeek editor={editor} board={board} />
      {cleared && <ClearFx key={cleared} onDone={endCleared} />}
      <Tooltips />

      {/* Typing in a table cell, the panel shows and sets that cell's own formatting. */}
      {textItem && textShown === textItem.id && <TextPanel editor={editor}
        item={editing?.id === textItem.id && editing.type === 'table' && ui.editingCell !== null ? cellItem(editing, ui.editingCell) : textItem} />}

      {/* Hidden while typing, but for a mind map node, which opens for typing on a single click. */}
      {(!editing || editing.type === 'mind') && <SelectionPanel editor={editor} items={selItems} cells={ui.cells} linkCount={linkCount} docked={docked} />}
      {/* A table cell is typed into as if it were an item of its own, the size of the cell. */}
      {editing && (editing.type === 'table' && ui.editingCell !== null
        ? <TextEditor key={`${editing.id}:${ui.editingCell}`} editor={editor} item={cellItem(editing, ui.editingCell)} />
        : <TextEditor key={editing.id} editor={editor} item={editing} />)}

      {pop === 'clear' && (
        <div className="pop confirm" role="dialog" aria-label="Очистить доску">
          <p>Удалить всё с доски у всех участников? Отменить можно через <b>Ctrl+Z</b></p>
          <div className="row">
            <button className="btn" onClick={() => setPop(null)}>Отмена</button>
            <button className="btn primary" onClick={() => { editor.clearBoard(); setPop(null); setCleared(Date.now()); }}>Очистить</button>
          </div>
        </div>
      )}

      {pop === 'name' && <NamePopover name={conn.me.name} onSave={(n) => { conn.rename(n); setPop(null); }} />}

      {pop === 'help' && (
        <div className="pop help" role="dialog" aria-label="Управление">
          <h3>Управление</h3>
          <dl>
            <dt>Пробел + тянуть</dt><dd>двигать доску</dd>
            <dt>Колесо, щипок</dt><dd>масштаб</dd>
            <dt>Двойной клик</dt><dd>редактировать текст</dd>
            <dt>Shift + клик</dt><dd>выделить несколько</dd>
            <dt>Shift + тянуть за угол</dt><dd>стикер любой формы, фигура в пропорции</dd>
            <dt>Alt + тянуть</dt><dd>копировать элемент</dd>
            <dt>Тянуть за синюю точку</dt><dd>связать с другим элементом</dd>
            <dt><kbd>V H N T R O C F P M E I</kbd></dt><dd>инструменты</dd>
            <dt>Удерживать инструмент</dt><dd>переставить его на панели</dd>
            <dt><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd></dt><dd>отменить / вернуть свои действия</dd>
            <dt><kbd>Ctrl</kbd>+<kbd>C</kbd> <kbd>V</kbd> <kbd>D</kbd></dt><dd>копировать, вставить, дублировать</dd>
            <dt><kbd>Ctrl</kbd>+<kbd>G</kbd></dt><dd>фрейм вокруг выделенного</dd>
            <dt><kbd>Del</kbd></dt><dd>удалить выделенное</dd>
          </dl>
        </div>
      )}

      {toast && <div className="pop toast" role="status">{toast}</div>}
      {bare && (
        <button className="cat-corner" title="Вернуть панели" aria-label="Вернуть панели" onClick={() => setBare(false)}>
          <img src={catFor()} alt="" draggable={false} />
        </button>
      )}
    </>
  );
}

function NamePopover({ name, onSave }: { name: string; onSave: (n: string) => void }) {
  const [v, setV] = useState(name);
  return (
    <form className="pop namepop" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
      <p>Как вас подписать для остальных?</p>
      <input id="my-name" autoFocus value={v} maxLength={24} onChange={(e) => setV(e.target.value)} aria-label="Ваше имя" />
      <div className="row"><button className="btn primary" type="submit">Сохранить</button></div>
    </form>
  );
}

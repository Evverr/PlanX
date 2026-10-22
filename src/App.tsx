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
import { DockButton, useDock } from './ui/Dock';
import { Minimap } from './ui/Minimap';
import { AudioRecorder } from './ui/AudioRecorder';
import { catFor } from './emoji/emoji';
import { readPictures } from './canvas/pictures';
import { cellRect, cellText } from './model/table';
import { useSortable } from './ui/sortable';

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
    try {
      const saved = localStorage.getItem('planx-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* storage can be unavailable */ }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('planx-theme', next); } catch { /* the choice just won't be remembered */ }
  };
  // The canvas watches data-theme and redraws itself.
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  // One chevron, in the zoom panel, sticks every panel around the edge of the screen to it.
  const [docked, toggleDock] = useDock('panels');
  const [minimap, setMinimap] = useState(false);
  const [recorder, setRecorder] = useState(false);
  // Buttons in the top bar and the zoom panel can be rearranged by holding them.
  const topSort = useSortable('planx-order-top', ['logo', 'sep', 'title', 'undo', 'redo', 'new', 'clear'], 'x');
  const zoomSort = useSortable('planx-order-zoom', ['zoom', 'zoom-out', 'zoom-in', 'map', 'sep', 'share', 'help', 'theme', 'fit', 'dock', 'people'], 'x');
  const closeMinimap = useCallback(() => setMinimap(false), []);

  const [title, setTitle] = useState(board.title);
  useEffect(() => setTitle(board.title), [board.title]);
  useEffect(() => { document.title = board.title ? `${board.title} · PlanX` : 'PlanX'; }, [board.title]);

  const selItems = ui.selection.map((id) => board.get(id)).filter((i) => !!i);
  const linkCount = ui.selection.filter((id) => board.getLink(id)).length;
  const editing = ui.editingId ? board.get(ui.editingId) : undefined;
  const textItem = selItems.length === 1 && ['text', 'sticky', 'task', 'table'].includes(selItems[0].type) ? selItems[0] : undefined;
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

      <header ref={topSort.ref} className={`bar topbar sortable ${docked ? 'docked' : ''} ${topSort.sorting ? 'sorting' : ''}`} {...topSort.container}>
        {topSort.render({
          logo: <div className="logo">Plan<span>X</span></div>,
          sep: <div className="sep" />,
          // The field is as wide as its text (the copy in data-text sizes it), up to 30 characters.
          title: (
            <div className="title-fit" data-text={(title || 'Без названия').slice(0, 30)}>
              <input className="title-input" id="board-title" aria-label="Название доски" spellCheck={false} placeholder="Без названия" data-nosort
                size={1} maxLength={30} value={title} onChange={(e) => setTitle(e.target.value)}
                onBlur={() => { if (title.trim() !== board.title) board.setTitle(title.trim()); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
            </div>
          ),
          undo: <button className="ib hide-narrow" title="Отменить (Ctrl+Z)" aria-label="Отменить" onClick={() => editor.undo()}><PanelIcon name="undo-on" /></button>,
          redo: <button className="ib hide-narrow" title="Вернуть (Ctrl+Shift+Z)" aria-label="Вернуть" onClick={() => editor.redo()}><PanelIcon name="redo-on" /></button>,
          new: <button className="tb hide-narrow" onClick={() => { location.search = `?board=${newBoardId()}`; }}>Новая доска</button>,
          clear: <button className="tb danger" onClick={() => toggle('clear')}>Очистить</button>,
        })}
      </header>

      <Toolbar editor={editor} tool={ui.tool} pens={ui.pens} docked={docked} iconsOpen={pop === 'icons'} onToggleIcons={() => { toggle('icons'); setRecorder(false); }}
        recorderOpen={recorder} onToggleRecorder={() => { setRecorder(!recorder); setPop(null); }} />
      {/* Not a popover: a click on the board mustn't cut a recording short. */}
      {recorder && <AudioRecorder onClose={() => setRecorder(false)} onAdd={(note) => { editor.addAudio(note); setRecorder(false); }} />}
      {pop === 'icons' && <IconPicker onPick={(kind, id, at) => {
        setPop(null);
        if (kind === 'emoji') editor.addEmoji(id, at);
        else if (kind === 'sticky') editor.addSticky(id, at);
        else editor.addIcon(id, at);
      }} />}

      <div ref={zoomSort.ref as React.RefObject<HTMLDivElement>} className={`bar zoom sortable ${docked ? 'docked' : ''} ${zoomSort.sorting ? 'sorting' : ''}`} {...zoomSort.container}>
        {zoomSort.render({
        people: <div className="avatars">
          <button className="avatar me" title={`${conn.me.name} (вы). Нажмите, чтобы сменить имя`}
            aria-label="Ваше имя" onClick={() => toggle('name')}>
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
        })}
      </div>

      {minimap && <Minimap editor={editor} items={board.list()} docked={docked} onClose={closeMinimap} />}

      {textItem && <TextPanel editor={editor} item={textItem} />}

      {!editing && <SelectionPanel editor={editor} items={selItems} linkCount={linkCount} docked={docked} />}
      {/* A table cell is typed into as if it were an item of its own, the size of the cell. */}
      {editing && (editing.type === 'table' && ui.editingCell !== null
        ? <TextEditor key={`${editing.id}:${ui.editingCell}`} editor={editor} item={{ ...editing, ...cellRect(editing, ui.editingCell), text: cellText(editing, ui.editingCell), ls: undefined }} />
        : <TextEditor key={editing.id} editor={editor} item={editing} />)}

      {pop === 'clear' && (
        <div className="pop confirm" role="dialog" aria-label="Очистить доску">
          <p>Удалить всё с доски у всех участников? Отменить можно через <kbd>Ctrl</kbd>+<kbd>Z</kbd>.</p>
          <div className="row">
            <button className="btn" onClick={() => setPop(null)}>Отмена</button>
            <button className="btn red" onClick={() => { editor.clearBoard(); setPop(null); }}>Очистить</button>
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
            <dt><kbd>Del</kbd></dt><dd>удалить выделенное</dd>
          </dl>
        </div>
      )}

      {toast && <div className="pop toast" role="status">{toast}</div>}
    </>
  );
}

function NamePopover({ name, onSave }: { name: string; onSave: (n: string) => void }) {
  const [v, setV] = useState(name);
  return (
    <form className="pop namepop" onSubmit={(e) => { e.preventDefault(); onSave(v); }}>
      <p>Как вас подписать для остальных?</p>
      <input id="my-name" autoFocus value={v} maxLength={24} onChange={(e) => setV(e.target.value)} aria-label="Ваше имя" />
      <div className="row"><button className="btn" type="submit">Сохранить</button></div>
    </form>
  );
}

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Board } from './model/board';
import { Editor } from './editor/editor';
import { Connection, newBoardId } from './collab/connection';
import { Toolbar } from './ui/Toolbar';
import { IconPicker } from './ui/IconPicker';
import { SelectionPanel } from './ui/SelectionPanel';
import { TextEditor } from './ui/TextEditor';
import { FormatPanel, TextPanel } from './ui/FormatPanel';
import { PanelIcon } from './ui/PanelIcon';
import { DockButton, useDock } from './ui/Dock';
import { Minimap } from './ui/Minimap';

type Pop = 'clear' | 'icons' | 'help' | 'name' | null;

const STATUS_TEXT = { online: 'Сохранено и синхронизировано', connecting: 'Подключаюсь к серверу…', offline: 'Нет связи: изменения сохранятся в браузере и отправятся позже' };

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

  const [title, setTitle] = useState(board.title);
  useEffect(() => setTitle(board.title), [board.title]);
  useEffect(() => { document.title = board.title ? `${board.title} · PlanX` : 'PlanX'; }, [board.title]);

  const selItems = ui.selection.map((id) => board.get(id)).filter((i) => !!i);
  const linkCount = ui.selection.filter((id) => board.getLink(id)).length;
  const editing = ui.editingId ? board.get(ui.editingId) : undefined;
  const textItem = selItems.length === 1 && (selItems[0].type === 'text' || selItems[0].type === 'sticky') ? selItems[0] : undefined;
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
      <canvas ref={canvas} className="board-canvas" data-tool={ui.tool} aria-label="Доска" onPointerDown={() => setPop(null)} />

      <header className={`bar topbar ${docked ? 'docked' : ''}`}>
        <div className="logo">Plan<span>X</span></div>
        <div className="sep" />
        <input className="title-input" id="board-title" aria-label="Название доски" spellCheck={false} placeholder="Без названия"
          value={title} onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { if (title.trim() !== board.title) board.setTitle(title.trim()); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
        <span className={`status ${conn.status}`} title={STATUS_TEXT[conn.status]} aria-label={STATUS_TEXT[conn.status]} />
        <button className="ib hide-narrow" title="Отменить (Ctrl+Z)" aria-label="Отменить" onClick={() => editor.undo()}><PanelIcon name="undo-on" /></button>
        <button className="ib hide-narrow" title="Вернуть (Ctrl+Shift+Z)" aria-label="Вернуть" onClick={() => editor.redo()}><PanelIcon name="redo-on" /></button>
        <button className="tb hide-narrow" onClick={() => { location.search = `?board=${newBoardId()}`; }}>Новая доска</button>
        <button className="tb danger" onClick={() => toggle('clear')}>Очистить</button>
      </header>

      <Toolbar editor={editor} tool={ui.tool} docked={docked} iconsOpen={pop === 'icons'} onToggleIcons={() => toggle('icons')} />
      {pop === 'icons' && <IconPicker onPickEmoji={(id) => { editor.addEmoji(id); setPop(null); }} onPickIcon={(id) => { editor.addIcon(id); setPop(null); }} />}

      <div className={`bar zoom ${docked ? 'docked' : ''}`}>
        <div className="avatars">
          <button className="avatar me" style={{ background: conn.me.color }} title={`${conn.me.name} (вы). Нажмите, чтобы сменить имя`}
            aria-label="Ваше имя" onClick={() => toggle('name')}>
            {conn.me.name.slice(0, 1).toUpperCase()}
          </button>
          {peers.slice(0, 4).map((p) => (
            <span key={p.id} className="avatar" style={{ background: p.color }} title={p.name}>{p.name.slice(0, 1).toUpperCase()}</span>
          ))}
          {peers.length > 4 && <span className="more">+{peers.length - 4}</span>}
        </div>
        <button className="ib" title="Скопировать ссылку на доску" aria-label="Поделиться" onClick={share}><PanelIcon name="link" /></button>
        <div className="sep" />
        <button className={`ib ${minimap ? 'on' : ''}`} title="Карта доски" aria-label="Карта доски" aria-pressed={minimap}
          onClick={() => setMinimap(!minimap)}><PanelIcon name="map" /></button>
        <button className="ib" title="Отдалить (−)" aria-label="Отдалить" onClick={() => editor.zoomCenter(1 / 1.25)}><PanelIcon name="zoom-out" /></button>
        <button className="zpct" title="Масштаб 100%" onClick={() => editor.zoomCenter(1 / editor.cam.z)}>{Math.round(ui.cam.z * 100)}%</button>
        <button className="ib" title="Приблизить (+)" aria-label="Приблизить" onClick={() => editor.zoomCenter(1.25)}><PanelIcon name="zoom-in" /></button>
        <button className="ib" title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          onClick={toggleTheme}><PanelIcon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        <button className="ib fit" title="Показать всё (Shift+1)" aria-label="Показать всё" onClick={() => editor.fit()}><PanelIcon name="screen" /></button>
        <DockButton edge="bottom" docked={docked} onToggle={toggleDock} />
      </div>

      {minimap && <Minimap editor={editor} items={board.list()} docked={docked} />}

      <FormatPanel />
      {textItem && <TextPanel editor={editor} item={textItem} />}

      {!editing && <SelectionPanel editor={editor} items={selItems} linkCount={linkCount} docked={docked} />}
      {editing && <TextEditor key={editing.id} editor={editor} item={editing} />}

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

      <button className="bar ib help-btn" title="Подсказки" aria-label="Подсказки" onClick={() => toggle('help')}><PanelIcon name="question-l" /></button>
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
            <dt><kbd>V H N T R O C F I</kbd></dt><dd>инструменты</dd>
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

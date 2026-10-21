import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Board } from './model/board';
import { Editor } from './editor/editor';
import { Connection, newBoardId } from './collab/connection';
import { Toolbar } from './ui/Toolbar';
import { IconPicker } from './ui/IconPicker';
import { SelectionPanel } from './ui/SelectionPanel';
import { TextEditor } from './ui/TextEditor';
import { FormatPanel } from './ui/FormatPanel';
import { Stroke } from './ui/glyphs';

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

  const [title, setTitle] = useState(board.title);
  useEffect(() => setTitle(board.title), [board.title]);
  useEffect(() => { document.title = board.title ? `${board.title} · PlanX` : 'PlanX'; }, [board.title]);

  const selItems = ui.selection.map((id) => board.get(id)).filter((i) => !!i);
  const linkCount = ui.selection.filter((id) => board.getLink(id)).length;
  const editing = ui.editingId ? board.get(ui.editingId) : undefined;
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

      <header className="bar topbar">
        <div className="logo"><i /><span>PlanX</span></div>
        <div className="sep" />
        <input className="title-input" id="board-title" aria-label="Название доски" spellCheck={false} placeholder="Без названия"
          value={title} onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { if (title.trim() !== board.title) board.setTitle(title.trim()); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
        <span className={`status ${conn.status}`} title={STATUS_TEXT[conn.status]} aria-label={STATUS_TEXT[conn.status]} />
        <button className="ib hide-narrow" title="Отменить (Ctrl+Z)" aria-label="Отменить" onClick={() => editor.undo()}><Stroke name="undo" /></button>
        <button className="ib hide-narrow" title="Вернуть (Ctrl+Shift+Z)" aria-label="Вернуть" onClick={() => editor.redo()}><Stroke name="redo" /></button>
        <button className="tb hide-narrow" onClick={() => { location.search = `?board=${newBoardId()}`; }}>Новая доска</button>
        <button className="tb danger" onClick={() => toggle('clear')}>Очистить</button>
      </header>

      <div className="bar people">
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
        <button className="tb primary" onClick={share}>Поделиться</button>
      </div>

      <Toolbar editor={editor} tool={ui.tool} iconsOpen={pop === 'icons'} onToggleIcons={() => toggle('icons')} />
      {pop === 'icons' && <IconPicker onPick={(id) => { editor.addIcon(id); setPop(null); }} />}

      <div className="bar zoom">
        <button className="ib" title="Отдалить (−)" aria-label="Отдалить" onClick={() => editor.zoomCenter(1 / 1.25)}><Stroke name="minus" /></button>
        <button className="zpct" title="Масштаб 100%" onClick={() => editor.zoomCenter(1 / editor.cam.z)}>{Math.round(ui.cam.z * 100)}%</button>
        <button className="ib" title="Приблизить (+)" aria-label="Приблизить" onClick={() => editor.zoomCenter(1.25)}><Stroke name="plus" /></button>
        <button className="ib fit" title="Показать всё (Shift+1)" aria-label="Показать всё" onClick={() => editor.fit()}><Stroke name="fit" /></button>
      </div>

      <FormatPanel />

      {!editing && <SelectionPanel editor={editor} items={selItems} linkCount={linkCount} />}
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

      <button className="bar ib help-btn" title="Подсказки" aria-label="Подсказки" onClick={() => toggle('help')}><Stroke name="help" /></button>
      {pop === 'help' && (
        <div className="pop help" role="dialog" aria-label="Управление">
          <h3>Управление</h3>
          <dl>
            <dt>Пробел + тянуть</dt><dd>двигать доску</dd>
            <dt>Колесо, щипок</dt><dd>масштаб</dd>
            <dt>Двойной клик</dt><dd>редактировать текст</dd>
            <dt>Shift + клик</dt><dd>выделить несколько</dd>
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

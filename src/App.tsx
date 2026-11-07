import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Board } from './model/board';
import { Editor } from './editor/editor';
import { Connection, newBoardId } from './collab/connection';
import { Toolbar } from './ui/Toolbar';
import { IconPicker } from './ui/IconPicker';
import { SelectionPanel } from './ui/SelectionPanel';
import { usePanelPlace } from './labs/panelPlace';
import { TextEditor } from './ui/TextEditor';
import { TextPanel } from './ui/FormatPanel';
import { TaskKeepPop, TaskPop, TaskTipBubble } from './ui/TaskPop';
import { noteBoard, setSideOpen, useSideOpen } from './labs/SideNav';
import { navigate } from './route';
import { PanelIcon } from './ui/PanelIcon';
import { asOne } from './labs/multi';
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
import { ProfileDialog, SettingsDialog } from './ui/Dialogs';
import { openBoardFile, saveBoardFile } from './collab/boardFile';
import { resetPanels, savePanels } from './ui/panels/store';
import { useBar } from './ui/panels/bar';
import type { Item, Link } from './model/types';
import { Labs } from './labs/LabsLayer';
import { labOn, useLabs } from './labs/labs';
import { morphPanel } from './labs/textButton';
import { toggleDots, useDotsOn } from './labs/linkTool';
import { joinDropped } from './labs/linkJoint';
import { HelpPop } from './ui/HelpPop';
import { useFollowing } from './labs/presence';
import { readJSON, readText, writeJSON, writeText } from './storage';
import { shelfUrlFor, useShelfTracking } from './shelf/track';

/** Where a board copied into a new tab waits for it, followed by the new board's id. */
const COPY_KEY = 'planx-copy:';

type Pop = 'clear' | 'icons' | 'help' | 'name' | null;


/** How long the text panel takes to fade out (format.css: half its fading in). */
const PANEL_OUT = 80;

export function App({ boardId }: { boardId: string }) {
  const conn = useMemo(() => new Connection(boardId), [boardId]);
  const board = useMemo(() => new Board(conn.doc), [conn]);
  const editor = useMemo(() => new Editor(board, { presence: conn, storageKey: `planx-cam-${boardId}` }), [board, conn, boardId]);
  useEffect(() => () => conn.destroy(), [conn]);
  // Handy in the browser console and for end-to-end checks.
  useEffect(() => { Object.assign(window, { planx: { board, editor, conn } }); }, [board, editor, conn]);

  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => editor.mount(canvas.current!), [editor]);
  // The board keeps its place on the start page's shelf (src/shelf) up to date, and is the one «Работа»
  // goes back to ("Боковая панель", src/labs).
  useShelfTracking(boardId, board);
  useEffect(() => noteBoard(boardId), [boardId]);
  const toShelf = () => {
    window.dispatchEvent(new Event('planx:leave'));
    navigate(shelfUrlFor(boardId));
  };

  const ui = useSyncExternalStore(editor.subscribeUI, editor.getUI);
  useSyncExternalStore(board.subscribe, board.getVersion);
  useSyncExternalStore(conn.subscribe, () => `${conn.status}|${conn.peers().length}|${conn.me.name}`);

  const [pop, setPop] = useState<Pop>(null);
  const [toast, setToast] = useState<string | null>(null);
  // "Профиль" or "Настройки", open over the board.
  const [dialog, setDialog] = useState<'profile' | 'settings' | null>(null);
  // "Боковая панель" (src/labs, kept on the page: see main.tsx), opened and closed by the logo.
  const sideOpen = useSideOpen();
  // A note at the bottom with a button (see src/labs/tidyMind.ts), sent as "planx:toast".
  const [note, setNote] = useState<{ text: string; action: string; run: () => void; at: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setNote({ ...(e as CustomEvent).detail, at: Date.now() });
    window.addEventListener('planx:toast', on);
    return () => window.removeEventListener('planx:toast', on);
  }, []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(t);
  }, [note]);
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

  // ? opens what the "?" in the zoom bar does, Esc puts it away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === '?') { e.preventDefault(); toggle('help'); setMinimap(false); }
      if (e.key === 'Escape') setPop((cur) => (cur === 'help' ? null : cur));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // While the window is being resized, the panels don't glide (see moves.css).
  useEffect(() => {
    let t = 0;
    const resizing = () => {
      document.documentElement.dataset.resizing = '';
      clearTimeout(t);
      t = window.setTimeout(() => delete document.documentElement.dataset.resizing, 200);
    };
    window.addEventListener('resize', resizing);
    return () => { window.removeEventListener('resize', resizing); clearTimeout(t); };
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
  // (The theme's button is in "Настройки" now; the link dots' switch has its place.)
  const zoomSort = useSortable('planx-order-zoom', ['zoom', 'zoom-out', 'zoom-in', 'map', 'sep', 'share', 'help', 'links', 'fit', 'dock', 'people'], 'x', { theme: 'links' });
  const dots = useDotsOn();

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
    const params = new URLSearchParams(location.search), key = `${COPY_KEY}${params.get('board')}`;
    // A template from the shelf (shelf/templates.ts) brings its name along with what's on it.
    const copy = readJSON<{ items: Item[]; links: Link[]; title?: string }>(key);
    const name = params.get('title') ?? copy?.title;
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
  // "Загрузить доску": a board file picked opens as a new board.
  const boardFileInput = useRef<HTMLInputElement>(null);
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

  // (For the panels, so none yet while it's still being picked: they come once, on letting go.)
  const selItems = ui.picking ? [] : ui.selection.map((id) => board.get(id)).filter((i) => !!i);
  const linkCount = ui.picking ? 0 : ui.selection.filter((id) => board.getLink(id)).length;
  const editing = ui.editingId ? board.get(ui.editingId) : undefined;
  // Several picked with text ("Несколько сразу", src/labs): the panel takes them as one.
  // What has text the panel sets: text, basic stickers, tasks, tables, shapes (not mind map nodes, nor a
  // component's title); several picked with text ("Несколько сразу", src/labs) taken as one.
  // (A task's description too, while it's typed in: its list and links.)
  const typingDesc = selItems.length === 1 && selItems[0].type === 'task' && editing?.id === selItems[0].id && ui.editingCell === 0;
  // (Kept for it after the typing's gone to the panel's own field, the link's address, till a press on the board.)
  const [descOf, setDescOf] = useState<string | null>(null);
  useEffect(() => { if (typingDesc) setDescOf(selItems[0].id); else if (ui.editingId) setDescOf(null); }, [typingDesc, ui.editingId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const off = (e: PointerEvent) => { if (e.target === editor.canvas) setDescOf(null); };
    window.addEventListener('pointerdown', off, true);
    return () => window.removeEventListener('pointerdown', off, true);
  }, [editor]);
  const taskDesc = typingDesc || (selItems.length === 1 && descOf === selItems[0].id);
  const textItem = selItems.length === 1 && (['text', 'sticky', 'table', 'rect', 'ellipse', 'polygon'].includes(selItems[0].type) && !selItems[0].code || taskDesc) ? selItems[0] : asOne(selItems) ?? undefined;
  const labs = useLabs();
  // "Кнопка T" (src/labs): the text panel instead of the selection panel, asked for by its T, till the
  // next press on the board (or something else picked).
  // (Standing where the selection panel stood when that was at the bottom.)
  const [textMode, setTextMode] = useState<{ id: string; dock?: { cx: number; bottom: number } } | null>(null);
  // What it's for: what the text panel's for, or a mind map node (whose text the panel's for only by the T).
  const tItem = selItems.length === 1 && (textItem?.id === selItems[0].id || selItems[0].type === 'mind') ? selItems[0] : undefined;
  useEffect(() => { if (textMode && textMode.id !== tItem?.id) setTextMode(null); }, [tItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const textModeRef = useRef(textMode);
  textModeRef.current = textMode;
  const tMode = labs.textButton && !!tItem && textMode?.id === tItem.id && !editing;
  // Its text typed in (or being typed): the panel's for it while it stays picked.
  const [typedIn, setTypedIn] = useState<string | null>(null);
  useEffect(() => { if (ui.editingId) setTypedIn(ui.editingId); }, [ui.editingId]);
  useEffect(() => { if (typedIn && typedIn !== textItem?.id) setTypedIn(null); }, [textItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The text panel shows up 0.28 s after typing starts (several picked: after they're picked), or after
  // it's let go when moved; it stays away while the item is being moved or resized.
  const [textShown, setTextShown] = useState<string | null>(null);
  const textReady = textItem && (selItems.length > 1 || typedIn === textItem.id) ? textItem.id : null;
  useEffect(() => {
    setTextShown(null);
    if (!textReady || ui.moving) return;
    const t = setTimeout(() => setTextShown(textReady), 280);
    return () => clearTimeout(t);
  }, [textReady, ui.moving]);
  // Typing ended (by a press elsewhere, or Esc): the panel goes, and stays away from what that press
  // picked, till something else is picked or typing starts again.
  const [quiet, setQuiet] = useState<string | null>(null);
  const wasEditing = useRef<string | null>(null);
  useEffect(() => {
    // (Not when typing ended for one of the panel's own fields, the link's address.)
    if (wasEditing.current && !ui.editingId && !document.activeElement?.closest('.tfmt')) setQuiet(textItem?.id ?? null);
    else if (ui.editingId) setQuiet(null);
    wasEditing.current = ui.editingId;
  }, [ui.editingId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (quiet && quiet !== textItem?.id) setQuiet(null); }, [textItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Any later press on the board (one that doesn't end typing) brings it back, on the same item too.
  useEffect(() => {
    const press = (e: PointerEvent) => {
      if (e.target !== editor.canvas) return;
      // (With "Кнопка T", src/labs, it's the T that brings it back.)
      if (!editor.editingId && !labOn('textButton')) setQuiet(null);
      // Back to the selection panel, turning into it.
      if (textModeRef.current) morphPanel('.tfmt', 'panel', () => setTextMode(null));
    };
    window.addEventListener('pointerdown', press, true);
    return () => window.removeEventListener('pointerdown', press, true);
  }, [editor]);
  // The text panel: shown as above; once it goes, it fades out (half as long as it fades in), still
  // showing what it showed.
  const panelOn = tMode || (!!textItem && textShown === textItem.id && quiet !== textItem.id);
  const panelNow = tMode ? tItem! : panelOn && textItem ? (editing?.id === textItem.id && editing.type === 'table' && ui.editingCell !== null ? cellItem(editing, ui.editingCell) : textItem) : null;
  const lastPanel = useRef<Item | null>(null);
  const [, panelGone] = useState(0);
  if (panelNow) lastPanel.current = panelNow;
  useEffect(() => {
    if (panelOn || !lastPanel.current) return;
    const t = setTimeout(() => { lastPanel.current = null; panelGone((n) => n + 1); }, PANEL_OUT);
    return () => clearTimeout(t);
  }, [panelOn]);
  const panelItem = panelNow ?? lastPanel.current;
  // Asked to say yes (and, with `input`, a name first).
  // `only`: a note with just its button (no «Отмена»); `check`: a box under it, its state given to `ok`.
  const [ask, setAsk] = useState<{ text: string; action: string; ok: (value?: string, checked?: boolean) => void; input?: string; placeholder?: string; only?: boolean; check?: string; alt?: string; altRun?: () => void } | null>(null);
  const [askValue, setAskValue] = useState('');
  const [askChecked, setAskChecked] = useState(false);
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent).detail; setAsk(d); setAskValue(d.input ?? ''); setAskChecked(false); };
    window.addEventListener('planx:confirm', on);
    return () => window.removeEventListener('planx:confirm', on);
  }, []);
  const peers = conn.peers();
  // "Панель над элементом" (src/labs); it and the text panel, coming in where the other's going, wait for it to go.
  const place = usePanelPlace(editor, selItems);
  const overOn = labs.panelOver && (!editing || editing.type === 'mind') && !tMode, overShown = overOn && place === 'over' && selItems.length > 0;
  const overWent = useRef({ shown: false, at: 0 });
  // What's picked, and whether that's instead of something else picked just now (the panel over it
  // fading out and coming back in by the new one).
  const selKey = selItems.map((i) => i.id).join(), lastSel = useRef(''), swapped = !!lastSel.current && lastSel.current !== selKey && !!selKey;
  useEffect(() => { lastSel.current = selKey; }, [selKey]);
  if (overWent.current.shown && !overShown) overWent.current.at = performance.now();
  overWent.current.shown = overShown;
  const following = useFollowing();
  // The T (on something with text, alone, the text panel not up already, or going): the panel turns into the text panel.
  const toText = labs.textButton && tItem && !panelOn
    ? () => {
      const bar = document.querySelector('.bar.panel:not(.gone)'), r = bar?.getBoundingClientRect();
      const dock = r && !bar!.classList.contains('panel-over') ? { cx: r.left + r.width / 2, bottom: r.bottom } : undefined;
      morphPanel('.bar.panel', 'tfmt', () => setTextMode({ id: tItem.id, dock }));
    } : undefined;

  // All the others shown, after "+N" was pressed (back to five once they're five or fewer).
  const [peersOpen, setPeersOpen] = useState(false);
  if (peersOpen && peers.length <= 5) setPeersOpen(false);

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
          // The logo leads back to the shelf, to the folder this board is in.
          // ("Боковая панель", src/labs: it opens the side instead, a chevron before it under the pointer.)
          logo: labs.sideNav
            ? <button className={`logo to-shelf side-nav-logo-btn ${sideOpen ? "open" : ""}`} title="Боковая панель" aria-label="Боковая панель" aria-expanded={sideOpen} onClick={() => setSideOpen(!sideOpen)}>Plan</button>
            : <button className="logo to-shelf" title="К папке с досками" aria-label="К папке с досками" onClick={toShelf}>Plan</button>,
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
                onProfile={() => { setMenuOpen(false); setDialog('profile'); }}
                onSettings={() => { setMenuOpen(false); setDialog('settings'); }}
                onShare={() => { setMenuOpen(false); void share(); }}
                onSaveBoard={() => { saveBoardFile(editor); setMenuOpen(false); setToast('Доска сохранена в файл'); }}
                onSaveBoardAs={() => {
                  setMenuOpen(false);
                  window.dispatchEvent(new CustomEvent('planx:confirm', { detail: { text: 'Сохранить доску в файл под именем', action: 'Сохранить', input: board.title.trim() || 'Доска', placeholder: 'Имя файла',
                    ok: (name?: string) => { saveBoardFile(editor, name); setToast('Доска сохранена в файл'); } } }));
                }}
                onLoadBoard={() => { setMenuOpen(false); boardFileInput.current?.click(); }}
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

      <Toolbar editor={editor} tool={ui.tool} pens={ui.pens} zoom={ui.cam.z} docked={docked} iconsOpen={pop === 'icons'} onToggleIcons={() => { toggle('icons'); setRecorder(false); }}
        recorderOpen={recorder} onToggleRecorder={() => { setRecorder(!recorder); setPop(null); }} />
      {/* Not a popover: a click on the board mustn't cut a recording short. */}
      {recorder && <AudioRecorder onClose={() => setRecorder(false)} onAdd={(note) => { editor.addAudio(note); setRecorder(false); }} />}
      {pop === 'icons' && <IconPicker zoom={ui.cam.z} onPick={(kind, id, at) => {
        setPop(null);
        // A line picked: dropped on its middle, what's made goes into it ("Узел на линии", src/labs).
        const sel = [...editor.selection], line = labs.linkJoint && at && sel.length === 1 && editor.board.getLink(sel[0]) ? sel[0] : null;
        if (kind === 'emoji') editor.addEmoji(id, at);
        else if (kind === 'sticky') editor.addSticky(id, at);
        else if (kind === 'doodle') editor.addDoodle(id, at);
        else editor.addIcon(id, at);
        if (line) joinDropped(editor, line, editor.selectedItems()[0]);
      }} />}

      {/* The others on the board: in the top right corner, faint till the pointer comes over them; five,
          and the rest behind a "+N" that opens them all. */}
      {peers.length > 0 && <div className={`peers ${peersOpen ? 'open' : ''}`} aria-label="Участники">
        {(peersOpen ? peers : peers.slice(0, 5)).map((p) => labs.follow ? (
          <button key={p.id} className={`avatar follow ${following?.id === p.id ? 'following' : ''}`} style={{ borderColor: following?.id === p.id ? p.color : undefined }}
            title={following?.id === p.id ? `Перестать следовать за ${p.name}` : `Следовать за ${p.name}`} aria-label={`Следовать за ${p.name}`}
            onClick={() => window.dispatchEvent(new CustomEvent('planx:follow', { detail: p.id }))}>
            <img src={catFor(p.id)} alt="" draggable={false} />
          </button>
        ) : (
          <span key={p.id} className="avatar" title={p.name}><img src={catFor(p.id)} alt="" draggable={false} /></span>
        ))}
        {!peersOpen && peers.length > 5 && (
          <button className="avatar peers-more" title="Показать всех" aria-label={`Ещё ${peers.length - 5}`} onClick={() => setPeersOpen(true)}>+{peers.length - 5}</button>
        )}
      </div>}
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
        </div>,
        share: <button className="ib" title="Скопировать ссылку на доску" aria-label="Поделиться" onClick={share}><PanelIcon name="ai-two-stars" /></button>,
        sep: <div className="sep" />,
        map: <button className={`ib ${minimap ? 'on' : ''}`} title="Карта доски" aria-label="Карта доски" aria-pressed={minimap} data-minimap-toggle
          onClick={() => { setMinimap(!minimap); setPop(null); }}><PanelIcon name="location" /></button>,
        'zoom-out': <button className="ib" title="Отдалить (−)" aria-label="Отдалить" onClick={() => editor.zoomCenter(1 / 1.25)}><PanelIcon name="zoom-out" /></button>,
        zoom: <button className="zpct" title="Масштаб 100%" onClick={() => editor.zoomCenter(1 / editor.cam.z)}>{Math.round(ui.cam.z * 100)}%</button>,
        'zoom-in': <button className="ib" title="Приблизить (+)" aria-label="Приблизить" onClick={() => editor.zoomCenter(1.25)}><PanelIcon name="zoom-in" /></button>,
        // "Связи инструментом" (src/labs): the link dots out on everything, or away.
        links: labs.linkTool ? <button className={`ib ${dots ? 'on solid-on' : ''}`} title="Связи (C)" aria-label="Связи" aria-pressed={dots}
          onClick={() => toggleDots(editor)}><PanelIcon name={dots ? 'path-solid' : 'path'} /></button> : undefined,
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
      <Labs editor={editor} conn={conn} docked={docked} />

      {/* Typing in a table cell, the panel shows and sets that cell's own formatting. */}
      {/* A basic sticker's panel once its text is being typed, not on just picking it. */}
      {panelItem && <TextPanel editor={editor} item={panelItem} leaving={!panelOn} after={performance.now() - overWent.current.at < PANEL_OUT} dock={tMode ? textMode?.dock : undefined}
        onBack={tMode ? () => morphPanel('.tfmt', 'panel', () => setTextMode(null)) : undefined} />}

      {/* Hidden while typing, but for a mind map node, which opens for typing on a single click. */}
      {/* "Панель над элементом" (src/labs): over what's picked instead, but where it'd be in the way there (see panelPlace). */}
      {(!editing || editing.type === 'mind') && !tMode && (!labs.panelOver || place === 'bottom') && <SelectionPanel editor={editor} items={selItems} cells={ui.cells} linkCount={linkCount} docked={docked} onText={toText} />}
      {/* Something else picked: the one by the last fades out, a new one comes in by it once that's gone. */}
      {overOn && place === 'over' && <SelectionPanel key={`over:${selKey}`} editor={editor} items={selItems} cells={ui.cells} linkCount={0} docked={false} over after={!!panelItem || swapped} onText={toText} />}
      {/* A table cell is typed into as if it were an item of its own, the size of the cell. */}
      {editing && (editing.type === 'table' && ui.editingCell !== null
        ? <TextEditor key={`${editing.id}:${ui.editingCell}`} editor={editor} item={cellItem(editing, ui.editingCell)} />
        : <TextEditor key={editing.type === 'task' ? `${editing.id}:${ui.editingCell}` : editing.id} editor={editor} item={editing} />)}
      {/* A task's people and date, picked where its row was pressed. */}
      <TaskPop editor={editor} me={conn.me} peers={peers} />
      <TaskTipBubble />
      <TaskKeepPop editor={editor} />

      {pop === 'clear' && (
        <div className="pop confirm" role="dialog" aria-label="Очистить доску">
          <p>Удалить всё с доски у всех участников? Отменить можно через <b>Ctrl+Z</b></p>
          <div className="row">
            <button className="btn" onClick={() => setPop(null)}>Отмена</button>
            <button className="btn primary" onClick={() => { editor.clearBoard(); setPop(null); setCleared(Date.now()); }}>Очистить</button>
          </div>
        </div>
      )}

      {/* Asked before something goes that takes more with it (a component's last instance). */}
      {ask && (
        <div className="pop confirm" role="alertdialog" aria-label="Подтверждение">
          {ask.input !== undefined && (
            <input className="confirm-input" autoFocus value={askValue} placeholder={ask.placeholder} aria-label={ask.placeholder}
              onChange={(e) => setAskValue(e.target.value)} onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => { if (e.key === 'Enter') { ask.ok(askValue); setAsk(null); } else if (e.key === 'Escape') setAsk(null); }} />
          )}
          <p>{ask.text}</p>
          {ask.check && (
            <label className="confirm-check"><input type="checkbox" checked={askChecked} onChange={(e) => setAskChecked(e.target.checked)} />{ask.check}</label>
          )}
          <div className="row">
            {!ask.only && <button className="btn" onClick={() => setAsk(null)}>Отмена</button>}
            {ask.alt && <button className="btn" onClick={() => { ask.altRun?.(); if (askChecked) ask.ok(askValue, askChecked); setAsk(null); }}>{ask.alt}</button>}
            <button className="btn primary" onClick={() => { ask.ok(askValue, askChecked); setAsk(null); }}>{ask.action}</button>
          </div>
        </div>
      )}

      {dialog === 'profile' && <ProfileDialog name={conn.me.name} onRename={(n) => conn.rename(n)} onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} dark={theme === 'dark'} onDark={toggleTheme} />}

      {pop === 'name' && <NamePopover name={conn.me.name} onSave={(n) => { conn.rename(n); setPop(null); }} />}

      {pop === 'help' && <HelpPop />}

      {toast && <div className="pop toast" role="status">{toast}</div>}
      {note && (
        <div key={note.at} className="pop toast bottom" role="status">
          <span>{note.text}</span>
          {note.action && <button className="btn" onClick={() => { note.run(); setNote(null); }}>{note.action}</button>}
        </div>
      )}
      <input ref={boardFileInput} type="file" accept=".plnt" hidden onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) void openBoardFile(f).then((why) => { if (why) setToast(why); });
      }} />
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

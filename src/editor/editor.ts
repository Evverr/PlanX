import type { Board } from '../model/board';
import type { Item, ItemType, Link, Side } from '../model/types';
import { COLORABLE, DEFAULTS, EDITABLE, HAS_FONT, STROKABLE, uid } from '../model/types';
import type { Point, Rect } from '../canvas/geometry';
import { boundsOf, center, pointInRect, resizedAt } from '../canvas/geometry';
import { clearTextCache, drawScene, readTheme, type Camera, type Peer, type Scene, type Theme } from '../canvas/renderer';
import { fitHeight, foldedSize, font, itemTextHeight, mindSize } from '../canvas/text';
import { onEmojiLoad } from '../emoji/emoji';
import { onPictureLoad, type Picture } from '../canvas/pictures';
import { newTable, withCellFormat, withCount, withTableFormat, type TableLine } from '../model/table';
import type { AudioNote } from '../canvas/audio';
import { descendants, foldedAway, folding, makeRoom, mindDepth, type Way } from '../model/mind';
import { readJSON, writeJSON } from '../storage';
import { clamp, fittedTo, freeArea, wheelMove, zoomedAt } from './camera';
import { copiesOf } from './copies';
import { carried, hiddenIn, linksIn, membersOf, peekView, settled, stacked } from './frames';
import { endGesture, moveGesture, type Gesture } from './gestures';
import { updateCursor } from './hover';
import { onKeyDown } from './keys';
import { addMindNode, mindFit, refitMind, removeMindNode, type MindAdd } from './mindOps';
import { press } from './press';
import { formatCells, pickCell, restOn, setTableLines } from './tables';
import { DEFAULT_PENS, isPoly, MIND_TOPIC, PENS_KEY, readPens, type InkStyle, type Pens, type PenTool, type Tool } from './tools';
import { isLocked } from '../labs/labs';

export { DRAW_TOOLS, INK_SIZES, SHAPE_TOOLS } from './tools';
export type { InkStyle, PenSet, Pens, PenTool, Tool } from './tools';

/** Whether dragged items line up with others along guides, kept per browser. */
const GUIDES_KEY = 'planx-guides';
/** How big a finger's target is, in screen pixels. */
const FINGER = 40;
/** The mind map "+" buttons' wait after a node is picked, and their fade in, in ms. */
const PLUS_DELAY = 330, PLUS_FADE = 300;

/** What the editor needs from the collaboration layer. Optional, so the editor also runs alone. */
export interface Presence {
  setCursor(p: Point | null): void;
  setSelection(ids: string[]): void;
  peers(): Peer[];
  subscribe(fn: () => void): () => void;
}

export interface UIState {
  tool: Tool;
  selection: string[];
  editingId: string | null;
  /** The table cell being edited, when editingId is a table. */
  editingCell: number | null;
  /** Items are being moved or resized by hand right now. */
  moving: boolean;
  cam: Camera;
  pens: Pens;
  /** Whether dragged items line up with others along guides. */
  guides: boolean;
  /** Cells picked in the one selected table (by index, row by row). */
  cells: number[];
  /** Whether there's anything of this person's to undo, or to redo. */
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Owns the canvas: turns pointer and keyboard input into board changes and redraws when anything
 * changes. React only draws the chrome around it.
 *
 * The work is spread over the modules next to this one (press, gestures, hover, frames, tables,
 * mindOps, keys, camera, copies); the fields and methods marked "shared" are for them, not the UI.
 */
export class Editor {
  readonly board: Board;
  presence?: Presence;
  cam: Camera = { x: 0, y: 0, z: 1 };
  tool: Tool = 'select';
  selection = new Set<string>();
  editingId: string | null = null;
  editingCell: number | null = null;
  moving = false;
  pens: Pens = readPens();
  /** Whether the text overlay opens with all the text picked (to type over it) or the caret at its end. */
  editCaret: 'all' | 'end' = 'all';

  // Shared with the editor's modules.
  canvas: HTMLCanvasElement | null = null;
  gesture: Gesture | null = null;
  pointers = new Map<number, Point>();
  spaceDown = false;
  lastTap = { id: '', t: 0 };
  /** The last press on the empty board, for a double one there to show everything. */
  lastEmpty = { t: 0, x: 0, y: 0 };
  needsFit: boolean;
  hotDot: Side | null = null;
  /** The mind map node button under the pointer (see buttonKey). */
  hotPlus: string | null = null;
  /** Shared: the node and way (`id:way`) a "+" has just given its first branches: no chevron there
   *  till the node is picked again, so nothing new turns up by the "+" while it's clicked on. */
  chevronless: string | null = null;
  /** Whether the last press was a finger's: small things to grab (the resize handle, the link dots,
   *  the turning corner, a mind map node's buttons) then reach FINGER px across, not their own size. */
  byFinger = false;
  /** The table line under the pointer, and the lines picked with Shift to be dragged together. */
  hotLine: TableLine | null = null;
  pickedLines: TableLine[] = [];
  /** The table line the mouse rests on: it can be taken hold of once it's been there half a second
   *  (till then a press there takes the table), which is when it lights up. */
  lineRest: { line: TableLine; armed: boolean; timer: number } | null = null;
  guides = readJSON<boolean>(GUIDES_KEY) ?? false;
  /** Cells picked in the selected table: a click on a cell of a table already selected picks it,
   *  Shift-click picks the box from there to another, Cmd-click adds or drops one. */
  cells: number[] = [];
  /** The cell a Shift-click range is counted from: the one last clicked on its own. */
  cellAnchor: number | null = null;
  /** Drawn over the board after it, at screen scale (the features on trial, src/labs): each returns
   *  true while it's still moving and wants another frame. */
  overlays = new Set<(ctx: CanvasRenderingContext2D) => boolean | void>();

  private ctx: CanvasRenderingContext2D | null = null;
  private theme: Theme | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private clipboard: string | null = null;
  private raf = 0;
  private ui: UIState;
  private uiListeners = new Set<() => void>();
  private camKey: string;
  private lastCursorSent = 0;
  /** When the buttons of the mind map node picked now start to fade in (a moment after it's picked
   *  or let go), and what was picked then. */
  private plusKey = '';
  private plusFrom = 0;
  private plusTimer = 0;
  /** What's in sight, worked out once for each change of the board (it's asked for on every move
   *  of the pointer and every frame drawn). */
  private sight: { version: number; hidden: Set<string>; folded: Map<string, Map<Way, number>>; shown: Item[]; links: Link[] } | null = null;
  /** Steps undone along with the board's though they aren't on it (the panels put back as by
   *  default), each at the place in the board's history it was taken. */
  private outside: Array<{ undo: () => void; depth: number }> = [];

  constructor(board: Board, opts: { presence?: Presence; storageKey?: string } = {}) {
    this.board = board;
    this.presence = opts.presence;
    this.camKey = opts.storageKey ?? 'planx-cam';
    const saved = readJSON<Camera>(this.camKey);
    this.needsFit = !saved;
    if (saved) this.cam = saved;
    this.ui = this.snapshot();
    // The undo and redo buttons follow the history.
    const history = () => {
      const s = this.snapshot();
      if (s.canUndo !== this.ui.canUndo || s.canRedo !== this.ui.canRedo) this.emit();
    };
    for (const ev of ['stack-item-added', 'stack-item-popped', 'stack-cleared'] as const) board.undoManager.on(ev, history);
  }

  /* ---------- React bridge ---------- */

  getUI = (): UIState => this.ui;

  subscribeUI = (fn: () => void): (() => void) => {
    this.uiListeners.add(fn);
    return () => this.uiListeners.delete(fn);
  };

  private snapshot(): UIState {
    return { tool: this.tool, selection: [...this.selection], editingId: this.editingId, editingCell: this.editingCell, moving: this.moving, cam: { ...this.cam }, pens: this.pens,
      guides: this.guides, cells: this.cells, canUndo: this.board.undoManager.undoStack.length > 0 || this.outside.length > 0, canRedo: this.board.undoManager.redoStack.length > 0 };
  }

  /** Shared: items are being moved or resized by hand, or no longer. */
  setMoving(moving: boolean): void {
    if (this.moving === moving) return;
    this.moving = moving;
    this.emit();
  }

  /** Shared: tells the UI what's changed. */
  emit(): void {
    this.ui = this.snapshot();
    this.uiListeners.forEach((fn) => fn());
  }

  /* ---------- lifecycle ---------- */

  mount(canvas: HTMLCanvasElement): () => void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = readTheme();
    const offs: Array<() => void> = [];
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, ev: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn as EventListener, opts);
      offs.push(() => el.removeEventListener(ev, fn as EventListener, opts));
    };
    on(canvas, 'pointerdown', (e) => press(this, e));
    on(canvas, 'pointermove', (e) => this.onPointerMove(e));
    on(canvas, 'pointerup', (e) => this.onPointerUp(e));
    on(canvas, 'pointercancel', (e) => this.onPointerUp(e));
    on(canvas, 'pointerleave', () => {
      this.presence?.setCursor(null);
      restOn(this, null);
      if (this.hotDot || this.hotLine) { this.hotDot = null; this.hotLine = null; this.requestRender(); }
    });
    on(canvas, 'wheel', (e) => this.wheel(e), { passive: false });
    on(window, 'keydown', (e) => onKeyDown(this, e));
    on(window, 'keyup', (e) => { if (e.code === 'Space') this.setSpace(false); });
    on(window, 'blur', () => this.setSpace(false));
    on(window, 'resize', () => this.resize());
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => { this.theme = readTheme(); this.requestRender(); };
    mq.addEventListener('change', onTheme);
    offs.push(() => mq.removeEventListener('change', onTheme));
    const themeObs = new MutationObserver(onTheme);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    offs.push(() => themeObs.disconnect());
    offs.push(this.board.subscribe(() => this.onBoardChange()));
    offs.push(onEmojiLoad(() => this.requestRender()));
    offs.push(onPictureLoad(() => this.requestRender()));
    if (this.presence) offs.push(this.presence.subscribe(() => this.requestRender()));
    document.fonts?.ready.then(() => { clearTextCache(); this.requestRender(); });
    // Fonts picked for text load when first drawn.
    const onFonts = () => { clearTextCache(); this.requestRender(); };
    document.fonts?.addEventListener('loadingdone', onFonts);
    offs.push(() => document.fonts?.removeEventListener('loadingdone', onFonts));
    this.resize();
    this.onBoardChange();
    return () => {
      offs.forEach((off) => off());
      cancelAnimationFrame(this.raf);
      this.canvas = null;
    };
  }

  private resize(): void {
    if (!this.canvas) return;
    this.dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.requestRender();
  }

  private onBoardChange(): void {
    // Drop selection of things someone else deleted.
    let changed = false;
    for (const id of this.selection) {
      if (!this.board.get(id) && !this.board.getLink(id)) { this.selection.delete(id); changed = true; }
    }
    if (this.editingId && !this.board.get(this.editingId)) { this.editingId = null; changed = true; }
    if (changed) { this.presence?.setSelection([...this.selection]); this.emit(); }
    if (this.needsFit && this.board.list().length && this.width) { this.needsFit = false; this.fit(); }
    this.requestRender();
  }

  requestRender(): void {
    if (this.raf || !this.ctx) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  private render(): void {
    if (!this.ctx || !this.theme) return;
    refitMind(this);
    const g = this.gesture;
    let linkPreview = null;
    if (g?.type === 'link') {
      const from = this.board.get(g.from);
      if (from) linkPreview = { from, fromSide: g.fromSide, to: g.to, target: g.target ? this.board.get(g.target) ?? null : null };
    }
    // A mind map node's buttons stay while its text is being typed (one click opens it for typing).
    const plusKey = `${[...this.selection].join()}|${this.moving}|${this.editingId && this.board.get(this.editingId)?.type !== 'mind' ? this.editingId : ''}`;
    if (plusKey !== this.plusKey) {
      this.plusKey = plusKey;
      this.chevronless = null;
      this.plusFrom = performance.now() + PLUS_DELAY;
      clearTimeout(this.plusTimer);
      this.plusTimer = window.setTimeout(() => this.requestRender(), PLUS_DELAY);
    }
    const plusFade = this.plusFade();
    if (plusFade > 0 && plusFade < 1) this.requestRender();
    drawScene(this.ctx, {
      items: this.shown(),
      links: this.shownLinks(),
      get: (id) => this.board.get(id),
      cam: this.cam,
      theme: this.theme,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      selection: this.selection,
      editingId: this.editingId,
      marquee: g?.type === 'marquee' ? g.rect : null,
      linkPreview,
      peers: this.presence?.peers() ?? [],
      showHandle: this.selection.size === 1 && !!this.board.get([...this.selection][0]) && !isLocked(this.board.get([...this.selection][0])),
      byFinger: this.byFinger,
      hotDot: this.hotDot,
      hotPlus: this.hotPlus,
      plusFade,
      folded: this.folded(),
      chevronless: this.chevronless,
      mindMove: g?.type === 'mindMove' ? { from: g.from, to: g.to, target: g.target ? this.board.get(g.target) ?? null : null } : null,
      tableLines: this.hotLine ? [...this.pickedLines, this.hotLine] : this.pickedLines,
      editingCell: this.editingCell,
      guides: g?.type === 'drag' ? g.guides ?? [] : [],
      pickedCells: this.cells.length && this.selection.size === 1 ? { id: [...this.selection][0], cells: this.cells } : null,
      stroke: g?.type === 'draw' ? { pts: g.pts, color: this.penStyle(g.tool).color, width: this.penStyle(g.tool).size / this.cam.z, hl: g.tool === 'marker' } : null,
    });
    let again = false;
    for (const draw of this.overlays) {
      this.ctx.save();
      if (draw(this.ctx)) again = true;
      this.ctx.restore();
    }
    if (again) this.requestRender();
  }

  /** Shared: how far the selected mind map node's "+" buttons have faded in, 0…1. */
  plusFade(): number {
    const typing = this.editingId && this.board.get(this.editingId)?.type !== 'mind';
    return this.moving || typing ? 0 : clamp((performance.now() - this.plusFrom) / PLUS_FADE, 0, 1);
  }

  /** Shared: how far (in board units) a small thing of radius `px` on screen reaches for the pointer:
   *  for a finger, at least half of FINGER. */
  reach(px: number): number {
    return (this.byFinger ? Math.max(px, FINGER / 2) : px) / this.cam.z;
  }

  /* ---------- camera ---------- */

  toWorld(sx: number, sy: number): Point {
    return { x: (sx - this.cam.x) / this.cam.z, y: (sy - this.cam.y) / this.cam.z };
  }

  /** Screen position of a board point, for overlays such as the text editor. */
  toScreen(p: Point): Point {
    return { x: p.x * this.cam.z + this.cam.x, y: p.y * this.cam.z + this.cam.y };
  }

  /** Shared: the camera's been moved; it's kept, drawn and told to the UI. */
  camChanged(): void {
    writeJSON(this.camKey, this.cam);
    this.requestRender();
    this.emit();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    this.cam = zoomedAt(this.cam, sx, sy, factor);
    this.camChanged();
  }

  zoomCenter(factor: number): void {
    this.zoomAt(this.width / 2, this.height / 2, factor);
  }

  /** Brings everything on the board into view, in the part of the screen the panels leave free,
   *  with 5% of it left empty at each side. */
  fit(): void {
    const b = boundsOf(this.shown());
    this.cam = b ? fittedTo(b, freeArea(this.width, this.height, this.canvas?.getBoundingClientRect() ?? { left: 0, top: 0 }))
      : { x: this.width / 2, y: this.height / 2, z: 1 };
    this.camChanged();
  }

  /** The part of the board that's on screen, in board coordinates. */
  viewRect(): Rect {
    const p = this.toWorld(0, 0);
    return { x: p.x, y: p.y, w: this.width / this.cam.z, h: this.height / this.cam.z };
  }

  /** Moves the board so that this point is in the middle of the screen, keeping the zoom. */
  centerOn(p: Point): void {
    this.cam = { ...this.cam, x: this.width / 2 - p.x * this.cam.z, y: this.height / 2 - p.y * this.cam.z };
    this.camChanged();
  }

  /** Wheel and trackpad: zoom or scroll the board. `sp` is the screen point zooming keeps still,
   *  the pointer by default; the board map passes the middle of the screen. */
  wheel(e: WheelEvent, sp: Point = this.local(e)): void {
    e.preventDefault();
    const m = wheelMove(e, this.cam);
    if ('zoom' in m) this.zoomAt(sp.x, sp.y, m.zoom);
    else {
      this.cam = { ...this.cam, x: this.cam.x - m.pan[0], y: this.cam.y - m.pan[1] };
      this.camChanged();
    }
  }

  /* ---------- tools & selection ---------- */

  setTool(tool: Tool): void {
    this.tool = tool;
    if (this.canvas) this.canvas.dataset.tool = tool;
    this.emit();
  }

  penStyle(tool: PenTool): InkStyle {
    const set = this.pens[tool];
    return set.presets[set.active] ?? DEFAULT_PENS[tool].presets[0];
  }

  /** Picks a cell of the selected table (see tables.ts). */
  pickCell(i: number, how: 'one' | 'range' | 'toggle'): void { pickCell(this, i, how); }

  /** Fills the picked cells of the selected table with a colour ('none' takes it away). */
  setCellFill(color: string): void {
    formatCells(this, { bg: color === 'none' ? undefined : color });
  }

  /** Opacity (0…1) of the picked cells' fill, or every cell's when none is picked. */
  setCellOpacity(value: number): void {
    formatCells(this, { bgo: value >= 1 ? undefined : Math.round(value * 100) / 100 });
  }

  /** The selected table's lines: their colour ('gray' the usual, 'none' none) and opacity. */
  setTableLines(patch: { sc?: string; so?: number }): void { setTableLines(this, patch); }

  /** Turns lining up along guides on or off. */
  toggleGuides(): void {
    this.guides = !this.guides;
    writeJSON(GUIDES_KEY, this.guides);
    this.emit();
  }

  /** Draws with one of the pen's presets from now on. */
  pickPen(tool: PenTool, active: number): void {
    this.pens = { ...this.pens, [tool]: { ...this.pens[tool], active } };
    writeJSON(PENS_KEY, this.pens);
    this.setTool(tool);
  }

  setPenStyle(tool: PenTool, i: number, patch: Partial<InkStyle>): void {
    const presets = this.pens[tool].presets.map((p, j) => (j === i ? { ...p, ...patch } : p));
    this.pens = { ...this.pens, [tool]: { ...this.pens[tool], presets } };
    writeJSON(PENS_KEY, this.pens);
    this.emit();
  }

  setSelection(ids: Iterable<string>): void {
    const was = [...this.selection];
    this.selection = new Set(ids);
    if (this.cells.length && (this.selection.size !== 1 || !this.selection.has(was[0]))) { this.cells = []; this.cellAnchor = null; }
    this.presence?.setSelection([...this.selection]);
    this.emit();
    this.requestRender();
  }

  selectedItems(): Item[] {
    return [...this.selection].map((id) => this.board.get(id)).filter((i): i is Item => !!i);
  }

  /** Shared: the space bar held (the board pans while it's down) or let go. */
  setSpace(down: boolean): void {
    this.spaceDown = down;
    if (this.canvas) this.canvas.classList.toggle('space', down);
  }

  /* ---------- operations ---------- */

  newItem(type: ItemType, x: number, y: number, extra: Partial<Item> = {}): Item {
    // Fitting the board once it loads is for boards opened with content, not for the first thing made on a new one.
    this.needsFit = false;
    const d = DEFAULTS[type];
    const z = type === 'frame' ? this.board.minZ() - 1 : this.board.maxZ() + 1;
    return { ...d, id: uid(), type, x: Math.round(x), y: Math.round(y), z, ...extra } as Item;
  }

  /** Puts an icon in the middle of the screen (fanned out a little so several don't stack),
   *  or centred on a screen point when dropped there. */
  addIcon(icon: string, at?: Point): void {
    const c = this.toWorld(at?.x ?? this.width / 2, at?.y ?? this.height / 2);
    const n = at ? 0 : this.board.list().filter((i) => i.type === 'icon').length % 6;
    const it = this.newItem('icon', c.x - 32 + n * 12, c.y - 32 + n * 12, { icon });
    this.addItem(it);
    this.setTool('select');
    this.setSelection([it.id]);
  }

  /** A sticker of the given colour, like addIcon; it opens for typing as one placed with the sticker tool does. */
  addSticky(color: string, at?: Point): void {
    const c = this.toWorld(at?.x ?? this.width / 2, at?.y ?? this.height / 2);
    const d = DEFAULTS.sticky, n = at ? 0 : this.board.list().filter((i) => i.type === 'sticky').length % 6;
    const it = this.newItem('sticky', c.x - d.w / 2 + n * 12, c.y - d.h / 2 + n * 12, { color });
    this.addItem(it);
    this.setTool('select');
    this.setSelection([it.id]);
    this.startEditing(it.id);
  }

  /** Puts pictures centred in the middle of the screen or on a screen point, fanned out, at most
   *  half the screen across and never bigger than their own pixels; they end up selected. */
  addPictures(pics: Picture[], at?: Point): void {
    if (!pics.length) return;
    const c = this.toWorld(at?.x ?? this.width / 2, at?.y ?? this.height / 2);
    const max = Math.min(this.width, this.height) * 0.5 / this.cam.z;
    const items = pics.map((p, i) => {
      const k = Math.min(1 / this.cam.z, max / Math.max(p.w, p.h));
      const w = Math.max(16, Math.round(p.w * k)), h = Math.max(16, Math.round(p.h * k));
      return this.newItem('image', c.x - w / 2 + i * 24, c.y - h / 2 + i * 24, { w, h, src: p.src });
    });
    this.board.beginGesture();
    items.forEach((it) => this.addItem(it));
    this.board.endGesture();
    this.setTool('select');
    this.setSelection(items.map((i) => i.id));
  }

  /** Puts a recorded audio note in the middle of the screen, selected. */
  addAudio(note: AudioNote): void {
    const c = this.toWorld(this.width / 2, this.height / 2), d = DEFAULTS.audio;
    const it = this.newItem('audio', c.x - d.w / 2, c.y - d.h / 2, { src: note.src, dur: Math.round(note.dur * 10) / 10, peaks: note.peaks });
    this.addItem(it);
    this.setTool('select');
    this.setSelection([it.id]);
  }

  /** Like addIcon. */
  addEmoji(emoji: string, at?: Point): void {
    const c = this.toWorld(at?.x ?? this.width / 2, at?.y ?? this.height / 2);
    const n = at ? 0 : this.board.list().filter((i) => i.type === 'emoji').length % 6;
    const it = this.newItem('emoji', c.x - 32 + n * 12, c.y - 32 + n * 12, { emoji });
    this.addItem(it);
    this.setTool('select');
    this.setSelection([it.id]);
  }

  deleteSelection(): void {
    // Locked items stay (and stay selected).
    const ids = new Set([...this.selection].filter((id) => !isLocked(this.board.get(id))));
    if (!ids.size) return;
    // A mind map node goes with everything branching from it, a folded frame with all it holds.
    const items = this.board.list(), folded = items.filter((i) => i.fold && ids.has(i.id));
    const held = folded.length ? [...this.carried(folded).keys()] : [];
    this.board.remove([...ids, ...held, ...descendants(ids, items)].filter((id) => !isLocked(this.board.get(id))));
    this.setSelection([...this.selection].filter((id) => !ids.has(id)));
  }

  setColor(color: string): void {
    this.board.transact(() => {
      for (const it of this.selectedItems()) {
        // Mind map nodes take only their own strong colours (or any picked one), not the pale fills.
        if (it.type === 'mind' && !color.startsWith('#')) continue;
        if (COLORABLE.includes(it.type) && !(color === 'none' && it.type === 'sticky')) this.board.update(it.id, { color });
      }
    });
  }

  /** Outline colour of the selected shapes and tasks; 'gray' is the usual outline. */
  setStroke(color: string): void {
    this.board.transact(() => {
      for (const it of this.selectedItems()) if (STROKABLE.includes(it.type)) this.board.update(it.id, { sc: color === 'gray' ? undefined : color });
    });
  }

  /** Opacity (0…1) of the selected items' fill or, for shapes and tasks, their outline. A run of
   *  calls between beginChange and endChange (a slider being dragged) is one undo step. */
  setOpacity(of: 'fill' | 'stroke', value: number): void {
    const v = value >= 1 ? undefined : Math.max(0, Math.round(value * 100) / 100);
    this.board.transact(() => {
      for (const it of this.selectedItems()) {
        if (of === 'fill' && COLORABLE.includes(it.type)) this.board.update(it.id, { fo: v });
        if (of === 'stroke' && (STROKABLE.includes(it.type) || it.type === 'mind')) this.board.update(it.id, { so: v });
      }
    });
  }

  /** Fill of the selected mind map nodes but central topics ('none' back to the usual). */
  setMindFill(color: string): void {
    this.board.transact(() => {
      for (const it of this.selectedItems()) {
        if (it.type === 'mind' && mindDepth(it, (id) => this.board.get(id)) >= 1) this.board.update(it.id, { fc: color === 'none' ? undefined : color });
      }
    });
  }

  beginChange(): void { this.board.beginGesture(); }
  endChange(): void { this.board.endGesture(); }

  setIconColor(color: string): void {
    this.board.transact(() => {
      for (const it of this.selectedItems()) if (it.type === 'icon') this.board.update(it.id, { color });
    });
  }

  /** Changes how the selected items' text looks; an undefined field goes back to the default.
   *  Text items are re-measured to fit, and again once a newly picked font has loaded. */
  setTextStyle(patch: Partial<Item>): void {
    const items = this.selectedItems().filter((i) => HAS_FONT.includes(i.type));
    const refit = () => this.board.transact(() => {
      for (const it of items) {
        const now = this.board.get(it.id);
        const h = now && fitHeight(now);
        if (h) this.board.update(it.id, { h });
      }
    });
    this.board.transact(() => {
      for (const it of items) {
        // In a table, the cell being typed in takes it on its own; otherwise the whole table, every cell.
        if (it.type !== 'table') this.board.update(it.id, patch);
        else if (this.editingId === it.id && this.editingCell !== null) this.board.update(it.id, withCellFormat(it, this.editingCell, patch));
        else if (this.cells.length) {
          // The picked cells, each on its own.
          let next: Partial<Item> = {};
          for (const i of this.cells) next = withCellFormat({ ...it, ...next }, i, patch);
          this.board.update(it.id, next);
        }
        else this.board.update(it.id, withTableFormat(it, patch));
      }
      refit();
    });
    if (patch.ff && document.fonts) {
      const f = font(20, 400, patch.ff);
      void Promise.all([document.fonts.load(f), document.fonts.load(font(20, 700, patch.ff, true))]).then(refit);
    }
  }

  /** Makes what a tool makes, at its usual size, centred on a screen point (a tool dragged off the
   *  rail onto the board). Text, tasks and frames open for typing, as when made with the tool. */
  dropItem(tool: Tool, at: Point): void {
    const type = (isPoly(tool) ? 'polygon' : tool) as ItemType;
    if (!DEFAULTS[type]) return;
    const extra: Partial<Item> = isPoly(tool) ? { shape: tool } : tool === 'table' ? newTable() : tool === 'mind' ? { text: MIND_TOPIC } : {};
    if (type === 'mind') Object.assign(extra, mindSize({ ...DEFAULTS.mind, ...extra } as Item));
    const c = this.toWorld(at.x, at.y), d = { ...DEFAULTS[type], ...extra };
    const it = this.newItem(type, c.x - d.w / 2, c.y - d.h / 2, extra);
    if (type === 'text') it.h = itemTextHeight(it);
    this.addItem(it);
    this.setTool('select');
    this.setSelection([it.id]);
    if (type === 'text' || type === 'task' || type === 'frame' || type === 'mind') this.startEditing(it.id);
  }

  /** Puts a frame around two or more selected items, 40 units clear of them, and opens its title
   *  for typing as a new frame's is. Returns whether there was enough to frame. */
  frameSelection(): boolean {
    const b = boundsOf(this.selectedItems());
    if (this.selectedItems().length < 2 || !b) return false;
    // Just under the lowest of them, not under everything: a frame they already sit in stays below.
    const pad = 40, z = Math.min(...this.selectedItems().map((i) => i.z)) - 0.5;
    const it = this.newItem('frame', b.x - pad, b.y - pad, { w: Math.round(b.w + pad * 2), h: Math.round(b.h + pad * 2), z, members: [] });
    // Only the selected go in: whatever else lies under the new frame stays out of it.
    this.board.beginGesture();
    this.board.add(it);
    this.settle([...this.selection, it.id], it.id);
    this.board.endGesture();
    this.setTool('select');
    this.setSelection([it.id]);
    this.startEditing(it.id);
    return true;
  }

  /** Adds (+1) or removes (-1) the last column or row of the selected tables. */
  changeTable(axis: 'col' | 'row', delta: 1 | -1): void {
    this.board.transact(() => {
      for (const it of this.selectedItems()) if (it.type === 'table') this.board.update(it.id, withCount(it, axis, delta));
    });
  }

  bringToFront(): void {
    let z = this.board.maxZ();
    const items = this.selectedItems().sort((a, b) => a.z - b.z);
    this.board.transact(() => items.forEach((it) => this.board.update(it.id, { z: ++z })));
  }

  sendToBack(): void {
    let z = this.board.minZ();
    const items = this.selectedItems().sort((a, b) => b.z - a.z);
    this.board.transact(() => items.forEach((it) => this.board.update(it.id, { z: --z })));
  }

  copy(): boolean {
    const items = this.selectedItems();
    if (!items.length) return false;
    const ids = new Set(items.map((i) => i.id));
    const links = this.board.linkList().filter((l) => ids.has(l.from) && ids.has(l.to));
    this.clipboard = JSON.stringify({ items, links });
    return true;
  }

  paste(offset = 30): void {
    if (!this.clipboard) return;
    const data = JSON.parse(this.clipboard) as { items: Item[]; links: Link[] };
    const { items, links } = this.insertCopies(data.items, data.links, offset);
    // Copies land in the frame they're pasted into, unless they came with their own.
    const held = new Set(items.flatMap((i) => i.members ?? []));
    this.settle(items.filter((i) => !held.has(i.id)).map((i) => i.id));
    // Paste again lands one step further.
    this.clipboard = JSON.stringify({ items, links });
    this.setSelection(items.map((i) => i.id));
  }

  /** Puts copies of items, and of the links among them, on the board (see copiesOf). */
  private insertCopies(src: Item[], srcLinks: Link[], offset: number) {
    const made = copiesOf(src, srcLinks, offset, this.board.maxZ());
    this.board.transact(() => {
      made.items.forEach((it) => this.board.add(it));
      made.links.forEach((l) => this.board.addLink(l));
    });
    return made;
  }

  /** Shared: Alt-drag leaves the dragged items where they are and drags copies of them instead. */
  dragCopies(orig: Map<string, Point>): Map<string, Point> {
    const items = [...orig.keys()].map((id) => this.board.get(id)).filter((i): i is Item => !!i);
    const links = this.board.linkList().filter((l) => orig.has(l.from) && orig.has(l.to));
    const { items: copies, map } = this.insertCopies(items, links, 0);
    this.setSelection([...this.selection].map((id) => map.get(id)).filter((id): id is string => !!id));
    return new Map(copies.map((c) => [c.id, { x: c.x, y: c.y }]));
  }

  duplicate(): void {
    const keep = this.clipboard;
    if (this.copy()) this.paste(24);
    this.clipboard = keep;
  }

  /** Empties the board and goes back to 100% zoom, about the middle of the screen. */
  clearBoard(): void {
    this.board.replaceAll([], []);
    this.setSelection([]);
    this.zoomCenter(1 / this.cam.z);
  }

  /** Adds a step outside the board: Ctrl+Z (or the undo button) undoes it once the board's later
   *  changes are undone. */
  addOutsideStep(undo: () => void): void {
    this.outside.push({ undo, depth: this.board.undoManager.undoStack.length });
    this.emit();
  }

  undo(): void {
    if (this.editingId) this.stopEditing();
    const last = this.outside[this.outside.length - 1];
    if (last && this.board.undoManager.undoStack.length <= last.depth) {
      this.outside.pop();
      last.undo();
      this.emit();
      return;
    }
    this.board.undo();
  }

  redo(): void {
    this.board.redo();
  }

  /* ---------- text editing ---------- */

  /** Opens an item's text for typing; for a table, one cell's (the first unless given). */
  startEditing(id: string, cell?: number | null, caret: 'all' | 'end' = 'all'): void {
    const it = this.board.get(id);
    if (!it || !EDITABLE.includes(it.type) || isLocked(it)) return;
    this.editCaret = caret;
    this.editingId = id;
    this.editingCell = it.type === 'table' ? cell ?? 0 : null;
    this.selection = new Set([id]);
    this.presence?.setSelection([id]);
    this.emit();
    this.requestRender();
  }

  /** Called by the text overlay with its final value. */
  commitText(id: string, text: string): void {
    const it = this.board.get(id);
    const cell = this.editingCell;
    if (this.editingId === id) { this.editingId = null; this.editingCell = null; }
    if (it) {
      const value = text.replace(/\s+$/, '');
      if (it.type === 'table') {
        if (cell !== null && value !== (it.cells?.[cell] ?? '')) {
          const cells = [...(it.cells ?? [])];
          cells[cell] = value;
          this.board.update(id, { cells: Array.from(cells, (c) => c ?? '') });
        }
      } else if (it.type === 'text' && !value.trim()) {
        this.board.remove([id]);
        this.selection.delete(id);
      } else if (value !== (it.text ?? '')) {
        const patch: Partial<Item> = { text: value, ...mindFit(this, it, value), ...(it.fold && { w: foldedSize(value).w }) };
        const h = fitHeight(it, value);
        if (h) Object.assign(patch, { h }, it.rot && resizedAt(it, it.w, h));
        this.board.update(id, patch);
        // A mind map node that grew makes room among its neighbours, as while it was typed in (those
        // of its level only).
        const dw = (patch.w ?? it.w) - it.w, dh = (patch.h ?? it.h) - it.h;
        if (it.type === 'mind' && it.parent && (dw || dh)) {
          const moves = makeRoom(id, dw, dh, this.board.list());
          this.board.transact(() => moves.forEach((pt, k) => this.board.update(k, pt)));
        }
      }
    }
    this.emit();
    this.requestRender();
  }

  /** Live text while typing, so a text item or a task grows (or shrinks back) as you type and others see it. */
  previewText(id: string, text: string): void {
    const it = this.board.get(id);
    const h = it && fitHeight(it, text);
    if (it && h && h !== it.h) this.board.update(id, { h, ...(it.rot && resizedAt(it, it.w, h)) });
    if (it?.type === 'mind') {
      // A node growing (a line taller, or wider under its parent) moves its neighbours along, so
      // nothing overlaps.
      const fit = mindFit(this, it, text), dw = (fit.w ?? it.w) - it.w, dh = (fit.h ?? it.h) - it.h;
      const moves = it.parent && (dw || dh) ? makeRoom(id, dw, dh, this.board.list()) : new Map<string, Point>();
      this.board.transact(() => {
        this.board.update(id, fit);
        moves.forEach((pt, k) => this.board.update(k, pt));
      });
    }
  }

  /** Adds a node to a mind map (see mindOps.ts). */
  addMindNode(fromId: string, kind: MindAdd, byPlus = false): void { addMindNode(this, fromId, kind, byPlus); }

  /** Takes away an emptied mind map node (see mindOps.ts). */
  removeMindNode(id: string): void { removeMindNode(this, id); }

  /** Shared: typing stops (the overlay listens for this and commits its value). */
  stopEditing(): void {
    if (this.editingId) window.dispatchEvent(new CustomEvent('planx:commit-edit'));
  }

  /* ---------- frames and what's in sight ---------- */

  private inSight() {
    const version = this.board.getVersion();
    if (this.sight?.version !== version) {
      const items = this.board.list(), hidden = hiddenIn(this.board, items);
      // How many nodes each folded mind map node hides, each way.
      const get = (id: string) => this.board.get(id), folded = new Map<string, Map<Way, number>>();
      for (const i of items) {
        if (i.type !== 'mind' || (!i.collapsed && !i.foldedWays)) continue;
        folded.set(i.id, new Map([...foldedAway(i, items, get)].map(([way, ids]) => [way, ids.length])));
      }
      const shown = stacked(this.board, hidden.size ? items.filter((i) => !hidden.has(i.id)) : items);
      this.sight = { version, hidden, folded, shown, links: linksIn(this.board, items, hidden) };
    }
    return this.sight;
  }

  /** Shared: everything folded frames hold and folded mind map nodes hide, out of sight. */
  hidden(): Set<string> { return this.inSight().hidden; }

  /** Shared: how many nodes each folded mind map node hides, each way. */
  folded(): Map<string, Map<Way, number>> { return this.inSight().folded; }


  /** The items in sight: all but what folded frames hold and folded mind map nodes hide. */
  shown(): Item[] { return this.inSight().shown; }

  /** Shared: the links as they're seen, those into folded frames led to their bars. */
  shownLinks(): Link[] { return this.inSight().links; }

  /** Shared: what a frame holds. */
  membersOf(f: Item): string[] { return membersOf(this.board, f, this.board.list()); }

  /** Shared: these items with what the frames among them hold and the mind map branches, each with
   *  where it is now. */
  carried(sel: Item[]): Map<string, Point> { return carried(this.board, sel, this.board.list()); }

  /** Shared: the selected items plus what the selected frames hold (but those locked in place). */
  dragSet(items: Item[]): Map<string, Point> {
    return carried(this.board, items.filter((i) => this.selection.has(i.id) && !isLocked(i)), items);
  }

  /** Shared: puts each of these items in the frame it lies in, or out of frames (see settled). */
  settle(ids: Iterable<string>, fresh?: string): void {
    const lists = settled(this.board, ids, fresh);
    this.board.transact(() => lists.forEach((members, f) => this.board.update(f, { members })));
  }

  /** Shared: adds a newly made item: into the frame it's made in; a new frame takes in what lies inside it. */
  addItem(it: Item): void {
    this.board.add(it);
    this.settleNew(it.id);
  }

  /** Shared: a new item goes into the frame it's in; a new frame takes in what lies inside it. */
  settleNew(id: string): void {
    const it = this.board.get(id);
    if (!it) return;
    if (it.type !== 'frame') { this.settle([id]); return; }
    const hidden = this.hidden();
    this.settle([...this.board.list().filter((i) => i.id !== id && !hidden.has(i.id) && pointInRect(center(i), it)).map((i) => i.id), id], id);
  }

  /** Folds a frame into a bar with its title, what it holds hidden away, or unfolds it again. */
  setFolded(id: string, fold: boolean): void {
    const f = this.board.get(id);
    if (f?.type !== 'frame' || !!f.fold === fold) return;
    if (fold) {
      // It keeps a list of what it holds from then on, so nothing new slips in under the bar.
      this.board.update(id, { fold: { w: f.w, h: f.h }, ...foldedSize(f.text ?? ''), members: this.membersOf(f) });
      const hidden = this.hidden();
      this.setSelection([...this.selection].filter((s) => !hidden.has(s)));
    } else {
      this.board.update(id, { w: f.fold!.w, h: f.fold!.h, fold: undefined });
    }
    this.requestRender();
  }

  /** Folds away all that grows from a mind map node's branches growing `way` (all of them, but a
   *  central topic's), or unfolds them again. */
  setCollapsed(id: string, way: Way, on: boolean): void {
    const it = this.board.get(id);
    if (it?.type !== 'mind') return;
    this.board.update(id, folding(it, way, on));
    if (on) {
      const hidden = this.hidden();
      this.setSelection([...this.selection].filter((s) => !hidden.has(s)));
    }
    this.requestRender();
  }

  /** What the look into a folded frame shows, in a w × h view (see peekView). */
  peekScene(id: string, w: number, h: number, dpr: number, pad = 24): Scene | null {
    return this.theme ? peekView(this.board, id, this.theme, w, h, dpr, pad) : null;
  }

  /* ---------- pointer input ---------- */

  /**
   * A mind map node being typed in that's pressed at `from` (on screen) and dragged: typing stops and
   * the node is dragged from there like any item, its text or not under the pointer.
   */
  dragFromText(id: string, from: { x: number; y: number }, e: PointerEvent): void {
    if (!this.canvas || this.gesture) return;
    this.stopEditing();
    const r = this.canvas.getBoundingClientRect(), start = this.toWorld(from.x - r.left, from.y - r.top);
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* the pointer's already gone */ }
    this.pointers.set(e.pointerId, this.local(e));
    this.setSelection([id]);
    this.gesture = { type: 'drag', start, orig: this.dragSet(this.board.list()), moved: false, id, dbl: false };
    this.onPointerMove(e);
  }

  /** Shared: where an event is on the canvas, in screen pixels. */
  local(e: PointerEvent | WheelEvent): Point {
    const r = this.canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.pointers.size) this.byFinger = e.pointerType === 'touch';
    const sp = this.local(e);
    const w = this.toWorld(sp.x, sp.y);
    this.sendCursor(w);
    updateCursor(this, w, e.altKey);
    if (!this.pointers.has(e.pointerId) || !this.gesture) return;
    this.pointers.set(e.pointerId, sp);
    moveGesture(this, this.gesture, e, sp, w);
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!g) return;
    // A pinch ends when the last finger is off.
    if (g.type === 'pinch') { if (!this.pointers.size) this.gesture = null; return; }
    this.gesture = null;
    this.canvas?.classList.remove('panning');
    this.setMoving(false);
    endGesture(this, g, e);
  }

  private sendCursor(w: Point): void {
    const now = performance.now();
    if (!this.presence || now - this.lastCursorSent < 40) return;
    this.lastCursorSent = now;
    this.presence.setCursor({ x: Math.round(w.x), y: Math.round(w.y) });
  }
}

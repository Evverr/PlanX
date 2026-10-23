import type { Board } from '../model/board';
import type { Item, ItemType, Link, PolyShape, Side } from '../model/types';
import { COLORABLE, DEFAULTS, EDITABLE, HAS_FONT, ROTATABLE, STROKABLE, uid } from '../model/types';
import type { Point, Rect } from '../canvas/geometry';
import { angleOf, boundsOf, boxOf, center, hitItem, hitLink, nearestSide, nearInk, normRect, onAudioButton, onTaskBox, pointInRect, rectContains, rectsIntersect, resizedAt, sidePoint, SIDES, toLocal, turn } from '../canvas/geometry';
import { clearTextCache, DOT_GAP, drawScene, HANDLE, readTheme, type Camera, type Peer, type Theme } from '../canvas/renderer';
import { fitHeight, font, itemTextHeight, mindSize } from '../canvas/text';
import { onEmojiLoad } from '../emoji/emoji';
import { onPictureLoad, type Picture } from '../canvas/pictures';
import { cellAt, colsOf, lineAt, MIN_COL, MIN_ROW, movedLines, newTable, rowsOf, withCount, withScale, type TableLine } from '../model/table';
import { toggleAudio, type AudioNote } from '../canvas/audio';
import { balance, canMoveTo, childPlace, descendants, mindButtons, mindSide, moveBranch, type MindButton } from '../model/mind';

export type Tool = 'select' | 'hand' | 'sticky' | 'text' | 'rect' | 'ellipse' | 'link' | 'frame' | 'pen' | 'marker' | 'eraser' | 'task' | 'table' | 'mind' | PolyShape;
export type PenTool = 'pen' | 'marker';
export const DRAW_TOOLS: Tool[] = ['pen', 'marker', 'eraser'];
/** Tools that draw a figure by dragging out its box; the polygons are one item type with a `shape`. */
export const SHAPE_TOOLS: Tool[] = ['rect', 'ellipse', 'triangle', 'rhombus', 'pentagon', 'star'];
const isPoly = (t: Tool): t is PolyShape => t === 'triangle' || t === 'rhombus' || t === 'pentagon' || t === 'star';

/** A pen's colour (a key of INK_COLORS or '#rrggbb') and line width in screen pixels at the zoom it's drawn at. */
export interface InkStyle { color: string; size: number }
/** Each pen has three presets, as in Miro; `active` is the one it draws with. */
export interface PenSet { presets: InkStyle[]; active: number }
export type Pens = Record<PenTool, PenSet>;

export const INK_SIZES: Record<PenTool, number[]> = { pen: [2, 4, 8, 14], marker: [12, 20, 32, 48] };
const DEFAULT_PENS: Pens = {
  pen: { presets: [{ color: 'ink', size: 2 }, { color: 'red', size: 4 }, { color: 'blue', size: 8 }], active: 0 },
  marker: { presets: [{ color: 'yellow', size: 20 }, { color: 'green', size: 20 }, { color: 'pink', size: 20 }], active: 0 },
};
const PENS_KEY = 'planx-pens';

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
  /** Whether there's anything of this person's to undo, or to redo. */
  canUndo: boolean;
  canRedo: boolean;
}

type Gesture =
  | { type: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { type: 'pinch'; d0: number; z0: number; anchor: Point }
  | { type: 'drag'; start: Point; orig: Map<string, Point>; moved: boolean; id: string; dbl: boolean }
  | { type: 'resize'; id: string; start: Point; orig: Item }
  | { type: 'rotate'; id: string; c: Point; a0: number; rot0: number; held: Array<{ id: string; c: Point; rot0: number }> }
  | { type: 'create'; id: string; origin: Point }
  | { type: 'place'; at: Point; tool: 'sticky' | 'text' | 'task' | 'table' | 'mind' }
  | { type: 'tableLine'; id: string; start: Point; lines: TableLine[]; cols0: number[]; rows0: number[] }
  | { type: 'link'; from: string; fromSide: Side | null; to: Point; target: string | null }
  | { type: 'mindMove'; id: string; from: Point; to: Point; target: string | null }
  | { type: 'marquee'; start: Point; base: Set<string>; rect: Rect | null }
  | { type: 'draw'; tool: PenTool; pts: Point[] }
  | { type: 'erase'; last: Point };

/** What a new mind map's central topic says until it's typed over. */
const MIND_TOPIC = 'Центральная тема';

/** How far outside a corner (in screen pixels) the pointer turns the item, and how close to a square
 *  angle (in degrees) the turn sticks to it. */
const ROTATE_ZONE = 18, ROTATE_SNAP = 3;
/** The mind map "+" buttons' wait after a node is picked, and their fade in, in ms. */
const PLUS_DELAY = 330, PLUS_FADE = 300;

/** Cursors for turning: a curved double arrow around the top left corner, turned by deg. Kept by
 *  the degree. */
const rotateCursors = new Map<number, string>();
function rotateCursor(deg: number): string {
  const d = Math.round(deg);
  let c = rotateCursors.get(d);
  if (!c) {
    // Drawn twice, white and wide under dark, so it shows on any background.
    const arrow = (ink: string, width: number) => `<path fill="none" stroke="${ink}" stroke-width="${width}" d="M6.5 17.5A11 11 0 0 1 17.5 6.5"/>`
      + `<path fill="${ink}" stroke="${ink}" stroke-width="${width - 1.6}" stroke-linejoin="round" d="M3.5 16.5 6.5 21 9.5 16.5Z M16.5 3.5 21 6.5 16.5 9.5Z"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(${d} 12 12)">${arrow('#fff', 4.4)}${arrow('#1A1A1A', 1.8)}</g></svg>`;
    c = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
    rotateCursors.set(d, c);
  }
  return c;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const MIN_Z = 0.08, MAX_Z = 4;
/** Zoom change per mouse wheel notch: three percentage points. */
const WHEEL_STEP = 0.03;

/**
 * Owns the canvas: turns pointer and keyboard input into board changes and
 * redraws when anything changes. React only draws the chrome around it.
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

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private theme: Theme | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private gesture: Gesture | null = null;
  private pointers = new Map<number, Point>();
  private spaceDown = false;
  private clipboard: string | null = null;
  private lastTap = { id: '', t: 0 };
  private raf = 0;
  private ui: UIState;
  private uiListeners = new Set<() => void>();
  private camKey: string;
  private needsFit: boolean;
  private lastCursorSent = 0;
  private hotDot: Side | null = null;
  /** The mind map node button under the pointer; and when the buttons of the node picked now start
   *  to fade in (they come a moment after it's picked or let go). */
  private hotPlus: MindButton | null = null;
  private plusKey = '';
  private plusFrom = 0;
  private plusTimer = 0;
  /** The table line under the pointer, and the lines picked with Shift to be dragged together. */
  private hotLine: TableLine | null = null;
  private pickedLines: TableLine[] = [];

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
      canUndo: this.board.undoManager.undoStack.length > 0, canRedo: this.board.undoManager.redoStack.length > 0 };
  }

  private setMoving(moving: boolean): void {
    if (this.moving === moving) return;
    this.moving = moving;
    this.emit();
  }

  private emit(): void {
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
    on(canvas, 'pointerdown', (e) => this.onPointerDown(e));
    on(canvas, 'pointermove', (e) => this.onPointerMove(e));
    on(canvas, 'pointerup', (e) => this.onPointerUp(e));
    on(canvas, 'pointercancel', (e) => this.onPointerUp(e));
    on(canvas, 'pointerleave', () => {
      this.presence?.setCursor(null);
      if (this.hotDot || this.hotLine) { this.hotDot = null; this.hotLine = null; this.requestRender(); }
    });
    on(canvas, 'wheel', (e) => this.wheel(e), { passive: false });
    on(window, 'keydown', (e) => this.onKeyDown(e));
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
      this.plusFrom = performance.now() + PLUS_DELAY;
      clearTimeout(this.plusTimer);
      this.plusTimer = window.setTimeout(() => this.requestRender(), PLUS_DELAY);
    }
    const plusFade = this.plusFade();
    if (plusFade > 0 && plusFade < 1) this.requestRender();
    drawScene(this.ctx, {
      items: this.board.list(),
      links: this.board.linkList(),
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
      showHandle: this.selection.size === 1 && !!this.board.get([...this.selection][0]),
      hotDot: this.hotDot,
      hotPlus: this.hotPlus,
      plusFade,
      mindMove: g?.type === 'mindMove' ? { from: g.from, to: g.to, target: g.target ? this.board.get(g.target) ?? null : null } : null,
      tableLines: this.hotLine ? [...this.pickedLines, this.hotLine] : this.pickedLines,
      editingCell: this.editingCell,
      stroke: g?.type === 'draw' ? { pts: g.pts, color: this.penStyle(g.tool).color, width: this.penStyle(g.tool).size / this.cam.z, hl: g.tool === 'marker' } : null,
    });
  }

  /* ---------- camera ---------- */

  toWorld(sx: number, sy: number): Point {
    return { x: (sx - this.cam.x) / this.cam.z, y: (sy - this.cam.y) / this.cam.z };
  }

  private camChanged(): void {
    writeJSON(this.camKey, this.cam);
    this.requestRender();
    this.emit();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const z = clamp(this.cam.z * factor, MIN_Z, MAX_Z);
    const w = this.toWorld(sx, sy);
    this.cam = { z, x: sx - w.x * z, y: sy - w.y * z };
    this.camChanged();
  }

  zoomCenter(factor: number): void {
    this.zoomAt(this.width / 2, this.height / 2, factor);
  }

  fit(): void {
    const b = boundsOf(this.board.list());
    const W = this.width, H = this.height;
    if (!b) { this.cam = { x: W / 2, y: H / 2, z: 1 }; this.camChanged(); return; }
    const padX = W < 600 ? 70 : 110, padY = 100;
    const z = clamp(Math.min((W - padX * 2) / b.w, (H - padY * 2) / b.h), MIN_Z, 1.4);
    this.cam = { z, x: W / 2 - (b.x + b.w / 2) * z, y: H / 2 + 10 - (b.y + b.h / 2) * z };
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

  /** Screen position of a board point, for overlays such as the text editor. */
  toScreen(p: Point): Point {
    return { x: p.x * this.cam.z + this.cam.x, y: p.y * this.cam.z + this.cam.y };
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
    this.selection = new Set(ids);
    this.presence?.setSelection([...this.selection]);
    this.emit();
    this.requestRender();
  }

  selectedItems(): Item[] {
    return [...this.selection].map((id) => this.board.get(id)).filter((i): i is Item => !!i);
  }

  private setSpace(down: boolean): void {
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
    if (!this.selection.size) return;
    // A mind map node goes with everything branching from it.
    this.board.remove([...this.selection, ...descendants(this.selection, this.board.list())]);
    this.setSelection([]);
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
        if (of === 'stroke' && STROKABLE.includes(it.type)) this.board.update(it.id, { so: v });
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
      for (const it of items) this.board.update(it.id, patch);
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

  /** Adds copies of items, and of the links among them, with fresh ids. Copies keep their order and go on top. */
  private insertCopies(src: Item[], srcLinks: Link[], offset: number): { items: Item[]; links: Link[]; map: Map<string, string> } {
    const map = new Map<string, string>();
    let z = this.board.maxZ();
    const items = [...src].sort((a, b) => a.z - b.z).map((it) => {
      const id = uid();
      map.set(it.id, id);
      return { ...it, id, x: it.x + offset, y: it.y + offset, z: it.type === 'frame' ? it.z : ++z };
    }).map((it) => {
      // Copied mind map nodes hang from the copies of their parents (or still from the original ones).
      if (it.parent && map.has(it.parent)) it.parent = map.get(it.parent);
      // A copied frame holds the copies of what it held.
      if (it.members) it.members = it.members.map((m) => map.get(m)).filter((m): m is string => !!m);
      return it;
    });
    const links = srcLinks.map((l) => ({ ...l, id: uid(), from: map.get(l.from)!, to: map.get(l.to)! }));
    this.board.transact(() => {
      items.forEach((it) => this.board.add(it));
      links.forEach((l) => this.board.addLink(l));
    });
    return { items, links, map };
  }

  /** Alt-drag: leave the dragged items where they are and drag copies of them instead. */
  private dragCopies(orig: Map<string, Point>): Map<string, Point> {
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

  clearBoard(): void {
    this.board.replaceAll([], []);
    this.setSelection([]);
  }

  undo(): void {
    if (this.editingId) this.stopEditing();
    this.board.undo();
  }

  redo(): void {
    this.board.redo();
  }

  /* ---------- text editing ---------- */

  /** Opens an item's text for typing; for a table, one cell's (the first unless given). */
  /** Whether the text overlay opens with all the text picked (to type over it) or the caret at its end. */
  editCaret: 'all' | 'end' = 'all';

  startEditing(id: string, cell?: number | null, caret: 'all' | 'end' = 'all'): void {
    const it = this.board.get(id);
    if (!it || !EDITABLE.includes(it.type)) return;
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
        const patch: Partial<Item> = { text: value, ...this.mindFit(it, value) };
        const h = fitHeight(it, value);
        if (h) Object.assign(patch, { h }, it.rot && resizedAt(it, it.w, h));
        this.board.update(id, patch);
        // A mind map node that grew taller makes room among its neighbours.
        if (it.type === 'mind' && it.parent && patch.h !== it.h) this.rebalance(id);
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
    if (it?.type === 'mind') this.board.update(id, this.mindFit(it, text));
  }

  /** A mind map node's size for its text; one growing leftwards keeps its right edge where it is. */
  private mindFit(it: Item, text: string): Partial<Item> {
    if (it.type !== 'mind') return {};
    const { w, h } = mindSize(it, text), up = it.parent ? this.board.get(it.parent) : undefined;
    const left = up && mindSide(it, up) < 0;
    // New lines grow it downwards.
    return { w, h, x: left ? it.x + it.w - w : it.x };
  }

  /** Adds a node to a mind map: a child of `from`, or another child of its parent right after it
   *  (`below`) or before it (`above`), and opens it for typing. */
  addMindNode(fromId: string, kind: 'child' | 'above' | 'below'): void {
    const from = this.board.get(fromId);
    if (from?.type !== 'mind') return;
    const parent = kind !== 'child' && from.parent ? this.board.get(from.parent) : from;
    if (!parent) return;
    const items = this.board.list(), get = (id: string) => this.board.get(id);
    const depth = (n: Item): number => (n.parent ? 1 + depth(this.board.get(n.parent) ?? n) : 0);
    const level = depth(parent) + 1;
    const draft = { ...DEFAULTS.mind, type: 'mind', fs: level === 1 ? 16 : 14, text: '' } as Item;
    const { w, h } = mindSize(draft, '');
    // A parallel branch grows on the same side of the centre as the node it's added beside.
    const at = childPlace(parent, items, get, w, h, parent !== from ? mindSide(from, parent) : undefined);
    // A parallel branch goes right after (or before) the node it's added beside, lined up with it
    // on the side towards the parent; then the branches re-centre.
    if (parent !== from) {
      at.y = from.y + from.h / 2 + (kind === 'above' ? -2 : 2) - h / 2;
      at.x = mindSide(from, parent) > 0 ? from.x : from.x + from.w - w;
    }
    const it = this.newItem('mind', at.x, at.y, { w, h, fs: draft.fs, parent: parent.id });
    this.board.beginGesture();
    this.board.add(it);
    this.rebalance(it.id);
    this.board.endGesture();
    this.setSelection([it.id]);
    this.startEditing(it.id);
  }

  /** Lays the mind map's branches out again around the way from this node to the centre. */
  private rebalance(id: string): void {
    const moves = balance(id, this.board.list());
    this.board.transact(() => moves.forEach((y, k) => this.board.update(k, { y })));
  }

  private stopEditing(): void {
    // The overlay listens for this and commits its value.
    if (this.editingId) window.dispatchEvent(new CustomEvent('planx:commit-edit'));
  }

  /* ---------- pointer input ---------- */

  private local(e: PointerEvent | WheelEvent): Point {
    const r = this.canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerDown(e: PointerEvent): void {
    this.stopEditing();
    // Same as in newItem: once someone works on the board, leave the camera to them.
    this.needsFit = false;
    const sp = this.local(e);
    this.canvas!.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, sp);

    if (this.pointers.size === 2) {
      this.cancelGesture();
      const [p, q] = [...this.pointers.values()];
      this.gesture = { type: 'pinch', d0: Math.hypot(p.x - q.x, p.y - q.y) || 1, z0: this.cam.z, anchor: this.toWorld((p.x + q.x) / 2, (p.y + q.y) / 2) };
      return;
    }
    if (this.pointers.size > 2) return;

    const w = this.toWorld(sp.x, sp.y);
    const items = this.board.list();
    // A frame takes clicks anywhere on its empty area, but links drawn across it come first.
    let hit = hitItem(items, w, this.cam.z);
    const link = hit && hit.type !== 'frame' ? null : hitLink(this.board.linkList(), (id) => this.board.get(id), w, this.cam.z);
    if (link) hit = null;

    const touchPan = e.pointerType === 'touch' && this.tool === 'select' && !hit && !link;
    if (e.button === 1 || this.spaceDown || this.tool === 'hand' || touchPan) {
      this.gesture = { type: 'pan', sx: sp.x, sy: sp.y, cx: this.cam.x, cy: this.cam.y };
      this.canvas!.classList.add('panning');
      return;
    }
    if (e.button !== 0) return;

    switch (this.tool) {
      case 'sticky':
      case 'text':
      case 'task':
      case 'table':
      case 'mind':
        this.gesture = { type: 'place', at: w, tool: this.tool };
        return;
      case 'rect':
      case 'ellipse':
      case 'triangle':
      case 'rhombus':
      case 'pentagon':
      case 'star':
      case 'frame': {
        this.board.beginGesture();
        const t = this.tool;
        const it = isPoly(t) ? this.newItem('polygon', w.x, w.y, { w: 1, h: 1, shape: t }) : this.newItem(t, w.x, w.y, { w: 1, h: 1 });
        this.board.add(it);
        this.gesture = { type: 'create', id: it.id, origin: w };
        return;
      }
      case 'link':
        if (hit) this.gesture = { type: 'link', from: hit.id, fromSide: null, to: w, target: null };
        return;
      case 'pen':
      case 'marker':
        if (this.selection.size) this.setSelection([]);
        this.gesture = { type: 'draw', tool: this.tool, pts: [w] };
        this.requestRender();
        return;
      case 'eraser':
        this.board.beginGesture();
        this.gesture = { type: 'erase', last: w };
        this.eraseAlong(w, w);
        return;
    }

    // Select tool.
    const single = this.selection.size === 1 ? this.board.get([...this.selection][0]) : undefined;
    const plus = single && this.plusAt(single, w);
    if (single && plus) {
      if (plus === 'move') this.gesture = { type: 'mindMove', id: single.id, from: w, to: w, target: null };
      else this.addMindNode(single.id, plus);
      return;
    }
    const dot = single && !this.editingId ? this.dotAt(single, w) : null;
    if (single && dot) {
      this.gesture = { type: 'link', from: single.id, fromSide: dot, to: w, target: null };
      return;
    }
    if (single && this.onHandle(single, w)) {
      this.board.beginGesture();
      this.gesture = { type: 'resize', id: single.id, start: w, orig: { ...single } };
      this.setMoving(true);
      return;
    }
    if (single && this.onRotate(single, w)) {
      this.board.beginGesture();
      const c = center(single), items = this.board.list();
      // A frame turns with everything it holds, which keeps a list from then on.
      if (single.type === 'frame' && !single.members) this.board.update(single.id, { members: this.membersOf(single, items) });
      const held = single.type === 'frame' ? [...this.carried([single], items).keys()].filter((id) => id !== single.id) : [];
      this.gesture = {
        type: 'rotate', id: single.id, c, a0: Math.atan2(w.y - c.y, w.x - c.x), rot0: single.rot ?? 0,
        held: held.map((id) => this.board.get(id)!).map((i) => ({ id: i.id, c: center(i), rot0: i.rot ?? 0 })),
      };
      this.setMoving(true);
      return;
    }
    // A table's lines resize the column or row before them, the table selected or not. Shift-clicking
    // picks several lines (or drops one); dragging any picked line moves them all.
    const tl = this.editingId ? null : this.tableLineAt(w, hit);
    if (tl) {
      const same = (l: TableLine) => l.id === tl.id && l.axis === tl.axis && l.index === tl.index;
      const picked = this.pickedLines.filter((l) => l.id === tl.id), was = picked.some(same);
      // Only Shift-clicks pick lines; a line dragged on its own isn't kept.
      this.pickedLines = e.shiftKey ? (was ? picked.filter((l) => !same(l)) : [...picked, tl]) : was ? picked : [];
      const table = this.board.get(tl.id)!;
      const lines = e.shiftKey || was ? this.pickedLines : [tl];
      this.board.beginGesture();
      this.hotLine = tl;
      this.gesture = { type: 'tableLine', id: tl.id, start: w, lines, cols0: colsOf(table), rows0: rowsOf(table) };
      this.setMoving(true);
      this.requestRender();
      return;
    }
    if (this.pickedLines.length) { this.pickedLines = []; this.requestRender(); }
    // A task's checkbox ticks it off (or back on) instead of picking the task up.
    if (hit?.type === 'task' && !e.shiftKey && onTaskBox(hit, w, this.cam.z)) {
      this.board.update(hit.id, { done: hit.done ? undefined : true });
      return;
    }
    // An audio note's button plays it (or stops it) instead of picking it up.
    if (hit?.type === 'audio' && !e.shiftKey && onAudioButton(hit, w)) {
      toggleAudio(hit, () => this.requestRender());
      return;
    }
    if (hit) {
      const now = performance.now();
      const dbl = this.lastTap.id === hit.id && now - this.lastTap.t < 380 && !e.shiftKey;
      this.lastTap = { id: hit.id, t: now };
      if (e.shiftKey) {
        const next = new Set(this.selection);
        if (next.has(hit.id)) next.delete(hit.id); else next.add(hit.id);
        this.setSelection(next);
      } else if (!this.selection.has(hit.id)) this.setSelection([hit.id]);
      this.gesture = { type: 'drag', start: w, orig: this.dragSet(items), moved: false, id: hit.id, dbl };
      return;
    }
    this.lastTap = { id: '', t: 0 };
    if (link) {
      if (e.shiftKey) {
        const next = new Set(this.selection);
        if (next.has(link.id)) next.delete(link.id); else next.add(link.id);
        this.setSelection(next);
      } else this.setSelection([link.id]);
      return;
    }
    if (!e.shiftKey) this.setSelection([]);
    this.gesture = { type: 'marquee', start: w, base: new Set(this.selection), rect: null };
  }

  /** Selected items plus what the selected frames hold. */
  private dragSet(items: Item[]): Map<string, Point> {
    return this.carried(items.filter((i) => this.selection.has(i.id)), items);
  }

  /** These items, what the frames among them hold (frames in frames too) and the branches of mind
   *  map nodes, each with where it is now. */
  private carried(sel: Item[], items: Item[]): Map<string, Point> {
    const orig = new Map<string, Point>();
    sel.forEach((i) => orig.set(i.id, { x: i.x, y: i.y }));
    const frames = sel.filter((i) => i.type === 'frame');
    while (frames.length) {
      for (const id of this.membersOf(frames.pop()!, items)) {
        const i = this.board.get(id);
        if (!i || orig.has(id)) continue;
        orig.set(id, { x: i.x, y: i.y });
        if (i.type === 'frame') frames.push(i);
      }
    }
    // A mind map node brings its branches along.
    for (const id of descendants(orig.keys(), items)) {
      const i = this.board.get(id);
      if (i) orig.set(id, { x: i.x, y: i.y });
    }
    return orig;
  }

  /** What a frame holds: what was put in it, or, in a frame from before frames kept a list,
   *  everything lying inside. */
  private membersOf(f: Item, items: Item[]): string[] {
    if (f.members) return f.members.filter((id) => this.board.get(id));
    return items.filter((i) => i.type !== 'frame' && rectContains(boxOf(f), boxOf(i))).map((i) => i.id);
  }

  /**
   * Puts each of these items in the innermost frame its middle lies in, or takes it out of frames
   * when it lies in none. Only this puts things in frames: an item that merely ends up under a frame
   * (a frame put around others, or dragged over it) stays out until it's moved or made there.
   */
  private settle(ids: Iterable<string>, fresh?: string): void {
    // Worked out on one look at the board (it reads back stale within a change), then written at once.
    const items = this.board.list(), frames = items.filter((f) => f.type === 'frame');
    const held = new Map(frames.map((f) => [f.id, f.id === fresh ? [] : this.membersOf(f, items)]));
    const changed = new Set<string>();
    for (const id of ids) {
      const it = this.board.get(id);
      // Mind map branches go wherever their node goes.
      if (!it || (it.type === 'mind' && it.parent)) continue;
      const c = center(it);
      const inside = it.type === 'frame' ? new Set(this.carried([it], items).keys()) : new Set([id]);
      const home = frames
        .filter((f) => !inside.has(f.id) && pointInRect(toLocal(f, c), f) && (it.type !== 'frame' || f.w * f.h > it.w * it.h))
        .sort((a, b) => a.w * a.h - b.w * b.h)[0];
      for (const f of frames) {
        const list = held.get(f.id)!, has = list.includes(id);
        if (f === home && (!has || !f.members)) { held.set(f.id, has ? list : [...list, id]); changed.add(f.id); }
        else if (f !== home && has) { held.set(f.id, list.filter((m) => m !== id)); changed.add(f.id); }
      }
    }
    if (fresh) changed.add(fresh);
    this.board.transact(() => changed.forEach((f) => this.board.update(f, { members: held.get(f) })));
  }

  /** Adds a newly made item: into the frame it's made in; a new frame takes in what lies inside it. */
  private addItem(it: Item): void {
    this.board.add(it);
    this.settleNew(it.id);
  }

  private settleNew(id: string): void {
    const it = this.board.get(id);
    if (!it) return;
    if (it.type !== 'frame') { this.settle([id]); return; }
    const items = this.board.list();
    this.settle([...items.filter((i) => i.id !== id && pointInRect(center(i), it)).map((i) => i.id), id], id);
  }

  private onHandle(it: Item, w: Point): boolean {
    if (it.type === 'mind') return false;
    const hs = (HANDLE + 6) / this.cam.z, off = 3 / this.cam.z;
    return pointInRect(toLocal(it, w), { x: it.x + it.w + off - hs / 2, y: it.y + it.h + off - hs / 2, w: hs, h: hs });
  }

  /** How far the selected mind map node's "+" buttons have faded in, 0…1. */
  private plusFade(): number {
    const typing = this.editingId && this.board.get(this.editingId)?.type !== 'mind';
    return this.moving || typing ? 0 : clamp((performance.now() - this.plusFrom) / PLUS_FADE, 0, 1);
  }

  /** Which of a mind map node's buttons is under the point, once they're showing. */
  private plusAt(it: Item, w: Point): MindButton | null {
    if (it.type !== 'mind' || this.plusFade() === 0) return null;
    return mindButtons(it, (id) => this.board.get(id), this.cam.z).find((b) => Math.hypot(w.x - b.x, w.y - b.y) <= b.r * 1.5)?.kind ?? null;
  }

  /** Whether the point is just outside the item's top right corner, where it is turned. */
  private onRotate(it: Item, w: Point): boolean {
    if (!ROTATABLE.includes(it.type)) return false;
    const p = toLocal(it, w);
    return !pointInRect(p, it) && Math.hypot(p.x - (it.x + it.w), p.y - it.y) <= ROTATE_ZONE / this.cam.z;
  }

  /** The link dot under the point, if any. */
  private dotAt(it: Item, w: Point): Side | null {
    if (it.type === 'mind') return null;
    const r = 16.5 / this.cam.z;  // well beyond the dot itself, so it is easy to catch
    for (const side of SIDES) {
      const p = sidePoint(it, side, DOT_GAP / this.cam.z);
      if (Math.hypot(w.x - p.x, w.y - p.y) <= r) return side;
    }
    return null;
  }

  private onPointerMove(e: PointerEvent): void {
    const sp = this.local(e);
    const w = this.toWorld(sp.x, sp.y);
    this.sendCursor(w);
    this.updateCursor(w, e.altKey);
    if (!this.pointers.has(e.pointerId) || !this.gesture) return;
    this.pointers.set(e.pointerId, sp);
    const g = this.gesture;

    switch (g.type) {
      case 'pinch': {
        const [p, q] = [...this.pointers.values()];
        if (!q) return;
        const z = clamp(g.z0 * Math.hypot(p.x - q.x, p.y - q.y) / g.d0, MIN_Z, MAX_Z);
        const cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2;
        this.cam = { z, x: cx - g.anchor.x * z, y: cy - g.anchor.y * z };
        this.camChanged();
        return;
      }
      case 'pan':
        this.cam = { ...this.cam, x: g.cx + sp.x - g.sx, y: g.cy + sp.y - g.sy };
        this.camChanged();
        return;
      case 'drag': {
        const dx = w.x - g.start.x, dy = w.y - g.start.y;
        if (!g.moved) {
          if (Math.hypot(dx, dy) * this.cam.z < 3) return;
          g.moved = true;
          this.setMoving(true);
          this.board.beginGesture();
          if (e.altKey) g.orig = this.dragCopies(g.orig);
        }
        this.board.transact(() => {
          for (const [id, o] of g.orig) this.board.update(id, { x: Math.round(o.x + dx), y: Math.round(o.y + dy) });
        });
        return;
      }
      case 'resize': {
        const it = this.board.get(g.id);
        if (!it) return;
        const min = it.type === 'frame' ? 80 : it.type === 'ink' ? 4 : it.type === 'audio' ? 32 : it.type === 'icon' || it.type === 'emoji' || it.type === 'image' ? 16 : 40;
        // A turned item is stretched along its own sides.
        const { w: w0, h: h0 } = g.orig, d = turn({ x: w.x - g.start.x, y: w.y - g.start.y }, { x: 0, y: 0 }, -angleOf(g.orig));
        let nw = Math.max(min, Math.round(w0 + d.x));
        let nh = Math.max(min, Math.round(h0 + d.y));
        // Stickers, icons, emoji, drawings and pictures keep their proportions; Shift flips that: a sticker of any shape, or a shape kept in proportion.
        const keep = it.type === 'sticky' || it.type === 'image' ? !e.shiftKey : it.type === 'icon' || it.type === 'emoji' || it.type === 'ink' || it.type === 'audio' || e.shiftKey;
        if (keep) {
          const k = Math.max(nw / w0, nh / h0);
          nw = Math.round(w0 * k);
          nh = Math.round(h0 * k);
        }
        if (it.type === 'text') nh = itemTextHeight(it, it.text, nw);
        // A task can be made taller by hand, never shorter than its text.
        if (it.type === 'task') nh = Math.max(nh, fitHeight(it, it.text, nw)!);
        this.board.update(g.id, it.type === 'table' ? withScale(it, nw, nh) : g.orig.rot ? { w: nw, h: nh, ...resizedAt(g.orig, nw, nh) } : { w: nw, h: nh });
        return;
      }
      case 'rotate': {
        // Shift turns in steps of 15°; otherwise the turn sticks to the square angles when near them.
        let deg = g.rot0 + ((Math.atan2(w.y - g.c.y, w.x - g.c.x) - g.a0) * 180) / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        else if (Math.abs(deg - Math.round(deg / 90) * 90) < ROTATE_SNAP) deg = Math.round(deg / 90) * 90;
        deg = Math.round((((deg % 360) + 540) % 360 - 180) * 10) / 10;
        // What a frame holds goes round its middle, turning as much (what can't turn just goes round).
        const d = deg - g.rot0, a = (d * Math.PI) / 180;
        this.board.transact(() => {
          this.board.update(g.id, { rot: deg || undefined });
          for (const h of g.held) {
            const it = this.board.get(h.id);
            if (!it) continue;
            const c = turn(h.c, g.c, a), patch: Partial<Item> = { x: Math.round(c.x - it.w / 2), y: Math.round(c.y - it.h / 2) };
            if (ROTATABLE.includes(it.type)) patch.rot = Math.round((((h.rot0 + d) % 360 + 540) % 360 - 180) * 10) / 10 || undefined;
            this.board.update(h.id, patch);
          }
        });
        if (this.canvas) this.canvas.style.cursor = rotateCursor(deg + 90);
        return;
      }
      case 'tableLine': {
        const it = this.board.get(g.id);
        if (!it) return;
        // The dragged lines move together, the gaps between them kept.
        const patch: Partial<Item> = {};
        const cols = g.lines.filter((l) => l.axis === 'col').map((l) => l.index);
        const rows = g.lines.filter((l) => l.axis === 'row').map((l) => l.index);
        if (cols.length) { patch.cols = movedLines(g.cols0, cols, w.x - g.start.x, MIN_COL); patch.w = patch.cols.reduce((a, b) => a + b, 0); }
        if (rows.length) { patch.rows = movedLines(g.rows0, rows, w.y - g.start.y, MIN_ROW); patch.h = patch.rows.reduce((a, b) => a + b, 0); }
        this.board.update(g.id, patch);
        return;
      }
      case 'create': {
        let r = normRect(g.origin, w);
        if (e.shiftKey) { const s = Math.max(r.w, r.h); r = { ...r, w: s, h: s }; }
        this.board.update(g.id, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
        return;
      }
      case 'mindMove': {
        const t = hitItem(this.board.list(), w, this.cam.z);
        g.to = w;
        g.target = t && canMoveTo(g.id, t.id, this.board.list()) ? t.id : null;
        this.requestRender();
        return;
      }
      case 'link': {
        const t = hitItem(this.board.list(), w, this.cam.z);
        g.to = w;
        g.target = t && t.id !== g.from ? t.id : null;
        this.requestRender();
        return;
      }
      case 'draw': {
        // Coalesced events keep fast strokes smooth; skip points closer than a pixel and a half.
        for (const ev of e.getCoalescedEvents?.() ?? [e]) {
          const l = this.local(ev), p = this.toWorld(l.x, l.y), last = g.pts[g.pts.length - 1];
          if (Math.hypot(p.x - last.x, p.y - last.y) * this.cam.z >= 1.5) g.pts.push(p);
        }
        this.requestRender();
        return;
      }
      case 'erase':
        this.eraseAlong(g.last, w);
        g.last = w;
        return;
      case 'marquee': {
        g.rect = normRect(g.start, w);
        const next = new Set(g.base);
        for (const it of this.board.list()) {
          const inside = it.type === 'frame' ? rectContains(g.rect, boxOf(it)) : rectsIntersect(g.rect, boxOf(it));
          if (inside) next.add(it.id);
        }
        this.setSelection(next);
        return;
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!g) return;
    if (g.type === 'pinch') { if (!this.pointers.size) this.gesture = null; return; }
    this.gesture = null;
    this.canvas?.classList.remove('panning');
    this.setMoving(false);

    switch (g.type) {
      case 'drag':
        if (g.moved) {
          // What was dragged into a frame is in it now, and what was dragged out of one is out.
          this.settle([...this.selection]);
          this.board.endGesture();
        }
        else if (g.dbl) {
          const it = this.board.get(g.id);
          this.startEditing(g.id, it?.type === 'table' ? cellAt(it, g.start) : null);
        } else if (this.board.get(g.id)?.type === 'mind' && this.selection.size === 1 && !e.shiftKey) {
          // A mind map node opens for typing on a single click, the caret after its text.
          this.startEditing(g.id, null, 'end');
        }
        return;
      case 'resize':
      case 'rotate':
      case 'tableLine':
        this.board.endGesture();
        return;
      case 'place': {
        const d = DEFAULTS[g.tool];
        const it = g.tool === 'text'
          ? this.newItem('text', g.at.x - 4, g.at.y - 14)
          : this.newItem(g.tool, g.at.x - d.w / 2, g.at.y - d.h / 2, g.tool === 'table' ? newTable() : g.tool === 'mind' ? { text: MIND_TOPIC } : {});
        if (it.type === 'text') it.h = itemTextHeight(it);
        if (it.type === 'mind') Object.assign(it, mindSize(it), { x: Math.round(g.at.x - mindSize(it).w / 2) });
        this.addItem(it);
        this.setTool('select');
        this.setSelection([it.id]);
        this.startEditing(it.id);
        return;
      }
      case 'create': {
        const it = this.board.get(g.id);
        if (it) {
          const d = DEFAULTS[it.type];
          if (it.w < 10 && it.h < 10) this.board.update(it.id, { w: d.w, h: d.h, x: Math.round(g.origin.x - d.w / 2), y: Math.round(g.origin.y - d.h / 2) });
          else this.board.update(it.id, { w: Math.max(it.w, 30), h: Math.max(it.h, 30) });
          this.settleNew(it.id);
        }
        this.board.endGesture();
        this.setTool('select');
        this.setSelection([g.id]);
        if (it?.type === 'frame') this.startEditing(g.id);
        return;
      }
      case 'link':
        if (g.target && !this.board.hasLink(g.from, g.target)) {
          const target = this.board.get(g.target)!;
          const l: Link = g.fromSide
            ? { id: uid(), from: g.from, to: g.target, fromSide: g.fromSide, toSide: nearestSide(target, g.to) }
            : { id: uid(), from: g.from, to: g.target };
          this.board.addLink(l);
          this.setTool('select');
          this.setSelection([l.id]);
        }
        this.requestRender();
        return;
      case 'mindMove':
        // The branch hangs from the node it's dropped on now, on that side of a central topic.
        if (g.target) {
          const target = this.board.get(g.target)!, toward = g.to.x >= target.x + target.w / 2 ? 1 : -1;
          const moves = moveBranch(g.id, g.target, this.board.list(), toward);
          this.board.transact(() => {
            this.board.update(g.id, { parent: g.target! });
            moves.forEach((p, id) => this.board.update(id, p));
          });
        }
        this.requestRender();
        return;
      case 'marquee':
        this.requestRender();
        return;
      case 'draw':
        this.addInk(g.tool, g.pts);
        return;
      case 'erase':
        this.board.endGesture();
        return;
    }
  }

  /** Turns a drawn line into an ink item boxed around it, its points kept relative to the box. */
  private addInk(tool: PenTool, pts: Point[]): void {
    const style = this.penStyle(tool), sw = style.size / this.cam.z;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
    const x = Math.floor(x1 - sw / 2), y = Math.floor(y1 - sw / 2);
    const w = Math.ceil(x2 + sw / 2) - x, h = Math.ceil(y2 + sw / 2) - y;
    const r = (v: number) => Math.round(v * 10) / 10;
    this.addItem(this.newItem('ink', x, y, {
      w, h, iw: w, sw: r(sw), color: style.color, hl: tool === 'marker' || undefined,
      pts: pts.flatMap((p) => [r(p.x - x), r(p.y - y)]),
    }));
  }

  /** Removes every stroke the eraser touches between two points, checked at steps narrower than the eraser. */
  private eraseAlong(a: Point, b: Point): void {
    const tol = 8 / this.cam.z, steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / tol));
    const gone = new Set<string>();
    for (const it of this.board.list()) {
      if (it.type !== 'ink') continue;
      const box = { x: it.x - tol, y: it.y - tol, w: it.w + tol * 2, h: it.h + tol * 2 };
      for (let i = 0; i <= steps; i++) {
        const p = { x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps };
        if (pointInRect(toLocal(it, p), box) && nearInk(it, p, tol)) { gone.add(it.id); break; }
      }
    }
    if (gone.size) this.board.remove(gone);
  }

  private cancelGesture(): void {
    const g = this.gesture;
    if (!g) return;
    if (g.type === 'create') { this.board.remove([g.id]); this.board.endGesture(); }
    if ((g.type === 'drag' && g.moved) || g.type === 'resize' || g.type === 'rotate' || g.type === 'erase' || g.type === 'tableLine') this.board.endGesture();
    this.gesture = null;
    this.setMoving(false);
    this.requestRender();
  }

  private updateCursor(w: Point, alt: boolean): void {
    if (!this.canvas || this.gesture || this.tool !== 'select') return;
    const single = this.selection.size === 1 ? this.board.get([...this.selection][0]) : undefined;
    const dot = single && !this.editingId ? this.dotAt(single, w) : null;
    if (dot !== this.hotDot) { this.hotDot = dot; this.requestRender(); }
    let cursor = '';
    const line = this.editingId || dot ? null : this.tableLineAt(w, hitItem(this.board.list(), w, this.cam.z));
    const same = line && this.hotLine && line.id === this.hotLine.id && line.axis === this.hotLine.axis && line.index === this.hotLine.index;
    if (!same && (line || this.hotLine)) { this.hotLine = line; this.requestRender(); }
    const plus = single ? this.plusAt(single, w) : null;
    if (plus !== this.hotPlus) { this.hotPlus = plus; this.requestRender(); }
    if (plus) cursor = 'pointer';
    else if (dot) cursor = 'crosshair';
    else if (single && this.onHandle(single, w)) cursor = 'nwse-resize';
    else if (single && this.onRotate(single, w)) cursor = rotateCursor((single.rot ?? 0) + 90);
    else if (line) cursor = line.axis === 'col' ? 'col-resize' : 'row-resize';
    else if (hitLink(this.board.linkList(), (id) => this.board.get(id), w, this.cam.z)) cursor = 'pointer';
    else {
      const hit = hitItem(this.board.list(), w, this.cam.z);
      if ((hit?.type === 'task' && onTaskBox(hit, w, this.cam.z)) || (hit?.type === 'audio' && onAudioButton(hit, w))) cursor = 'pointer';
      else if (hit) cursor = alt ? 'copy' : 'move';
    }
    this.canvas.style.cursor = cursor;
  }

  /** The table line under the point: of the table there, or just past a table's right or bottom edge. */
  private tableLineAt(w: Point, hit: Item | null): TableLine | null {
    if (hit && hit.type !== 'table' && hit.type !== 'frame') return null;
    const tol = 5 / this.cam.z, items = this.board.list();
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.type !== 'table') continue;
      const l = lineAt(it, w, tol);
      if (l) return { id: it.id, ...l };
    }
    return null;
  }

  private sendCursor(w: Point): void {
    const now = performance.now();
    if (!this.presence || now - this.lastCursorSent < 40) return;
    this.lastCursorSent = now;
    this.presence.setCursor({ x: Math.round(w.x), y: Math.round(w.y) });
  }

  /** Wheel and trackpad: zoom or scroll the board. `sp` is the screen point zooming keeps still,
   *  the pointer by default; the board map passes the middle of the screen. */
  wheel(e: WheelEvent, sp: Point = this.local(e)): void {
    e.preventDefault();
    const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    const pan = (dx: number, dy: number) => { this.cam = { ...this.cam, x: this.cam.x - dx, y: this.cam.y - dy }; this.camChanged(); };
    // Cmd + wheel scrolls up and down, Shift + wheel sideways; a sideways swipe moves sideways.
    if (e.metaKey) pan(e.deltaX, e.deltaY);
    else if (e.shiftKey) pan(e.deltaX || e.deltaY, 0);
    // A trackpad pinch (it comes as Ctrl + wheel) zooms with the fingers.
    else if (e.ctrlKey) this.zoomAt(sp.x, sp.y, Math.exp(-e.deltaY * 0.004));
    else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) pan(e.deltaX, 0);
    // The wheel zooms linearly: every notch adds or takes the same WHEEL_STEP, a smooth wheel as much per 100px.
    else {
      const step = mouseWheel ? Math.sign(e.deltaY) * WHEEL_STEP : (e.deltaY / 100) * WHEEL_STEP;
      this.zoomAt(sp.x, sp.y, (this.cam.z - step) / this.cam.z);
    }
  }

  /* ---------- keyboard ---------- */

  private onKeyDown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.code === 'Space') { e.preventDefault(); this.setSpace(true); return; }
    if (mod) {
      switch (e.code) {
        case 'KeyZ': e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return;
        case 'KeyY': e.preventDefault(); this.redo(); return;
        case 'KeyC': this.copy(); return;
        case 'KeyX': if (this.copy()) this.deleteSelection(); return;
        case 'KeyV': e.preventDefault(); this.paste(); return;
        case 'KeyD': e.preventDefault(); this.duplicate(); return;
        case 'KeyA': e.preventDefault(); this.setSelection(this.board.list().map((i) => i.id)); return;
        case 'KeyG': e.preventDefault(); this.frameSelection(); return;
      }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (this.selection.size) { e.preventDefault(); this.deleteSelection(); } return; }
    if (e.key === 'Escape') { this.pickedLines = []; this.setSelection([]); this.setTool('select'); window.dispatchEvent(new CustomEvent('planx:close-popovers')); return; }
    // On a mind map node, Tab adds a branch to it and Enter one beside it (to the centre: a branch).
    const one = this.selection.size === 1 ? this.board.get([...this.selection][0]) : undefined;
    if (one?.type === 'mind' && (e.key === 'Tab' || e.key === 'Enter')) {
      e.preventDefault();
      this.addMindNode(one.id, e.key === 'Enter' && one.parent ? 'below' : 'child');
      return;
    }
    if (e.key === 'Enter' && this.selection.size === 1) { e.preventDefault(); this.startEditing([...this.selection][0]); return; }
    if (e.shiftKey && e.code === 'Digit1') { this.fit(); return; }
    if (e.shiftKey && e.code === 'Digit0') { this.zoomCenter(1 / this.cam.z); return; }
    if (e.key === '+' || e.key === '=') { this.zoomCenter(1.2); return; }
    if (e.key === '-' || e.key === '_') { this.zoomCenter(1 / 1.2); return; }
    if (e.key.startsWith('Arrow') && this.selection.size) {
      e.preventDefault();
      const s = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0;
      const dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0;
      this.board.transact(() => this.selectedItems().forEach((it) => this.board.update(it.id, { x: it.x + dx, y: it.y + dy })));
      return;
    }
    const tools: Record<string, Tool> = { KeyV: 'select', KeyH: 'hand', KeyN: 'sticky', KeyS: 'sticky', KeyT: 'text', KeyR: 'rect', KeyO: 'ellipse', KeyC: 'link', KeyL: 'link', KeyF: 'frame', KeyP: 'pen', KeyM: 'marker', KeyE: 'eraser' };
    if (e.code === 'KeyI') { window.dispatchEvent(new CustomEvent('planx:toggle-icons')); return; }
    if (tools[e.code]) this.setTool(tools[e.code]);
  }
}

function readPens(): Pens {
  const saved = readJSON<Pens>(PENS_KEY);
  return saved?.pen?.presets?.length && saved.marker?.presets?.length ? saved : DEFAULT_PENS;
}

function readJSON<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be unavailable; the camera just won't be remembered */
  }
}

import type { Board } from '../model/board';
import type { Item, ItemType, Link, Side } from '../model/types';
import { COLORABLE, DEFAULTS, EDITABLE, HAS_FONT, uid } from '../model/types';
import type { Point, Rect } from '../canvas/geometry';
import { boundsOf, hitItem, hitLink, nearestSide, nearInk, normRect, pointInRect, rectContains, rectsIntersect, sidePoint, SIDES } from '../canvas/geometry';
import { clearTextCache, DOT_GAP, DOT_R, drawScene, HANDLE, readTheme, type Camera, type Peer, type Theme } from '../canvas/renderer';
import { font, itemTextHeight } from '../canvas/text';
import { onEmojiLoad } from '../emoji/emoji';

export type Tool = 'select' | 'hand' | 'sticky' | 'text' | 'rect' | 'ellipse' | 'link' | 'frame' | 'pen' | 'marker' | 'eraser';
export type PenTool = 'pen' | 'marker';
export const DRAW_TOOLS: Tool[] = ['pen', 'marker', 'eraser'];

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
  cam: Camera;
  pens: Pens;
}

type Gesture =
  | { type: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { type: 'pinch'; d0: number; z0: number; anchor: Point }
  | { type: 'drag'; start: Point; orig: Map<string, Point>; moved: boolean; id: string; dbl: boolean }
  | { type: 'resize'; id: string; start: Point; w0: number; h0: number }
  | { type: 'create'; id: string; origin: Point }
  | { type: 'place'; at: Point; tool: 'sticky' | 'text' }
  | { type: 'link'; from: string; fromSide: Side | null; to: Point; target: string | null }
  | { type: 'marquee'; start: Point; base: Set<string>; rect: Rect | null }
  | { type: 'draw'; tool: PenTool; pts: Point[] }
  | { type: 'erase'; last: Point };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const MIN_Z = 0.08, MAX_Z = 4;

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

  constructor(board: Board, opts: { presence?: Presence; storageKey?: string } = {}) {
    this.board = board;
    this.presence = opts.presence;
    this.camKey = opts.storageKey ?? 'planx-cam';
    const saved = readJSON<Camera>(this.camKey);
    this.needsFit = !saved;
    if (saved) this.cam = saved;
    this.ui = this.snapshot();
  }

  /* ---------- React bridge ---------- */

  getUI = (): UIState => this.ui;

  subscribeUI = (fn: () => void): (() => void) => {
    this.uiListeners.add(fn);
    return () => this.uiListeners.delete(fn);
  };

  private snapshot(): UIState {
    return { tool: this.tool, selection: [...this.selection], editingId: this.editingId, cam: { ...this.cam }, pens: this.pens };
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
    on(canvas, 'pointerleave', () => this.presence?.setCursor(null));
    on(canvas, 'wheel', (e) => this.onWheel(e), { passive: false });
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
    const d = DEFAULTS[type];
    const z = type === 'frame' ? this.board.minZ() - 1 : this.board.maxZ() + 1;
    return { ...d, id: uid(), type, x: Math.round(x), y: Math.round(y), z, ...extra } as Item;
  }

  addIcon(icon: string): void {
    const c = this.toWorld(this.width / 2, this.height / 2);
    const n = this.board.list().filter((i) => i.type === 'icon').length % 6;
    const it = this.newItem('icon', c.x - 32 + n * 12, c.y - 32 + n * 12, { icon });
    this.board.add(it);
    this.setTool('select');
    this.setSelection([it.id]);
  }

  addEmoji(emoji: string): void {
    const c = this.toWorld(this.width / 2, this.height / 2);
    const n = this.board.list().filter((i) => i.type === 'emoji').length % 6;
    const it = this.newItem('emoji', c.x - 32 + n * 12, c.y - 32 + n * 12, { emoji });
    this.board.add(it);
    this.setTool('select');
    this.setSelection([it.id]);
  }

  deleteSelection(): void {
    if (!this.selection.size) return;
    this.board.remove(this.selection);
    this.setSelection([]);
  }

  setColor(color: string): void {
    this.board.transact(() => {
      for (const it of this.selectedItems()) {
        if (COLORABLE.includes(it.type) && !(color === 'none' && it.type === 'sticky')) this.board.update(it.id, { color });
      }
    });
  }

  setIconColor(color: string): void {
    this.board.transact(() => {
      for (const it of this.selectedItems()) if (it.type === 'icon') this.board.update(it.id, { color });
    });
  }

  changeFontSize(dir: 1 | -1): void {
    this.board.transact(() => {
      for (const it of this.selectedItems()) {
        if (!HAS_FONT.includes(it.type)) continue;
        const fs = clamp(Math.round((it.fs ?? 16) * (dir > 0 ? 1.2 : 1 / 1.2)), 8, 120);
        this.board.update(it.id, it.type === 'text' ? { fs, h: itemTextHeight({ ...it, fs }) } : { fs });
      }
    });
  }

  /** Changes how the selected items' text looks; an undefined field goes back to the default.
   *  Text items are re-measured to fit, and again once a newly picked font has loaded. */
  setTextStyle(patch: Partial<Item>): void {
    const items = this.selectedItems().filter((i) => HAS_FONT.includes(i.type));
    const refit = () => this.board.transact(() => {
      for (const it of items) {
        const now = this.board.get(it.id);
        if (now?.type === 'text') this.board.update(it.id, { h: itemTextHeight(now) });
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

  startEditing(id: string): void {
    const it = this.board.get(id);
    if (!it || !EDITABLE.includes(it.type)) return;
    this.editingId = id;
    this.selection = new Set([id]);
    this.presence?.setSelection([id]);
    this.emit();
    this.requestRender();
  }

  /** Called by the text overlay with its final value. */
  commitText(id: string, text: string): void {
    const it = this.board.get(id);
    if (this.editingId === id) this.editingId = null;
    if (it) {
      const value = text.replace(/\s+$/, '');
      if (it.type === 'text' && !value.trim()) {
        this.board.remove([id]);
        this.selection.delete(id);
      } else if (value !== (it.text ?? '')) {
        const patch: Partial<Item> = { text: value };
        if (it.type === 'text') patch.h = itemTextHeight(it, value);
        this.board.update(id, patch);
      }
    }
    this.emit();
    this.requestRender();
  }

  /** Live text while typing, so a text item grows as you type and others see it. */
  previewText(id: string, text: string): void {
    const it = this.board.get(id);
    if (it?.type === 'text') {
      const h = itemTextHeight(it, text);
      if (h !== it.h) this.board.update(id, { h });
    }
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
    // Fitting the board once it loads is for boards opened with content, not for the first thing drawn on a new one.
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
    const hit = hitItem(items, w, this.cam.z);
    const link = hit ? null : hitLink(this.board.linkList(), (id) => this.board.get(id), w, this.cam.z);

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
        this.gesture = { type: 'place', at: w, tool: this.tool };
        return;
      case 'rect':
      case 'ellipse':
      case 'frame': {
        this.board.beginGesture();
        const it = this.newItem(this.tool, w.x, w.y, { w: 1, h: 1 });
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
    const dot = single && !this.editingId ? this.dotAt(single, w) : null;
    if (single && dot) {
      this.gesture = { type: 'link', from: single.id, fromSide: dot, to: w, target: null };
      return;
    }
    if (single && this.onHandle(single, w)) {
      this.board.beginGesture();
      this.gesture = { type: 'resize', id: single.id, start: w, w0: single.w, h0: single.h };
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

  /** Selected items plus everything sitting inside a selected frame. */
  private dragSet(items: Item[]): Map<string, Point> {
    const orig = new Map<string, Point>();
    const sel = items.filter((i) => this.selection.has(i.id));
    sel.forEach((i) => orig.set(i.id, { x: i.x, y: i.y }));
    for (const f of sel.filter((i) => i.type === 'frame')) {
      for (const i of items) if (i.type !== 'frame' && !orig.has(i.id) && rectContains(f, i)) orig.set(i.id, { x: i.x, y: i.y });
    }
    return orig;
  }

  private onHandle(it: Item, w: Point): boolean {
    const hs = (HANDLE + 6) / this.cam.z, off = 3 / this.cam.z;
    return pointInRect(w, { x: it.x + it.w + off - hs / 2, y: it.y + it.h + off - hs / 2, w: hs, h: hs });
  }

  /** The link dot under the point, if any. */
  private dotAt(it: Item, w: Point): Side | null {
    const r = (DOT_R + 5) / this.cam.z;
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
        const min = it.type === 'frame' ? 80 : it.type === 'ink' ? 4 : it.type === 'icon' || it.type === 'emoji' ? 16 : 40;
        let nw = Math.max(min, Math.round(g.w0 + w.x - g.start.x));
        let nh = Math.max(min, Math.round(g.h0 + w.y - g.start.y));
        // Stickers, icons, emoji and drawings keep their proportions; Shift flips that: a sticker of any shape, or a shape kept in proportion.
        const keep = it.type === 'sticky' ? !e.shiftKey : it.type === 'icon' || it.type === 'emoji' || it.type === 'ink' || e.shiftKey;
        if (keep) {
          const k = Math.max(nw / g.w0, nh / g.h0);
          nw = Math.round(g.w0 * k);
          nh = Math.round(g.h0 * k);
        }
        if (it.type === 'text') nh = itemTextHeight(it, it.text, nw);
        this.board.update(g.id, { w: nw, h: nh });
        return;
      }
      case 'create': {
        let r = normRect(g.origin, w);
        if (e.shiftKey) { const s = Math.max(r.w, r.h); r = { ...r, w: s, h: s }; }
        this.board.update(g.id, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
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
          const inside = it.type === 'frame' ? rectContains(g.rect, it) : rectsIntersect(g.rect, it);
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

    switch (g.type) {
      case 'drag':
        if (g.moved) this.board.endGesture();
        else if (g.dbl) this.startEditing(g.id);
        return;
      case 'resize':
        this.board.endGesture();
        return;
      case 'place': {
        const d = DEFAULTS[g.tool];
        const it = g.tool === 'sticky'
          ? this.newItem('sticky', g.at.x - d.w / 2, g.at.y - d.h / 2)
          : this.newItem('text', g.at.x - 4, g.at.y - 14);
        if (it.type === 'text') it.h = itemTextHeight(it);
        this.board.add(it);
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
    this.board.add(this.newItem('ink', x, y, {
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
        if (pointInRect(p, box) && nearInk(it, p, tol)) { gone.add(it.id); break; }
      }
    }
    if (gone.size) this.board.remove(gone);
  }

  private cancelGesture(): void {
    const g = this.gesture;
    if (!g) return;
    if (g.type === 'create') { this.board.remove([g.id]); this.board.endGesture(); }
    if ((g.type === 'drag' && g.moved) || g.type === 'resize' || g.type === 'erase') this.board.endGesture();
    this.gesture = null;
    this.requestRender();
  }

  private updateCursor(w: Point, alt: boolean): void {
    if (!this.canvas || this.gesture || this.tool !== 'select') return;
    const single = this.selection.size === 1 ? this.board.get([...this.selection][0]) : undefined;
    const dot = single && !this.editingId ? this.dotAt(single, w) : null;
    if (dot !== this.hotDot) { this.hotDot = dot; this.requestRender(); }
    let cursor = '';
    if (dot) cursor = 'crosshair';
    else if (single && this.onHandle(single, w)) cursor = 'nwse-resize';
    else if (hitItem(this.board.list(), w, this.cam.z)) cursor = alt ? 'copy' : 'move';
    else if (hitLink(this.board.linkList(), (id) => this.board.get(id), w, this.cam.z)) cursor = 'pointer';
    this.canvas.style.cursor = cursor;
  }

  private sendCursor(w: Point): void {
    const now = performance.now();
    if (!this.presence || now - this.lastCursorSent < 40) return;
    this.lastCursorSent = now;
    this.presence.setCursor({ x: Math.round(w.x), y: Math.round(w.y) });
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const sp = this.local(e);
    const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey) this.zoomAt(sp.x, sp.y, Math.exp(-e.deltaY * 0.004));
    // Mouse wheel zooms linearly: every notch adds or takes the same 1.5 percentage points.
    else if (mouseWheel && !e.shiftKey) this.zoomAt(sp.x, sp.y, (this.cam.z - Math.sign(e.deltaY) * 0.015) / this.cam.z);
    else {
      const horiz = e.shiftKey && !e.deltaX;
      this.cam = { ...this.cam, x: this.cam.x - (horiz ? e.deltaY : e.deltaX), y: this.cam.y - (horiz ? 0 : e.deltaY) };
      this.camChanged();
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
      }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (this.selection.size) { e.preventDefault(); this.deleteSelection(); } return; }
    if (e.key === 'Escape') { this.setSelection([]); this.setTool('select'); window.dispatchEvent(new CustomEvent('planx:close-popovers')); return; }
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

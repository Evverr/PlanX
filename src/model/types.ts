export type ItemType = 'sticky' | 'text' | 'rect' | 'ellipse' | 'frame' | 'icon' | 'emoji' | 'ink' | 'image' | 'task' | 'table' | 'audio' | 'polygon' | 'mind';
export type PolyShape = 'triangle' | 'rhombus' | 'pentagon' | 'star' | 'hexagon' | 'parallelogram' | 'trapezoid' | 'arrow' | 'cross';

export interface Item {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Stacking order, higher is drawn on top. */
  z: number;
  text?: string;
  color?: string;
  /** Font size in board units. */
  fs?: number;
  /** Font weight; unset means the type's own (see baseWeight). */
  fw?: number;
  /** How the text looks: font (a key of FONTS in canvas/text.ts), italic, underline, strikethrough,
   *  text colour and highlight (keys of TEXT_COLORS and MARK_COLORS, or '#rrggbb'), alignment and list. */
  ff?: string;
  fi?: boolean;
  fu?: boolean;
  fx?: boolean;
  tc?: string;
  mk?: string;
  ta?: TextAlign;
  /** Text at the top of a sticker or shape instead of in its middle. */
  va?: 'top';
  ls?: ListKind;
  /** Icon id from src/icons/icons.json, icon items only. */
  icon?: string;
  /** Emoji id from src/emoji/emoji.ts (emoji-0 … emoji-80), emoji items only. */
  emoji?: string;
  /** Ink strokes: points as x0, y0, x1, y1… from the item's corner, laid out for width `iw`;
   *  a resized stroke is scaled by w / iw. `sw` is the line width, `hl` marks a highlighter. */
  pts?: number[];
  iw?: number;
  /** Picture or recording as a data URL, image and audio items only. */
  src?: string;
  /** Mind map nodes: the node this one branches from; the central topic has none (see model/mind.ts). */
  parent?: string;
  /** Which figure a polygon item is. */
  shape?: PolyShape;
  /** How round a rectangle's or a polygon's corners are, in board units (a rectangle without it: 8). */
  rad?: number;
  /** Outline colour of shapes and tasks: a key of STROKE_COLORS, '#rrggbb', or 'none' for no outline;
   *  unset is the usual grey (see strokeOf in the renderer). */
  sc?: string;
  /** Mind map nodes but central topics: their own fill (a key of FILLS or '#rrggbb'); unset is the usual. */
  fc?: string;
  /** Opacity of the fill and of the outline, 0…1; unset is solid. */
  fo?: number;
  so?: number;
  /** Turned clockwise about its centre by this many degrees (see ROTATABLE). */
  rot?: number;
  /** Audio notes: length in seconds and a coarse waveform, 0…1 per bar. */
  dur?: number;
  peaks?: number[];
  /** A task that has been ticked off. */
  done?: boolean;
  /** Tables: column widths, row heights and the cells' text row by row (see model/table.ts). */
  cols?: number[];
  rows?: number[];
  cells?: string[];
  /** Tables: each cell's own text formatting over the table's, row by row (see model/table.ts). */
  cellFmt?: Array<Partial<Record<string, unknown>> | null>;
  /** Frames: what was put in them and moves with them. Frames from before this have none and hold
   *  whatever lies inside. */
  members?: string[];
  /** Mind map nodes in a branch led down from the central topic (see model/mind.ts). */
  down?: boolean;
  /** Mind map nodes in a branch led up from the central topic. */
  up?: boolean;
  /** A mind map node with all that grows from it folded away (see model/mind.ts). */
  collapsed?: boolean;
  /** The ways a mind map's central topic has its branches folded away, each on its own. */
  foldedWays?: Array<'right' | 'left' | 'down' | 'up'>;
  /** A folded frame's unfolded size (see model/frame.ts). */
  fold?: { w: number; h: number };
  /** Components (see model/components.ts): a frame that's a component; a frame that's an instance of
   *  one (its id); an instance's copy of a component's item: what it's a copy of, the instance it's in,
   *  and the fields changed on it there, kept whatever the component does. */
  comp?: boolean;
  inst?: string;
  from?: string;
  host?: string;
  ovr?: string[];
  /** An instance stretched: how much wider and taller its contents are than its component's. */
  grow?: { w: number; h: number };
  /** A copy in an instance pushed down by this much from where its component has it, by text above it
   *  that grew there. */
  dy?: number;
  sw?: number;
  hl?: boolean;
  /** Locked in place: not moved, resized, typed in or deleted (src/labs, "Замок"). */
  lock?: boolean;
  /** Reactions: for each emoji id, who put it, by their browser's id (src/labs, "Реакции"). */
  rx?: Record<string, string[]>;
}

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type TextAlign = 'left' | 'center' | 'right';
export type ListKind = 'bullet' | 'number';

/** Font weight of text left as it was made: plain for text, heavier on stickers and shapes. */
export const baseWeight = (type: ItemType): number => (type === 'text' || type === 'table' ? 400 : type === 'sticky' ? 500 : 600);
/** Inset of the text in stickers and shapes; figures without square corners keep it further in. */
export const textPad = (it: Item): number =>
  it.type === 'sticky' ? 14 : it.type === 'rect' || it.type === 'task' ? 10 : it.type === 'table' ? 8 : it.type === 'mind' ? (it.parent ? 15 : 32)
    : it.type === 'ellipse' ? Math.min(it.w, it.h) * 0.15 + 6 : it.type === 'polygon' ? Math.min(it.w, it.h) * 0.22 + 6 : 0;
/** Room above and below the text: the same as to the sides, but for a central topic (15, not 32). */
export const textPadY = (it: Item): number => (it.type === 'mind' ? 15 : textPad(it));
export const alignOf = (it: Item): TextAlign => it.ta ?? (it.type === 'text' || it.type === 'table' || it.type === 'mind' ? 'left' : 'center');

/** Text colours; "ink" is the item's usual text colour. */
export const TEXT_COLORS: Record<string, string> = {
  ink: '',
  gray: '#8A8F98',
  red: '#E5484D',
  orange: '#E8892B',
  green: '#30A46C',
  blue: '#3E7BFA',
  purple: '#8E4EC6',
  pink: '#D6409F',
  black: '#1C1F26',
  white: '#FFFFFF',
};

/** Highlights behind the text, drawn at 45% so they work on any background. */
export const MARK_COLORS: Record<string, string> = {
  yellow: '#FFE135',
  green: '#5BD27A',
  blue: '#6EA8FE',
  pink: '#F17AC1',
  orange: '#F5A524',
  purple: '#B48CFF',
};

export interface Link {
  id: string;
  from: string;
  to: string;
  /** Sides the link is pinned to. Links drawn from the selection dots have them and are drawn as curves. */
  fromSide?: Side;
  toSide?: Side;
  /** How it runs: straight, in right angles, or (unset) in a smooth curve (see linkShape in canvas/geometry.ts). */
  style?: LinkStyle;
}

export type LinkStyle = 'straight' | 'elbow';

/** Fills for stickers and shapes, by name; an item's colour can also be any '#rrggbb' picked by hand. */
export const FILLS: Record<string, string> = {
  yellow: '#FFE27A',
  orange: '#FFBC78',
  pink: '#FFA8C8',
  purple: '#CDBBFF',
  blue: '#A6D4FF',
  green: '#B0E6A6',
  gray: '#E2E4E9',
  none: 'transparent',
};

/** Pen and highlighter colours; "ink" follows the theme's text colour. */
export const INK_COLORS: Record<string, string> = {
  ink: '',
  red: '#E5484D',
  orange: '#F5A524',
  yellow: '#FFE135',
  green: '#30A46C',
  blue: '#3E7BFA',
  purple: '#8E4EC6',
  pink: '#F17AC1',
};

/** Outline colours of shapes; "gray" is the usual outline (unset on the item), "ink" the theme's text colour. */
export const STROKE_COLORS: Record<string, string> = {
  gray: '',
  ink: '',
  red: '#E5484D',
  orange: '#F5A524',
  green: '#30A46C',
  blue: '#3E7BFA',
  purple: '#8E4EC6',
};

/** Icon colours; "ink" follows the theme's text colour. */
export const ICON_COLORS: Record<string, string> = {
  ink: '',
  red: '#D9483B',
  orange: '#E8892B',
  green: '#15A35F',
  blue: '#2F7DE1',
  purple: '#8C5BE0',
};

export const DEFAULTS: Record<ItemType, Partial<Item> & { w: number; h: number }> = {
  sticky: { w: 160, h: 160, color: 'yellow', fs: 16, text: '' },
  text: { w: 260, h: 26, fs: 20, text: '' },
  rect: { w: 180, h: 110, color: 'blue', fs: 16, text: '', ta: 'left', va: 'top' },
  ellipse: { w: 170, h: 110, color: 'green', fs: 16, text: '', ta: 'left', va: 'top' },
  frame: { w: 520, h: 380, text: 'Фрейм' },
  icon: { w: 64, h: 64, color: 'ink' },
  emoji: { w: 27, h: 27 },
  ink: { w: 1, h: 1 },
  image: { w: 200, h: 150 },
  task: { w: 180, h: 110, color: 'blue', fs: 16, text: '' },
  table: { w: 360, h: 120, fs: 14 },
  audio: { w: 300, h: 64 },
  polygon: { w: 160, h: 150, color: 'purple', fs: 16, text: '', ta: 'left', va: 'top' },
  mind: { w: 200, h: 56, fs: 18, text: '' },
};

export const COLORABLE: ItemType[] = ['sticky', 'rect', 'ellipse', 'polygon', 'task', 'mind'];
/** What has an outline whose colour can be set apart from the fill. */
export const STROKABLE: ItemType[] = ['rect', 'ellipse', 'polygon', 'task'];
export const HAS_FONT: ItemType[] = ['sticky', 'text', 'rect', 'ellipse', 'task', 'table', 'polygon', 'mind'];
/** What can be turned by its top right corner (a frame along with what it holds). Tables, mind map
 *  nodes and audio notes stay square to the board. */
export const ROTATABLE: ItemType[] = ['sticky', 'text', 'rect', 'ellipse', 'polygon', 'task', 'icon', 'emoji', 'image', 'ink', 'frame'];
export const EDITABLE: ItemType[] = ['sticky', 'text', 'rect', 'ellipse', 'frame', 'task', 'table', 'polygon', 'mind'];

export const uid = (): string =>
  Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

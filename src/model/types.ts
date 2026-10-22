export type ItemType = 'sticky' | 'text' | 'rect' | 'ellipse' | 'frame' | 'icon' | 'emoji' | 'ink';

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
  ls?: ListKind;
  /** Icon id from src/icons/icons.json, icon items only. */
  icon?: string;
  /** Emoji id from src/emoji/emoji.ts (emoji-0 … emoji-80), emoji items only. */
  emoji?: string;
  /** Ink strokes: points as x0, y0, x1, y1… from the item's corner, laid out for width `iw`;
   *  a resized stroke is scaled by w / iw. `sw` is the line width, `hl` marks a highlighter. */
  pts?: number[];
  iw?: number;
  sw?: number;
  hl?: boolean;
}

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type TextAlign = 'left' | 'center' | 'right';
export type ListKind = 'bullet' | 'number';

/** Font weight of text left as it was made: plain for text, heavier on stickers and shapes. */
export const baseWeight = (type: ItemType): number => (type === 'text' ? 400 : type === 'sticky' ? 500 : 600);
export const alignOf = (it: Item): TextAlign => it.ta ?? (it.type === 'text' ? 'left' : 'center');

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
}

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
  rect: { w: 180, h: 110, color: 'blue', fs: 16, text: '' },
  ellipse: { w: 170, h: 110, color: 'green', fs: 16, text: '' },
  frame: { w: 520, h: 380, text: 'Фрейм' },
  icon: { w: 64, h: 64, color: 'ink' },
  emoji: { w: 64, h: 64 },
  ink: { w: 1, h: 1 },
};

export const COLORABLE: ItemType[] = ['sticky', 'rect', 'ellipse'];
export const HAS_FONT: ItemType[] = ['sticky', 'text', 'rect', 'ellipse'];
export const EDITABLE: ItemType[] = ['sticky', 'text', 'rect', 'ellipse', 'frame'];

export const uid = (): string =>
  Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

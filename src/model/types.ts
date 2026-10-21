export type ItemType = 'sticky' | 'text' | 'rect' | 'ellipse' | 'frame' | 'icon';

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
  /** Font weight, text items only. */
  fw?: number;
  /** Icon id from src/icons/icons.json, icon items only. */
  icon?: string;
}

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Link {
  id: string;
  from: string;
  to: string;
  /** Sides the link is pinned to. Links drawn from the selection dots have them and are drawn as curves. */
  fromSide?: Side;
  toSide?: Side;
}

/** Fills for stickers and shapes. Stickers are paper, so they keep these colours in both themes. */
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
};

export const COLORABLE: ItemType[] = ['sticky', 'rect', 'ellipse'];
export const HAS_FONT: ItemType[] = ['sticky', 'text', 'rect', 'ellipse'];
export const EDITABLE: ItemType[] = ['sticky', 'text', 'rect', 'ellipse', 'frame'];

export const uid = (): string =>
  Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

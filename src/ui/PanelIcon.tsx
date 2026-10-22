// Icons for the Figma panels, exported as-is from the Figma file (Bitrix "Outline Icon Bold" set).
const ICON_URLS = import.meta.glob<string>('./panel-icons/*.svg', { eager: true, query: '?url', import: 'default' });

export type PanelIconName =
  | 'undo' | 'redo' | 'search' | 'comment' | 'bold' | 'italic' | 'underline' | 'strike' | 'color' | 'marker'
  | 'align' | 'list' | 'columns' | 'image' | 'link' | 'clear' | 'paint' | 'sup' | 'sub' | 'up' | 'drop'
  | 'cursor' | 'hand' | 'sticker' | 'text' | 'landscape' | 'circle-check' | 'maximize' | 'smile' | 'chevron-left'
  | 'moon' | 'sun' | 'zoom-in' | 'zoom-out' | 'screen' | 'question-l' | 'undo-on' | 'redo-on'
  | 'font-smaller' | 'font-bigger' | 'to-front' | 'to-back' | 'duplicate' | 'trashcan' | 'map' | 'pen' | 'highlighter' | 'eraser';

/** These come from the board icon set (assets/icons), drawn on a 24 grid; they're shown at 30 like the rest. */
const GRID24 = new Set<PanelIconName>(['list', 'moon', 'sun', 'zoom-in', 'zoom-out', 'screen', 'question-l', 'undo-on', 'redo-on',
  'font-smaller', 'font-bigger', 'to-front', 'to-back', 'duplicate', 'trashcan', 'map', 'pen', 'highlighter', 'eraser']);

export function PanelIcon({ name, className, style }: { name: PanelIconName; className?: string; style?: React.CSSProperties }) {
  const cls = ['pi', GRID24.has(name) ? 'grid24' : '', className ?? ''].filter(Boolean).join(' ');
  return <img src={ICON_URLS[`./panel-icons/${name}.svg`]} className={cls} style={style} alt="" draggable={false} />;
}

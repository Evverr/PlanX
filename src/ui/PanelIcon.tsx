// Icons for the Figma panels, exported as-is from the Figma file (Bitrix "Outline Icon Bold" set).
const ICON_URLS = import.meta.glob<string>('./panel-icons/*.svg', { eager: true, query: '?url', import: 'default' });

export type PanelIconName =
  | 'undo' | 'redo' | 'search' | 'comment' | 'message' | 'text-off' | 'arrow-left' | 'arrow-right' | 'bold' | 'italic' | 'underline' | 'strike' | 'color' | 'marker'
  | 'align' | 'list' | 'columns' | 'image' | 'link' | 'clear' | 'paint' | 'sup' | 'sub' | 'up' | 'drop'
  | 'cursor' | 'ai-two-stars' | 'landscape-solid' | 'star-solid' | 'hand' | 'sticker' | 'text' | 'landscape' | 'circle-check' | 'maximize' | 'smile' | 'chevron-left'
  | 'moon' | 'sun' | 'zoom-in' | 'zoom-out' | 'screen' | 'question-l' | 'undo-on' | 'redo-on'
  | 'to-front' | 'to-back' | 'duplicate' | 'trashcan' | 'location' | 'crop' | 'pen' | 'highlighter' | 'eraser'
  | 'align-left' | 'align-center' | 'align-right' | 'bulleted-list' | 'numbered-list' | 'question' | 'ellipse' | 'frame' | 'microphone' | 'triangle' | 'rhombus' | 'pentagon' | 'star' | 'plus' | 'cross' | 'plus-s' | 'minus-s' | 'branch' | 'more' | 'palette' | 'node-pool' | 'more-vertical' | 'chevron-down' | 'burger'
  | 'download' | 'file' | 'apps' | 'hexagon' | 'parallelogram' | 'trapezoid' | 'arrow' | 'shape-cross' | 'settings' | 'component' | 'component-off' | 'line-straight' | 'line-elbow' | 'line-curve' | 'timer' | 'magic-wand' | 'meeting-point' | 'keyboard' | 'lock-l' | 'unlock-l' | 'like' | 'heart' | 'timeline' | 'package' | 'pen-nib' | 'cloud-download' | 'path' | 'align-items-left' | 'align-items-center' | 'align-items-right' | 'align-items-top' | 'align-items-middle' | 'align-items-bottom' | 'layers' | 'clock' | 'code' | 'collapse-m' | 'expand-m' | 'check-m'
  | 'sticker-solid' | 'circle-check-solid' | 'columns-solid' | 'package-solid' | 'pen-nib-solid' | 'image-solid' | 'smile-solid' | 'path-solid' | 'branch-solid' | 'comment-solid';

/** These come from the board icon set (assets/icons), drawn on a 24 grid; they're shown at 30 like the rest. */
const GRID24 = new Set<PanelIconName>(['list', 'moon', 'sun', 'zoom-in', 'zoom-out', 'screen', 'question-l', 'undo-on', 'redo-on',
  'to-front', 'to-back', 'duplicate', 'trashcan', 'location', 'crop', 'pen', 'highlighter', 'eraser',
  'align-left', 'align-center', 'align-right', 'bulleted-list', 'numbered-list', 'question', 'ellipse', 'frame', 'microphone', 'triangle', 'rhombus', 'pentagon', 'star', 'plus', 'cross', 'plus-s', 'minus-s', 'branch', 'more', 'palette', 'node-pool', 'more-vertical', 'chevron-down', 'burger',
  'download', 'file', 'apps', 'hexagon', 'parallelogram', 'trapezoid', 'arrow', 'shape-cross', 'settings', 'component', 'component-off', 'line-straight', 'line-elbow', 'line-curve', 'timer', 'magic-wand', 'meeting-point', 'keyboard', 'lock-l', 'unlock-l', 'like', 'heart', 'timeline', 'package', 'pen-nib', 'cloud-download', 'path',
  'align-items-left', 'align-items-center', 'align-items-right', 'align-items-top', 'align-items-middle', 'align-items-bottom', 'layers', 'clock', 'code', 'collapse-m', 'expand-m', 'check-m',
  'cursor', 'ai-two-stars', 'landscape', 'landscape-solid', 'star-solid', 'sticker-solid', 'circle-check-solid', 'columns-solid', 'package-solid', 'pen-nib-solid', 'image-solid', 'smile-solid', 'path-solid', 'branch-solid', 'comment-solid', 'message', 'text-off', 'arrow-left', 'arrow-right']);

/** The icon is a mask over a plain fill, so CSS picks its colour: the panel's ink, blue when pressed. */
export function PanelIcon({ name, className, style }: { name: PanelIconName; className?: string; style?: React.CSSProperties }) {
  const cls = ['pi', GRID24.has(name) ? 'grid24' : '', className ?? ''].filter(Boolean).join(' ');
  const mask = `url("${ICON_URLS[`./panel-icons/${name}.svg`]}")`;
  return <i className={cls} style={{ WebkitMaskImage: mask, maskImage: mask, ...style }} aria-hidden="true" />;
}

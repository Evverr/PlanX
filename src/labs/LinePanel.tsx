import type { Editor, Tool } from '../editor/editor';
import type { LinkStyle } from '../model/types';
import { PanelIcon, type PanelIconName } from '../ui/PanelIcon';

const STYLES: Array<[LinkStyle | undefined, PanelIconName, string]> = [
  [undefined, 'line-curve', 'Плавная линия'], ['elbow', 'line-elbow', 'Линия с прямыми углами'], ['straight', 'line-straight', 'Прямая линия'],
];

/**
 * "Линии" (src/labs): the line tool's ways a line runs, beside the rail, opened by holding its button.
 * Picking one takes the tool with it: a line from any item to any other, dragged from one to the other.
 */
export function LinePanel({ editor, tool, onPick }: { editor: Editor; tool: Tool; onPick: () => void }) {
  return (
    <div className="draw-panel line-panel" role="toolbar" aria-label="Линии">
      {STYLES.map(([style, icon, label]) => (
        <button key={icon} className={`fb ${tool === 'link' && editor.linkStyle === style ? 'on' : ''}`} title={label} aria-label={label}
          onClick={() => { editor.setLinkStyle(style); editor.setTool('link'); onPick(); }}>
          <PanelIcon name={icon} />
        </button>
      ))}
    </div>
  );
}

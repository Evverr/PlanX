import type { Editor, Tool } from '../editor/editor';
import { Glyph, Stroke, type StrokeName } from './glyphs';

const TOOLS: Array<[Tool, string] | 'sep'> = [
  ['select', 'Выбор (V)'],
  ['hand', 'Рука (H)'],
  'sep',
  ['sticky', 'Стикер (N)'],
  ['text', 'Текст (T)'],
  ['rect', 'Прямоугольник (R)'],
  ['ellipse', 'Эллипс (O)'],
  ['link', 'Стрелка (C)'],
  ['frame', 'Фрейм (F)'],
];

export function Toolbar({ editor, tool, iconsOpen, onToggleIcons }: {
  editor: Editor; tool: Tool; iconsOpen: boolean; onToggleIcons: () => void;
}) {
  return (
    <nav className="bar tools" aria-label="Инструменты">
      {TOOLS.map((t, i) =>
        t === 'sep' ? <div key={i} className="sep" /> : (
          <button key={t[0]} className={`ib ${tool === t[0] ? 'on' : ''}`} title={t[1]} aria-label={t[1]}
            aria-pressed={tool === t[0]} onClick={() => editor.setTool(t[0])}>
            <Stroke name={t[0] as StrokeName} />
          </button>
        ))}
      <button className={`ib ${iconsOpen ? 'on' : ''}`} title="Иконки (I)" aria-label="Иконки" aria-expanded={iconsOpen} onClick={onToggleIcons}>
        <Glyph id="smile" className="glyph" />
      </button>
    </nav>
  );
}

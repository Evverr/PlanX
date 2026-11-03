import { useEffect, useReducer, useState } from 'react';
import type { Editor } from '../editor/editor';
import { PanelIcon } from '../ui/PanelIcon';
import { addLayer, BASE, deleteLayer, layerCounts, layersOf, moveToLayer, pickLayer, renameLayer, setLayerShown, useLayersMine } from './layers';

/** "Слои" (src/labs): each layer with its tick (shown or hidden, for oneself), its name (a double click
 *  renames it) and how many items it holds; a click picks it for new items, "Сюда" puts the picked ones
 *  in it, the bin (on hover, not the first) takes it away with all it holds, asked first. */
export function LayersPop({ editor }: { editor: Editor }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const mine = useLayersMine();
  const [renaming, setRenaming] = useState<string | null>(null);
  useEffect(() => {
    const layers = editor.board.doc.getMap('layers');
    layers.observe(redraw);
    const offs = [editor.board.subscribe(redraw), editor.subscribeUI(redraw)];
    return () => { layers.unobserve(redraw); offs.forEach((off) => off()); };
  }, [editor]);
  const layers = layersOf(editor.board), counts = layerCounts(editor.board), picked = editor.selection.size > 0;
  const active = layers.some((l) => l.id === mine.active) ? mine.active : layers[0].id;
  return (
    <div className="pop labs-pop layers-pop" role="dialog" aria-label="Слои">
      <h3>Слои</h3>
      <div className="layers-list">
        {layers.map((l) => (
          <div key={l.id} className={`layer-row ${l.id === active ? 'on' : ''}`} onClick={() => pickLayer(l.id)}>
            <input type="checkbox" checked={!mine.hidden.includes(l.id)} aria-label={`Показывать «${l.name}»`}
              onClick={(e) => e.stopPropagation()} onChange={(e) => setLayerShown(editor, l.id, e.target.checked)} />
            {renaming === l.id
              ? <input className="layer-name" autoFocus defaultValue={l.name} aria-label="Название слоя" onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => { renameLayer(editor.board, l.id, e.target.value); setRenaming(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); e.stopPropagation(); }} />
              : <span className="layer-name" onDoubleClick={() => setRenaming(l.id)}>{l.name}</span>}
            <i>{counts.get(l.id) ?? 0}</i>
            {l.id !== BASE && (
              <button className="layer-delete" title="Удалить слой" aria-label={`Удалить «${l.name}»`}
                onClick={(e) => {
                  e.stopPropagation();
                  const n = counts.get(l.id) ?? 0;
                  if (!n) { deleteLayer(editor, l.id); return; }
                  window.dispatchEvent(new CustomEvent('planx:confirm', { detail: { text: `Удалить «${l.name}» и всё, что в нём (${n}), у всех участников? Отменить можно через Ctrl+Z`, action: 'Удалить', ok: () => deleteLayer(editor, l.id) } }));
                }}>
                <PanelIcon name="trashcan" />
              </button>
            )}
            {picked && <button className="layer-here" title="Перенести выделенное в этот слой" onClick={(e) => { e.stopPropagation(); moveToLayer(editor, l.id); }}>Сюда</button>}
          </div>
        ))}
      </div>
      <button className="btn layers-add" onClick={() => pickLayer(addLayer(editor.board))}>+ Новый слой</button>
    </div>
  );
}

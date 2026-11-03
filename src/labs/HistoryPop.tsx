import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor';
import { PanelIcon } from '../ui/PanelIcon';
import { addPoint, autoPoints, goBackTo, listPoints, removePoint, setAutoPoints, subscribeAuto, type Point } from './history';

const KIND: Record<Point['kind'], string> = { manual: 'вручную', auto: 'автоматически', before: 'перед откатом' };

/** When a point was: today by the second (points set a moment apart stand apart), before that with its date. */
function when(t: number): string {
  const d = new Date(t), time = d.toLocaleTimeString('ru-RU');
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
}

/** "История" (src/labs): how the board's points are made, by hand or by themselves, and those it has: a board goes
 *  back to one (asked first), the bin takes one off. */
export function HistoryPop({ editor, onToast }: { editor: Editor; onToast: (text: string) => void }) {
  const board = editor.board;
  const auto = useSyncExternalStore(useCallback((fn: () => void) => subscribeAuto(board, fn), [board]), () => autoPoints(board));
  const [points, setPoints] = useState<Point[] | null>(null);
  const [failed, setFailed] = useState(false);
  /** Does it, then shows the points as they are; no server, it says so. */
  const run = useCallback(async (fn?: () => Promise<unknown>) => {
    try {
      await fn?.();
      setPoints(await listPoints());
      setFailed(false);
    } catch { setFailed(true); }
  }, []);
  useEffect(() => { void run(); }, [run, auto]);
  const back = (p: Point) => window.dispatchEvent(new CustomEvent('planx:confirm', { detail: {
    text: `Вернуть доску к ${when(p.t)} у всех участников? Сегодняшнее состояние сохранится точкой, и отменить можно через Ctrl+Z`, action: 'Откатиться',
    ok: () => { void run(() => goBackTo(editor, p.id)).then(() => onToast(`Доска возвращена к ${when(p.t)}`)); },
  } }));
  return (
    <div className="pop labs-pop history-pop" role="dialog" aria-label="История">
      <h3>История</h3>
      <div className="labs-seg" role="group" aria-label="Как ставятся точки">
        <button className={auto ? 'on' : ''} aria-pressed={auto} onClick={() => setAutoPoints(board, true)}>Автоматически</button>
        <button className={!auto ? 'on' : ''} aria-pressed={!auto} onClick={() => setAutoPoints(board, false)}>Вручную</button>
      </div>
      {auto
        ? <p className="muted">Точка раз в 30 минут, если доска менялась, и когда все с неё ушли.</p>
        : <button className="btn history-add" onClick={() => void run(() => addPoint())}>Поставить точку</button>}
      {failed && <p className="muted history-failed">Нет связи с сервером, попробуйте ещё раз.</p>}
      <div className="history-list">
        {points?.length === 0 && <p className="muted">Точек пока нет.</p>}
        {points?.map((p) => (
          <div key={p.id} className="history-row">
            <span><b>{when(p.t)}</b><i>{KIND[p.kind]}</i></span>
            <button className="history-delete" title="Удалить точку" aria-label={`Удалить точку ${when(p.t)}`} onClick={() => void run(() => removePoint(p.id))}><PanelIcon name="trashcan" /></button>
            <button className="layer-here" onClick={() => back(p)}>Откатиться</button>
          </div>
        ))}
      </div>
    </div>
  );
}

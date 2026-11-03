import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor';
import type { Board } from '../model/board';
import { PanelIcon } from '../ui/PanelIcon';
import { addPoint, autoPoints, endLook, goBackTo, listPoints, lookAt, removePoint, setAutoPoints, subscribeAuto, useLooked, type Point } from './history';

const KIND: Record<Point['kind'], string> = { manual: 'вручную', auto: 'автоматически', before: 'перед откатом' };

/** When a point was: today by the second (points set a moment apart stand apart), before that with its date. */
function when(t: number): string {
  const d = new Date(t), time = d.toLocaleTimeString('ru-RU');
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
}

/** Asks, then the board goes back to the point; says so. */
function askGoBack(editor: Editor, p: Point, onToast: (text: string) => void, onFail: () => void): void {
  window.dispatchEvent(new CustomEvent('planx:confirm', { detail: {
    text: `Вернуть доску к ${when(p.t)} у всех участников? Сегодняшнее состояние сохранится точкой, и отменить можно через Ctrl+Z`, action: 'Откатиться',
    ok: () => { goBackTo(editor, p.id).then(() => onToast(`Доска возвращена к ${when(p.t)}`), onFail); },
  } }));
}

/** While a point's on the canvas: which, that it only shows, and the ways out. Esc too. */
export function HistoryLookBar({ editor, onToast }: { editor: Editor; onToast: (text: string) => void }) {
  const point = useLooked();
  useEffect(() => {
    if (!point) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.confirm')) { e.stopPropagation(); endLook(editor); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [point, editor]);
  if (!point) return null;
  return (
    <div className="labs-pill history-pill" role="status">
      <span>Как было: <b>{when(point.t)}</b>. Только просмотр</span>
      <button className="btn" onClick={() => askGoBack(editor, point, onToast, () => onToast('Нет связи с сервером, попробуйте ещё раз'))}>Откатиться</button>
      <button className="btn primary" onClick={() => endLook(editor)}>Вернуться к доске</button>
    </div>
  );
}

/** "История" (src/labs): how the board's points are made, by hand or by themselves, and those it has: a press on one's
 *  time puts the board as it was then on the canvas (again, takes it off), a board goes back to one (asked first), the
 *  bin takes one off. */
export function HistoryPop({ editor, board, onToast }: { editor: Editor; board: Board; onToast: (text: string) => void }) {
  const auto = useSyncExternalStore(useCallback((fn: () => void) => subscribeAuto(board, fn), [board]), () => autoPoints(board));
  const looked = useLooked();
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
  // (Gone back to one, there's another now, of what the board was.)
  useEffect(() => { void run(); }, [run, auto, looked]);
  const look = (p: Point) => void run(async () => { if (looked?.id === p.id) endLook(editor); else await lookAt(editor, p); });
  const remove = (p: Point) => void run(async () => { if (looked?.id === p.id) endLook(editor); await removePoint(p.id); });
  return (
    <div className="pop labs-pop history-pop" role="dialog" aria-label="История">
      <h3>История</h3>
      <div className="labs-seg" role="group" aria-label="Как ставятся точки">
        <button className={auto ? 'on' : ''} aria-pressed={auto} onClick={() => setAutoPoints(board, true)}>Автоматически</button>
        <button className={!auto ? 'on' : ''} aria-pressed={!auto} onClick={() => setAutoPoints(board, false)}>Вручную</button>
      </div>
      {auto
        ? <p className="muted">Точка раз в 30 минут, если доска менялась, и когда все с неё ушли.</p>
        : <button className="btn history-add" disabled={!!looked} onClick={() => void run(() => addPoint())}>Поставить точку</button>}
      {failed && <p className="muted history-failed">Нет связи с сервером, попробуйте ещё раз.</p>}
      <div className="history-list">
        {points?.length === 0 && <p className="muted">Точек пока нет.</p>}
        {points?.map((p) => (
          <div key={p.id} className={`history-row ${looked?.id === p.id ? 'on' : ''}`}>
            <button className="history-when" title="Посмотреть, что было" aria-pressed={looked?.id === p.id} onClick={() => look(p)}><b>{when(p.t)}</b><i>{KIND[p.kind]}</i></button>
            <button className="history-delete" title="Удалить точку" aria-label={`Удалить точку ${when(p.t)}`} onClick={() => remove(p)}><PanelIcon name="trashcan" /></button>
            <button className="layer-here" onClick={() => askGoBack(editor, p, onToast, () => setFailed(true))}>Откатиться</button>
          </div>
        ))}
      </div>
    </div>
  );
}

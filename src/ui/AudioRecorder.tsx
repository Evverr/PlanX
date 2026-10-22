import { useEffect, useReducer, useRef, useState } from 'react';
import { clock, MAX_SECONDS, startRecording, type AudioNote, type Recording } from '../canvas/audio';
import { PanelIcon } from './PanelIcon';

type State =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'recording'; rec: Recording; since: number }
  | { kind: 'saving' }
  | { kind: 'recorded'; note: AudioNote }
  | { kind: 'error'; message: string };

/** Bars in the live loudness meter. */
const METER = 32;

/**
 * Records an audio note next to the tool rail: start, watch the meter and the clock, stop (or hit
 * the three-minute limit), listen back, then put it on the board or record again. Closing the
 * panel throws away a recording in progress.
 */
export function AudioRecorder({ onAdd, onClose }: { onAdd: (note: AudioNote) => void; onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const levels = useRef<number[]>(Array(METER).fill(0));
  const live = useRef(state);
  live.current = state;

  useEffect(() => () => { if (live.current.kind === 'recording') live.current.rec.cancel(); }, []);

  const start = async () => {
    setState({ kind: 'starting' });
    try {
      const rec = await startRecording();
      levels.current = Array(METER).fill(0);
      setState({ kind: 'recording', rec, since: performance.now() });
    } catch {
      setState({ kind: 'error', message: 'Нет доступа к микрофону. Разрешите его в настройках браузера и попробуйте снова.' });
    }
  };
  const stop = async () => {
    const s = live.current;
    if (s.kind !== 'recording') return;
    setState({ kind: 'saving' });
    try {
      setState({ kind: 'recorded', note: await s.rec.stop() });
    } catch {
      setState({ kind: 'error', message: 'Не получилось сохранить запись.' });
    }
  };

  // While recording, the meter and the clock move every frame; the limit stops it.
  useEffect(() => {
    if (state.kind !== 'recording') return;
    let raf = 0;
    const loop = () => {
      levels.current = [...levels.current.slice(1), state.rec.level()];
      if ((performance.now() - state.since) / 1000 >= MAX_SECONDS) { void stop(); return; }
      redraw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsed = state.kind === 'recording' ? (performance.now() - state.since) / 1000 : 0;
  return (
    <div className="pop recorder" role="dialog" aria-label="Аудиозаметка">
      <div className="recorder-head">
        <h3>Аудиозаметка</h3>
        <button className="ib" aria-label="Закрыть" title="Закрыть" onClick={onClose}>×</button>
      </div>
      {(state.kind === 'idle' || state.kind === 'starting') && (
        <>
          <button className="rec-btn" aria-label="Начать запись" disabled={state.kind === 'starting'} onClick={() => void start()}>
            <PanelIcon name="microphone" />
          </button>
          <p className="muted">Нажмите, чтобы начать запись. До {MAX_SECONDS / 60} минут.</p>
        </>
      )}
      {(state.kind === 'recording' || state.kind === 'saving') && (
        <>
          <div className="rec-meter" aria-hidden="true">
            {levels.current.map((l, i) => <i key={i} style={{ height: `${Math.max(6, l * 100)}%` }} />)}
          </div>
          <div className="rec-clock">{clock(elapsed)} <span className="muted">/ {clock(MAX_SECONDS)}</span></div>
          <button className="rec-btn on" aria-label="Остановить запись" disabled={state.kind === 'saving'} onClick={() => void stop()}>
            <i className="rec-stop" />
          </button>
        </>
      )}
      {state.kind === 'recorded' && (
        <>
          <audio className="rec-preview" src={state.note.src} controls />
          <div className="row">
            <button className="btn" onClick={() => void start()}>Записать заново</button>
            <button className="btn blue" onClick={() => onAdd(state.note)}>Добавить на доску</button>
          </div>
        </>
      )}
      {state.kind === 'error' && (
        <>
          <p>{state.message}</p>
          <div className="row"><button className="btn" onClick={() => void start()}>Попробовать снова</button></div>
        </>
      )}
    </div>
  );
}

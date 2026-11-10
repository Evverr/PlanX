import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Connection } from '../collab/connection';
import { PanelIcon } from '../ui/PanelIcon';
import { Call } from './call';

/** One call per board connection (see call.ts). */
const calls = new WeakMap<Connection, Call>();
const callOf = (conn: Connection): Call => {
  let c = calls.get(conn);
  if (!c) calls.set(conn, (c = new Call(conn)));
  return c;
};

/**
 * «Аудиозвонок» (src/labs): the button on the right panel. Pressed, into the call (or, it being full, its
 * popup, to ask in); in it, the popup by it: who's in it (lit as they speak), the microphone, leaving.
 * It opens by itself for someone asking in, and for a word to me.
 */
export function CallButton({ conn }: { conn: Connection }) {
  const call = callOf(conn);
  useSyncExternalStore(call.subscribe, () => call.version);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
  const members = call.members(), on = !!call.state.on, askers = call.askers(), count = members.length + (on ? 1 : 0);
  const shown = open || askers.length > 0 || !!call.notice;

  // Off the board (another one opened), out of its call.
  useEffect(() => () => { if (call.state.on) call.leave(); }, [call]);

  // A press elsewhere closes it (not while someone's asking in).
  useEffect(() => {
    if (!shown) return;
    const away = (e: PointerEvent) => {
      if (pop.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return;
      if (!askers.length) { setOpen(false); call.readNotice(); }
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); call.readNotice(); } };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc); };
  }, [shown, askers.length, call]);

  // Who's speaking: read some 10 times a second while it's open.
  const [levels, setLevels] = useState<Map<number | 'me', number>>(new Map());
  useEffect(() => {
    if (!shown || !on) return;
    const t = window.setInterval(() => setLevels(call.levels()), 100);
    return () => clearInterval(t);
  }, [shown, on, call]);

  // By the button: over it (the panel at the bottom) or under it, its middle at the button's, on the screen.
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  useEffect(() => {
    if (!shown) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const w = pop.current?.offsetWidth ?? 260, left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
      setAt(r.top > innerHeight / 2 ? { left, bottom: innerHeight - r.top + 10 } : { left, top: r.bottom + 10 });
    };
    place();
    const t = window.setInterval(place, 300);
    return () => clearInterval(t);
  }, [shown]);

  const press = () => {
    if (on) { setOpen(!open); return; }
    if (call.full()) { setOpen(true); return; }
    setOpen(true);
    void call.join();
  };
  const speaking = (id: number | 'me') => (levels.get(id) ?? 0) > 0.08;

  return (
    <>
      <button ref={btn} className={`ib call-btn ${on ? 'on solid-on' : ''}`} title={on ? 'Звонок' : count ? `Присоединиться к звонку (в нём ${count})` : 'Начать звонок'}
        aria-label="Звонок" aria-pressed={on} onClick={press}>
        <PanelIcon name="phone-up" />
        {count > 0 && <span className="call-count">{count}</span>}
      </button>
      {shown && createPortal(
        <div ref={pop} className={`pop call-pop ${at?.bottom !== undefined ? 'above' : ''}`} role="dialog" aria-label="Звонок"
          style={at ? { left: at.left, top: at.top, bottom: at.bottom } : { visibility: 'hidden' }}>
          {call.notice && <p className="call-notice">{call.notice}</p>}
          {on && (
            <ul className="call-people">
              <li className={speaking('me') ? 'speaking' : ''}><i style={{ background: conn.me.color }} />{conn.me.name} <span className="call-you">(вы)</span>
                {call.state.muted && <PanelIcon name="microphone-off" className="call-muted" />}</li>
              {members.map((m) => (
                <li key={m.id} className={`${speaking(m.id) ? 'speaking' : ''} ${call.connected(m.id) ? '' : 'joining'}`}>
                  <i style={{ background: m.color }} />{m.name}
                  {m.muted && <PanelIcon name="microphone-off" className="call-muted" />}
                </li>
              ))}
            </ul>
          )}
          {askers.map((m) => (
            <div key={m.id} className="call-ask">
              <p><b>{m.name}</b> хочет присоединиться</p>
              <div className="row">
                <button className="btn" onClick={() => call.refuse(m.id)}>Не сейчас</button>
                <button className="btn primary" onClick={() => call.admit(m.id)}>Пустить</button>
              </div>
            </div>
          ))}
          {on ? (
            <div className="row">
              <button className="btn" onClick={() => call.toggleMute()}>{call.state.muted ? 'Включить микрофон' : 'Выключить микрофон'}</button>
              <button className="btn primary call-leave" onClick={() => { call.leave(); setOpen(false); }}>Выйти</button>
            </div>
          ) : call.full() && (
            <>
              <p>В звонке уже {members.length} {members.length < 5 ? 'человека' : 'человек'}</p>
              <div className="row">
                {call.isAsking()
                  ? <><span className="call-wait">Ждём ответа…</span><button className="btn" onClick={() => call.stopAsking()}>Отменить</button></>
                  : <button className="btn primary" onClick={() => call.ask()}>Попроситься</button>}
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

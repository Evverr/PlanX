import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import type { Connection } from '../collab/connection';
import { boxOf } from '../canvas/geometry';
import { Glyph } from '../ui/glyphs';
import { labOn, subscribeLabs, useLabs } from './labs';
import { LabsRail, type RailButton } from './LabsRail';
import { drawLabs, laser, LASER_FADE, pillAt, toggleReaction } from './overlays';
import { LabsPresence, useFollowing } from './presence';
import { cameraFor, flyTo, stopFlight } from './camera';
import { downloadPicture, pictureSize, renderPicture, type Background, type ExportOptions } from './exportPng';
import { findOnBoard, snippet, type Found } from './search';
import { addMinute, chime, clockText, leftOf, pauseTimer, resumeTimer, startTimer, stopTimer, useTimer } from './timer';
import './labs.css';

type LabPop = 'export' | 'search' | 'timer' | 'keys';

/** Popups that close on a press anywhere but in them (the cheat sheet has its own backdrop). */
const AWAY = '.labs-pop, .labs-rail, .labs-more';

/**
 * The features on trial that live outside the board's own panels: a rail of their buttons at the
 * right edge, their popups, the timer and "following" at the top, and what they do with the
 * pointer and keys. Each shows only while it's switched on in the board menu.
 */
export function Labs({ editor, conn, docked }: { editor: Editor; conn: Connection; docked: boolean }) {
  const labs = useLabs();
  const [pop, setPop] = useState<LabPop | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [laserOn, setLaserOn] = useState(false);
  const presence = useMemo(() => new LabsPresence(editor, conn, setToast), [editor, conn]);
  useEffect(() => () => presence.destroy(), [presence]);
  const following = useFollowing();
  const laserRef = useRef(false);
  laserRef.current = laserOn && labs.laser;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Their drawing over the board, redrawn whenever one is switched on or off (the editor asks about
  // locks as it goes, so its handles change too).
  useEffect(() => {
    const draw = (ctx: CanvasRenderingContext2D) => drawLabs(ctx, editor);
    editor.overlays.add(draw);
    editor.requestRender();
    const off = subscribeLabs(() => { editor.emit(); editor.requestRender(); });
    return () => { editor.overlays.delete(draw); off(); };
  }, [editor]);

  // A feature switched off takes what it had open with it.
  useEffect(() => {
    if (!labs.laser) setLaserOn(false);
    if (!labs.follow) presence.stopFollowing();
    if (pop && !labs[pop]) setPop(null);
  }, [labs, pop, presence]);

  useEffect(() => { editor.canvas?.classList.toggle('laser', laserOn && labs.laser); }, [editor, laserOn, labs.laser]);

  // Keys: Ctrl+F looks for text, ? opens the cheat sheet, K takes the laser, Esc puts all that away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF' && labOn('search')) { e.preventDefault(); setPop('search'); return; }
      if (typing) return;
      if (e.key === '?' && labOn('keys')) { e.preventDefault(); setPop((p) => (p === 'keys' ? null : 'keys')); return; }
      if (e.code === 'KeyK' && !e.ctrlKey && !e.metaKey && !e.altKey && labOn('laser')) { setLaserOn((v) => !v); return; }
      if (e.key === 'Escape') { setLaserOn(false); presence.stopFollowing(); setPop(null); }
    };
    const close = () => setPop(null);
    const follow = (e: Event) => presence.follow((e as CustomEvent<number>).detail);
    window.addEventListener('keydown', onKey);
    window.addEventListener('planx:close-popovers', close);
    window.addEventListener('planx:follow', follow);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('planx:close-popovers', close);
      window.removeEventListener('planx:follow', follow);
    };
  }, [presence]);

  // The pointer on the board: a press on a reaction under an item flips yours; with the laser, a
  // press draws its trail instead of doing what it would. Taking the board yourself stops following.
  useEffect(() => {
    let drawing = false;
    const canvas = () => editor.canvas;
    const local = (e: PointerEvent) => { const r = canvas()!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const addPoint = (e: PointerEvent) => {
      const p = local(e), now = performance.now();
      laser.mine = [...laser.mine.filter((q) => now - q.t < LASER_FADE), { ...editor.toWorld(p.x, p.y), t: now }];
      editor.requestRender();
      presence.shareLaser();
    };
    const onDown = (e: PointerEvent) => {
      if (e.target !== canvas()) {
        if (!(e.target as Element | null)?.closest?.(AWAY)) setPop((p) => (p === 'keys' ? p : null));
        return;
      }
      setPop(null);
      if (presence.followingId !== null) { presence.stopFollowing(); stopFlight(); }
      const pill = e.button === 0 && labOn('reactions') ? pillAt(local(e)) : undefined;
      if (pill) {
        e.stopPropagation();
        toggleReaction(editor, [pill.id], pill.emoji);
        return;
      }
      if (laserRef.current && e.button === 0) {
        e.stopPropagation();
        drawing = true;
        canvas()!.setPointerCapture(e.pointerId);
        addPoint(e);
      }
    };
    const onMove = (e: PointerEvent) => { if (drawing) addPoint(e); };
    const onUp = () => { if (drawing) { drawing = false; presence.shareLaser(); } };
    const onWheel = (e: WheelEvent) => { if (e.target === canvas() && presence.followingId !== null) { presence.stopFollowing(); stopFlight(); } };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('wheel', onWheel, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('wheel', onWheel, true);
    };
  }, [editor, presence]);

  const toggle = (p: LabPop) => setPop((cur) => (cur === p ? null : p));
  const summon = () => setToast(presence.summon() ? 'Все участники перенесены к вам' : 'На доске пока никого нет. Откройте ссылку на доску во втором окне');
  const all: Record<'export' | 'search' | 'timer' | 'laser' | 'follow' | 'keys', RailButton> = {
    export: { icon: 'download', title: 'Экспорт в PNG', on: pop === 'export', onClick: () => toggle('export') },
    search: { icon: 'search', title: 'Поиск по доске (Ctrl+F)', on: pop === 'search', onClick: () => toggle('search') },
    timer: { icon: 'timer', title: 'Общий таймер', on: pop === 'timer', onClick: () => toggle('timer') },
    laser: { icon: 'magic-wand', title: 'Лазерная указка (K)', on: laserOn, onClick: () => setLaserOn(!laserOn) },
    follow: { icon: 'meeting-point', title: 'Позвать всех ко мне', onClick: summon },
    keys: { icon: 'keyboard', title: 'Шпаргалка по клавишам (?)', on: pop === 'keys', onClick: () => toggle('keys') },
  };
  const buttons = Object.fromEntries(Object.entries(all).filter(([id]) => labs[id as keyof typeof all]));

  return (
    <>
      <LabsRail buttons={buttons} docked={docked} />
      {pop === 'export' && <ExportPop editor={editor} onCancel={() => setPop(null)} onDone={(ok) => { setPop(null); setToast(ok ? 'Картинка сохранена' : 'На доске пока пусто'); }} />}
      {pop === 'search' && <SearchPop editor={editor} />}
      {pop === 'timer' && <TimerPop onStart={(min) => { startTimer(editor.board.doc, min * 60000, conn.me.name); setPop(null); }} />}
      {pop === 'keys' && <KeysSheet onClose={() => setPop(null)} />}
      <div className="labs-top">
        {labs.timer && <TimerPill editor={editor} />}
        {following && labs.follow && (
          <div className="labs-pill follow-pill" style={{ borderColor: following.color }}>
            <span className="follow-dot" style={{ background: following.color }} />
            <span>Вы смотрите за: <b>{following.name}</b></span>
            <button className="btn" onClick={() => presence.stopFollowing()}>Хватит</button>
          </div>
        )}
      </div>
      {following && labs.follow && <div className="labs-follow-frame" style={{ borderColor: following.color }} />}
      {laserOn && labs.laser && <div className="labs-pill laser-pill" role="status">Лазерная указка: тяните по доске. <b>K</b> или <b>Esc</b>, чтобы выйти</div>}
      {toast && <div className="pop toast labs-toast" role="status">{toast}</div>}
    </>
  );
}

/** A row of choices, one of them picked. */
function Choice<T extends string | number>({ value, options, onPick }: { value: T; options: Array<[T, string]>; onPick: (v: T) => void }) {
  return (
    <div className="labs-seg" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={String(v)} role="radio" aria-checked={v === value} className={v === value ? 'on' : ''} onClick={() => onPick(v)}>{label}</button>
      ))}
    </div>
  );
}

function ExportPop({ editor, onCancel, onDone }: { editor: Editor; onCancel: () => void; onDone: (ok: boolean) => void }) {
  const hasSelection = editor.selectedItems().length > 0;
  const [what, setWhat] = useState<ExportOptions['what']>(hasSelection ? 'selection' : 'all');
  const [scale, setScale] = useState(2);
  const [bg, setBg] = useState<Background>('white');
  const opts = { what, scale, bg };
  const preview = useMemo(() => renderPicture(editor, opts, { w: 252, h: 150 })?.toDataURL() ?? null, [what, bg, editor.board.getVersion()]); // eslint-disable-line react-hooks/exhaustive-deps
  const size = pictureSize(editor, opts);
  return (
    <div className="pop labs-pop export-pop" role="dialog" aria-label="Экспорт в PNG">
      <h3>Экспорт в PNG</h3>
      <div className={`export-preview ${bg === 'none' ? 'checker' : ''}`}>
        {preview ? <img src={preview} alt="Так будет выглядеть картинка" /> : <span>На доске пока пусто</span>}
      </div>
      <label>Что</label>
      <Choice value={what} onPick={setWhat} options={hasSelection ? [['selection', 'Выделенное'], ['all', 'Вся доска']] : [['all', 'Вся доска']]} />
      <label>Фон</label>
      <Choice value={bg} onPick={setBg} options={[['white', 'Белый'], ['board', 'Как на доске'], ['none', 'Прозрачный']]} />
      <label>Качество</label>
      <Choice value={scale} onPick={setScale} options={[[1, '1×'], [2, '2×'], [3, '3×']]} />
      {size && <p className="muted">{size.w} × {size.h} пикселей</p>}
      <div className="row">
        <button className="btn" onClick={onCancel}>Отмена</button>
        <button className="btn primary" disabled={!size} onClick={() => void downloadPicture(editor, opts).then(onDone)}>Скачать PNG</button>
      </div>
    </div>
  );
}

function SearchPop({ editor }: { editor: Editor }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const found = useMemo(() => findOnBoard(editor.shown(), q), [q, editor.board.getVersion()]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  // Ctrl+F again picks what's typed, to type something new.
  useEffect(() => {
    const again = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') input.current?.select(); };
    window.addEventListener('keydown', again);
    return () => window.removeEventListener('keydown', again);
  }, []);
  const go = (f: Found, i: number) => {
    setActive(i);
    const it = editor.board.get(f.id);
    if (!it) return;
    flyTo(editor, cameraFor(editor, boxOf(it), 0.5, Math.max(editor.cam.z, 1)));
    editor.setSelection([f.id]);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (found.length) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : found.length - 1)) % found.length);
    } else if (e.key === 'Enter' && found.length) {
      // Enter goes to the one picked, and Enter again to the next.
      const i = Math.min(active, found.length - 1);
      go(found[i], i);
      setActive((i + 1) % found.length);
    } else if (e.key === 'Escape') {
      window.dispatchEvent(new CustomEvent('planx:close-popovers'));
    }
  };
  return (
    <div className="pop labs-pop search-pop" role="dialog" aria-label="Поиск по доске">
      <div className="search-field">
        <Glyph id="search" className="search-icon" />
        <input ref={input} id="labs-search" type="search" placeholder="Найти на доске" aria-label="Найти на доске" value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} />
      </div>
      {!q.trim() && <p className="muted">Ищет в стикерах, текстах, фигурах, задачах, таблицах и фреймах. Enter переходит к следующему.</p>}
      {q.trim() && !found.length && <p className="muted">Ничего не нашлось</p>}
      {found.length > 0 && <>
        <p className="muted">Найдено: {found.length}{found.length >= 50 ? '+' : ''}</p>
        <ul className="search-list" role="listbox">
          {found.map((f, i) => {
            const s = snippet(f);
            return (
              <li key={f.id} role="option" aria-selected={i === active}>
                <button className={i === active ? 'on' : ''} onClick={() => go(f, i)} onPointerEnter={() => setActive(i)}>
                  <span className="search-kind">{f.kind}</span>
                  <span className="search-text">{s.before}<mark>{s.match}</mark>{s.after}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </>}
    </div>
  );
}

function TimerPop({ onStart }: { onStart: (minutes: number) => void }) {
  const [custom, setCustom] = useState('');
  const minutes = Number(custom.replace(',', '.'));
  const ok = minutes > 0 && minutes <= 180;
  return (
    <div className="pop labs-pop timer-pop" role="dialog" aria-label="Общий таймер">
      <h3>Общий таймер</h3>
      <p className="muted">Отсчёт увидят все, кто сейчас на доске.</p>
      <div className="timer-presets">
        {[1, 3, 5, 10, 15].map((m) => <button key={m} className="btn" onClick={() => onStart(m)}>{m} мин</button>)}
      </div>
      <form className="timer-custom" onSubmit={(e) => { e.preventDefault(); if (ok) onStart(minutes); }}>
        <input id="labs-timer-min" inputMode="decimal" placeholder="Своё, мин" aria-label="Минут" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button className="btn primary" type="submit" disabled={!ok}>Запустить</button>
      </form>
    </div>
  );
}

function TimerPill({ editor }: { editor: Editor }) {
  const doc = editor.board.doc;
  const { timer, now } = useTimer(doc);
  const rung = useRef<number | null>(null);
  const left = timer ? Math.min(leftOf(timer, now), timer.total) : 0;
  const running = timer?.end !== undefined, ended = !!timer && running && left === 0;
  // It rings once as it runs out (not for one that ran out before you came), and goes away a minute after.
  useEffect(() => {
    if (!ended || !timer?.end) return;
    if (rung.current !== timer.end && Date.now() - timer.end < 5000) chime();
    rung.current = timer.end;
    const t = setTimeout(() => stopTimer(doc), Math.max(0, timer.end + 60000 - Date.now()));
    return () => clearTimeout(t);
  }, [ended, timer?.end, doc]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!timer) return null;
  return (
    <div className={`labs-pill timer-pill ${ended ? 'ended' : ''} ${!running ? 'paused' : ''}`} role="timer" aria-label="Общий таймер">
      <Glyph id="timer" className="pill-icon" />
      <span className="timer-clock">{ended ? 'Время вышло' : clockText(left)}</span>
      <span className="timer-track"><i style={{ width: `${(timer.total ? left / timer.total : 0) * 100}%` }} /></span>
      {!ended && (running
        ? <button className="pill-btn" title="Пауза" aria-label="Пауза" onClick={() => pauseTimer(doc)}><Glyph id="pause-l" /></button>
        : <button className="pill-btn" title="Продолжить" aria-label="Продолжить" onClick={() => resumeTimer(doc)}><Glyph id="play-l" /></button>)}
      <button className="pill-btn text" title="Ещё минута" aria-label="Ещё минута" onClick={() => addMinute(doc)}>+1</button>
      <button className="pill-btn" title="Убрать таймер" aria-label="Убрать таймер" onClick={() => stopTimer(doc)}><Glyph id="circle-cross" /></button>
    </div>
  );
}

/** Keys in [brackets] are drawn as keys. */
const KEYS: Array<[string, Array<[string, string]>]> = [
  ['Инструменты', [['[V]', 'выделение'], ['[H]', 'рука'], ['[N]', 'стикер'], ['[T]', 'текст'], ['[R]', 'прямоугольник'], ['[O]', 'эллипс'],
    ['[C]', 'связь'], ['[F]', 'фрейм'], ['[P]', 'ручка'], ['[M]', 'маркер'], ['[E]', 'ластик'], ['[I]', 'иконки и эмодзи']]],
  ['Правка', [['[Ctrl] [Z]', 'отменить своё'], ['[Ctrl] [Shift] [Z]', 'вернуть'], ['[Ctrl] [C] [X] [V]', 'копировать, вырезать, вставить'],
    ['[Ctrl] [D]', 'дублировать'], ['[Ctrl] [A]', 'выделить всё'], ['[Ctrl] [G]', 'фрейм вокруг выделенного'], ['[Enter]', 'редактировать текст'],
    ['[Del]', 'удалить'], ['[←] [→] [↑] [↓]', 'сдвинуть (с Shift на 10)'], ['[Alt] + тянуть', 'копия элемента']]],
  ['Вид', [['[Пробел] + тянуть', 'двигать доску'], ['Колесо, щипок', 'масштаб'], ['[+] [−]', 'приблизить, отдалить'], ['[Shift] [1]', 'показать всё'],
    ['[Shift] [0]', 'масштаб 100%'], ['Двойной клик', 'по пустому месту: показать всё']]],
  ['Майнд-карта', [['[Tab]', 'новая ветка'], ['[Enter]', 'соседний узел']]],
  ['Нововведения', [['[Ctrl] [F]', 'поиск по доске'], ['[K]', 'лазерная указка'], ['[?]', 'эта шпаргалка'], ['[Esc]', 'закрыть, перестать следовать']]],
];

function KeysSheet({ onClose }: { onClose: () => void }) {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const keyText = (k: string) => (mac ? k.replace(/Ctrl/g, '⌘').replace(/Alt/g, '⌥') : k);
  const keys = (k: string) => keyText(k).split(/(\[[^\]]+\])/).filter(Boolean)
    .map((part, i) => (part.startsWith('[') ? <kbd key={i}>{part.slice(1, -1)}</kbd> : <span key={i}>{part}</span>));
  return (
    <div className="labs-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pop labs-keys" role="dialog" aria-label="Шпаргалка по клавишам">
        <div className="keys-head">
          <h3>Шпаргалка по клавишам</h3>
          <button className="pill-btn" title="Закрыть" aria-label="Закрыть" onClick={onClose}><Glyph id="circle-cross" /></button>
        </div>
        <div className="keys-grid">
          {KEYS.map(([group, rows]) => (
            <section key={group}>
              <h4>{group}</h4>
              <dl>
                {rows.map(([k, what]) => (
                  <div key={k + what} className="keys-row">
                    <dt>{keys(k)}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

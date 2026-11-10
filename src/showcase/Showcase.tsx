import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import * as Y from 'yjs';
import { Board } from '../model/board';
import { Editor } from '../editor/editor';
import type { Item, ItemType } from '../model/types';
import { DEFAULT_PENS, type Tool } from '../editor/tools';
import { Toolbar } from '../ui/Toolbar';
import { SelectionPanel } from '../ui/SelectionPanel';
import { TextPanel } from '../ui/FormatPanel';
import { DrawPanel } from '../ui/DrawPanel';
import { ShapePanel } from '../ui/ShapePanel';
import { BoardMenu, Switch } from '../ui/BoardMenu';
import { ColorPicker } from '../ui/ColorPicker';
import { ProfileDialog, SettingsDialog } from '../ui/Dialogs';
import { HelpPop } from '../ui/HelpPop';
import { IconPicker } from '../ui/IconPicker';
import { AudioRecorder } from '../ui/AudioRecorder';
import { Minimap } from '../ui/Minimap';
import { PanelIcon } from '../ui/PanelIcon';
import { TaskKeepPop, TaskMenu, TaskPop, TaskTipBubble } from '../ui/TaskPop';
import { LinePanel } from '../labs/LinePanel';
import { ObjectsMenu } from '../labs/ObjectsMenu';
import { LayersPop } from '../labs/LayersPop';
import { LabsRail } from '../labs/LabsRail';
import { ContextMenu } from '../labs/ContextMenu';
import { ExportPop, SearchPop, TimerPill, TimerPop } from '../labs/LabsLayer';
import { startTimer } from '../labs/timer';
import { catFor } from '../emoji/emoji';
import { TOKENS, findDrift, type Drift } from './tokens';

/**
 * «Витрина» (showcase.html): every panel, menu and popup of the board, each on its own card, live (the
 * app's own components on a little board of their own, with no connection), to look them over side by
 * side for a design system. Popups the app puts over the board by the screen stand in their card here
 * (showcase.css). What the app draws by hand in App.tsx (the top bar, confirmations, toasts) is copied
 * as it is there.
 */

/** A board of its own with a few things on it, not connected anywhere; `pick` is selected. */
function useDemo(items: Array<[ItemType, Partial<Item>]>, pick: number[] = []) {
  return useMemo(() => {
    const board = new Board(new Y.Doc());
    const editor = new Editor(board);
    const ids = items.map(([type, extra], i) => {
      const it = editor.newItem(type, 40 + i * 220, 40, extra);
      board.add(it);
      return it.id;
    });
    if (pick.length) editor.setSelection(pick.map((i) => ids[i]));
    return { board, editor, ids, items: () => pick.map((i) => board.get(ids[i])!).filter(Boolean) };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** One card: what it is, where it opens in the app, and the thing itself on a board-coloured stage. */
function Card({ title, where, h = 220, free, wide, children, again }: {
  title: string; where: string; h?: number;
  /** Left where the app puts it (fixed to the stage, not the screen), not set in the middle. */
  free?: boolean; wide?: boolean;
  children: ReactNode;
  /** Opened by an event in the app: shown again by this. */
  again?: () => void;
}) {
  return (
    <section className={`sc-card ${wide ? 'wide' : ''}`}>
      <header className="sc-card-head">
        <h3>{title}</h3>
        {again && <button className="sc-again" onClick={again}>Показать снова</button>}
      </header>
      <p className="sc-where">{where}</p>
      <div className={`sc-stage ${free ? 'free' : 'flow'}`} style={{ height: h }}>{children}</div>
    </section>
  );
}

function Section({ id, title, min, children }: { id: string; title: string; min?: number; children: ReactNode }) {
  return (
    <section className="sc-section" id={id}>
      <h2>{title}</h2>
      <div className="sc-grid" style={min ? { gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))` } : undefined}>{children}</div>
    </section>
  );
}

/** Fires an app event once the card's in (and again on «Показать снова»). */
function useFire(fire: () => void): () => void {
  useEffect(() => { const t = setTimeout(fire, 50); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return fire;
}

const emit = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const noop = () => {};
const ME = { name: 'Женя', color: '#3E7BFA' } as never;

/* ——— Основы ——— */

function Tokens() {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => { window.addEventListener('sc-theme', redraw); return () => window.removeEventListener('sc-theme', redraw); }, []);
  const cs = getComputedStyle(document.documentElement);
  return (
    <section className="sc-card wide">
      <header className="sc-card-head"><h3>Цвета темы</h3></header>
      <p className="sc-where">src/styles/theme.css. Значение для текущей темы, переключите тему сверху.</p>
      <div className="sc-tokens">
        {TOKENS.map(([name, about]) => {
          const v = cs.getPropertyValue(name).trim();
          return (
            <div key={name} className="sc-token">
              <i style={{ background: `var(${name})` }} />
              <code>{name}</code>
              <span>{v}</span>
              <small>{about}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Basics() {
  const [on, setOn] = useState(true);
  return (
    <Section id="basics" title="Основы">
      <Tokens />
      <Card title="Кнопки" where="popups.css: .btn и .btn.primary, во всех подтверждениях" h={120}>
        <div className="sc-row">
          <button className="btn">Отмена</button>
          <button className="btn primary">Очистить</button>
          <button className="btn" disabled>Недоступна</button>
        </div>
      </Card>
      <Card title="Кнопки-иконки на панели" where="panels.css: .ib, обычная, нажатая, недоступная, удалить" h={120}>
        <div className="bar sc-bar">
          <button className="ib"><PanelIcon name="undo-on" /></button>
          <button className="ib on"><PanelIcon name="location" /></button>
          <button className="ib" disabled><PanelIcon name="redo-on" /></button>
          <div className="sep" />
          <button className="ib danger"><PanelIcon name="trashcan" /></button>
        </div>
      </Card>
      <Card title="Переключатель" where="BoardMenu.tsx: Switch, в меню и настройках" h={120}>
        <button className="sc-plain" onClick={() => setOn(!on)}><Switch on={on} /></button>
        <Switch on={false} />
      </Card>
      <Card title="Шрифты" where="theme.css: --ui (Onest), --display (Unbounded); попапы на Inter" h={160}>
        <div className="sc-fonts">
          <p style={{ font: '600 22px/1.2 var(--display)' }}>Unbounded: Мои доски</p>
          <p style={{ font: '400 14px/1.4 var(--ui)' }}>Onest 14: основной текст интерфейса</p>
          <p style={{ font: '400 13px/21px "Inter", var(--ui)' }}>Inter 13/21: текст попапов</p>
          <p style={{ font: '600 12px/32px "Inter", var(--ui)' }}>Inter Semi Bold 12: кнопки</p>
        </div>
      </Card>
    </Section>
  );
}

/* ——— Панели ——— */

function TopBar() {
  return (
    <header className="bar topbar">
      <button className="logo to-shelf">Plan</button>
      <div className="sep" />
      <div className="title-fit" data-text="План запуска"><input className="title-input" size={1} defaultValue="План запуска" /></div>
      <div className="menu-wrap"><button className="ib"><PanelIcon name="burger" /></button></div>
      <div className="sep" />
      <button className="ib"><PanelIcon name="undo-on" /></button>
      <button className="ib" disabled><PanelIcon name="redo-on" /></button>
      <button className="ib"><PanelIcon name="plus" /></button>
      <button className="ib"><PanelIcon name="cross" /></button>
    </header>
  );
}

function ZoomBar() {
  return (
    <div className="bar zoom">
      <div className="avatars"><button className="avatar me"><img src={catFor()} alt="" /></button></div>
      <button className="ib"><PanelIcon name="ai-two-stars" /></button>
      <div className="sep" />
      <button className="ib"><PanelIcon name="location" /></button>
      <button className="ib"><PanelIcon name="zoom-out" /></button>
      <button className="zpct">100%</button>
      <button className="ib"><PanelIcon name="zoom-in" /></button>
      <button className="ib fit"><PanelIcon name="screen" /></button>
      <button className="ib"><PanelIcon name="question" /></button>
    </div>
  );
}

function Selection({ title, where, items, pick }: { title: string; where: string; items: Array<[ItemType, Partial<Item>]>; pick: number[] }) {
  const d = useDemo(items, pick);
  return (
    <Card title={title} where={where} h={150}>
      <SelectionPanel editor={d.editor} items={d.items()} cells={[]} linkCount={0} docked={false} />
    </Card>
  );
}

function TextFormat() {
  const d = useDemo([['text', { text: 'Заголовок', w: 260, h: 26 }]], [0]);
  return (
    <Card title="Панель текста" where="FormatPanel.tsx: TextPanel, над текстом, который печатают" h={150} wide>
      <TextPanel editor={d.editor} item={d.items()[0]} />
    </Card>
  );
}

function Rails() {
  const d = useDemo([]);
  const [tool, setTool] = useState<Tool>('select');
  useEffect(() => d.editor.subscribeUI(() => setTool(d.editor.getUI().tool)), [d]);
  return (
    <Card title="Левая панель инструментов" where="Toolbar.tsx, у левого края доски" h={760}>
      <Toolbar editor={d.editor} tool={tool} pens={DEFAULT_PENS} zoom={1} docked={false} iconsOpen={false} onToggleIcons={noop} recorderOpen={false} onToggleRecorder={noop} />
    </Card>
  );
}

function LabsRailCard() {
  const btn = (icon: Parameters<typeof PanelIcon>[0]['name'], title: string) => ({ icon, title, onClick: noop });
  const buttons = { export: btn('cloud-download', 'Экспорт в PNG'), pdf: btn('file', 'Экспорт в PDF'), search: btn('search', 'Поиск'), layers: btn('layers', 'Слои'),
    history: btn('clock', 'История'), timer: btn('timer', 'Таймер'), laser: btn('magic-wand', 'Лазер') };
  return (
    <Card title="Правая панель нововведений" where="LabsRail.tsx, у правого края доски" h={760}>
      <LabsRail buttons={buttons} docked={false} />
    </Card>
  );
}

function Draw() {
  const d = useDemo([]);
  return (
    <Card title="Панель рисования" where="DrawPanel.tsx: удержание кнопки рисования" h={420} free>
      <DrawPanel editor={d.editor} tool="pen" pens={DEFAULT_PENS} />
    </Card>
  );
}

function MinimapCard() {
  const d = useDemo([['sticky', { text: 'Идея' }], ['rect', {}], ['ellipse', {}], ['sticky', { color: 'pink' }]]);
  return (
    <Card title="Карта доски" where="Minimap.tsx: кнопка с меткой на нижней правой панели" h={260} free>
      <Minimap editor={d.editor} items={d.board.list()} docked={false} onClose={noop} />
    </Card>
  );
}

function Panels() {
  return (
    <Section id="panels" title="Панели" min={600}>
      <Card title="Верхняя панель" where="App.tsx: лого, название, меню, отменить, вернуть (копия разметки)" h={110}><TopBar /></Card>
      <Card title="Нижняя правая панель" where="App.tsx: вы, поделиться, карта, масштаб (копия разметки)" h={110}><ZoomBar /></Card>
      <Selection title="Панель выделенного: стикер" where="SelectionPanel.tsx, внизу по центру" items={[['sticky', { text: 'Идея' }]]} pick={[0]} />
      <Selection title="Панель выделенного: фигура" where="SelectionPanel.tsx" items={[['rect', { text: '' }]]} pick={[0]} />
      <Selection title="Панель выделенного: иконка" where="SelectionPanel.tsx" items={[['icon', { icon: 'star' }]]} pick={[0]} />
      <Selection title="Панель выделенного: несколько" where="SelectionPanel.tsx, выбрано три разных" items={[['sticky', {}], ['rect', {}], ['text', { text: 'Текст' }]]} pick={[0, 1, 2]} />
      <TextFormat />
      <Rails />
      <LabsRailCard />
      <Draw />
      <MinimapCard />
    </Section>
  );
}

/* ——— Меню ——— */

function Shapes() {
  const d = useDemo([]);
  return <Card title="Фигуры" where="ShapePanel.tsx: удержание кнопки фигур" h={640}><ShapePanel editor={d.editor} tool="rect" zoom={1} onPick={noop} /></Card>;
}

function Lines() {
  const d = useDemo([]);
  return <Card title="Линии" where="LinePanel.tsx: удержание кнопки линии (нововведение)" h={240}><LinePanel editor={d.editor} tool="link" onPick={noop} /></Card>;
}

function Objects() {
  const d = useDemo([]);
  return <Card title="Объекты" where="ObjectsMenu.tsx: удержание кнопки «Объекты» (нововведение)" h={200}><ObjectsMenu editor={d.editor} tool="select" onPick={noop} onClose={noop} /></Card>;
}

function Context() {
  const d = useDemo([['sticky', { text: 'Идея' }]], [0]);
  const again = useFire(() => emit('planx:item-menu', new DOMRect(40, 20, 0, 0)));
  return (
    <Card title="Меню по правому клику" where="ContextMenu.tsx: правый клик или три точки на панели (нововведение)" h={600} free again={again}>
      <ContextMenu editor={d.editor} onToast={noop} />
    </Card>
  );
}

function TaskMenus() {
  const d = useDemo([['task', { text: 'Задача' }]]);
  const id = d.ids[0];
  const again = useFire(() => emit('planx:task-menu', { id, field: 'boss', x: 24, y: 24 }));
  return (
    <Card title="Меню задачи" where="TaskPop.tsx: TaskMenu, три точки на задаче" h={260} free again={again}>
      <TaskMenu editor={d.editor} />
    </Card>
  );
}

function TaskPeople() {
  const d = useDemo([['task', { text: 'Задача' }]]);
  const id = d.ids[0];
  const again = useFire(() => emit('planx:task-pick', { id, field: 'doer', x: 24, y: 8 }));
  return (
    <Card title="Исполнитель задачи" where="TaskPop.tsx: TaskPop, клик по исполнителю" h={260} free again={again}>
      <TaskPop editor={d.editor} me={ME} peers={[{ name: 'Аня', color: '#E5484D' }, { name: 'Костя', color: '#30A46C' }]} />
    </Card>
  );
}

function Menus() {
  return (
    <Section id="menus" title="Меню">
      <Card title="Меню доски" where="BoardMenu.tsx: кнопка-бургер на верхней панели. Наведите на строку со стрелкой" h={640} free>
        <div className="sc-anchor"><BoardMenu onShare={noop} onSave={noop} onReset={noop} onSaveBoard={noop} onSaveBoardAs={noop} onLoadBoard={noop} onProfile={noop} onSettings={noop} /></div>
      </Card>
      <Shapes />
      <Lines />
      <Objects />
      <Context />
      <TaskMenus />
      <TaskPeople />
    </Section>
  );
}

/* ——— Попапы ——— */

function Confirm({ input }: { input?: boolean }) {
  return (
    <div className="pop confirm" role="dialog">
      {input && <input className="confirm-input" defaultValue="План запуска" />}
      <p>{input ? 'Сохранить доску в файл под именем' : <>Удалить всё с доски у всех участников? Отменить можно через <b>Ctrl+Z</b></>}</p>
      <div className="row">
        <button className="btn">Отмена</button>
        <button className="btn primary">{input ? 'Сохранить' : 'Очистить'}</button>
      </div>
    </div>
  );
}

function Pickers() {
  const [c, setC] = useState('#3E7BFA');
  return <Card title="Палитра цвета" where="ColorPicker.tsx: «свой цвет» на панели выделенного" h={340}><ColorPicker value={c} onChange={setC} /></Card>;
}

function LabPops() {
  const d = useDemo([['sticky', { text: 'Найди меня' }], ['rect', { text: 'Идея' }]]);
  const t = useDemo([]);
  useEffect(() => startTimer(t.board.doc, 5 * 60000, 'Женя'), [t]);
  return (
    <>
      <Card title="Экспорт" where="LabsLayer.tsx: ExportPop, кнопка на правой панели (нововведение)" h={600}>
        <ExportPop editor={d.editor} format="png" onCancel={noop} onDone={noop} />
      </Card>
      <Card title="Поиск по доске" where="LabsLayer.tsx: SearchPop, Ctrl+F (нововведение)" h={200}><SearchPop editor={d.editor} /></Card>
      <Card title="Общий таймер" where="LabsLayer.tsx: TimerPop, кнопка на правой панели (нововведение)" h={280}><TimerPop onStart={noop} /></Card>
      <Card title="Таймер идёт" where="LabsLayer.tsx: TimerPill, вверху по центру у всех" h={110}><TimerPill editor={t.editor} /></Card>
      <Card title="Слои" where="LayersPop.tsx: кнопка на правой панели (нововведение)" h={260}><LayersPop editor={d.editor} /></Card>
    </>
  );
}

function TaskKeep() {
  const d = useDemo([['task', { text: 'Задача' }]]);
  const id = d.ids[0];
  const again = useFire(() => emit('planx:task-keep', { id, x: 24, top: 0, bottom: 8 }));
  return (
    <Card title="Не сворачивать задачу" where="TaskPop.tsx: TaskKeepPop" h={240} free wide again={again}>
      <TaskKeepPop editor={d.editor} />
    </Card>
  );
}

function TaskTip() {
  const again = useFire(() => emit('planx:task-tip', { text: 'Задача сделана', x: 120, y: 70 }));
  return <Card title="Подсказка на задаче" where="TaskPop.tsx: TaskTipBubble, пропадает через 3 секунды" h={110} free again={again}><TaskTipBubble /></Card>;
}

function Popups() {
  return (
    <Section id="popups" title="Попапы">
      <Card title="Подтверждение" where="App.tsx: «Очистить доску» (копия разметки)" h={200}><Confirm /></Card>
      <Card title="Подтверждение с полем" where="App.tsx: «Сохранить как» и другие вопросы (копия разметки)" h={240}><Confirm input /></Card>
      <Card title="Ваше имя" where="App.tsx: NamePopover (копия разметки)" h={200}>
        <form className="pop namepop" onSubmit={(e) => e.preventDefault()}>
          <p>Как вас подписать для остальных?</p>
          <input defaultValue="Женя" />
          <div className="row"><button className="btn primary">Сохранить</button></div>
        </form>
      </Card>
      <Card title="Уведомления" where="App.tsx: .toast сверху и .toast.bottom с кнопкой (копия разметки)" h={160}>
        <div className="sc-col">
          <div className="pop toast" role="status">Ссылка скопирована</div>
          <div className="pop toast bottom" role="status"><span>Раскладка начнётся заново</span><button className="btn">Отменить</button></div>
        </div>
      </Card>
      <Card title="Подсказки по управлению" where="HelpPop.tsx: кнопка «?» на нижней правой панели" h={640} wide><HelpPop /></Card>
      <Card title="Эмодзи, стикеры и иконки" where="IconPicker.tsx: кнопка смайлика на левой панели" h={520}><IconPicker zoom={1} onPick={noop} /></Card>
      <Card title="Аудиозаметка" where="AudioRecorder.tsx: кнопка микрофона на левой панели" h={300}><AudioRecorder onAdd={noop} onClose={noop} /></Card>
      <Pickers />
      <LabPops />
      <TaskKeep />
      <TaskTip />
    </Section>
  );
}

/* ——— Окна ——— */

function Dialogs() {
  const [dark, setDark] = useState(false);
  return (
    <Section id="dialogs" title="Окна">
      <Card title="Профиль" where="Dialogs.tsx: ProfileDialog, меню доски → «Профиль»" h={640} free wide>
        <ProfileDialog name="Женя" onRename={noop} onClose={noop} />
      </Card>
      <Card title="Настройки" where="Dialogs.tsx: SettingsDialog, меню доски → «Настройки»" h={900} free wide>
        <SettingsDialog dark={dark} onDark={() => setDark(!dark)} onClose={noop} />
      </Card>
    </Section>
  );
}

/* ——— Расхождения ——— */

function DriftList() {
  const [drift, setDrift] = useState<Drift[] | null>(null);
  // Measured once everything's drawn.
  useEffect(() => { const t = setTimeout(() => setDrift(findDrift()), 600); return () => clearTimeout(t); }, []);
  return (
    <section className="sc-section" id="drift">
      <h2>Расхождения</h2>
      <p className="sc-lead">Посчитано по тому, что нарисовано на этой странице: у каких попапов и панелей разные углы, тени, шрифты и отступы. Чем длиннее список значений, тем больше разнобой.</p>
      {!drift ? <p className="sc-where">Считаю…</p> : (
        <div className="sc-drift">
          {drift.map((d) => (
            <div key={d.what} className="sc-drift-row">
              <h3>{d.what} <small>{d.values.length} вариантов</small></h3>
              <ul>{d.values.map(([v, who], i) => (
                <li key={v}>
                  <code>{v}</code> <b>{i === 0 ? 'чаще всего' : who.length === 1 ? 'один' : `${who.length}`}</b>
                  {who.length > 3
                    ? <details><summary>{who.slice(0, 3).join(', ')} и ещё {who.length - 3}</summary>{who.slice(3).join(', ')}</details>
                    : <span> {who.join(', ')}</span>}
                </li>
              ))}</ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const NAV: Array<[string, string]> = [['basics', 'Основы'], ['panels', 'Панели'], ['menus', 'Меню'], ['popups', 'Попапы'], ['dialogs', 'Окна'], ['drift', 'Расхождения']];

export function Showcase() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  useEffect(() => { document.documentElement.dataset.theme = theme; window.dispatchEvent(new Event('sc-theme')); }, [theme]);
  return (
    <div className="sc">
      <header className="sc-top">
        <h1>Витрина PlanX</h1>
        <nav>{NAV.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
        <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</button>
      </header>
      <Basics />
      <Panels />
      <Menus />
      <Popups />
      <Dialogs />
      <DriftList />
    </div>
  );
}

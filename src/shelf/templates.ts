import * as Y from 'yjs';
import { Board } from '../model/board';
import { addChild, childPlace, type Toward } from '../model/mind';
import { newTable } from '../model/table';
import { DEFAULTS, uid, type Item, type ItemType, type Link } from '../model/types';
import { fitHeight, mindSize } from '../canvas/text';
import { newBoardId } from '../collab/connection';
import { readText, writeJSON, writeText } from '../storage';
import { FOLDER_COLORS, addFolder, readShelf, newEntry, writeShelf, writeThumb } from './boards';
import { previewOf } from './preview';

/**
 * Ready-made boards in a green "Шаблоны" folder, put on the shelf once, the first time it opens after
 * they came in (deleted, they don't come back). Each is made only of what boards already have:
 * frames, stickers, tasks, text, icons, a mind map and a table. What's on a board is handed to it the
 * way a copy of a board is (App.tsx, "planx-copy:"): kept in the browser's storage, and taken by the
 * board the first time it's opened.
 */
export interface Template { title: string; items: Item[]; links: Link[] }

const DONE_KEY = 'planx-templates';
const COPY_KEY = 'planx-copy:';
export const TEMPLATES_FOLDER = 'Шаблоны';
const GREEN = FOLDER_COLORS.find((c) => c.name === 'Зелёная')!.color;

/** Makes items one above another, in the order they're made. */
function maker() {
  let z = 0;
  const make = (type: ItemType, x: number, y: number, patch: Partial<Item> = {}): Item => {
    const it = { ...DEFAULTS[type], id: uid(), type, x, y, z: ++z, ...patch } as Item;
    const h = fitHeight(it);
    return h === null || patch.h !== undefined ? it : { ...it, h };
  };
  const title = (x: number, y: number, text: string, w = 1000) => make('text', x, y, { text, w, fs: 34, fw: 700 });
  const note = (x: number, y: number, text: string, w = 1000) => make('text', x, y, { text, w, fs: 17, tc: 'gray' });
  /** A frame and what's in it, which it then holds. */
  const frame = (x: number, y: number, w: number, h: number, text: string, inside: Item[]) =>
    make('frame', x, y, { w, h, text, members: inside.map((i) => i.id) });
  return { make, title, note, frame };
}

/** Columns of task cards, from planned to done. */
export function kanban(): Template {
  const { make, title, note, frame } = maker();
  const cols: Array<[string, string, Array<[string, boolean?]>]> = [
    ['Бэклог', 'yellow', [['Собрать требования к проекту'], ['Нарисовать макет главной страницы'], ['Подобрать подрядчика на рекламу'], ['Настроить рассылку']]],
    ['В работе', 'blue', [['Написать тексты для сайта'], ['Подготовить презентацию для инвесторов']]],
    ['На проверке', 'purple', [['Согласовать договор с подрядчиком']]],
    ['Готово', 'green', [['Придумать название', true], ['Собрать команду', true]]],
  ];
  const W = 300, GAP = 36, CARD = 260, items: Item[] = [
    make('icon', 0, -112, { icon: 'kanban', w: 44, h: 44, color: 'blue' }),
    title(60, -112, 'Канбан-доска'),
    note(0, -52, 'Перетаскивайте карточки из колонки в колонку. Сделанное отмечайте галочкой. Двойной клик по колонке сворачивает её.', 4 * W + 3 * GAP),
  ];
  cols.forEach(([name, color, cards], i) => {
    const x = i * (W + GAP), y = 20;
    const inside = cards.map(([text, done], k) => make('task', x + (W - CARD) / 2, y + 20 + k * 126, { w: CARD, text, color, done: done || undefined }));
    items.push(frame(x, y, W, 540, name, inside), ...inside);
  });
  return { title: 'Канбан-доска', items, links: [] };
}

/** What went well, what got in the way, what to try, and what was agreed. */
export function retro(): Template {
  const { make, title, note, frame } = maker();
  const W = 400, GAP = 40;
  const items: Item[] = [
    make('icon', 0, -168, { icon: 'refresh-l', w: 44, h: 44, color: 'purple' }),
    title(60, -168, 'Ретроспектива'),
    note(0, -108, '1. Запустите общий таймер на 5 минут, и пусть каждый молча пишет стикеры.\n2. Поставьте реакции на самые важные стикеры.\n3. Запишите, что делаете дальше, в «Договорились».', 3 * W + 2 * GAP),
  ];
  const cols: Array<[string, string, string, string, string[]]> = [
    ['Что было хорошо', 'green', 'like', 'green', ['Быстро запустили сайт', 'Дизайнер был всегда на связи']],
    ['Что мешало', 'pink', 'dislike', 'red', ['Задачи менялись по ходу дела', 'Долгие созвоны']],
    ['Что попробуем', 'blue', 'idea-lamp', 'orange', ['Планировать на неделю вперёд', 'Созвоны не дольше 15 минут']],
  ];
  cols.forEach(([name, color, icon, iconColor, notes], i) => {
    const x = i * (W + GAP), y = 20;
    const inside = [
      make('icon', x + W - 56, y + 16, { icon, w: 40, h: 40, color: iconColor }),
      ...notes.map((text, k) => make('sticky', x + 24 + k * 180, y + 72, { text, color })),
    ];
    items.push(frame(x, y, W, 460, name, inside), ...inside);
  });
  const y = 540, done = ['Созвон по понедельникам, 15 минут', 'План на неделю — в пятницу', 'Новые задачи — только через бэклог'];
  const tasks = done.map((text, k) => make('task', 24 + k * 300, y + 24, { w: 270, text, color: 'yellow' }));
  items.push(frame(0, y, 3 * W + 2 * GAP, 160, 'Договорились', tasks), ...tasks);
  return { title: 'Ретроспектива', items, links: [] };
}

/** A mind map of the project, and its stages in a table. */
export function projectPlan(): Template {
  const { make, title, note, frame } = maker();
  const items: Item[] = [];
  const get = (id: string) => items.find((i) => i.id === id);
  const root = make('mind', 0, 0, { text: 'Новый проект', fs: 18 });
  Object.assign(root, mindSize(root));
  items.push(root);
  /** A node growing from `parent` (the way of `toward` from the central topic), laid out as a "+" does. */
  const node = (parent: Item, text: string, toward?: Toward): Item => {
    const fs = parent === root ? 14 : 12, size = mindSize({ ...DEFAULTS.mind, type: 'mind', fs, parent: parent.id } as Item, text);
    const at = childPlace(parent, items, get, size.w, size.h, toward);
    const it = make('mind', at.x, at.y, { ...size, text, fs, parent: parent.id });
    items.push(it);
    for (const [id, pt] of addChild(it.id, items)) Object.assign(get(id)!, pt);
    return it;
  };
  const branches: Array<[string, Toward, string[]]> = [
    ['Цели', 1, ['Запуститься к весне', '1000 первых клиентов']],
    ['Задачи', 1, ['Сайт', 'Реклама', 'Поддержка клиентов']],
    ['Команда', -1, ['Руководитель', 'Дизайнер', 'Разработчик']],
    ['Риски', -1, ['Не хватит бюджета', 'Сдвинутся сроки']],
  ];
  for (const [text, toward, kids] of branches) {
    const b = node(root, text, toward);
    kids.forEach((k) => node(b, k));
  }
  const left = Math.min(...items.map((i) => i.x)), right = Math.max(...items.map((i) => i.x + i.w));
  const top = Math.min(...items.map((i) => i.y)), bottom = Math.max(...items.map((i) => i.y + i.h));

  const rows = [['Этап', 'Срок', 'Ответственный'], ['Подготовка', '1–15 ноября', ''], ['Запуск', '1 декабря', ''], ['Итоги', '20 декабря', '']];
  const t = newTable(3, rows.length);
  const cols = [200, 160, 200], tw = cols.reduce((s, v) => s + v, 0), th = t.h!;
  const fx = Math.round((left + right) / 2 - (tw + 48) / 2), fy = bottom + 80;
  const table = make('table', fx + 24, fy + 24, {
    ...t, cols, w: tw, cells: rows.flat(), cellFmt: rows.flat().map((_, i) => (i < 3 ? { fw: 700, bg: 'blue' } : null)),
  });
  const stages = frame(fx, fy, tw + 48, th + 48, 'Этапы', [table]);

  return {
    title: 'План проекта',
    items: [
      make('icon', left, top - 152, { icon: 'planning', w: 44, h: 44, color: 'green' }),
      title(left + 60, top - 152, 'План проекта'),
      note(left, top - 92, 'Добавляйте ветки кнопкой «+» у узла карты. Сроки и ответственных ведите в таблице.', Math.max(right - left, 600)),
      ...items, stages, table,
    ],
    links: [],
  };
}

export const TEMPLATES = [kanban, retro, projectPlan];

/** A picture for a template's tile, drawn from a board made of it in memory. */
function pictureOf(t: Template): string | null {
  const doc = new Y.Doc();
  try {
    const board = new Board(doc);
    board.replaceAll(t.items, t.links, t.title);
    return previewOf(board);
  } catch {
    return null;
  } finally {
    doc.destroy();
  }
}

/** Puts the green "Шаблоны" folder with the ready-made boards on the shelf, once per browser. */
export function addTemplates(now = Date.now()): void {
  if (readText(DONE_KEY)) return;
  writeText(DONE_KEY, '1');
  const folder = addFolder(newBoardId(), { title: TEMPLATES_FOLDER, color: GREEN }, now);
  const made = TEMPLATES.map((make) => {
    const t = make(), id = newBoardId();
    writeJSON(`${COPY_KEY}${id}`, { items: t.items, links: t.links, title: t.title });
    if (typeof document !== 'undefined') writeThumb(id, pictureOf(t));
    return newEntry(id, { title: t.title, folder: folder.id, items: t.items.length }, now);
  });
  writeShelf([...(readShelf() ?? []), ...made]);
}

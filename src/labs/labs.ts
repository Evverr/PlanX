import { useSyncExternalStore } from 'react';
import type { Item } from '../model/types';
import { readJSON, readText, writeJSON, writeText } from '../storage';

/**
 * Features on trial ("Нововведения"): each can be switched on and off in the board menu, kept per
 * browser. Everything they need lives in this folder; the app only asks labOn() where a feature
 * changes what it does, so one that isn't kept comes out by deleting its file and those few lines.
 */
export type LabId = 'export' | 'pdf' | 'tidy' | 'lock' | 'search' | 'timer' | 'reactions' | 'laser' | 'follow' | 'cursors' | 'swap' | 'textPush' | 'wishlist' | 'clickThrough' | 'multi' | 'textLink' | 'objects' | 'contextMenu' | 'lineTool' | 'boardImport' | 'comments' | 'zoomBox' | 'align' | 'nib' | 'softEraser' | 'layers' | 'solidTool' | 'history' | 'panelOver' | 'zoomFade' | 'zoomKeys' | 'tableMove' | 'textButton' | 'tableCut' | 'linkJoint' | 'tableLook' | 'imageCrop' | 'boardGrid' | 'linkTool' | 'customize' | 'codeBlock' | 'taskFull' | 'sideNav' | 'discussion' | 'groups' | 'subDrag' | 'nearGuides' | 'textBox' | 'sideTabs' | 'lineEnd' | 'tlLinks' | 'call' | 'panelGlide' | 'formObject' | 'quickCreate' | 'docx' | 'pollObject';

export interface Lab { id: LabId; label: string; icon: string; hint: string }

/** In the order they're listed in the menu. `icon` is from the board's icon set. */
export const LABS: Lab[] = [
  { id: 'export', label: 'Экспорт в PNG', icon: 'cloud-download', hint: 'Скачать доску или выделенное картинкой' },
  { id: 'pdf', label: 'Экспорт в PDF', icon: 'file', hint: 'Скачать доску или выделенное PDF-файлом' },
  { id: 'tidy', label: 'Авторасположение', icon: 'apps', hint: 'Выделенное ровной сеткой; отступы между рядами и столбцами тянутся' },
  { id: 'align', label: 'Выравнивание', icon: 'align-items-left', hint: 'Выбрано несколько: кнопка на нижней панели, по краям и по центру' },
  { id: 'nib', label: 'Перо', icon: 'pen-nib', hint: 'В рисовании: фигура по вершинам; клик по первой — замкнуть, двойной клик или Enter — линия' },
  { id: 'softEraser', label: 'Ластик кружком', icon: 'eraser', hint: 'Ластик стирает только то, что под кружком; его размер — в меню рисования' },
  { id: 'textButton', label: 'Кнопка T', icon: 'text', hint: 'На панели выделенного с текстом: T открывает панель шрифта и текста, следующий клик по доске возвращает обычную' },
  { id: 'linkJoint', label: 'Узел на линии', icon: 'path', hint: 'Выделите линию и перетащите на её кружок посередине текст, стикер, фигуру или смайл: он станет частью линии. С Cmd (Ctrl) его можно вытащить обратно' },
  { id: 'tableLook', label: 'Таблица помнит формат', icon: 'table', hint: 'Выравнивание, жирность, размер, заданные в ячейке, переходят в следующую пустую ячейку' },
  { id: 'tableCut', label: 'Удаление строк и столбцов', icon: 'table', hint: 'Выделены целые строки или столбцы таблицы: Delete сначала стирает текст, второй раз — их самих' },
  { id: 'customize', label: 'Режим настройки меню', icon: 'change-order', hint: 'В меню доски: включённый режим даёт переставлять кнопки на панелях, выключенный — нет. Перетащить кнопку с левой панели на доску можно всегда' },
  { id: 'boardGrid', label: 'Фон доски', icon: 'apps', hint: 'В меню доски: три точки, линии на фоне, точки или ничего' },
  { id: 'discussion', label: 'Обсуждение', icon: 'message', hint: 'Кнопка чата на левой панели открывает справа панель обсуждения (пока — пожелания); комментарии на доске — кнопкой на нижней правой панели' },
  { id: 'sideNav', label: 'Боковая панель', icon: 'columns', hint: 'Клик по лого открывает слева тёмную панель: доски, профиль, настройки' },
  { id: 'taskFull', label: 'Задача сразу целиком', icon: 'maximize', hint: 'Задача раскрывается сразу полностью (новая на доске — до описания). Выключено: сначала только описание, затем всё' },
  { id: 'codeBlock', label: 'Код', icon: 'code', hint: 'Кнопка на правой панели: блок кода с подсветкой, язык выбирается на панели блока' },
  { id: 'imageCrop', label: 'Кроп картинки', icon: 'image', hint: 'На панели картинки: кнопка кропа. Края двигаются, шарик в левом нижнем углу скругляет. Отрезанное не вернуть, скругление можно менять' },
  { id: 'tableMove', label: 'Перестановка в таблице', icon: 'table', hint: 'Двойной клик по таблице: над столбцом и слева от строки под курсором ползунок, потяните, чтобы переставить' },
  { id: 'zoomKeys', label: 'Зум на 1 и 2', icon: 'zoom-in', hint: '1 — показать всё, 2 — показать выбранное (ничего не выбрано — масштаб 100%)' },
  { id: 'zoomFade', label: 'Мелочи при отдалении', icon: 'zoom-out', hint: 'Реакции, замки, кнопки компонента и счётчики свёрнутых веток пропадают, когда доска сильно отдалена; у выбранного остаются' },
  { id: 'panelOver', label: 'Панель над элементом', icon: 'more-vertical-m', hint: 'Панель выделенного над ним, как панель текста; внизу, если выбранное большое, далеко разбросано, за краем экрана или видны ручки авторасположения' },
  { id: 'solidTool', label: 'Сплошная выбранная иконка', icon: 'palette', hint: 'На левой панели: выбранный инструмент белой сплошной иконкой на синем' },
  { id: 'history', label: 'История', icon: 'clock-l', hint: 'Кнопка на правой панели: точки вручную или сами раз в 30 минут; доску можно вернуть к любой' },
  { id: 'layers', label: 'Слои', icon: 'layers', hint: 'Кнопка на правой панели: слои с галочками, скрытое не видно только вам; новое — в выбранный слой' },
  { id: 'lock', label: 'Замок', icon: 'lock-l', hint: 'Закреплённое не сдвинуть и не удалить' },
  { id: 'search', label: 'Поиск по доске', icon: 'search', hint: 'Ctrl+F: найти текст на доске' },
  { id: 'timer', label: 'Общий таймер', icon: 'timer', hint: 'Отсчёт, который видят все на доске' },
  { id: 'reactions', label: 'Реакции', icon: 'like', hint: 'Лайки и другие значки на элементах' },
  { id: 'laser', label: 'Лазерная указка', icon: 'magic-wand', hint: 'K: след, который тает за секунду' },
  { id: 'follow', label: 'Следовать за участником', icon: 'meeting-point', hint: 'Смотреть туда же, куда другой, и звать всех к себе' },
  { id: 'cursors', label: 'Курсоры участников', icon: 'person-search', hint: 'Видеть, где мышь у других на доске' },
  { id: 'textPush', label: 'Текст не слипается', icon: 'arrow-down-l', hint: 'Текст, ставший выше, отодвигает текст прямо под ним (до 16 px), и в копии компонента тоже' },
  { id: 'wishlist', label: 'Wishlist', icon: 'gift', hint: 'На странице «Мои доски»: общий список пожеланий с лайками' },
  { id: 'comments', label: 'Комментарии', icon: 'message', hint: 'Комментарии на доске, как в Figma: кнопка на левой панели или правый клик' },
  { id: 'boardImport', label: 'Доски извне', icon: 'upload', hint: 'На «Моих досках»: загрузить доску из файла или по адресу, перетащить файл из Finder' },
  { id: 'linkTool', label: 'Связи инструментом', icon: 'path', hint: 'Точки для связей не у выбранного: кнопка «Связи» на правой нижней панели (или C) включает их у всех элементов сразу, у майндов при наведении' },
  { id: 'lineTool', label: 'Линии', icon: 'path', hint: 'Инструмент линии на левой панели; линию можно тащить к другой цели за любое место' },
  { id: 'contextMenu', label: 'Меню по правому клику', icon: 'more-l', hint: 'Скопировать, удалить, вверх, вниз, сделать компонентом; то же под тремя точками на нижней панели и панели текста' },
  { id: 'objects', label: 'Объекты', icon: 'package', hint: 'Кнопка на левой панели (зажмите — меню объектов); первый — таймлайн' },
  { id: 'textLink', label: 'Ссылка в тексте', icon: 'link', hint: 'Кнопка-цепочка на панели текста. Ссылку на части текста открывает клик, на всём элементе — Cmd+клик (Ctrl+клик)' },
  { id: 'multi', label: 'Несколько сразу', icon: 'group', hint: 'Выбрано несколько: общий текст на панели и один уголок, чтобы масштабировать всё вместе' },
  { id: 'clickThrough', label: 'Клик сквозь', icon: 'layers', hint: 'Медленный повторный клик по выбранному выбирает то, что под ним' },
  { id: 'zoomBox', label: 'Зум рамкой', icon: 'expand-l', hint: 'Держите Z и обведите рамкой: то, что в ней, на весь экран' },
  { id: 'groups', label: 'Группы', icon: 'collapse-m', hint: 'Выбрано несколько: кнопка на панели или Cmd+G объединяет их в группу, группы — в группу групп. Клик выбирает группу целиком, двойной клик — уровень внутрь. Выбранная группа: на панели число объектов и «Разгруппировать» (Cmd+Shift+G), по уровню за раз' },
  { id: 'subDrag', label: 'Перетаскивание подзадач', icon: 'check-list', hint: 'В развёрнутой задаче подзадачу можно потянуть вверх или вниз и поставить на другое место' },
  { id: 'nearGuides', label: 'Направляющие по близким объектам', icon: 'align-left', hint: 'Перетаскиваемое само выравнивается по объектам рядом с ним (в 200 точках экрана), линии — только до них. С Shift — по всем на экране, как раньше; с Cmd — без направляющих. Выключено: направляющие только с Shift' },
  { id: 'textBox', label: 'Текст рамкой', icon: 'text', hint: 'Инструмент «Текст»: протяните рамку — текст переносится по её ширине; её размер меняется за края и уголок, не поместившееся торчит из неё. Клик, как раньше, ставит строку' },
  { id: 'sideTabs', label: 'Полукруги на рамке', icon: 'shape-cross', hint: 'У выбранного на середине сторон рамки шарик выглядывает из-за неё на четверть, с курсором рядом — целый, на нём видна будущая копия. Клик — копия в эту сторону, потяните — линия' },
  { id: 'lineEnd', label: 'Линия в пустоту', icon: 'path', hint: 'Линию, отпущенную мимо объекта, не удаляет: её конец остаётся там (у невидимой точки); его можно перетащить и на объект' },
  { id: 'tlLinks', label: 'Угловые линии на таймлайне', icon: 'line-elbow', hint: 'Линия между объектами на таймлайне — с прямыми углами, из правой стороны в левую следующего; если он левее, обходит снизу между ними' },
  { id: 'call', label: 'Аудиозвонок', icon: 'phone-up', hint: 'Кнопка звонка на правой панели: все на доске, кто нажал, слышат друг друга. До трёх человек, следующий просится, и любой в звонке может его пустить' },
  { id: 'panelGlide', label: 'Перестроение панели', icon: 'more-vertical-m', hint: 'Выбрал другой объект: панель над ним не гаснет и не появляется заново, а сразу встаёт у нового; одинаковые иконки остаются, новые проявляются на месте. Вместе с «Панелью над элементом»' },
  { id: 'quickCreate', label: 'Быстрое создание', icon: 'lightning-plus', hint: 'Молния в верхнем меню вместо «Очистить доску»: окно быстрого создания (пока только поле ввода)' },
  { id: 'pollObject', label: 'Голосование в объектах', icon: 'poll', hint: 'В «Объектах» — голосование: вопрос и варианты; каждый выбирает один или несколько, и сразу видно, сколько у какого. Поставивший может его отредактировать' },
  { id: 'formObject', label: 'Форма в объектах', icon: 'form', hint: 'В «Объектах» — форма: два поля и кнопка «Заполнить». Заполнил — значения остаются текстом, кнопка становится «Редактировать»' },
  { id: 'docx', label: 'Документы Word', icon: 'file', hint: 'Перетащите .docx на доску или выберите его кнопкой картинки: на доске видна первая страница, двойной клик открывает документ целиком (только просмотр)' },
  { id: 'swap', label: 'Замена двойным кликом', icon: 'repeat', hint: 'Двойной клик по эмодзи или иконке: выбрать другую на её место, и в копии компонента тоже' },
];

const KEY = 'planx-labs';

/** Those that show up switched off, till they're switched on (which is kept apart, under ON_KEY). */
const START_OFF: LabId[] = ['panelGlide'];
const ON_KEY = 'planx-labs-on';
let onFirst = new Set<LabId>(readJSON<LabId[]>(ON_KEY) ?? []);
/** What's switched off; anything not listed is on, so a new feature shows up switched on (but START_OFF). */
let off = new Set<LabId>([...(readJSON<LabId[]>(KEY) ?? []), ...START_OFF.filter((id) => !onFirst.has(id))]);
let snapshot: Record<LabId, boolean> = makeSnapshot();
const listeners = new Set<() => void>();

function makeSnapshot(): Record<LabId, boolean> {
  return Object.fromEntries(LABS.map((l) => [l.id, !off.has(l.id)])) as Record<LabId, boolean>;
}

export function labOn(id: LabId): boolean {
  return !off.has(id);
}

export function setLab(id: LabId, on: boolean): void {
  off = new Set(off);
  if (on) off.delete(id); else off.add(id);
  writeJSON(KEY, [...off]);
  if (START_OFF.includes(id)) { onFirst = new Set(onFirst); if (on) onFirst.add(id); else onFirst.delete(id); writeJSON(ON_KEY, [...onFirst]); }
  snapshot = makeSnapshot();
  listeners.forEach((fn) => fn());
}

export function subscribeLabs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Which features are on, for React. */
export function useLabs(): Record<LabId, boolean> {
  return useSyncExternalStore(subscribeLabs, () => snapshot);
}

/** Whether an item is locked in place (and the lock is switched on). */
export const isLocked = (it: Item | undefined): boolean => !!it?.lock && labOn('lock');

/** Whether an item stays where it is, not to be moved or deleted: locked itself, or in a frame (a
 *  timeline, a group) that's locked, or in one in it. */
export function heldInPlace(it: Item | undefined, items: Item[]): boolean {
  if (!labOn('lock')) return false;
  const seen = new Set<string>();
  for (let cur = it; cur && !seen.has(cur.id); cur = items.find((f) => f.members?.includes(cur!.id))) {
    if (cur.lock) return true;
    seen.add(cur.id);
  }
  return false;
}

/** This browser's own id, for telling whose reaction is whose (the people's ids change each visit). */
export function myId(): string {
  // (Kept once read: the same all along, where nothing's kept in the browser too.)
  if (ownId) return ownId;
  let id = readText('planx-labs-id');
  if (!id) {
    id = Math.random().toString(36).slice(2, 12);
    writeText('planx-labs-id', id);
  }
  return (ownId = id);
}
let ownId: string | null = null;

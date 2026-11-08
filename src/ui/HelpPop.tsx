import { zoomHelp } from '../labs/wheelZoom';

/** Keys in [brackets] are drawn as keys. */
const KEYS: Array<[string, Array<[string, string]>]> = [
  ['Мышь', [['Двойной клик', 'Редактировать текст'], ['[Shift] + клик', 'Выделить несколько'], ['[Shift] + тянуть за угол', 'Стикер любой формы, фигура в пропорции'],
    ['Тянуть за синюю точку', 'Связать с другим элементом'], ['Двойной клик по таблице', 'Переставлять строки и столбцы'], ['[Ctrl] + тянуть', 'Вытащить из линии'], ['Удерживать кнопку', 'Переставить её на панели']]],
  ['Инструменты', [['[V]', 'Выделение'], ['[H]', 'Рука'], ['[N]', 'Стикер'], ['[T]', 'Текст'], ['[R]', 'Прямоугольник'], ['[O]', 'Эллипс'],
    ['[C]', 'Связь'], ['[F]', 'Фрейм'], ['[P]', 'Ручка'], ['[M]', 'Маркер'], ['[E]', 'Ластик'], ['[I]', 'Иконки и эмодзи']]],
  ['Правка', [['[Ctrl] [Z]', 'Отменить своё'], ['[Ctrl] [Shift] [Z], [Y]', 'Вернуть'], ['[Ctrl] [C] [X] [V]', 'Копировать, вырезать, вставить'],
    ['[Ctrl] [D]', 'Дублировать'], ['[Ctrl] [A]', 'Выделить всё'], ['[Ctrl] [G]', 'Сгруппировать'], ['[Ctrl] [Shift] [G]', 'Разгруппировать'], ['[Enter]', 'Редактировать текст'],
    ['[Del]', 'Удалить'], ['[←] [→] [↑] [↓]', 'Сдвинуть (с Shift на 10)'], ['[Ctrl] [↑] [↓]', 'На слой выше, ниже'], ['[Alt] + тянуть', 'Копия элемента']]],
  ['Вид', [['[Пробел] + тянуть', 'Двигать доску'], ['Колесо, щипок', 'Масштаб'], ['[+] [−]', 'Приблизить, отдалить'], ['[Shift] [1]', 'Показать всё'], ['[1] [2]', 'Всё, выбранное'],
    ['[Shift] [0]', 'Масштаб 100%'], ['Двойной клик', 'По пустому месту: показать всё']]],
  ['Майнд-карта', [['[Tab]', 'Новая ветка'], ['[Shift] [Tab]', 'К родителю'], ['[Enter]', 'Соседний узел'], ['[Shift] [Enter]', 'Новая строка']]],
  ['Нововведения', [['[Ctrl] [F]', 'Поиск по доске'], ['[Z] + рамка', 'Зум рамкой'], ['[K]', 'Лазерная указка'], ['[?]', 'Эта подсказка'], ['[Esc]', 'Закрыть, перестать следовать']]],
];

/** The "?" in the zoom bar (or the ? key): what can be done with the mouse and the keys, in three columns. */
export function HelpPop() {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const keyText = (k: string) => (k === 'Колесо, щипок' ? zoomHelp() : mac ? k.replace(/Ctrl/g, '⌘').replace(/Alt/g, '⌥') : k);
  const keys = (k: string) => keyText(k).split(/(\[[^\]]+\])/).filter(Boolean)
    .map((part, i) => (part.startsWith('[') ? <kbd key={i}>{part.slice(1, -1)}</kbd> : <span key={i}>{part}</span>));
  return (
    <div className="pop help" role="dialog" aria-label="Управление">
      <div className="help-body">
        <div className="keys-grid">
          {KEYS.map(([group, rows]) => (
            <section key={group}>
              <h4>{group}</h4>
              <dl>
                {rows.map(([k, what]) => (
                  <div key={k + what} className="keys-row">
                    <dt>{what}</dt>
                    <dd>{keys(k)}</dd>
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

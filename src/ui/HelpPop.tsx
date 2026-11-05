import { zoomHelp } from '../labs/wheelZoom';

/** Keys in [brackets] are drawn as keys. */
const KEYS: Array<[string, Array<[string, string]>]> = [
  ['Мышью', [['Двойной клик', 'редактировать текст'], ['[Shift] + клик', 'выделить несколько'], ['[Shift] + тянуть за угол', 'стикер любой формы, фигура в пропорции'],
    ['Тянуть за синюю точку', 'связать с другим элементом'], ['Удерживать кнопку', 'переставить её на панели']]],
  ['Инструменты', [['[V]', 'выделение'], ['[H]', 'рука'], ['[N]', 'стикер'], ['[T]', 'текст'], ['[R]', 'прямоугольник'], ['[O]', 'эллипс'],
    ['[C]', 'связь'], ['[F]', 'группа'], ['[P]', 'ручка'], ['[M]', 'маркер'], ['[E]', 'ластик'], ['[I]', 'иконки и эмодзи']]],
  ['Правка', [['[Ctrl] [Z]', 'отменить своё'], ['[Ctrl] [Shift] [Z], [Y]', 'вернуть'], ['[Ctrl] [C] [X] [V]', 'копировать, вырезать, вставить'],
    ['[Ctrl] [D]', 'дублировать'], ['[Ctrl] [A]', 'выделить всё'], ['[Ctrl] [G]', 'группа вокруг выделенного'], ['[Enter]', 'редактировать текст'],
    ['[Del]', 'удалить'], ['[←] [→] [↑] [↓]', 'сдвинуть (с Shift на 10)'], ['[Ctrl] [↑] [↓]', 'на слой выше, ниже'], ['[Alt] + тянуть', 'копия элемента']]],
  ['Вид', [['[Пробел] + тянуть', 'двигать доску'], ['Колесо, щипок', 'масштаб'], ['[+] [−]', 'приблизить, отдалить'], ['[Shift] [1]', 'показать всё'], ['[1] [2]', 'всё, выбранное'],
    ['[Shift] [0]', 'масштаб 100%'], ['Двойной клик', 'по пустому месту: показать всё']]],
  ['Майнд-карта', [['[Tab]', 'новая ветка'], ['[Enter]', 'соседний узел']]],
  ['Нововведения', [['[Ctrl] [F]', 'поиск по доске'], ['[Z] + рамка', 'зум рамкой'], ['[K]', 'лазерная указка'], ['[?]', 'эта подсказка'], ['[Esc]', 'закрыть, перестать следовать']]],
];

/** The "?" in the zoom bar (or the ? key): what can be done with the mouse and the keys, in three columns. */
export function HelpPop() {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const keyText = (k: string) => (k === 'Колесо, щипок' ? zoomHelp() : mac ? k.replace(/Ctrl/g, '⌘').replace(/Alt/g, '⌥') : k);
  const keys = (k: string) => keyText(k).split(/(\[[^\]]+\])/).filter(Boolean)
    .map((part, i) => (part.startsWith('[') ? <kbd key={i}>{part.slice(1, -1)}</kbd> : <span key={i}>{part}</span>));
  return (
    <div className="pop help" role="dialog" aria-label="Управление">
      <h3>Управление</h3>
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
  );
}

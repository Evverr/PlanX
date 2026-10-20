import type { Item, Link } from './types';
import { uid } from './types';

/** Example board shown in the "demo" room the first time it is opened. */
export function sampleBoard(): { title: string; items: Item[]; links: Link[] } {
  let z = 0;
  const S = (x: number, y: number, text: string, color: string): Item =>
    ({ id: uid(), type: 'sticky', x, y, w: 150, h: 150, z: ++z, text, color, fs: 16 });
  const F = (x: number, y: number, text: string): Item =>
    ({ id: uid(), type: 'frame', x, y, w: 360, h: 540, z: ++z, text });
  const I = (x: number, y: number, icon: string, color: string): Item =>
    ({ id: uid(), type: 'icon', x, y, w: 48, h: 48, z: 1000 + ++z, icon, color });

  const frames = [F(0, 120, 'Бэклог'), F(400, 120, 'В работе'), F(800, 120, 'Готово')];
  const title: Item = { id: uid(), type: 'text', x: 0, y: -10, w: 900, h: 43, z: ++z,
    text: 'Запуск приложения · план на 4 квартал', fs: 34, fw: 700 };
  const note: Item = { id: uid(), type: 'text', x: 0, y: 46, w: 980, h: 22, z: ++z,
    text: 'Пример доски. Откройте эту ссылку в другом окне, и изменения появятся там сразу.', fs: 17 };

  const backlog = [
    S(20, 140, 'Онбординг: 3 экрана', 'yellow'),
    S(190, 140, 'Пуш-уведомления о заказе', 'blue'),
    S(20, 310, 'Тёмная тема', 'purple'),
    S(190, 310, 'Отзывы в App Store: собрать 50+', 'orange'),
  ];
  const doing = [S(420, 140, 'Оплата через СБП', 'pink'), S(590, 140, 'Экран профиля', 'yellow'), S(420, 310, 'Аналитика воронки', 'blue')];
  const design = S(990, 140, 'Дизайн-система v1', 'green');
  const catalog = S(820, 310, 'Каталог и поиск', 'green');
  const done = [S(820, 140, 'Вход по номеру телефона', 'green'), design, catalog];

  const beta: Item = { id: uid(), type: 'rect', x: 1260, y: 250, w: 200, h: 110, z: ++z,
    text: 'Бета-тест\n200 пользователей', color: 'blue', fs: 16 };
  const release: Item = { id: uid(), type: 'ellipse', x: 1250, y: 470, w: 220, h: 130, z: ++z,
    text: 'Релиз 1.0\n15 декабря', color: 'yellow', fs: 18 };

  const items = [...frames, title, note, ...backlog, ...doing, ...done, beta, release,
    I(1478, 281, 'collaboration', 'blue'), I(1486, 511, 'flag', 'red')];
  const links: Link[] = [
    { id: uid(), from: design.id, to: beta.id },
    { id: uid(), from: catalog.id, to: beta.id },
    { id: uid(), from: beta.id, to: release.id },
  ];
  return { title: 'Запуск приложения', items, links };
}

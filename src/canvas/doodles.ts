/**
 * Game stickers ("Стикеры" in the picker): drawings from assets/doodles, picked as they are and put on
 * the board on a white ground (assets/doodles/outlined), then a set of round badges under them, as a picture item that names its sticker
 * (`doodle`), so boards keep them whatever the build calls their files.
 */
const PLAIN = import.meta.glob<string>('../../assets/doodles/*.svg', { eager: true, query: '?url', import: 'default' });
const OUTLINED = import.meta.glob<string>('../../assets/doodles/outlined/*.svg', { eager: true, query: '?url', import: 'default' });
/** A second set, round "volume" badges (assets/doodles/volume): on the board as they are. */
const VOLUME = import.meta.glob<string>('../../assets/doodles/volume/*.svg', { eager: true, query: '?url', import: 'default' });

const NAMES: Record<string, string> = {
  '01-love': 'Любовь', '02-on-fire': 'В ударе', '03-you-star': 'Ты звезда', '04-looking': 'Смотрю', '05-good-idea': 'Хорошая идея',
  '06-nice': 'Отлично', '07-peace': 'Мир', '08-good-vibes': 'Хорошие вибрации', '09-lets-go': 'Поехали', '10-flower-power': 'Сила цветов',
  '11-coffee-break': 'Кофе-брейк', '12-wow': 'Вау', '13-electric': 'Энергия', '14-best-buds': 'Лучшие друзья', '15-party-time': 'Вечеринка',
  'v-beer': 'Пиво', 'v-cake': 'Торт', 'v-cup': 'Кубок', 'v-flag': 'Флаг', 'v-flower': 'Цветок', 'v-gift': 'Подарок', 'v-king-or-queen': 'Корона',
  'v-like': 'Лайк', 'v-love': 'Сердце', 'v-martini': 'Мартини', 'v-money': 'Деньги', 'v-number-one': 'Номер один', 'v-smile': 'Улыбка', 'v-star': 'Звезда',
};

const idOf = (path: string) => path.match(/([^/]+)\.svg$/)![1];

/** A sticker: its picture in the picker, on the board (`outlined`), and its set (the picker shows them apart). */
export interface Doodle { id: string; name: string; url: string; outlined: string; set: 'doodle' | 'volume' }

export const DOODLES: Doodle[] = [
  ...Object.entries(PLAIN).map(([path, url]): Doodle => {
    const id = idOf(path);
    return { id, name: NAMES[id] ?? id, url, outlined: OUTLINED[`../../assets/doodles/outlined/${id}.svg`] ?? url, set: 'doodle' };
  }).sort((a, b) => a.id.localeCompare(b.id)),
  ...Object.entries(VOLUME).map(([path, url]): Doodle => {
    const id = `v-${idOf(path)}`;
    return { id, name: NAMES[id] ?? id, url, outlined: url, set: 'volume' };
  }).sort((a, b) => a.id.localeCompare(b.id)),
];

const BY_ID = new Map(DOODLES.map((d) => [d.id, d]));
export const doodle = (id: string | undefined) => (id ? BY_ID.get(id) : undefined);

/** How big a sticker comes onto the board, across. */
export const DOODLE_SIZE = 128;

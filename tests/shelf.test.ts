import { describe, expect, it } from 'vitest';
import { ago, arrange, boardsInside, idFromLink, newEntry, pathTo, placeOf, plural, withInside, type FolderEntry } from '../src/shelf/boards';

describe('the shelf of boards', () => {
  const list = [
    newEntry('a', { title: 'План на неделю', opened: 3, edited: 1, created: 1 }),
    newEntry('b', { title: 'Ёлка', opened: 1, edited: 3, created: 2 }),
    newEntry('c', { title: '', opened: 2, edited: 2, created: 3 }),
  ];

  const by = (b: (typeof list)[number], k: 'opened' | 'edited' | 'created') => b[k];

  it('sorts by the chosen order', () => {
    expect(arrange(list, '', 'opened', by).map((b) => b.id)).toEqual(['a', 'c', 'b']);
    expect(arrange(list, '', 'edited', by).map((b) => b.id)).toEqual(['b', 'c', 'a']);
    expect(arrange(list, '', 'created', by).map((b) => b.id)).toEqual(['c', 'b', 'a']);
    expect(arrange(list, '', 'title', by).map((b) => b.id)).toEqual(['c', 'b', 'a']);
  });

  it('finds by name in any case, ё as е, untitled ones as "Без названия"', () => {
    expect(arrange(list, 'елк', 'opened', by).map((b) => b.id)).toEqual(['b']);
    expect(arrange(list, 'НЕДЕЛ', 'opened', by).map((b) => b.id)).toEqual(['a']);
    expect(arrange(list, 'без назв', 'opened', by).map((b) => b.id)).toEqual(['c']);
  });

  it('says how long ago in words', () => {
    const now = new Date(2026, 9, 25, 12).getTime();
    expect(ago(now - 20000, now)).toBe('только что');
    expect(ago(now - 5 * 60000, now)).toBe('5 мин назад');
    expect(ago(now - 3 * 3600000, now)).toBe('3 ч назад');
    expect(ago(now - 26 * 3600000, now)).toBe('вчера');
    expect(ago(now - 5 * 86400000, now)).toBe('5 дней назад');
    expect(plural(22, 'элемент', 'элемента', 'элементов')).toBe('элемента');
    expect(plural(11, 'элемент', 'элемента', 'элементов')).toBe('элементов');
  });

  it('takes a board id from a link or the id itself', () => {
    expect(idFromLink('https://plan.example/?board=ab_12')).toBe('ab_12');
    expect(idFromLink(' ab_12 ')).toBe('ab_12');
    expect(idFromLink('https://plan.example/')).toBeNull();
    expect(idFromLink('не ссылка')).toBeNull();
  });
});

describe('folders', () => {
  const folder = (id: string, parent: string | null): FolderEntry => ({ id, title: id, color: '#000', parent, created: 0, opened: 0 });
  const folders = [folder('work', null), folder('sprints', 'work'), folder('s42', 'sprints'), folder('home', null)];

  it('gives the path from the top down', () => {
    expect(pathTo('s42', folders).map((f) => f.id)).toEqual(['work', 'sprints', 's42']);
    expect(pathTo(null, folders)).toEqual([]);
  });

  it("knows what's inside a folder, however deep, so it can't be moved into itself", () => {
    expect([...withInside('work', folders)].sort()).toEqual(['s42', 'sprints', 'work']);
    const boards = [newEntry('a', { folder: 's42' }), newEntry('b', { folder: 'home' }), newEntry('c')];
    expect(boardsInside('work', boards, folders).map((b) => b.id)).toEqual(['a']);
  });

  it('puts what names a deleted folder at the top', () => {
    expect(placeOf('sprints', folders)).toBe('sprints');
    expect(placeOf('gone', folders)).toBeNull();
    expect(placeOf(undefined, folders)).toBeNull();
  });
});

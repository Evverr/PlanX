import { describe, expect, it } from 'vitest';
import { Board } from '../src/model/board';
import type { Item } from '../src/model/types';
import { myId } from '../src/labs/labs';
import { mine, pollLayout, pressPoll, setAnswers, votesOf } from '../src/labs/poll';

const make = () => {
  const b = new Board();
  b.add({ id: 'p', type: 'rect', x: 0, y: 0, w: 360, h: 300, z: 1, poll: true, pd: true, pq: 'Тренировка в 10:00?', po: ['буду', '', 'не смогу'], pa: myId() } as Item);
  return b;
};

describe('«Голосование»', () => {
  it('starts with its empty answers left out, its height for them; not with fewer than two', () => {
    const b = make();
    pressPoll(b, b.get('p')!, 'start');
    const p = b.get('p')!;
    expect(p.pd).toBeUndefined();
    expect(p.po).toEqual(['буду', 'не смогу']);
    expect(p.h).toBe(Math.round(pollLayout(p).h));
    const c = new Board();
    c.add({ id: 'q', type: 'rect', x: 0, y: 0, w: 360, h: 300, z: 1, poll: true, pd: true, po: ['одно', ''] } as Item);
    pressPoll(c, c.get('q')!, 'start');
    expect(c.get('q')!.pd).toBe(true);
  });

  it('grows with an answer added', () => {
    const b = make(), h = pollLayout(b.get('p')!).h;
    setAnswers(b, b.get('p')!, ['буду', '', 'не смогу', '']);
    expect(b.get('p')!.h).toBeGreaterThan(h);
  });

  it('takes my votes, several, each its own field; clicked again, unpicked; others\' votes kept apart', () => {
    const b = make();
    pressPoll(b, b.get('p')!, 'start');
    pressPoll(b, b.get('p')!, { answer: 1 });
    pressPoll(b, b.get('p')!, { answer: 0 });
    expect(mine(b.get('p')!)).toEqual([0, 1]);
    b.update('p', { 'pv:someone': [1] } as Partial<Item>);
    expect(votesOf(b.get('p')!).size).toBe(2);
    pressPoll(b, b.get('p')!, { answer: 0 });
    pressPoll(b, b.get('p')!, { answer: 1 });
    expect(mine(b.get('p')!)).toEqual([]);
    expect([...votesOf(b.get('p')!).keys()]).toEqual(['someone']);
  });

  it('is set up again by «Редактировать», votes kept', () => {
    const b = make();
    pressPoll(b, b.get('p')!, 'start');
    pressPoll(b, b.get('p')!, { answer: 0 });
    pressPoll(b, b.get('p')!, 'edit');
    expect(b.get('p')!.pd).toBe(true);
    expect(mine(b.get('p')!)).toEqual([0]);
  });
});

import { useEffect, useRef, useState } from 'react';
import { searchIcons } from '../icons/icons';
import { Glyph } from './glyphs';

export function IconPicker({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (matchMedia('(pointer: fine)').matches) input.current?.focus();
  }, []);
  const found = searchIcons(q);
  return (
    <div className="pop icon-pick" role="dialog" aria-label="Иконки">
      <input ref={input} id="icon-search" type="search" placeholder="Найти иконку" aria-label="Найти иконку"
        autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="icon-grid">
        {found.map((i) => (
          <button key={i.id} title={i.ru} aria-label={i.ru} onClick={() => onPick(i.id)}>
            <Glyph id={i.id} />
          </button>
        ))}
      </div>
      {!found.length && <p className="muted">Ничего не нашлось</p>}
    </div>
  );
}

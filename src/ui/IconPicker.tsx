import { useEffect, useRef, useState } from 'react';
import { searchIcons } from '../icons/icons';
import { EMOJI } from '../emoji/emoji';
import { Glyph } from './glyphs';

type Tab = 'emoji' | 'icons';

/** Emoji and icons to put on the board, on two tabs; emoji first. */
export function IconPicker({ onPickEmoji, onPickIcon }: { onPickEmoji: (id: string) => void; onPickIcon: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>('emoji');
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (tab === 'icons' && matchMedia('(pointer: fine)').matches) input.current?.focus();
  }, [tab]);
  const found = tab === 'icons' ? searchIcons(q) : [];
  return (
    <div className="pop icon-pick" role="dialog" aria-label="Смайлы и иконки">
      <div className="pick-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'emoji'} className={tab === 'emoji' ? 'on' : ''} onClick={() => setTab('emoji')}>Смайлы</button>
        <button role="tab" aria-selected={tab === 'icons'} className={tab === 'icons' ? 'on' : ''} onClick={() => setTab('icons')}>Иконки</button>
      </div>
      {tab === 'emoji' ? (
        <div className="icon-grid emoji-grid">
          {EMOJI.map((e) => (
            <button key={e.id} aria-label="Смайл" onClick={() => onPickEmoji(e.id)}><img src={e.url} alt="" draggable={false} /></button>
          ))}
        </div>
      ) : (
        <>
          <input ref={input} id="icon-search" type="search" placeholder="Найти иконку" aria-label="Найти иконку"
            autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="icon-grid">
            {found.map((i) => (
              <button key={i.id} title={i.ru} aria-label={i.ru} onClick={() => onPickIcon(i.id)}>
                <Glyph id={i.id} />
              </button>
            ))}
          </div>
          {!found.length && <p className="muted">Ничего не нашлось</p>}
        </>
      )}
    </div>
  );
}

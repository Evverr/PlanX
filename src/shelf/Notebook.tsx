import type { Cover } from './boards';

/**
 * A board drawn as a notebook standing on the shelf: a coloured cover with a spine, an elastic band,
 * a paper label with the name and, if chosen, a window with a picture of the board.
 */
export function Notebook({ title, cover, thumb, pinned }: { title: string; cover: Cover; thumb?: string | null; pinned?: boolean }) {
  const peek = cover.peek && !!thumb;
  return (
    <span className={`nb ${peek ? 'peeking' : ''}`} data-pattern={cover.pattern} style={{ '--cover': cover.color } as React.CSSProperties}>
      <span className="nb-pages" />
      <span className="nb-body">
        {peek && <span className="nb-window"><img src={thumb!} alt="" draggable={false} /></span>}
        <span className="nb-label">{title || 'Без названия'}</span>
        <span className="nb-band" />
        {pinned && <span className="nb-ribbon" title="В избранном" />}
      </span>
    </span>
  );
}

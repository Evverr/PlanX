import { ICON_BY_ID } from '../icons/icons';

/** An icon from the board's icon set. */
export function Glyph({ id, className }: { id: string; className?: string }) {
  const icon = ICON_BY_ID.get(id);
  if (!icon) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {icon.paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill === 'current' ? 'currentColor' : p.fill} fillOpacity={p.opacity}
          fillRule={p.evenodd ? 'evenodd' : undefined} clipRule={p.evenodd ? 'evenodd' : undefined} />
      ))}
    </svg>
  );
}

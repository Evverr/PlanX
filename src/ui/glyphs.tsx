import { ICON_BY_ID } from '../icons/icons';

/** Line icons for the app's own controls. */
const STROKES = {
  select: 'M5 3l14 8-6 1.5L10 19z',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7s-4.5-1.5-6.5-5L3 13.5a1.5 1.5 0 0 1 2.4-1.8L8 14',
  sticky: 'M4 4h16v10l-6 6H4zM14 20v-6h6',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  rect: 'M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  ellipse: 'M3.5 12a8.5 6.5 0 1 0 17 0a8.5 6.5 0 1 0-17 0',
  link: 'M5 19L19 5M11 5h8v8',
  frame: 'M7 3v18M17 3v18M3 7h18M3 17h18',
  minus: 'M5 12h14',
  plus: 'M5 12h14M12 5v14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  front: 'M8 8h12v12H8zM4 16V4h12',
  back: 'M4 4h12v12H4zM20 8v12H8',
  dup: 'M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3',
  del: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  smaller: 'M4 18l4-10 4 10M5.5 14.5h5M15 13h6',
  bigger: 'M3 19l5-13 5 13M5 15h6M15 12h6M18 9v6',
  help: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
} as const;

export type StrokeName = keyof typeof STROKES;

export function Stroke({ name }: { name: StrokeName }) {
  return (
    <svg viewBox="0 0 24 24" className="stroke" aria-hidden="true">
      <path d={STROKES[name]} />
    </svg>
  );
}

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

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Glyph } from './glyphs';

/** How long the picture comes in, stays and flies off, in ms (matched by the keyframes in the styles). */
const COME = 500, STAY = 1000, GO = 500;

/**
 * The picture over the board once it's been cleared: it comes in over half a second, stays a second,
 * then fades away as it grows, as if flying at you. It lets clicks through the whole time.
 * (A broom from the icon set for now, till the picture is drawn.)
 */
export function ClearFx({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, COME + STAY + GO);
    return () => clearTimeout(t);
  }, [onDone]);
  return createPortal(
    <div className="clear-fx" aria-hidden="true" style={{ '--come': `${COME}ms`, '--stay': `${STAY}ms`, '--go': `${GO}ms` } as React.CSSProperties}>
      <Glyph id="broom" className="clear-fx-pic" />
    </div>,
    document.body,
  );
}

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import picture from './clear/plan.webp';

/** How long the picture comes in, stays and flies off, in ms (matched by the keyframes in the styles). */
const COME = 1000, STAY = 600, GO = 1000;

/**
 * The picture over the board once it's been cleared: it comes in growing from small, stays a
 * moment, then fades away growing faster and faster, as if flying at you. It lets clicks through
 * the whole time. Fetched only when first shown.
 */
export function ClearFx({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, COME + STAY + GO);
    return () => clearTimeout(t);
  }, [onDone]);
  return createPortal(
    <div className="clear-fx" aria-hidden="true" style={{ '--come': `${COME}ms`, '--stay': `${STAY}ms`, '--go': `${GO}ms` } as React.CSSProperties}>
      <img className="clear-fx-pic" src={picture} alt="" draggable={false} />
    </div>,
    document.body,
  );
}

import { useEffect, useRef, useState } from 'react';

/** Hue (0…360), saturation and brightness (0…1). */
interface Hsv { h: number; s: number; v: number }

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');

function toHex({ h, s, v }: Hsv): string {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return `#${hex2(f(5) * 255)}${hex2(f(3) * 255)}${hex2(f(1) * 255)}`;
}

function toHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: max ? d / max : 0, v: max };
}

/**
 * Any colour, the way the browser's own picker offers it (a saturation/brightness square, a hue strip
 * and the colour's code), in a popover of the app's style. Dragging is one change (onStart … onEnd).
 */
export function ColorPicker({ value, onChange, onStart, onEnd }: {
  value: string; onChange: (hex: string) => void; onStart?: () => void; onEnd?: () => void;
}) {
  const [hsv, setHsv] = useState(() => toHsv(/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffe27a'));
  const [code, setCode] = useState(toHex(hsv));
  useEffect(() => setCode(toHex(hsv)), [hsv]);
  const pick = (next: Hsv) => { setHsv(next); onChange(toHex(next)); };

  // Dragging in the square or along the strip, from the press on.
  const drag = (el: HTMLElement, e: React.PointerEvent, at: (fx: number, fy: number) => Hsv) => {
    const r = el.getBoundingClientRect();
    const go = (x: number, y: number) => pick(at(Math.min(1, Math.max(0, (x - r.left) / r.width)), Math.min(1, Math.max(0, (y - r.top) / r.height))));
    onStart?.();
    go(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => go(ev.clientX, ev.clientY);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onEnd?.(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const square = useRef<HTMLDivElement>(null), strip = useRef<HTMLDivElement>(null);
  const hue = `hsl(${hsv.h}, 100%, 50%)`;
  return (
    <div className="color-picker" data-nosort onPointerDown={(e) => e.stopPropagation()}>
      <div ref={square} className="cp-square" style={{ background: hue }}
        onPointerDown={(e) => drag(square.current!, e, (fx, fy) => ({ h: hsv.h, s: fx, v: 1 - fy }))}>
        <i style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: toHex(hsv) }} />
      </div>
      <div className="cp-row">
        <span className="cp-swatch" style={{ background: toHex(hsv) }} />
        <div ref={strip} className="cp-hue" onPointerDown={(e) => drag(strip.current!, e, (fx) => ({ ...hsv, h: fx * 360 }))}>
          <i style={{ left: `${(hsv.h / 360) * 100}%`, background: hue }} />
        </div>
      </div>
      <label className="cp-code">
        <span>HEX</span>
        <input value={code} spellCheck={false} maxLength={7} aria-label="Код цвета"
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            setCode(v);
            if (/^#[0-9a-f]{6}$/i.test(v)) pick(toHsv(v));
          }} />
      </label>
    </div>
  );
}

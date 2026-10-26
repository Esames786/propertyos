import { animate } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../preferences/PreferencesProvider';

/**
 * Counts from the previous value to the new one (first paint counts up from zero). Assistive
 * technology only ever gets the final text; the moving digits are hidden from it. Under reduced
 * motion the final value renders immediately.
 */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(reduced ? value : 0);
  useEffect(() => {
    if (reduced) {
      from.current = value;
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(v),
      onComplete: () => {
        from.current = value;
      },
    });
    return () => {
      from.current = value;
      controls.stop();
    };
  }, [value, reduced]);
  return (
    <span className={className}>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden>{format(shown)}</span>
    </span>
  );
}

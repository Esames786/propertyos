import { useLayoutEffect, useRef, useState } from 'react';

/** Content-box size of an element, kept current with ResizeObserver (charts redraw to fit). */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize((s) => (Math.round(rect.width) === s.width && Math.round(rect.height) === s.height ? s : { width: Math.round(rect.width), height: Math.round(rect.height) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

import type { ReactNode } from 'react';

/** Text for screen readers only (still in the accessibility tree). */
export function VisuallyHidden({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span id={id} className="sr-only">
      {children}
    </span>
  );
}

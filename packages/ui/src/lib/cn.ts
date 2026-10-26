import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** Tailwind-aware class merge: later classes win for the same CSS property (e.g. `hidden` over `inline-flex`). */
const merge = extendTailwindMerge({
  extend: {
    theme: { radius: ['sm', 'control', 'card', 'pill'] },
  },
});

export function cn(...values: ClassValue[]): string {
  return merge(clsx(values));
}

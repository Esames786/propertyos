import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Tailwind-aware class merge: later classes win for the same CSS property (e.g. `hidden` over `inline-flex`).
 * The design system's own text sizes are listed so they are read as sizes; unknown `text-*` names are
 * taken for colours, and `text-nav text-muted` would otherwise lose its size.
 */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['sm', 'control', 'tile', 'card', 'pill'],
      text: ['micro', 'mini', 'small', 'md', 'lead', 'figure-xs', 'figure-sm', 'figure', 'figure-lg', 'figure-xl', 'hero', 'nav', 'chrome'],
    },
  },
});

export function cn(...values: ClassValue[]): string {
  return merge(clsx(values));
}

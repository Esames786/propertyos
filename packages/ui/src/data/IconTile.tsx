import type { TileHue } from '@repo/tokens';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';

export type { TileHue };

/** Full class strings (Tailwind only generates classes it can see). */
const SOFT: Record<TileHue, string> = {
  emerald: 'bg-tile-emerald-soft text-tile-emerald-ink',
  teal: 'bg-tile-teal-soft text-tile-teal-ink',
  sky: 'bg-tile-sky-soft text-tile-sky-ink',
  violet: 'bg-tile-violet-soft text-tile-violet-ink',
  rose: 'bg-tile-rose-soft text-tile-rose-ink',
  amber: 'bg-tile-amber-soft text-tile-amber-ink',
  orange: 'bg-tile-orange-soft text-tile-orange-ink',
  slate: 'bg-tile-slate-soft text-tile-slate-ink',
  gold: 'bg-tile-gold-soft text-tile-gold-ink',
};

const SOLID: Record<TileHue, string> = {
  emerald: 'bg-tile-emerald text-on-tile',
  teal: 'bg-tile-teal text-on-tile',
  sky: 'bg-tile-sky text-on-tile',
  violet: 'bg-tile-violet text-on-tile',
  rose: 'bg-tile-rose text-on-tile',
  amber: 'bg-tile-amber text-on-tile',
  orange: 'bg-tile-orange text-on-tile',
  slate: 'bg-tile-slate text-on-tile',
  gold: 'bg-tile-gold text-on-tile',
};

/** Ink colour of a hue, for small accents next to a tile (text-safe on cards). */
export const TILE_INK: Record<TileHue, string> = {
  emerald: 'text-tile-emerald-ink',
  teal: 'text-tile-teal-ink',
  sky: 'text-tile-sky-ink',
  violet: 'text-tile-violet-ink',
  rose: 'text-tile-rose-ink',
  amber: 'text-tile-amber-ink',
  orange: 'text-tile-orange-ink',
  slate: 'text-tile-slate-ink',
  gold: 'text-tile-gold-ink',
};

export const TILE_SOFT_BG: Record<TileHue, string> = {
  emerald: 'bg-tile-emerald-soft',
  teal: 'bg-tile-teal-soft',
  sky: 'bg-tile-sky-soft',
  violet: 'bg-tile-violet-soft',
  rose: 'bg-tile-rose-soft',
  amber: 'bg-tile-amber-soft',
  orange: 'bg-tile-orange-soft',
  slate: 'bg-tile-slate-soft',
  gold: 'bg-tile-gold-soft',
};

const SIZE = {
  sm: ['size-8 rounded-[0.625rem]', 'size-4'],
  md: ['size-10 rounded-tile', 'size-5'],
  lg: ['size-12 rounded-tile', 'size-6'],
  xl: ['size-14 rounded-[1.125rem]', 'size-7'],
} as const;

/**
 * Icon wayfinding square. `soft` (tinted square, ink glyph) marks a module or metric; `solid`
 * (white glyph) is reserved for quick-action tiles. Decorative: the label beside it names it.
 */
export function IconTile({
  icon: Icon,
  hue,
  variant = 'soft',
  size = 'md',
  className,
}: {
  icon: LucideIcon;
  hue: TileHue;
  variant?: 'soft' | 'solid';
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const [box, glyph] = SIZE[size];
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center', box, variant === 'solid' ? SOLID[hue] : SOFT[hue], className)}>
      <Icon className={glyph} strokeWidth={2} />
    </span>
  );
}

/** Small tinted chip for a neutral attribute (tower, block, project). Not for status: use StatusLabel. */
export function HueChip({ hue, children, className }: { hue: TileHue; children: string; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full items-center rounded-pill px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', SOFT[hue], className)}>
      <span className="truncate">{children}</span>
    </span>
  );
}

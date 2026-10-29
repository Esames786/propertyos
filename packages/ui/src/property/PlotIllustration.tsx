import { cn } from '../lib/cn';

/**
 * Procedural site plan for residential plots (a plot is land, so no photograph): a street grid,
 * a park, and plot parcels with a few highlighted as available. Decorative; the card's text
 * carries the information. Drawn in tokens so it follows the palette.
 */
export function PlotIllustration({ className }: { className?: string }) {
  const parcels: Array<[number, number, boolean]> = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      parcels.push([24 + col * 40, 30 + row * 52, (row * 7 + col) % 3 === 1]);
    }
  }
  return (
    <svg aria-hidden data-decorative viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" className={cn('block size-full', className)}>
      <rect width="320" height="200" fill="var(--color-raised)" />
      {/* roads */}
      <rect x="0" y="20" width="320" height="6" fill="var(--color-sunken)" />
      <rect x="0" y="176" width="320" height="6" fill="var(--color-sunken)" />
      <rect x="10" y="0" width="6" height="200" fill="var(--color-sunken)" />
      {/* park */}
      <rect x="268" y="32" width="48" height="138" rx="10" fill="var(--color-primary-soft)" />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={284 + (i % 2) * 16} cy={52 + i * 26} r={7} fill="var(--color-ever-1)" opacity={0.85} />
      ))}
      {parcels.map(([x, y, highlight], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={34}
          height={44}
          rx={3}
          fill={highlight ? 'var(--color-ever-2)' : 'var(--color-panel)'}
          stroke={highlight ? 'var(--color-ever-3)' : 'var(--color-border)'}
          strokeWidth={1}
        />
      ))}
      <circle cx="160" cy="105" r="4" fill="var(--color-brass)" />
    </svg>
  );
}

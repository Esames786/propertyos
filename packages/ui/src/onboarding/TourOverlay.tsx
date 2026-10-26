import { cn } from '../lib/cn';
import type { Box } from './placement';

/**
 * Dimmed surroundings with a spotlight cut-out and a high-contrast ring (doc 09 §4).
 * The dimming is a box-shadow on the ring, so it never captures clicks: guided-action targets
 * stay usable; modal steps make the app inert separately. Purely visual, hidden from AT.
 */
export function TourOverlay({ rect, reducedMotion, highContrast }: { rect: Box | null; reducedMotion: boolean; highContrast: boolean }) {
  if (!rect) {
    return <div aria-hidden data-testid="tour-scrim" className="pointer-events-none fixed inset-0 bg-scrim" />;
  }
  const pad = 8;
  // Keep the ring on screen when the target touches the viewport edge (e.g. a full-height sidebar).
  const top = Math.max(2, rect.top - pad);
  const left = Math.max(2, rect.left - pad);
  const right = Math.min(window.innerWidth - 2, rect.left + rect.width + pad);
  const bottom = Math.min(window.innerHeight - 2, rect.top + rect.height + pad);
  return (
    <div
      aria-hidden
      data-testid="tour-spotlight"
      className={cn(
        'pointer-events-none fixed rounded-card',
        !reducedMotion && 'transition-[top,left,width,height] duration-[var(--motion-tour)] ease-[var(--ease-standard)]',
      )}
      style={{
        top,
        left,
        width: right - left,
        height: bottom - top,
        boxShadow: `0 0 0 var(--tour-ring-width) var(--color-focus), 0 0 0 calc(var(--tour-ring-width) + 2px) #ffffff, 0 0 0 9999px var(--color-scrim)`,
        outline: highContrast ? '2px solid #ffffff' : undefined,
      }}
    >
      {!reducedMotion && <span data-testid="tour-pulse" className="absolute inset-0 animate-tour-pulse rounded-card" />}
    </div>
  );
}

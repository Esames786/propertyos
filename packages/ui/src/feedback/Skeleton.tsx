import { cn } from '../lib/cn';
import { useT } from '../lib/useT';

/** Placeholder shapes while content loads; never stands in for a result. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-sm bg-sunken [animation-duration:1.6s]', className)} />;
}

/** A labelled loading region: screen readers hear "Loading…" once, sighted users see shapes. */
export function SkeletonBlock({ lines = 3, label, className }: { lines?: number; label?: string; className?: string }) {
  const { t } = useT();
  return (
    <div role="status" aria-busy="true" className={cn('space-y-3', className)} data-testid="skeleton">
      <span className="sr-only">{label ?? t('common:state.loading')}</span>
      <Skeleton className="h-5 w-2/5" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  );
}

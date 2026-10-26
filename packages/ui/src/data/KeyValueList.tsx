import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/** Label/value pairs as a description list; stacks on narrow screens. */
export function KeyValueList({ items, className }: { items: Array<{ label: string; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 @md:grid-cols-[minmax(8rem,auto)_1fr]', className)}>
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-sm text-muted">{item.label}</dt>
          <dd className="min-w-0 text-sm text-text max-@md:mb-2">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

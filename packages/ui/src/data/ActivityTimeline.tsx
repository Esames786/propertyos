import type { ActivityEvent } from '@repo/contracts';
import { CalendarClock, FileText, Phone, RefreshCw, Settings2, StickyNote, Wallet, type LucideIcon } from 'lucide-react';
import { dynamicT, useT } from '../lib/useT';
import { DateTime } from './DateTime';

const KIND_ICON: Record<ActivityEvent['kind'], LucideIcon> = {
  note: StickyNote,
  call: Phone,
  visit: CalendarClock,
  status: RefreshCw,
  document: FileText,
  payment: Wallet,
  system: Settings2,
};

/** Chronological activity as an ordered list; each entry has actor, translated text and time. */
export function ActivityTimeline({
  events,
  renderParams,
}: {
  events: readonly ActivityEvent[];
  /** Lets callers localise parameter values (dates, codes) before interpolation. */
  renderParams?: (event: ActivityEvent) => Record<string, string>;
}) {
  const { t } = useT();
  return (
    <ol aria-label={t('common:activity.timelineLabel')} className="relative space-y-4 border-s border-border ps-6">
      {events.map((event) => {
        const Icon = KIND_ICON[event.kind];
        return (
          <li key={event.id} className="relative">
            <span className="absolute -start-[2.05rem] top-0.5 grid size-6 place-items-center rounded-pill border border-border bg-panel text-muted">
              <Icon aria-hidden className="size-3.5" />
            </span>
            <p className="text-sm text-text">
              <bdi className="font-medium">{event.actorName}</bdi>{' '}
              <span>{dynamicT(t)(`common:${event.messageKey}`, renderParams?.(event) ?? event.params)}</span>
            </p>
            <p className="text-xs text-muted">
              <DateTime value={event.at} relative />
            </p>
          </li>
        );
      })}
    </ol>
  );
}

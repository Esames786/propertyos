import { AVAILABILITY_BUCKETS, type AccessTarget, type AvailabilityBucket, type BucketCounts, type InventoryEvent, type ProjectState, type StorageLocation, type StorageState } from '@repo/contracts';
import { Badge, cn, dynamicT, InlineAlert, Link, useSession, useT, type StatusTone } from '@repo/ui';
import { BadgeCheck, Ban, Bookmark, CheckCircle2, CircleDashed, Hourglass, Lock, Undo2, Wrench, type LucideIcon } from 'lucide-react';
import { useCrmFormat } from '../../crm/format';

/**
 * Gate E.2 shared pieces (projects and inventory, provisional): addresses, access targets, the area's
 * own navigation, status badges that never rely on colour alone (icon, words and a pattern), the
 * availability bar with its numbers in words, and the audit sentence of an event.
 */

const qs = (q: Record<string, string | undefined | null> = {}) => {
  const p = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => !!e[1]));
  return p.size ? `?${p}` : '';
};

export const PRJ = {
  list: (q?: Record<string, string | undefined>) => `/backoffice/prj/projects-list${qs(q)}`,
  p360: (id: string, tab?: string) => `/backoffice/prj/project-360-workspace${qs({ record: id, tab })}`,
  setup: (q?: Record<string, string | undefined>) => `/backoffice/prj/project-setup${qs(q)}`,
  matrix: (q?: Record<string, string | undefined>) => `/backoffice/inv/unit-matrix${qs(q)}`,
  availability: (q?: Record<string, string | undefined>) => `/backoffice/inv/live-availability${qs(q)}`,
  storage: (q?: Record<string, string | undefined>) => `/backoffice/inv/storage-inventory${qs(q)}`,
  lead: (id: string) => `/backoffice/crm/lead-360-workspace?record=${id}`,
  leads: '/backoffice/crm/leads-list',
} as const;

/** What each screen needs (the mock API checks the same, and more, on every request). */
export const TARGETS = {
  projects: { module: 'projects', anyOf: ['project.view', 'unit.view'] },
  setup: { module: 'projects', anyOf: ['project.view', 'project.manage', 'project.approve'] },
  inventory: { module: 'inventory', permission: 'unit.view' },
} as const satisfies Record<string, AccessTarget>;

type Section = 'projects' | 'setup' | 'matrix' | 'availability' | 'storage';

const SECTIONS: Array<{ id: Section; href: string; target: AccessTarget }> = [
  { id: 'projects', href: PRJ.list(), target: TARGETS.projects },
  { id: 'setup', href: PRJ.setup(), target: TARGETS.setup },
  { id: 'matrix', href: PRJ.matrix(), target: TARGETS.inventory },
  { id: 'availability', href: PRJ.availability(), target: TARGETS.inventory },
  { id: 'storage', href: PRJ.storage(), target: TARGETS.inventory },
];

/** The area's own navigation: every screen one step from the others, shown only to the people allowed. */
export function AreaNav({ current }: { current: Section }) {
  const { t } = useT();
  const { allows } = useSession();
  const shown = SECTIONS.filter((s) => allows(s.target));
  if (shown.length < 2) return null;
  return (
    <nav aria-label={t('projects:nav.label')} className="-mt-2 mb-5" data-testid="prj-nav">
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((s) => (
          <li key={s.id}>
            <Link
              href={s.href}
              variant="plain"
              aria-current={s.id === current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center rounded-pill border px-3 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-focus',
                s.id === current ? 'border-primary bg-primary text-on-primary' : 'border-border bg-panel text-text hover:bg-raised',
              )}
              data-testid={`prj-nav-${s.id}`}
            >
              {t(`projects:nav.${s.id}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export const BUCKET_LOOK: Record<AvailabilityBucket, [StatusTone, LucideIcon]> = {
  available: ['success', CheckCircle2],
  held: ['warning', Lock],
  reserved: ['info', Bookmark],
  booked: ['neutral', BadgeCheck],
  unavailable: ['neutral', Ban],
};

/**
 * A pattern per bucket on top of the tone, so a cell's status is never told by colour alone: held is
 * hatched, reserved dotted, booked solid, not-for-sale crossed. The words in the cell say it too.
 */
export const BUCKET_CELL: Record<AvailabilityBucket, string> = {
  available: 'border-success/50 bg-success-soft text-text',
  held: 'border-warning/60 bg-warning-soft text-text [background-image:repeating-linear-gradient(135deg,transparent_0_7px,color-mix(in_srgb,var(--color-warning)_22%,transparent)_7px_9px)]',
  reserved: 'border-info/50 bg-info-soft text-text [background-image:radial-gradient(color-mix(in_srgb,var(--color-info)_30%,transparent)_1px,transparent_1.5px)] [background-size:7px_7px]',
  booked: 'border-border bg-sunken text-text',
  unavailable: 'border-border bg-panel text-muted [background-image:repeating-linear-gradient(45deg,transparent_0_9px,color-mix(in_srgb,var(--color-muted)_18%,transparent)_9px_10px),repeating-linear-gradient(-45deg,transparent_0_9px,color-mix(in_srgb,var(--color-muted)_18%,transparent)_9px_10px)]',
};

export function BucketBadge({ bucket, testId }: { bucket: AvailabilityBucket; testId?: string }) {
  const { t } = useT();
  const [tone, icon] = BUCKET_LOOK[bucket];
  return (
    <Badge tone={tone} icon={icon} data-testid={testId} data-bucket={bucket}>
      {t(`projects:bucket.${bucket}`)}
    </Badge>
  );
}

const STATE: Record<ProjectState, [StatusTone, LucideIcon]> = {
  draft: ['neutral', CircleDashed],
  submitted: ['info', Hourglass],
  returned: ['warning', Undo2],
  active: ['success', BadgeCheck],
};

export function StateBadge({ state, testId }: { state: ProjectState; testId?: string }) {
  const { t } = useT();
  const [tone, icon] = STATE[state];
  return (
    <Badge tone={tone} icon={icon} data-testid={testId} data-state={state}>
      {t(`projects:state.${state}`)}
    </Badge>
  );
}

const STORAGE: Record<StorageState, [StatusTone, LucideIcon]> = {
  available: ['success', CheckCircle2],
  allocated: ['neutral', BadgeCheck],
  out_of_service: ['warning', Wrench],
};

export function StorageBadge({ state }: { state: StorageState }) {
  const { t } = useT();
  const [tone, icon] = STORAGE[state];
  return (
    <Badge tone={tone} icon={icon} data-testid="storage-state" data-state={state}>
      {t(`projects:storage.state.${state}`)}
    </Badge>
  );
}

export function SeedBadge() {
  const { t } = useT();
  return <Badge tone="demo">{t('projects:seed.badge')}</Badge>;
}

const BAR: Record<AvailabilityBucket, string> = {
  available: 'bg-success',
  held: 'bg-warning',
  reserved: 'bg-info',
  booked: 'bg-muted',
  unavailable: 'bg-border',
};

/** The availability split of some units: a bar (an image named with every number) and the numbers in words. */
export function BucketBar({ counts, total, testId, hrefFor }: { counts: BucketCounts; total: number; testId?: string; hrefFor?: (b: AvailabilityBucket) => string }) {
  const { t } = useT();
  const f = useInvFormat();
  const summary = AVAILABILITY_BUCKETS.map((b) => t('projects:common.count', { label: t(`projects:bucket.${b}`), count: f.count(counts[b]) })).join(', ');
  return (
    <div className="space-y-2" data-testid={testId}>
      <div role="img" aria-label={t('projects:common.bucketChart', { summary })} className="flex h-2.5 w-full overflow-hidden rounded-pill bg-sunken">
        {AVAILABILITY_BUCKETS.filter((b) => counts[b] > 0).map((b) => (
          <span key={b} className={cn('h-full', BAR[b])} style={{ inlineSize: `${(counts[b] / Math.max(total, 1)) * 100}%` }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {AVAILABILITY_BUCKETS.map((b) => {
          const [, Icon] = BUCKET_LOOK[b];
          const content = (
            <>
              <Icon aria-hidden className="size-3.5 shrink-0 text-muted" />
              <span className="text-muted">{t(`projects:bucket.${b}`)}</span> <span className="font-semibold text-text tabular-nums">{f.count(counts[b])}</span>
            </>
          );
          return (
            <li key={b} className="inline-flex items-center gap-1.5" data-bucket={b} data-count={counts[b]}>
              {hrefFor && counts[b] > 0 ? (
                <Link href={hrefFor(b)} variant="plain" className="inline-flex items-center gap-1.5 rounded-control underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Formatting for the area: counts, money, areas and instants in the reader's language. */
export function useInvFormat() {
  return useCrmFormat();
}

/** A storage unit's place in words. */
export function useLocationText() {
  const { t } = useT();
  return (l: StorageLocation) => (l.tower ? t('projects:storage.location.tower', { tower: l.tower, basement: String(l.basement ?? 1) }) : t('projects:storage.location.block', { block: l.block ?? '' }));
}

/** An audit entry as a sentence (the lead only when the server kept it for this reader). */
export function useEventText() {
  const { t } = useT();
  const dt = dynamicT(t);
  return (e: InventoryEvent) => {
    const withLead = (e.kind === 'unit_held' || e.kind === 'unit_released') && e.refs.lead;
    return dt(`projects:events.${e.kind}${withLead ? '_lead' : ''}`, { actor: e.actorName, unit: e.refs.unit ?? '', storage: e.refs.storage ?? '', setup: e.refs.setup ?? '', lead: e.refs.lead ?? '' });
  };
}

/** Where the reserved and booked states come from (never a fake sale). */
export function SeedNote({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <InlineAlert tone="info" className={className} data-testid="seed-note">
      {t('projects:seed.note')}
    </InlineAlert>
  );
}

/** This wave's screens are provisional until the Gate E foundation is reviewed and integrated. */
export function ProvisionalNote() {
  const { t } = useT();
  return (
    <p className="text-xs text-muted" data-testid="prj-provisional">
      {t('projects:provisional')}
    </p>
  );
}

const WORD_JOINER = String.fromCharCode(0x2060);
/** A reference kept on one line (no break after its hyphens). */
export const unbroken = (ref: string) => ref.replace(/-/g, `-${WORD_JOINER}`);

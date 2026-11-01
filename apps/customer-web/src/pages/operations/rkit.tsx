import type { OpsFile, RequestState, ResidentCount } from '@repo/contracts';
import { Badge, Button, cn, Drawer, PlainTextField, useT, type StatusTone } from '@repo/ui';
import { BadgeCheck, Ban, CheckCircle2, CircleDot, EyeOff, GitMerge, Hammer, ImagePlus, PauseCircle, Trash2, UserCheck, Users, type LucideIcon } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';

/**
 * Pieces of the resident operations screens (Gate D.2): states in words with an icon (never colour
 * alone), the names of places and categories, an honest count of affected households (D-47: a number
 * only when the privacy rule allows it, otherwise "Reported") and a picker for fictional photos.
 */

const STATE: Record<RequestState, [StatusTone, LucideIcon]> = {
  submitted: ['info', CircleDot],
  triaged: ['info', BadgeCheck],
  assigned: ['info', UserCheck],
  in_progress: ['warning', Hammer],
  on_hold: ['warning', PauseCircle],
  completed: ['success', CheckCircle2],
  closed: ['neutral', CheckCircle2],
  resolved: ['success', CheckCircle2],
  cancelled: ['neutral', Ban],
  merged: ['neutral', GitMerge],
  hidden: ['neutral', EyeOff],
};

export function ResidentStateChip({ state, className }: { state: RequestState; className?: string }) {
  const { t } = useT();
  const [tone, icon] = STATE[state];
  return (
    <Badge tone={tone} icon={icon} className={className} data-testid="request-state" data-state={state}>
      {t(`operations:residentState.${state}`)}
    </Badge>
  );
}

export function useWords() {
  const { t } = useT();
  return {
    category: (c: string) => t(`operations:category.${c}` as 'operations:category.plumbing'),
    room: (r: string) => t(`operations:room.${r}` as 'operations:room.kitchen'),
    urgency: (u: string) => t(`operations:urgency.${u}` as 'operations:urgency.normal'),
    purpose: (p: string) => t(`operations:purpose.${p}` as 'operations:purpose.guest'),
    slot: (s: string) => t(`operations:slot.${s}` as 'operations:slot.morning'),
    area: (a: { key: string; buildingCode?: string }) => (a.buildingCode ? t('operations:area.inBlock', { place: t(`operations:area.${a.key}` as 'operations:area.lift'), block: a.buildingCode }) : t(`operations:area.${a.key}` as 'operations:area.lift')),
  };
}

/** Affected households as residents may see them (never who). */
export function CountLine({ count, className }: { count: ResidentCount; className?: string }) {
  const { t } = useT();
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)} data-testid="issue-count" data-shown={count.shown}>
      <Users aria-hidden className="size-4 shrink-0 text-muted" />
      {count.shown ? (count.blocks.length ? t('operations:residentIssue.countBlocks', { count: count.site, blocks: count.blocks.map((b) => t('operations:issue.blockCount', { block: b.code, count: b.count })).join(', ') }) : t('operations:residentIssue.count', { count: count.site })) : t('operations:residentIssue.reported')}
    </span>
  );
}

const MAX = 5 * 1024 * 1024;

/** Fictional photos: the file stays in the browser; each needs a few words on what it shows. */
export function PhotoField({ files, onChange, label, testId = 'photos' }: { files: Array<Omit<OpsFile, 'id'>>; onChange: (f: Array<Omit<OpsFile, 'id'>>) => void; label: string; testId?: string }) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2" data-testid={testId}>
      <p id={id} className="text-sm font-medium text-text">
        {label} <span className="text-xs font-normal text-muted">{t('operations:photo.optional', { max: 3 })}</span>
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-labelledby={id}
        tabIndex={-1}
        data-testid={`${testId}-input`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          if (!f.type.startsWith('image/')) return setError(t('operations:errors.fileType'));
          if (f.size > MAX) return setError(t('operations:errors.fileSize'));
          setError(null);
          onChange([...files, { name: f.name, type: f.type, sizeBytes: f.size, alt: '' }]);
        }}
      />
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="space-y-2 rounded-tile border border-border p-3">
          <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0 [overflow-wrap:anywhere]"><bdi dir="ltr">{f.name}</bdi></span>
            <Button variant="quiet" size="sm" icon={Trash2} onPress={() => onChange(files.filter((_, x) => x !== i))} data-testid={`${testId}-remove-${i}`}>
              {t('operations:photo.remove')}
            </Button>
          </p>
          <PlainTextField label={t('operations:photo.alt')} description={t('operations:photo.altHint')} value={f.alt} onChange={(v) => onChange(files.map((x, j) => (j === i ? { ...x, alt: v } : x)))} testId={`${testId}-alt-${i}`} />
        </div>
      ))}
      {files.length < 3 && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={ImagePlus} onPress={() => input.current?.click()} data-testid={`${testId}-add`}>
            {t('operations:photo.add')}
          </Button>
          <Button variant="quiet" onPress={() => onChange([...files, { name: `demo-photo-${files.length + 1}.jpg`, type: 'image/jpeg', sizeBytes: 184_320, alt: '' }])} data-testid={`${testId}-sample`}>
            {t('operations:photo.sample')}
          </Button>
        </div>
      )}
      <p className="text-xs text-muted">{t('operations:photo.demoNote')}</p>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function PhotoStrip({ files }: { files: OpsFile[] }) {
  const { t } = useT();
  if (!files.length) return null;
  return (
    <ul className="grid grid-cols-1 gap-2 @md:grid-cols-2" aria-label={t('operations:photo.listLabel')}>
      {files.map((f) => (
        <li key={f.id} className="flex items-start gap-3 rounded-tile border border-border bg-sunken/40 p-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-control bg-panel text-muted">
            <ImagePlus className="size-5" />
          </span>
          <span className="min-w-0 text-sm text-text"><bdi>{f.alt}</bdi></span>
        </li>
      ))}
    </ul>
  );
}

/** A full-height sheet on phones, a side drawer on larger screens (the shared Drawer does both). */
export function Sheet({ isOpen, onClose, title, subtitle, children, footer, testId }: { isOpen: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; testId: string }) {
  return (
    <Drawer isOpen={isOpen} onOpenChange={(o) => !o && onClose()} title={title} subtitle={subtitle} footer={footer} testId={testId}>
      {children}
    </Drawer>
  );
}

export const DEMO_TODAY = '2026-10-26';
/** The demo's business date at the visitor's wall-clock time in Pakistan, as an ISO instant (for time windows). */
export function demoNow(): Date {
  const wall = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date());
  return new Date(`${DEMO_TODAY}T${wall}+05:00`);
}

/**
 * A moment as a date and a time that each stay whole: a narrow line (a phone, large text) wraps between
 * them, never inside "28 Oct 2026" or "8:00 PM". Each is isolated on its own, so a Latin "11:00 AM"
 * keeps its order after an Urdu date.
 */
export function When({ iso, fmt, className }: { iso: string; fmt: { instant: (iso: string) => string; time: (iso: string) => string }; className?: string }) {
  return (
    <bdi className={className}>
      <bdi className="whitespace-nowrap">{fmt.instant(iso)}</bdi> <bdi className="whitespace-nowrap">{fmt.time(iso)}</bdi>
    </bdi>
  );
}

/** A label and its value on one line when they fit, the value under the label when they do not. */
export function Labelled({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2" data-testid={testId}>
      <span className="text-muted">{label}</span> <span className="min-w-0 text-text">{children}</span>
    </span>
  );
}

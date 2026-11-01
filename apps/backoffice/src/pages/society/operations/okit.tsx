import type {
  AudienceRole,
  BookingState,
  CommonArea,
  GateRequestState,
  NoticeAudience,
  NoticeState,
  OpsFile,
  PassState,
  RequestKind,
  RequestPriority,
  RequestState,
  SlaStatus,
  VehicleState,
  VisitOutcome,
  WorkOrderState,
} from '@repo/contracts';
import { Badge, Button, cn, DateTime, Link, PlainTextField, useSession, useT, type StatusTone } from '@repo/ui';
import {
  AlarmClock,
  Ban,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock3,
  DoorClosed,
  DoorOpen,
  EyeOff,
  Flame,
  GitMerge,
  Hammer,
  Hourglass,
  ImagePlus,
  LogIn,
  LogOut,
  PauseCircle,
  RotateCcw,
  Send,
  ShieldX,
  Siren,
  Timer,
  Trash2,
  TriangleAlert,
  Undo2,
  UserCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';

/**
 * Shared pieces of the D.2 office screens: state badges that always carry words and an icon (never
 * colour alone), the names of categories, places and priorities, the audience of a notice in the
 * reader's language, and a picker for fictional photos that asks what each photo shows.
 */

type Spec<K extends string> = Record<K, [StatusTone, LucideIcon]>;

const badge = <K extends string>(table: Spec<K>, ns: string) =>
  function StateBadge({ state, testId, className }: { state: K; testId?: string; className?: string }) {
    const { t } = useT();
    const [tone, icon] = table[state];
    return (
      <Badge tone={tone} icon={icon} data-testid={testId} data-state={state} className={className}>
        {t(`operations:${ns}.${state}` as 'operations:requestState.submitted')}
      </Badge>
    );
  };

export const RequestBadge = badge<RequestState>(
  {
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
  },
  'requestState',
);

export const SlaBadge = badge<SlaStatus>(
  { on_track: ['success', Timer], at_risk: ['warning', AlarmClock], breached: ['error', TriangleAlert], met: ['success', CheckCircle2], missed: ['error', XCircle], paused: ['neutral', PauseCircle] },
  'sla',
);

export const WorkOrderBadge = badge<WorkOrderState>(
  { assigned: ['info', UserCheck], accepted: ['info', BadgeCheck], in_progress: ['warning', Hammer], on_hold: ['warning', PauseCircle], done: ['success', CheckCircle2], cancelled: ['neutral', Ban] },
  'workOrderState',
);

export const PassBadge = badge<PassState>(
  { scheduled: ['info', CalendarClock], active: ['success', DoorOpen], checked_in: ['info', LogIn], checked_out: ['neutral', LogOut], expired: ['neutral', Clock3], cancelled: ['neutral', Ban] },
  'passState',
);

export const VisitBadge = badge<VisitOutcome>({ inside: ['info', LogIn], left: ['neutral', LogOut], refused: ['error', ShieldX] }, 'visitOutcome');

export const GateRequestBadge = badge<GateRequestState>(
  { waiting: ['warning', Hourglass], approved: ['success', CheckCircle2], denied: ['error', DoorClosed], expired: ['neutral', Clock3], withdrawn: ['neutral', Undo2] },
  'gateRequestState',
);

export const VehicleBadge = badge<VehicleState>({ pending: ['warning', Hourglass], approved: ['success', BadgeCheck], rejected: ['error', XCircle], retired: ['neutral', Trash2] }, 'vehicleState');

export const NoticeBadge = badge<NoticeState>({ draft: ['neutral', CircleDashed], scheduled: ['info', CalendarClock], published: ['success', Send], withdrawn: ['neutral', Undo2], expired: ['neutral', Clock3] }, 'noticeState');

export const BookingBadge = badge<BookingState>({ confirmed: ['success', CheckCircle2], requested: ['warning', Hourglass], approved: ['success', BadgeCheck], declined: ['error', XCircle], cancelled: ['neutral', Ban] }, 'bookingState');

const PRIORITY: Record<RequestPriority, [StatusTone, LucideIcon]> = { p1: ['error', Siren], p2: ['warning', Flame], p3: ['info', CircleDot], p4: ['neutral', CircleDashed] };

export function PriorityBadge({ priority }: { priority: RequestPriority }) {
  const { t } = useT();
  const [tone, icon] = PRIORITY[priority];
  return (
    <Badge tone={tone} icon={icon} data-testid="priority" data-priority={priority}>
      {t(`operations:priority.${priority}`)}
    </Badge>
  );
}

export function ReopenedBadge({ count }: { count: number }) {
  const { t } = useT();
  if (!count) return null;
  return (
    <Badge tone="warning" icon={RotateCcw} data-testid="reopened">
      {t('operations:request.reopenedCount', { count })}
    </Badge>
  );
}

/** "Plumbing", "Lift"… */
export function useOpsWords() {
  const { t } = useT();
  return {
    category: (c: string) => t(`operations:category.${c}` as 'operations:category.plumbing'),
    area: (a: Pick<CommonArea, 'key' | 'buildingCode'>) => (a.buildingCode ? t('operations:area.inBlock', { place: t(`operations:area.${a.key}` as 'operations:area.lift'), block: a.buildingCode }) : t(`operations:area.${a.key}` as 'operations:area.lift')),
    areaKey: (key: string) => t(`operations:area.${key}` as 'operations:area.lift'),
    room: (r: string) => t(`operations:room.${r}` as 'operations:room.kitchen'),
    urgency: (u: string) => t(`operations:urgency.${u}` as 'operations:urgency.normal'),
    purpose: (p: string) => t(`operations:purpose.${p}` as 'operations:purpose.guest'),
    kind: (k: RequestKind) => t(`operations:kind.${k}`),
    slot: (s: string) => t(`operations:slot.${s}` as 'operations:slot.morning'),
    role: (r: AudienceRole) => t(`operations:audience.role.${r}`),
  };
}

/** Where a request is: its flat and room, or its common place. */
export function WhereText({ flatCode, room, area, where }: { flatCode?: string; room?: string; area?: CommonArea; where?: string }) {
  const w = useOpsWords();
  if (flatCode)
    return (
      <span>
        <bdi dir="ltr" className="ltr-ref font-medium">{flatCode}</bdi>
        {room ? ` · ${w.room(room)}` : ''}
      </span>
    );
  if (area) return <span>{w.area(area)}</span>;
  if (where) return <span>{/^[A-Z]-\d{3}$/.test(where) ? <bdi dir="ltr" className="ltr-ref">{where}</bdi> : w.areaKey(where)}</span>;
  return null;
}

/** A notice's audience in words: "Block A · occupants", "Whole site · owners and liable payers". */
export function AudienceText({ audience, label }: { audience: NoticeAudience; label: string }) {
  const { t } = useT();
  const w = useOpsWords();
  const where = audience.scope === 'site' ? t('operations:audience.wholeSite') : t(`operations:audience.scopeList.${audience.scope}`, { list: label });
  const roles = audience.roles.map(w.role);
  return (
    <span data-testid="audience-text">
      {where} · {roles.length > 1 ? t('operations:audience.and', { first: roles.slice(0, -1).join(', '), last: roles.at(-1)! }) : roles[0]}
    </span>
  );
}

export function When({ at, style = 'dateTime' }: { at: string; style?: 'date' | 'dateTime' | 'time' }) {
  return <DateTime value={at} style={style} />;
}

/** The office screens are for a society's or a maintenance client's own site (a developer keeps the planned pages). */
export function useOpsAvailable(): boolean {
  const { access } = useSession();
  return access?.tenant.type === 'association';
}

const MAX = 5 * 1024 * 1024;

/**
 * Fictional photos for the demo: the file never leaves the browser (name, type and size are kept), and
 * each photo needs a short description of what it shows, read by screen readers.
 */
export function PhotoPicker({ files, onChange, label, max = 3, testId = 'photo-picker' }: { files: Array<Omit<OpsFile, 'id'>>; onChange: (files: Array<Omit<OpsFile, 'id'>>) => void; label: string; max?: number; testId?: string }) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2" data-testid={testId}>
      <p id={id} className="text-sm font-medium text-text">
        {label} <span className="text-xs font-normal text-muted">{t('operations:photo.optional', { max })}</span>
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-labelledby={id}
        tabIndex={-1}
        data-testid={`${testId}-input`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (!file.type.startsWith('image/')) return setError(t('operations:errors.fileType'));
          if (file.size > MAX) return setError(t('operations:errors.fileSize'));
          setError(null);
          onChange([...files, { name: file.name, type: file.type, sizeBytes: file.size, alt: '' }]);
        }}
      />
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="space-y-2 rounded-tile border border-border p-3">
          <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <bdi dir="ltr">{f.name}</bdi> · {t('operations:photo.size', { kb: Math.max(1, Math.round(f.sizeBytes / 1024)) })}
            </span>
            <Button variant="quiet" size="sm" icon={Trash2} onPress={() => onChange(files.filter((_, x) => x !== i))} data-testid={`${testId}-remove-${i}`}>
              {t('operations:photo.remove')}
            </Button>
          </p>
          <PlainTextField label={t('operations:photo.alt')} description={t('operations:photo.altHint')} value={f.alt} onChange={(v) => onChange(files.map((x, j) => (j === i ? { ...x, alt: v } : x)))} testId={`${testId}-alt-${i}`} />
        </div>
      ))}
      {files.length < max && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={ImagePlus} onPress={() => input.current?.click()} data-testid={`${testId}-add`}>
            {t('operations:photo.add')}
          </Button>
          <Button variant="quiet" size="sm" onPress={() => onChange([...files, { name: `demo-photo-${files.length + 1}.jpg`, type: 'image/jpeg', sizeBytes: 184_320, alt: '' }])} data-testid={`${testId}-sample`}>
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

/** Thumbnails of the photos on a request (fictional: a framed description, never a real image). */
export function PhotoList({ files, className }: { files: OpsFile[]; className?: string }) {
  const { t } = useT();
  if (!files.length) return null;
  return (
    <ul className={cn('grid grid-cols-1 gap-2 @md:grid-cols-2', className)} aria-label={t('operations:photo.listLabel')} data-testid="photo-list">
      {files.map((f) => (
        <li key={f.id} className="flex items-start gap-3 rounded-tile border border-border bg-sunken/40 p-3">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-control bg-panel text-muted">
            <ImagePlus className="size-5" />
          </span>
          <span className="min-w-0 text-sm">
            <span className="block text-text">
              <bdi>{f.alt}</bdi>
            </span>
            <span className="block text-xs text-muted">
              <bdi dir="ltr">{f.name}</bdi>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A labelled figure that opens the records it counts (every KPI links to records). */
export function Figure({ label, value, href, tone = 'default', testId, children }: { label: string; value: ReactNode; href?: string; tone?: 'default' | 'warning' | 'error' | 'success'; testId?: string; children?: ReactNode }) {
  const tones = { default: 'text-text', warning: 'text-warning', error: 'text-error', success: 'text-success' };
  const body = (
    <>
      <span className="block text-xs font-medium text-muted">{label}</span>
      <span className={cn('block text-2xl font-bold tabular-nums', tones[tone])}>{value}</span>
      {children}
    </>
  );
  return href ? (
    <Link href={href} variant="plain" className="block rounded-tile border border-border/70 bg-panel p-4 shadow-card hover:bg-raised" data-testid={testId}>
      {body}
    </Link>
  ) : (
    <div className="rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid={testId}>
      {body}
    </div>
  );
}

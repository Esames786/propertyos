import {
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock3,
  FileQuestion,
  Hourglass,
  KeyRound,
  Lock,
  type LucideIcon,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { EvidenceStatus, InvoiceSettlement, LeadStatus, UnitStatus } from '@repo/contracts';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'demo';

const TONES: Record<StatusTone, string> = {
  neutral: 'bg-sunken text-muted border-border',
  info: 'bg-info-soft text-info border-info/30',
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  error: 'bg-error-soft text-error border-error/30',
  demo: 'bg-demo-soft text-demo border-demo/30',
};

type StatusSpec = [StatusTone, LucideIcon];

const UNIT: Record<UnitStatus, StatusSpec> = {
  draft: ['neutral', CircleDashed],
  available: ['success', CheckCircle2],
  held: ['warning', Clock3],
  reserved: ['warning', Hourglass],
  booked: ['info', CircleDot],
  allocated: ['info', KeyRound],
  handover_ready: ['info', KeyRound],
  handed_over: ['neutral', CheckCircle2],
  occupied: ['neutral', CircleDot],
  blocked: ['error', Ban],
  disputed: ['error', ShieldAlert],
  withdrawn: ['neutral', XCircle],
};

const LEAD: Record<LeadStatus, StatusSpec> = {
  new: ['info', CircleDot],
  assigned: ['info', CircleDot],
  contacted: ['info', Clock3],
  qualified: ['success', CheckCircle2],
  converted: ['success', CheckCircle2],
  dormant: ['neutral', CircleDashed],
  lost: ['neutral', XCircle],
  unqualified: ['neutral', Ban],
};

const SETTLEMENT: Record<InvoiceSettlement, StatusSpec> = {
  unpaid: ['warning', Clock3],
  partially_paid: ['warning', Hourglass],
  paid: ['success', CheckCircle2],
};

const EVIDENCE: Record<EvidenceStatus, StatusSpec> = {
  none: ['neutral', CircleDashed],
  submitted: ['info', Hourglass],
  under_review: ['info', Hourglass],
  needs_information: ['warning', FileQuestion],
  rejected: ['error', XCircle],
  verified: ['success', CheckCircle2],
};

export function Badge({ tone, icon: Icon, children, className }: { tone: StatusTone; icon?: LucideIcon; children: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-3.5 shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

type StatusProps =
  | { kind: 'unit'; status: UnitStatus }
  | { kind: 'lead'; status: LeadStatus }
  | { kind: 'settlement'; status: InvoiceSettlement }
  | { kind: 'evidence'; status: EvidenceStatus };

/** Lifecycle status as icon + translated text, never colour alone (WCAG 1.4.1). */
export function StatusLabel(props: StatusProps & { className?: string }) {
  const { t } = useT();
  const [tone, icon] =
    props.kind === 'unit'
      ? UNIT[props.status]
      : props.kind === 'lead'
        ? LEAD[props.status]
        : props.kind === 'settlement'
          ? SETTLEMENT[props.status]
          : EVIDENCE[props.status];
  const label = t(`status:${props.kind}.${props.status}` as 'status:unit.available');
  return <Badge tone={tone} icon={icon} className={props.className}>{label}</Badge>;
}

export function DemoBadge({ training = false }: { training?: boolean }) {
  const { t } = useT();
  return <Badge tone="demo" icon={Lock}>{training ? t('common:badge.training') : t('common:badge.demo')}</Badge>;
}

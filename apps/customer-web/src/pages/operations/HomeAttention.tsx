import type { ResidentNotices, ResidentRequests } from '@repo/contracts';
import { DirectionalIcon, Link, useApiQuery, useT } from '@repo/ui';
import { BellRing, ChevronRight, Wrench, type LucideIcon } from 'lucide-react';
import { OPS } from '../../nav.config';

/**
 * Resident home (Gate D.2): what the service modules need from the resident, if anything: a repair
 * the technician marked fixed (confirm or send it back) and notices that ask every household to
 * acknowledge them. A module outside the society's plan adds nothing (its endpoint refuses).
 */
export function HomeAttention() {
  const { t } = useT();
  const repairs = useApiQuery<ResidentRequests>({ method: 'GET', path: '/portal/requests' }, { retry: false });
  const notices = useApiQuery<ResidentNotices>({ method: 'GET', path: '/portal/notices' }, { retry: false });
  const toConfirm = (repairs.data?.items ?? []).filter((r) => r.state === 'completed');
  const toAck = (notices.data?.items ?? []).filter((n) => n.ackRequired && (n.state === 'unread' || n.state === 'read'));
  if (!toConfirm.length && !toAck.length) return null;
  return (
    <section aria-labelledby="home-attention-title" className="space-y-3" data-testid="home-attention">
      <h2 id="home-attention-title" className="text-lg font-bold text-text">
        {t('operations:home.attention')}
      </h2>
      <ul className="grid grid-cols-1 gap-3 @4xl:grid-cols-2">
        {toConfirm.map((r) => (
          <AttentionCard key={r.id} href={OPS.repair(r.id)} icon={Wrench} eyebrow={t('operations:home.repairEyebrow')} title={r.title} body={t('operations:home.repairBody')} action={t('operations:home.repairAction')} testId="home-attention-repair" />
        ))}
        {toAck.map((n) => (
          <AttentionCard key={n.id} href={OPS.notice(n.id)} icon={BellRing} eyebrow={t('operations:home.noticeEyebrow')} title={n.title ?? n.ref} body={t('operations:home.noticeBody')} action={t('operations:home.noticeAction')} testId="home-attention-notice" />
        ))}
      </ul>
    </section>
  );
}

/**
 * The whole card opens the record, but only the title is the link (its ::after covers the card), so
 * keyboard focus lands on a short target that stays clear of the header and the bottom bar even at
 * 200 % text in Urdu.
 */
function AttentionCard({ href, icon: Icon, eyebrow, title, body, action, testId }: { href: string; icon: LucideIcon; eyebrow: string; title: string; body: string; action: string; testId: string }) {
  return (
    <li className="relative flex h-full items-start gap-3 rounded-card border border-primary/30 bg-panel p-4 shadow-card hover:bg-raised" data-testid={testId}>
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-pill bg-primary-soft text-primary">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-muted">{eyebrow}</span>
        <Link href={href} variant="plain" className="block font-semibold text-text [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-card">
          <bdi>{title}</bdi>
        </Link>
        <span className="block text-sm text-text">{body}</span>
        <span className="mt-1 block text-sm font-semibold text-primary">{action}</span>
      </span>
      <DirectionalIcon icon={ChevronRight} className="mt-1 size-4 text-muted" />
    </li>
  );
}

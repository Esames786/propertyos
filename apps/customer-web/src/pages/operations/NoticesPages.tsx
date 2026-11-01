import type { ResidentNotice, ResidentNoticeOpen, ResidentNotices } from '@repo/contracts';
import { Badge, Button, DirectionalIcon, EmptyState, InlineAlert, Link, PlainCheckbox, SegmentedControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useT, useToast } from '@repo/ui';
import { ArrowLeft, BadgeCheck, CheckCircle2, ChevronRight, CircleDot, Eye, Megaphone, ShieldOff, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { OPS } from '../../nav.config';
import { PortalSkeleton, usePortalFormat } from '../portal/shared';
import { DEMO_TODAY } from './rkit';
import { NotAvailable, ProblemText } from './ProblemText';

/**
 * PORTAL-023 notices and PORTAL-043 notice detail (Gate D.2 reference experience 3, resident end).
 * Official notices come with the resident app (no community add-on): current notices, the ones that
 * ask for an acknowledgement, and the archive. A notice is one way (no replies). The audience is
 * checked on every open: a withdrawn notice shows only that it was withdrawn and when; a notice the
 * resident is not (or no longer) in the audience of says "not available to you" and shows nothing.
 */
export function NoticeStateChip({ notice }: { notice: ResidentNotice }) {
  const { t } = useT();
  if (notice.state === 'withdrawn') return <Badge tone="neutral" icon={Undo2} data-testid="notice-state" data-state="withdrawn">{t('operations:residentNotice.withdrawn')}</Badge>;
  if (notice.state === 'acknowledged') return <Badge tone="success" icon={BadgeCheck} data-testid="notice-state" data-state="acknowledged">{t('operations:residentNotice.acknowledged')}</Badge>;
  if (notice.ackRequired) return <Badge tone="warning" icon={CircleDot} data-testid="notice-state" data-state="needs_ack">{t('operations:residentNotice.needsAck')}</Badge>;
  if (notice.state === 'unread') return <Badge tone="info" icon={CircleDot} data-testid="notice-state" data-state="unread">{t('operations:residentNotice.unread')}</Badge>;
  return <Badge tone="neutral" icon={Eye} data-testid="notice-state" data-state="read">{t('operations:residentNotice.read')}</Badge>;
}

export function NoticesPage() {
  const { t } = useT();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const [tab] = useQueryParam('status');
  const [unread] = useQueryParam('unread');
  const setParams = useQueryParams();
  const q = useApiQuery<ResidentNotices>({ method: 'GET', path: '/portal/notices' });
  // Offline after a first load: keep the last list, labelled with the time it was loaded.
  const offline = q.isError && (q.error as { problem?: { code?: string } }).problem?.code === 'offline';
  if (q.isError && !(offline && q.data)) return <NotAvailable error={q.error} />;
  if (!q.data) return <PortalSkeleton title={t('operations:residentNotice.title')} />;
  const current = tab === 'ack' ? 'ack' : tab === 'archive' ? 'archive' : 'current';
  const items = q.data.items.filter((n) => (unread !== '1' || n.state === 'unread') && (current === 'ack' ? n.ackRequired && n.state !== 'acknowledged' : current === 'archive' ? n.state === 'withdrawn' || n.state === 'acknowledged' || (n.state === 'read' && !n.ackRequired) : n.state !== 'withdrawn'));
  return (
    <div className="@container space-y-6" data-testid="notices-page">
      <header className="space-y-2">
        <h1 id="page-title" tabIndex={-1} className="text-2xl font-bold text-text outline-none sm:text-3xl">
          {t('operations:residentNotice.title')}
        </h1>
        <p className="text-sm text-muted">{t('operations:residentNotice.intro')}</p>
      </header>
      <SegmentedControl
        label={t('operations:residentNotice.show')}
        value={current}
        onChange={(v) => setParams({ status: v === 'current' ? null : v })}
        options={[
          { id: 'current', label: t('operations:residentNotice.current', { count: q.data.counts.unread }) },
          { id: 'ack', label: t('operations:residentNotice.needsAckTab', { count: q.data.counts.needsAck }) },
          { id: 'archive', label: t('operations:residentNotice.archive') },
        ]}
        testId="notice-tabs"
        wrap
      />
      <PlainCheckbox isSelected={unread === '1'} onChange={(on) => setParams({ unread: on ? '1' : null })} testId="notice-unread-only">
        {t('operations:residentNotice.unreadOnly')}
      </PlainCheckbox>
      {offline && (
        <InlineAlert tone="warning" role="status" data-testid="notices-offline">
          {t('operations:residentNotice.offlineList', { time: fmt.instant(new Date(q.dataUpdatedAt).toISOString()) })}
        </InlineAlert>
      )}
      {items.length === 0 ? (
        <EmptyState title={t(`operations:residentNotice.empty.${current}`)} />
      ) : (
        <ul className="space-y-3" data-testid="notice-list">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={OPS.notice(n.id)} variant="plain" className={`block space-y-2 rounded-card border bg-panel p-4 shadow-card hover:bg-raised ${n.state === 'unread' || (n.ackRequired && n.state !== 'acknowledged') ? 'border-primary/40' : 'border-border'}`} data-testid="notice-card" data-state={n.state}>
                {/* The title keeps at least ~10 characters' width (em: it grows with the text size); when the
                    badge does not fit beside that, the badge moves to its own line instead of squeezing the
                    title. Words break only when one is wider than the card. */}
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 flex-[1_1_10em]">
                    <span className="block font-semibold text-text break-words" data-testid="notice-card-title">{n.state === 'withdrawn' ? t('operations:residentNotice.withdrawnTitle') : <bdi>{n.title}</bdi>}</span>
                    <span className="block text-xs text-muted">
                      {/* Each part isolated so two dates never join into one left-to-right run in Urdu. */}
                      {n.category ? <><bdi>{t(`operations:noticeCategory.${n.category}`)}</bdi> · </> : null}
                      <bdi>{n.state === 'withdrawn' && n.withdrawn ? t('operations:residentNotice.withdrawnLine', { date: fmt.instant(n.withdrawn.at) }) : fmt.instant(n.publishedAt)}</bdi>
                      {n.updatedOn ? <> · <bdi>{t('operations:residentNotice.updatedOn', { date: fmt.instant(n.updatedOn) })}</bdi></> : null}
                    </span>
                  </span>
                  <NoticeStateChip notice={n} />
                </span>
                <span className="flex items-center justify-end gap-1 text-sm text-primary">
                  {t('operations:residentNotice.read1')}
                  <DirectionalIcon icon={ChevronRight} className="size-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{t('operations:residentNotice.oneWay')}</p>
    </div>
  );
}

export function NoticeDetailPage({ noticeId }: { noticeId: string }) {
  const { t } = useT();
  const toast = useToast();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const q = useApiQuery<ResidentNoticeOpen>({ method: 'GET', path: `/portal/notices/${noticeId}` });
  const act = useApiMutation<ResidentNotice>();
  const marked = useRef(false);
  const open = q.data;
  // Opening a notice marks it read (once).
  useEffect(() => {
    if (open?.available && open.notice.state === 'unread' && !marked.current) {
      marked.current = true;
      void act.mutateAsync({ method: 'POST', path: `/portal/notices/${noticeId}/read`, body: {} }).then(() => q.refetch()).catch(() => undefined);
    }
  }, [open, noticeId, act, q]);
  if (q.isError) return <NotAvailable error={q.error} />;
  if (!open) return <PortalSkeleton title={t('operations:residentNotice.title')} />;
  const back = (
    <Link href={OPS.notices} className="inline-flex min-h-11 items-center gap-1.5 text-sm" data-testid="notice-back">
      <DirectionalIcon icon={ArrowLeft} className="size-4" />
      {t('operations:residentNotice.all')}
    </Link>
  );
  if (!open.available)
    return (
      <div className="space-y-4" data-testid="notice-unavailable" data-reason={open.reason}>
        {back}
        <section className="space-y-2 rounded-card border border-border bg-panel p-6">
          <ShieldOff aria-hidden className="size-6 text-muted" />
          <h1 id="page-title" tabIndex={-1} className="text-xl font-bold text-text outline-none">{t('operations:residentNotice.notAvailable')}</h1>
          <p className="text-sm text-muted">{t(`operations:residentNotice.notAvailableBody.${open.reason}`)}</p>
        </section>
      </div>
    );
  const n = open.notice;
  if (n.state === 'withdrawn')
    return (
      <div className="space-y-4" data-testid="notice-withdrawn">
        {back}
        <section className="space-y-2 rounded-card border border-border bg-panel p-6">
          <Undo2 aria-hidden className="size-6 text-muted" />
          <h1 id="page-title" tabIndex={-1} className="text-xl font-bold text-text outline-none">{t('operations:residentNotice.withdrawnTitle')}</h1>
          <p className="text-sm text-muted">{t('operations:residentNotice.withdrawnBody', { date: fmt.instant(n.withdrawn!.at) })}</p>
        </section>
      </div>
    );
  return (
    <article className="space-y-5" data-testid="notice-detail" data-state={n.state} aria-labelledby="page-title">
      {back}
      <header className="space-y-2">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-[0.1em] text-accent uppercase">
          <Megaphone aria-hidden className="size-3.5" />
          {n.category ? t(`operations:noticeCategory.${n.category}`) : ''}
        </p>
        <h1 id="page-title" tabIndex={-1} className="text-2xl leading-tight font-bold text-text outline-none sm:text-3xl [overflow-wrap:anywhere]">
          <bdi>{n.title}</bdi>
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {t('operations:residentNotice.publishedOn', { date: fmt.instant(n.publishedAt) })}
          {n.updatedOn && <Badge tone="info">{t('operations:residentNotice.updatedOn', { date: fmt.instant(n.updatedOn) })}</Badge>}
          <NoticeStateChip notice={n} />
        </p>
      </header>
      <div className="rounded-card bg-panel p-5 text-base leading-relaxed text-text shadow-card whitespace-pre-line [overflow-wrap:anywhere]" data-testid="notice-body">
        <bdi>{n.body}</bdi>
      </div>
      {n.ackRequired && n.state !== 'acknowledged' && (
        <section className="space-y-3 rounded-card border-2 border-primary/30 p-4" data-testid="notice-ack">
          <p className="text-sm text-text">{t('operations:residentNotice.ackAsk')}</p>
          <Button
            variant="primary"
            size="lg"
            icon={CheckCircle2}
            isPending={act.isPending}
            className="w-full justify-center whitespace-normal text-center sm:w-auto"
            onPress={async () => {
              await act.mutateAsync({ method: 'POST', path: `/portal/notices/${n.id}/acknowledge`, body: {} });
              toast.success(t('operations:residentNotice.acked'));
              void q.refetch();
            }}
            data-testid="notice-acknowledge"
          >
            {t('operations:residentNotice.acknowledge')}
          </Button>
          {act.error ? <ProblemText error={act.error} /> : null}
        </section>
      )}
      {n.state === 'acknowledged' && n.acknowledgedAt && (
        <p className="flex items-center gap-2 text-sm text-success" data-testid="notice-acked">
          <BadgeCheck aria-hidden className="size-4" />
          {t('operations:residentNotice.ackedOn', { date: fmt.instantTime(n.acknowledgedAt) })}
        </p>
      )}
      <p className="text-xs text-muted">{t('operations:residentNotice.oneWay')}</p>
    </article>
  );
}

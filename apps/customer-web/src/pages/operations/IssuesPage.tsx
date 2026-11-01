import type { CommonArea, OpsFile, RequestCategory, ResidentIssue, ResidentIssues } from '@repo/contracts';
import { Badge, Button, DirectionalIcon, EmptyState, Link, PlainTextArea, PlainTextField, SegmentedControl, SelectControl, useApiMutation, useApiQuery, useQueryParam, useQueryParams, useT, useToast } from '@repo/ui';
import { Bell, BellOff, ChevronRight, GitMerge, Hand, HandMetal, MessageSquarePlus, Plus, Send, ShieldCheck, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { OPS } from '../../nav.config';
import { PortalSkeleton, usePortalFormat } from '../portal/shared';
import { CountLine, DEMO_TODAY, PhotoField, ResidentStateChip, Sheet, useWords } from './rkit';
import { NotAvailable, ProblemText } from './ProblemText';

/**
 * PORTAL-034 community issues and PORTAL-035 raise an issue (Gate D.2). Problems in shared places,
 * reported once and affirmed by others ("This affects me too", withdrawable). The resident never sees
 * who else is affected: counts appear only when the privacy rule allows (D-47), refresh once a day,
 * and the resident's own affirmation shows at once. A problem inside a flat is a repair, not an issue.
 */
const CATEGORIES: RequestCategory[] = ['lift', 'water', 'security', 'cleaning', 'electrical', 'common_area', 'other'];

export default function IssuesPage() {
  const { t } = useT();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const [tab] = useQueryParam('tab');
  const [record] = useQueryParam('record');
  const [isNew] = useQueryParam('new');
  const setParams = useQueryParams();
  const q = useApiQuery<ResidentIssues>({ method: 'GET', path: '/portal/issues' });
  if (q.isError) return <NotAvailable error={q.error} />;
  if (!q.data) return <PortalSkeleton title={t('operations:residentIssue.title')} />;
  const d = q.data;
  const current = tab === 'mine' || tab === 'resolved' ? tab : 'near';
  const open = (i: ResidentIssue) => !['resolved', 'closed', 'cancelled'].includes(i.state);
  const items = d.items.filter((i) => (current === 'mine' ? i.mine || i.affirmed || i.following : current === 'resolved' ? !open(i) : open(i) && i.state !== 'merged'));
  const shown = record ? d.items.find((i) => i.id === record) : undefined;
  return (
    <div className="@container space-y-6" data-testid="issues-page">
      <header className="space-y-2">
        <h1 id="page-title" tabIndex={-1} className="text-2xl font-bold text-text outline-none sm:text-3xl">{t('operations:residentIssue.title')}</h1>
        <p className="text-sm text-muted">{t('operations:residentIssue.intro')}</p>
        <Button variant="primary" size="lg" icon={Plus} onPress={() => setParams({ new: '1', record: null })} className="w-full justify-center whitespace-normal text-center sm:w-auto" data-testid="issue-raise">
          {t('operations:residentIssue.raise')}
        </Button>
        <p className="text-sm text-muted">
          {t('operations:residentIssue.inFlat')}{' '}
          <Link href={OPS.repairs}>{t('operations:residentIssue.reportRepair')}</Link>
        </p>
      </header>
      <SegmentedControl label={t('operations:residentIssue.show')} value={current} onChange={(v) => setParams({ tab: v === 'near' ? null : v })} options={[{ id: 'near', label: t('operations:residentIssue.near') }, { id: 'mine', label: t('operations:residentIssue.mine') }, { id: 'resolved', label: t('operations:residentIssue.resolved') }]} testId="issue-tabs" />
      <p className="flex items-start gap-2 text-xs text-muted" data-testid="issue-privacy">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t('operations:residentIssue.privacy')} {d.snapshotAt ? t('operations:residentIssue.refreshedAt', { time: fmt.instantTime(d.snapshotAt) }) : ''}
      </p>
      {items.length === 0 ? (
        <EmptyState title={t(`operations:residentIssue.empty.${current}`)} />
      ) : (
        <ul className="space-y-3" data-testid="issue-list">
          {items.map((i) => (
            <li key={i.id}>
              <IssueCard issue={i} onOpen={() => setParams({ record: i.id, new: null })} onChanged={() => void q.refetch()} />
            </li>
          ))}
        </ul>
      )}
      <RaiseSheet isOpen={isNew === '1'} areas={d.areas} existing={d.items.filter(open)} onClose={() => setParams({ new: null })} onRaised={(id) => { setParams({ new: null, record: id }); void q.refetch(); }} />
      <IssueSheet issue={shown ?? null} notFound={!!record && !shown} onClose={() => setParams({ record: null })} onChanged={() => void q.refetch()} />
    </div>
  );
}

function AffirmButton({ issue: i, onChanged, size = 'md' }: { issue: ResidentIssue; onChanged: () => void; size?: 'md' | 'lg' }) {
  const { t } = useT();
  const toast = useToast();
  const act = useApiMutation<ResidentIssue>();
  if (['resolved', 'closed', 'cancelled', 'merged', 'hidden'].includes(i.state)) return null;
  return (
    <Button
      variant={i.affirmed ? 'secondary' : 'primary'}
      size={size}
      icon={i.affirmed ? Undo2 : Hand}
      aria-pressed={i.affirmed}
      className="max-w-full whitespace-normal text-start"
      isPending={act.isPending}
      onPress={async () => {
        await act.mutateAsync({ method: 'POST', path: `/portal/issues/${i.id}/${i.affirmed ? 'withdraw' : 'affirm'}`, body: {} });
        toast.success(i.affirmed ? t('operations:residentIssue.withdrawn') : t('operations:residentIssue.affirmed'));
        onChanged();
      }}
      data-testid="issue-affirm"
      data-affirmed={i.affirmed}
    >
      {i.affirmed ? t('operations:residentIssue.withdraw') : t('operations:residentIssue.affectsMe')}
    </Button>
  );
}

function IssueCard({ issue: i, onOpen, onChanged }: { issue: ResidentIssue; onOpen: () => void; onChanged: () => void }) {
  const { t } = useT();
  const w = useWords();
  return (
    <div className="space-y-3 rounded-card border border-border bg-panel p-4 shadow-card" data-testid="issue-card" data-ref={i.ref} data-state={i.state}>
      <button type="button" onClick={onOpen} className="block w-full space-y-2 text-start outline-none focus-visible:outline-2 focus-visible:outline-focus">
        <span className="flex flex-wrap items-start justify-between gap-2">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-text [overflow-wrap:anywhere]"><bdi>{i.title}</bdi></span>
            <span className="block text-xs text-muted">
              {i.area ? w.area(i.area) : ''} · {w.category(i.category)}
              {i.nearMe ? ` · ${t('operations:residentIssue.nearYou')}` : ''}
            </span>
          </span>
          <ResidentStateChip state={i.state} />
        </span>
        <span className="block text-sm text-text [overflow-wrap:anywhere]"><bdi>{i.summary}</bdi></span>
        <span className="flex flex-wrap items-center justify-between gap-2">
          <CountLine count={i.count} />
          <span className="inline-flex items-center gap-1 text-sm text-primary">
            {t('operations:residentIssue.open1')}
            <DirectionalIcon icon={ChevronRight} className="size-4" />
          </span>
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <AffirmButton issue={i} onChanged={onChanged} />
        {i.affirmed && <Badge tone="success" icon={HandMetal}>{t('operations:residentIssue.youSaid')}</Badge>}
        {i.mergedInto && <Badge tone="neutral" icon={GitMerge}>{t('operations:residentIssue.mergedInto', { ref: i.mergedInto.ref })}</Badge>}
      </div>
    </div>
  );
}

function RaiseSheet({ isOpen, areas, existing, onClose, onRaised }: { isOpen: boolean; areas: CommonArea[]; existing: ResidentIssue[]; onClose: () => void; onRaised: (id: string) => void }) {
  const { t } = useT();
  const w = useWords();
  const toast = useToast();
  const raise = useApiMutation<ResidentIssue>();
  const [areaId, setAreaId] = useState<string | null>(null);
  const [category, setCategory] = useState<RequestCategory>('lift');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<Array<Omit<OpsFile, 'id'>>>([]);
  const [error, setError] = useState<unknown>(null);
  const similar = areaId ? existing.filter((i) => i.area?.id === areaId) : [];
  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('operations:residentIssue.raiseTitle')}
      subtitle={t('operations:residentIssue.raiseSubtitle')}
      testId="issue-raise-sheet"
      footer={
        <Button
          variant="primary"
          size="lg"
          icon={Send}
          className="w-full justify-center"
          isPending={raise.isPending}
          isDisabled={!areaId || title.trim().length < 5 || description.trim().length < 10 || files.some((f) => f.alt.trim().length < 3)}
          onPress={async () => {
            setError(null);
            try {
              const i = await raise.mutateAsync({ method: 'POST', path: '/portal/issues', body: { areaId, category, title, description, urgency: 'normal', files } });
              toast.success(t('operations:residentIssue.raised', { ref: i.ref }));
              setTitle('');
              setDescription('');
              setFiles([]);
              onRaised(i.id);
            } catch (e) {
              setError(e);
            }
          }}
          data-testid="issue-submit"
        >
          {t('operations:residentIssue.submit')}
        </Button>
      }
    >
      <div className="space-y-4">
        <SelectControl label={t('operations:residentIssue.where')} value={areaId} onChange={setAreaId} options={areas.map((a) => ({ id: a.id, label: w.area(a) }))} testId="issue-area" />
        {similar.length > 0 && (
          <section className="space-y-2 rounded-tile border border-info/40 bg-info-soft/40 p-3" data-testid="issue-similar">
            <p className="text-sm font-semibold text-text">{t('operations:residentIssue.similar')}</p>
            {similar.map((i) => (
              <p key={i.id} className="text-sm text-text">
                <bdi>{i.title}</bdi> · <CountLine count={i.count} className="text-xs" />
              </p>
            ))}
            <p className="text-xs text-muted">{t('operations:residentIssue.similarHint')}</p>
          </section>
        )}
        <SelectControl label={t('operations:residentIssue.category')} value={category} onChange={(v) => setCategory((v ?? 'other') as RequestCategory)} options={CATEGORIES.map((c) => ({ id: c, label: w.category(c) }))} testId="issue-category" />
        <PlainTextField label={t('operations:residentIssue.titleField')} value={title} onChange={setTitle} testId="issue-title" />
        <PlainTextArea label={t('operations:residentIssue.describe')} description={t('operations:residentIssue.describeHint')} value={description} onChange={setDescription} testId="issue-description" />
        <PhotoField label={t('operations:residentIssue.photo')} files={files} onChange={setFiles} testId="issue-photos" />
        <p className="text-xs text-muted">{t('operations:residentIssue.youCount')}</p>
        {error ? <ProblemText error={error} /> : null}
      </div>
    </Sheet>
  );
}

function IssueSheet({ issue: i, notFound, onClose, onChanged }: { issue: ResidentIssue | null; notFound: boolean; onClose: () => void; onChanged: () => void }) {
  const { t } = useT();
  const w = useWords();
  const toast = useToast();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const act = useApiMutation<ResidentIssue>();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<unknown>(null);
  return (
    <Sheet isOpen={!!i || notFound} onClose={onClose} title={i ? i.title : t('operations:repairs.notFoundTitle')} subtitle={i ? <ResidentStateChip state={i.state} /> : undefined} testId="issue-sheet">
      {!i ? (
        <p className="text-sm text-text">{t('operations:residentIssue.notFound')}</p>
      ) : (
        <div className="space-y-5" data-testid="issue-detail">
          <p className="text-xs text-muted">
            <bdi dir="ltr" className="ltr-ref">{i.ref}</bdi> · {i.area ? w.area(i.area) : ''} · {fmt.instant(i.createdAt)}
          </p>
          <p className="text-text [overflow-wrap:anywhere]"><bdi>{i.summary}</bdi></p>
          <CountLine count={i.count} />
          <div className="flex flex-wrap gap-2">
            <AffirmButton issue={i} onChanged={onChanged} size="lg" />
            <Button
              variant="quiet"
              icon={i.following ? BellOff : Bell}
              isPending={act.isPending}
              onPress={async () => {
                await act.mutateAsync({ method: 'POST', path: `/portal/issues/${i.id}/follow`, body: { follow: !i.following } });
                onChanged();
              }}
              data-testid="issue-follow"
            >
              {i.following ? t('operations:residentIssue.unfollow') : t('operations:residentIssue.follow')}
            </Button>
          </div>
          <p className="text-xs text-muted">{t('operations:residentIssue.privacyShort')}</p>
          <section className="space-y-2" aria-labelledby="issue-comments">
            <h3 id="issue-comments" className="font-semibold text-text">{t('operations:residentIssue.comments')}</h3>
            {i.comments.length === 0 ? (
              <p className="text-sm text-muted">{t('operations:residentIssue.noComments')}</p>
            ) : (
              <ol className="space-y-2" data-testid="issue-comment-list">
                {i.comments.map((c) => (
                  <li key={c.id} className="rounded-tile border border-border p-3 text-sm">
                    <p className="text-xs text-muted">{c.byKind === 'staff' ? t('operations:repairs.office') : c.byName ? t('operations:repairs.you') : t('operations:residentIssue.aResident')} · {fmt.instantTime(c.at)}</p>
                    <p className="text-text [overflow-wrap:anywhere]"><bdi>{c.text}</bdi></p>
                  </li>
                ))}
              </ol>
            )}
            {!['resolved', 'closed', 'cancelled', 'merged', 'hidden'].includes(i.state) && (
              <>
                <PlainTextArea label={t('operations:residentIssue.addComment')} description={t('operations:residentIssue.commentHint')} value={comment} onChange={setComment} testId="issue-comment" />
                <Button
                  variant="secondary"
                  icon={MessageSquarePlus}
                  isPending={act.isPending}
                  isDisabled={comment.trim().length < 2}
                  onPress={async () => {
                    setError(null);
                    try {
                      await act.mutateAsync({ method: 'POST', path: `/portal/issues/${i.id}/comments`, body: { text: comment } });
                      toast.success(t('operations:repairs.messageSent'));
                      setComment('');
                      onChanged();
                    } catch (e) {
                      setError(e);
                    }
                  }}
                  data-testid="issue-comment-send"
                >
                  {t('operations:repairs.send')}
                </Button>
              </>
            )}
          </section>
          {error ? <ProblemText error={error} /> : null}
        </div>
      )}
    </Sheet>
  );
}

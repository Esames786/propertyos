import { ApiError, type ExportFile, type PrivacyRequest, type PrivacyRequestKind } from '@repo/contracts';
import { formatCalendarDate, formatInstant, formatNumber, useLocale } from '@repo/i18n';
import { Badge, Button, ChoiceCards, ErrorState, InlineAlert, Panel, PlainTextArea, saveFile, Skeleton, useAnnounce, useApiMutation, useApiQuery, useT, useToast, type StatusTone } from '@repo/ui';
import { Download, Send } from 'lucide-react';
import { useState } from 'react';

const KINDS: readonly PrivacyRequestKind[] = ['access', 'correction', 'deletion'];
const STATE_TONE: Record<PrivacyRequest['state'], StatusTone> = { submitted: 'info', in_review: 'warning', completed: 'success', rejected: 'neutral' };

/**
 * PORTAL-024 › My data (Gate D.1): what the society holds about the resident, a copy of their own
 * records to download (nothing about anyone else, enforced by the server), and requests for a full
 * copy, a correction or deletion, which the office answers in ADM-024. Simulated: no real files leave.
 */
export function MyDataPanel() {
  const { t } = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const announce = useAnnounce();
  const query = useApiQuery<{ requests: PrivacyRequest[]; holds: Record<string, number> }>({ method: 'GET', path: '/portal/my-data' });
  const exportMine = useApiMutation<ExportFile>();
  const send = useApiMutation<PrivacyRequest>();
  const [kind, setKind] = useState<PrivacyRequestKind>('correction');
  const [details, setDetails] = useState('');
  const [errorKey, setErrorKey] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data;

  return (
    <div className="grid gap-6 @4xl:grid-cols-2" data-testid="my-data">
      <div className="min-w-0 space-y-6">
        <Panel title={t('identity:myData.holdsTitle')} description={t('identity:myData.intro')}>
          {!data ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <dl className="grid grid-cols-2 gap-2.5 @md:grid-cols-3" data-testid="my-data-holds">
              {(['flats', 'bills', 'payments', 'proofs', 'devices'] as const).map((k) => (
                <div key={k} className="rounded-tile bg-sunken/60 p-3">
                  <dt className="text-xs text-muted">{t(`identity:myData.holds.${k}`)}</dt>
                  <dd className="text-figure-sm font-bold text-text">{formatNumber(data.holds[k] ?? 0, locale)}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-5 border-t border-border pt-4">
            <Button
              variant="secondary"
              icon={Download}
              isPending={exportMine.isPending}
              onPress={() =>
                exportMine.mutate(
                  { method: 'POST', path: '/portal/my-data/export' },
                  {
                    onSuccess: (file) => {
                      saveFile(file);
                      toast.success(t('identity:myData.downloaded', { file: file.fileName }));
                      announce(t('identity:myData.downloaded', { file: file.fileName }));
                    },
                  },
                )
              }
              data-testid="my-data-download"
            >
              {t('identity:myData.download')}
            </Button>
            <p className="mt-2 text-xs text-muted">{t('identity:myData.downloadHint')}</p>
          </div>
        </Panel>
      </div>

      <div className="min-w-0 space-y-6">
        <Panel title={t('identity:myData.newRequest')} description={t('identity:myData.requestsIntro')}>
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setProblem(null);
              if (details.trim().length < 10) {
                setErrorKey('identity:privacy.errors.details');
                return;
              }
              setErrorKey(undefined);
              send.mutate(
                { method: 'POST', path: '/portal/my-data/requests', body: { kind, details } },
                {
                  onSuccess: (r) => {
                    setDetails('');
                    toast.success(t('identity:myData.sent', { ref: r.reference }));
                    announce(t('identity:myData.sent', { ref: r.reference }));
                  },
                  onError: (err) => {
                    if (!(err instanceof ApiError)) return;
                    const field = err.problem.errors?.details?.[0]?.code;
                    if (field) setErrorKey(field);
                    else setProblem(err.problem.messageKey);
                  },
                },
              );
            }}
            data-testid="my-data-request-form"
          >
            <ChoiceCards<PrivacyRequestKind>
              label={t('identity:myData.kindLabel')}
              value={kind}
              onChange={setKind}
              columns="list"
              testId="my-data-kind"
              options={KINDS.map((k) => ({ id: k, label: t(`identity:myData.kind.${k}`), description: t(`identity:myData.kindHint.${k}`) }))}
            />
            <PlainTextArea label={t('identity:myData.details')} description={t('identity:myData.detailsHint')} value={details} onChange={setDetails} errorKey={errorKey} testId="my-data-details" />
            {problem && (
              <InlineAlert tone="warning" data-testid="my-data-problem">
                {t(problem as 'identity:privacy.errors.open')}
              </InlineAlert>
            )}
            <Button type="submit" variant="primary" icon={Send} isPending={send.isPending} data-testid="my-data-submit">
              {t('identity:myData.submit')}
            </Button>
          </form>
        </Panel>

        <Panel title={t('identity:myData.requestsTitle')}>
          {!data ? (
            <Skeleton className="h-20 w-full" />
          ) : data.requests.length === 0 ? (
            <p className="text-sm text-muted">{t('identity:myData.none')}</p>
          ) : (
            <ul className="divide-y divide-border" data-testid="my-data-requests">
              {data.requests.map((r) => (
                <li key={r.id} className="space-y-1 py-3" data-state={r.state}>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-text">{t(`identity:myData.kind.${r.kind}`)}</span>
                    <Badge tone={STATE_TONE[r.state]}>{t(`identity:myData.state.${r.state}`)}</Badge>
                  </p>
                  <p className="text-xs text-muted">
                    <bdi dir="ltr" className="ltr-ref">
                      {r.reference}
                    </bdi>{' '}
                    · {formatInstant(r.submittedAt, locale, 'date')} · {t('identity:myData.due', { date: formatCalendarDate(r.dueBy, locale) })}
                  </p>
                  <p className="text-sm text-text">{r.details}</p>
                  {(r.decisionNote || r.retentionOutcome) && <p className="text-sm text-muted">{t('identity:myData.outcome', { text: [r.decisionNote, r.retentionOutcome && t(`identity:privacy.retention.${r.retentionOutcome}` as 'identity:privacy.retention.contacts_removed_financial_kept')].filter(Boolean).join(' ') })}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

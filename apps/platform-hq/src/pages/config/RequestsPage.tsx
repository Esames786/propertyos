import { EDITIONS, SIGNUP_POLICIES, type ConfigPayload, type ConfigVersion, type SignupPolicy, type SignupPolicyConfig, type WorkspaceRequest, type WorkspaceRequestDecision, type WorkspaceRequestDetail } from '@repo/contracts';
import {
  Badge,
  Button,
  buttonClass,
  ConfirmDialog,
  ErrorState,
  IconTile,
  Link,
  PageHeader,
  Panel,
  RevealItem,
  SelectControl,
  Skeleton,
  Stagger,
  Switch,
  UrlTabs,
  useAnnounce,
  useApiMutation,
  useApiQuery,
  useCan,
  useQueryParam,
  useT,
  useToast,
} from '@repo/ui';
import { ArrowRight, CheckCircle2, Mail, PhoneCall, Sparkles, UserPlus, XCircle } from 'lucide-react';
import { useState } from 'react';
import { ConfigVersions, DraftEditor, InForce, NewVersionButton, ProblemSummary, useConfig } from '../../components/config';
import { CountInput } from '../../components/inputs';
import { useHqFormat } from '../../lib/format';
import { editionName } from '../../lib/labels';
import { HQ } from '../../nav.config';

type SignupPayload = Extract<ConfigPayload, { kind: 'signup_policy' }>;
type Request = WorkspaceRequest & WorkspaceRequestDetail;

/**
 * Signup policies and workspace requests (Gate B remaining scope; D-8). How each edition's
 * workspaces start (self-service trial, approval, invitation or sales-assisted), versioned like the
 * other commercial settings, and the queue of requests it produces: contact, approve (which opens a
 * prefilled tenant draft), decline with a reason, or convert. Every decision is audited.
 */
export default function RequestsPage() {
  const { t } = useT();
  return (
    <div className="@container space-y-6" data-testid="requests-page">
      <PageHeader title={t('platform:pages.requests')} description={t('platform:requests.pageIntro')} />
      <UrlTabs
        label={t('platform:pages.requests')}
        items={[
          { id: 'requests', label: t('platform:tenants.tabs.requests') },
          { id: 'signup', label: t('platform:requests.signupTab') },
        ]}
      >
        {(tab) => <div className="pt-6">{tab === 'signup' ? <SignupPolicyTab /> : <RequestsList />}</div>}
      </UrlTabs>
    </div>
  );
}

const STATUS_TONE: Record<WorkspaceRequest['status'], 'info' | 'neutral' | 'success' | 'warning'> = { new: 'info', contacted: 'warning', approved: 'success', declined: 'neutral', converted: 'success' };

export function RequestsList() {
  const { t } = useT();
  const fmt = useHqFormat();
  const can = useCan();
  const toast = useToast();
  const announce = useAnnounce();
  const decide = useApiMutation<Request>();
  const requests = useApiQuery<Request[]>({ method: 'GET', path: '/platform/requests' });
  const [dialog, setDialog] = useState<{ r: Request; decision: WorkspaceRequestDecision['decision'] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  if (requests.isError) return <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />;
  if (!requests.data) return <Skeleton className="h-48 rounded-card" />;
  const manage = can('platform.requests.manage');

  const run = async (r: Request, decision: WorkspaceRequestDecision['decision'], note?: string) => {
    setError(null);
    try {
      await decide.mutateAsync({ method: 'POST', path: `/platform/requests/${r.id}/decision`, body: { decision, ...(note ? { note } : {}) } });
      const msg = t(`platform:requests.decided.${decision}`, { name: r.organisation });
      toast.success(msg);
      announce(msg);
    } catch (e) {
      setError(e);
      throw e;
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t('platform:requests.intro')}</p>
      {error !== null && <ProblemSummary error={error} />}
      <Stagger as="ul" className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0" testId="requests-list">
        {requests.data.map((r) => (
          <RevealItem as="li" key={r.id}>
            <article className="flex h-full flex-col gap-3 rounded-card border border-border/70 bg-panel p-4 shadow-card" data-testid={`request-${r.id}`} data-status={r.status}>
              <div className="flex items-start gap-3">
                <IconTile icon={r.kind === 'sales' ? Mail : r.kind === 'trial' ? Sparkles : UserPlus} hue="sky" size="md" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-text">
                    <bdi>{r.organisation}</bdi>
                  </h3>
                  <p className="text-sm text-muted">
                    <bdi>{r.contactName}</bdi> · {r.city} · {fmt.relative(r.receivedAt)}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[r.status]}>{t(`platform:requests.status.${r.status}`)}</Badge>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">{t('platform:requests.kindLabel')}</dt>
                  <dd className="font-medium">{t(`platform:requests.kind.${r.kind}`)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('platform:tenants.edition')}</dt>
                  <dd className="font-medium">{editionName(t, r.edition)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('platform:requests.units')}</dt>
                  <dd className="font-medium tabular">{r.expectedUnits ? fmt.count(r.expectedUnits) : '—'}</dd>
                </div>
              </dl>
              <p className="text-sm text-text" data-testid={`request-outcome-${r.id}`}>
                {t('platform:requests.policySays', { policy: t(`platform:policy.modes.${r.policyOutcome}.name`) })}
              </p>
              {r.history.length > 0 && (
                <ol className="space-y-1 border-s border-border ps-3 text-xs text-muted" data-testid={`request-history-${r.id}`}>
                  {r.history.map((h, i) => (
                    <li key={i}>
                      {t(`platform:requests.status.${h.status as WorkspaceRequest['status']}`)} · <bdi>{h.actorName}</bdi> · {fmt.date(h.at)}
                      {h.note ? ` · “${h.note}”` : ''}
                    </li>
                  ))}
                </ol>
              )}
              {manage && (
                <div className="mt-auto flex flex-wrap gap-2">
                  {r.status === 'new' && (
                    <Button variant="secondary" icon={PhoneCall} onPress={() => void run(r, 'contacted')} data-testid={`request-contacted-${r.id}`}>
                      {t('platform:requests.actions.contacted')}
                    </Button>
                  )}
                  {(r.status === 'new' || r.status === 'contacted') && (
                    <>
                      <Button variant="primary" icon={CheckCircle2} onPress={() => setDialog({ r, decision: 'approved' })} data-testid={`request-approve-${r.id}`}>
                        {t('platform:requests.actions.approve')}
                      </Button>
                      <Button variant="quiet" icon={XCircle} onPress={() => setDialog({ r, decision: 'declined' })} data-testid={`request-decline-${r.id}`}>
                        {t('platform:requests.actions.decline')}
                      </Button>
                    </>
                  )}
                  {r.status === 'approved' && r.draftId && (
                    <Link variant="plain" href={HQ.resumeDraft(r.draftId)} className={buttonClass('primary')} data-testid={`request-continue-${r.id}`}>
                      <ArrowRight aria-hidden className="size-4 rtl:-scale-x-100" />
                      {t('platform:requests.actions.continue')}
                    </Link>
                  )}
                </div>
              )}
            </article>
          </RevealItem>
        ))}
      </Stagger>
      {dialog && (
        <>
          <ConfirmDialog
            isOpen={dialog.decision === 'approved'}
            onOpenChange={(o) => !o && setDialog(null)}
            title={t('platform:requests.approveTitle', { name: dialog.r.organisation })}
            effect={t('platform:requests.approveEffect')}
            confirmLabel={t('platform:requests.actions.approve')}
            onConfirm={() => run(dialog.r, 'approved')}
          />
          <ConfirmDialog
            isOpen={dialog.decision === 'declined'}
            onOpenChange={(o) => !o && setDialog(null)}
            title={t('platform:requests.declineTitle', { name: dialog.r.organisation })}
            effect={t('platform:requests.declineEffect')}
            confirmLabel={t('platform:requests.actions.decline')}
            reasonLabel={t('platform:requests.declineReason')}
            destructive
            onConfirm={(reason) => run(dialog.r, 'declined', reason)}
          />
        </>
      )}
    </div>
  );
}

function SignupPolicyTab() {
  const config = useConfig('signup_policy');
  const [draftId, setDraftId] = useQueryParam('draft');
  if (config.isPending) return <Skeleton className="h-96 rounded-card" />;
  if (config.isError) return <ErrorState error={config.error} onRetry={() => void config.refetch()} />;
  const o = config.data;
  const draft = o.versions.find((v) => v.id === draftId && (v.state === 'draft' || v.state === 'returned'));
  return (
    <div className="space-y-6" data-testid="signup-policy">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <InForce version={o.current} />
        {o.canManage && !draft && <NewVersionButton kind="signup_policy" onCreated={(id) => setDraftId(id, { replace: false })} />}
      </div>
      {draft ? (
        <DraftEditor version={draft as ConfigVersion & { payload: SignupPayload }} onClose={() => setDraftId(null)}>
          {(payload, set) => <SignupEditor signup={payload.signup} onChange={(signup) => set({ kind: 'signup_policy', signup })} />}
        </DraftEditor>
      ) : (
        <SignupView signup={(o.current.payload as SignupPayload).signup} />
      )}
      <ConfigVersions overview={o} onEdit={(id) => setDraftId(id, { replace: false })} />
    </div>
  );
}

function SignupView({ signup }: { signup: SignupPolicyConfig }) {
  const { t } = useT();
  const fmt = useHqFormat();
  return (
    <Panel title={t('platform:requests.signupTitle')} description={t('platform:requests.signupHint')}>
      <dl className="grid gap-3 @md:grid-cols-2" data-testid="signup-by-edition">
        {EDITIONS.map((e) => (
          <div key={e} className="rounded-tile border border-border/70 p-3" data-testid={`signup-${e}`}>
            <dt className="text-sm text-muted">{editionName(t, e)}</dt>
            <dd className="mt-1 font-semibold text-text">{t(`platform:policy.modes.${signup.byEdition[e]}.name`)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-muted">
        {t('platform:requests.signupLimits', { days: fmt.count(signup.trialDays), units: fmt.count(signup.maxSelfServiceUnits) })} ·{' '}
        {signup.requireVerifiedEmail ? t('platform:requests.verifiedEmail') : t('platform:requests.noVerifiedEmail')}
      </p>
    </Panel>
  );
}

function SignupEditor({ signup, onChange }: { signup: SignupPolicyConfig; onChange: (s: SignupPolicyConfig) => void }) {
  const { t } = useT();
  return (
    <div className="space-y-5">
      <div className="grid gap-4 @2xl:grid-cols-2">
        {EDITIONS.map((e) => (
          <SelectControl
            key={e}
            label={editionName(t, e)}
            value={signup.byEdition[e]}
            options={SIGNUP_POLICIES.map((p) => ({ id: p, label: t(`platform:policy.modes.${p}.name`) }))}
            onChange={(v) => v && onChange({ ...signup, byEdition: { ...signup.byEdition, [e]: v as SignupPolicy } })}
            testId={`signup-input-${e}`}
          />
        ))}
      </div>
      <div className="grid gap-4 @2xl:grid-cols-2">
        <CountInput label={t('platform:requests.trialDays')} value={signup.trialDays} min={1} max={90} onChange={(n) => onChange({ ...signup, trialDays: n })} testId="signup-input-trialDays" />
        <CountInput label={t('platform:requests.maxUnits')} description={t('platform:requests.maxUnitsHint')} value={signup.maxSelfServiceUnits} min={1} onChange={(n) => onChange({ ...signup, maxSelfServiceUnits: n })} testId="signup-input-maxUnits" />
      </div>
      <Switch isSelected={signup.requireVerifiedEmail} onChange={(v) => onChange({ ...signup, requireVerifiedEmail: v })} label={t('platform:requests.verifiedEmail')} testId="signup-input-verified" />
    </div>
  );
}

import { GL_ACCOUNT_TYPES, type ChartView, type GlAccountType, type GlAccountView } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, Drawer, EmptyState, ErrorState, FilterPills, Money, PageHeader, Panel, PlainTextField, SelectControl, useApiQuery, useKeyedCreate, useQueryParam, useSession, useT, useToast } from '@repo/ui';
import { BadgeCheck, FilePlus2, Hourglass, Landmark, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Loading, ProblemAlert, useSocietyFormat } from '../../society/kit';
import { fieldErrorKey, useProblemToast } from '../../society/hr/hkit';
import { ACC, AccountRef, Blocked, EntityBar, GL_POST, LedgerNav, LockBadge, ProvisionalNotice, useAccountName, useEntityParam, WRAP, KEEP } from './lkit';

/**
 * ACC-001 Chart of accounts (PARTIAL, Gate E.7 Wave 1; decision E-16). An illustrative chart per legal
 * entity, labelled as not a statutory chart, versioned: an account is added by a draft that someone
 * else approves (a new chart version); no account is deleted once used. Balances come from posted
 * lines only. Cash at bank and revenue accounts carry their lock in words. The bank account behind a
 * cash-at-bank account is shown (masked) to holders of the bank permission only.
 */
type TypeFilter = 'all' | GlAccountType;

export default function ChartPage() {
  const { t } = useT();
  const { allows } = useSession();
  const [entity, setEntity] = useEntityParam();
  const [typeRaw, setType] = useQueryParam('type');
  const [term, setTerm] = useState('');
  const [drafting, setDrafting] = useState(false);
  const type: TypeFilter = (GL_ACCOUNT_TYPES as readonly string[]).includes(typeRaw ?? '') ? (typeRaw as GlAccountType) : 'all';
  const q = useApiQuery<ChartView>({ method: 'GET', path: '/ledger/accounts', query: { ...(entity ? { entity } : {}), ...(term.trim() ? { q: term.trim() } : {}) } }, KEEP);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  const shown = d.accounts.filter((a) => type === 'all' || a.type === type);
  return (
    <div className="@container space-y-5" data-testid="ledger-chart" data-version={d.chartVersion}>
      <PageHeader
        title={t('ledger:chart.title')}
        description={t('ledger:chart.intro')}
        badge={<Badge tone="neutral" icon={Landmark}>{t('ledger:chart.illustrative')}</Badge>}
        actions={
          allows(GL_POST) && d.canDraft ? (
            <Button variant="primary" icon={FilePlus2} className={WRAP} onPress={() => setDrafting(true)} data-testid="account-draft-open">
              {t('ledger:chart.draft')}
            </Button>
          ) : undefined
        }
      />
      <LedgerNav current="chart" entity={entity} />
      <ProvisionalNotice screen="chart" />
      <EntityBar scope={d} onChange={setEntity} />
      <Panel title={t('ledger:chart.accountsTitle', { version: d.chartVersion })}>
        <div className="space-y-4">
          <FilterPills label={t('ledger:chart.typeLabel')} options={(['all', ...GL_ACCOUNT_TYPES] as TypeFilter[]).map((x) => ({ id: x, label: t(`ledger:accountType.${x}`), count: x === 'all' ? d.accounts.length : d.accounts.filter((a) => a.type === x).length }))} value={type} onChange={(x) => setType(x === 'all' ? null : x)} testId="chart-type" />
          <div className="max-w-md">
            <PlainTextField label={t('ledger:chart.search')} value={term} onChange={setTerm} testId="chart-search" />
          </div>
          {shown.length === 0 ? (
            <EmptyState title={t('ledger:chart.empty')} />
          ) : (
            <ul className="divide-y divide-border/70" data-testid="chart-accounts">
              {shown.map((a) => (
                <AccountRow key={a.id} a={a} />
              ))}
            </ul>
          )}
        </div>
      </Panel>
      <Panel title={t('ledger:chart.versionsTitle')}>
        <ol className="space-y-2 text-sm" data-testid="chart-versions">
          {d.versions.map((v) => (
            <ChartVersion key={v.version} v={v} />
          ))}
        </ol>
      </Panel>
      {drafting && <DraftDrawer entityId={d.entity.id} onClose={() => setDrafting(false)} />}
    </div>
  );
}

function ChartVersion({ v }: { v: ChartView['versions'][number] }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <li className="border-s-2 border-border ps-3">
      <span className="font-semibold">{t('ledger:chart.version', { version: v.version })}</span> · {v.change === 'seeded' ? t('ledger:chart.seeded') : t('ledger:chart.added', { code: v.accountCode ?? '' })}
      <span className="block text-xs text-muted">
        {t('ledger:chart.byApproved', { by: v.byName, approved: v.approvedByName ?? '—' })} · <bdi>{fmt.date(v.at)}</bdi>
      </span>
    </li>
  );
}

function AccountRow({ a }: { a: GlAccountView }) {
  const { t } = useT();
  const name = useAccountName();
  const toast = useToast();
  const problem = useProblemToast();
  const approve = useKeyedCreate<GlAccountView>('gla-approve');
  const reject = useKeyedCreate<GlAccountView>('gla-reject');
  const [rejecting, setRejecting] = useState(false);
  return (
    <li className="space-y-1 py-3" data-testid="chart-account" data-code={a.code} data-state={a.state} data-type={a.type}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <AccountRef code={a.code} name={name(a)} {...(a.state === 'active' ? { href: ACC.account(a.id) } : {})} />
            {a.state === 'draft' && (
              <Badge tone="info" icon={Hourglass} data-testid="account-state" data-state="draft">
                {t('ledger:accountState.draft')}
              </Badge>
            )}
            {a.state === 'rejected' && (
              <Badge tone="neutral" icon={XCircle} data-testid="account-state" data-state="rejected">
                {t('ledger:accountState.rejected')}
              </Badge>
            )}
            {a.lock && <LockBadge lock={a.lock} />}
          </p>
          <p className="text-xs text-muted">
            {t(`ledger:accountType.${a.type}`)} · {t(`ledger:normal.${a.normal}`)}
            {a.state === 'draft' && a.draftedByName ? ` · ${t('ledger:chart.draftedBy', { name: a.draftedByName })}` : ''}
            {a.rejectedByName ? ` · ${t('ledger:chart.rejectedBy', { name: a.rejectedByName })}` : ''}
          </p>
          {a.bank && (
            <p className="text-xs text-muted" data-testid="account-bank">
              {t('ledger:chart.bankLinked', { name: a.bank.name, bank: a.bank.bankName })} · <bdi dir="ltr">{a.bank.ibanMasked}</bdi>
            </p>
          )}
        </div>
        {a.state === 'active' && (
          <span className="text-end text-sm">
            <Money value={a.normalBalance} className="font-semibold" />
            <span className="block text-xs text-muted">{t('ledger:chart.postedLines', { count: a.postedLines })}</span>
          </span>
        )}
      </div>
      {(a.actions.approve || a.actions.reject) && (
        <div className="flex flex-wrap gap-2">
          {a.actions.approve && (
            <Button
              className={WRAP}
              variant="primary"
              icon={BadgeCheck}
              isPending={approve.isPending}
              onPress={async () => {
                try {
                  await approve.send({ method: 'POST', path: `/ledger/accounts/${a.id}/approve`, body: {} });
                  toast.success(t('ledger:chart.approved', { code: a.code }));
                } catch (e) {
                  problem(e);
                }
              }}
              data-testid="account-approve"
            >
              {t('ledger:chart.approve')}
            </Button>
          )}
          {a.actions.reject && (
            <Button className={WRAP} variant="quiet" icon={XCircle} onPress={() => setRejecting(true)} data-testid="account-reject">
              {t('ledger:chart.reject')}
            </Button>
          )}
        </div>
      )}
      {a.blocked && <Blocked>{t('ledger:chart.ownDraft')}</Blocked>}
      <ConfirmDialog
        isOpen={rejecting}
        onOpenChange={setRejecting}
        title={t('ledger:chart.rejectTitle', { code: a.code })}
        effect={t('ledger:chart.rejectEffect')}
        confirmLabel={t('ledger:chart.reject')}
        destructive
        reasonLabel={t('ledger:journal.reason')}
        onConfirm={async (reason) => {
          try {
            await reject.send({ method: 'POST', path: `/ledger/accounts/${a.id}/reject`, body: { reason } });
            toast.success(t('ledger:chart.rejected', { code: a.code }));
            setRejecting(false);
            return true;
          } catch (e) {
            problem(e);
            return false;
          }
        }}
      />
    </li>
  );
}

function DraftDrawer({ entityId, onClose }: { entityId: string; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<GlAccountType | null>(null);
  const [error, setError] = useState<unknown>(null);
  const draft = useKeyedCreate<GlAccountView>('gla-draft');
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('ledger:chart.draftTitle')}
      testId="account-draft"
      footer={
        <Button
          className={WRAP}
          variant="primary"
          isPending={draft.isPending}
          onPress={async () => {
            setError(null);
            try {
              const a = await draft.send({ method: 'POST', path: '/ledger/accounts', body: { entityId, code, name, type: type ?? '' } });
              toast.success(t('ledger:chart.drafted', { code: a.code }));
              onClose();
            } catch (e) {
              setError(e);
            }
          }}
          data-testid="account-draft-save"
        >
          {t('ledger:chart.draftSave')}
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? <ProblemAlert error={error} /> : null}
        <SelectControl label={t('ledger:chart.type')} options={GL_ACCOUNT_TYPES.map((x) => ({ id: x, label: t(`ledger:accountType.${x}`) }))} value={type} onChange={(x) => setType(x as GlAccountType | null)} errorKey={fieldErrorKey(error, 'type')} testId="account-type" placeholder={t('ledger:chart.typePlaceholder')} />
        <PlainTextField label={t('ledger:chart.code')} value={code} onChange={setCode} inputMode="numeric" dir="ltr" errorKey={fieldErrorKey(error, 'code')} description={t('ledger:chart.codeHint')} testId="account-code" />
        <PlainTextField label={t('ledger:chart.name')} value={name} onChange={setName} errorKey={fieldErrorKey(error, 'name')} testId="account-name" />
        <p className="text-xs text-muted">{t('ledger:chart.draftEffect')}</p>
      </div>
    </Drawer>
  );
}

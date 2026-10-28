import { ApiError, type FlatFact, type PersonDetail } from '@repo/contracts';
import { Badge, Breadcrumbs, buttonClass, EmptyState, ErrorState, Link, Money, NotFoundState, PageHeader, Panel, UrlTabs, useApiQuery, useNavigation, useQueryParam, useSession, useT } from '@repo/ui';
import { Home, KeyRound, Wallet } from 'lucide-react';
import { ACCESS_DATE, SOCIETY } from '../../../nav.config';
import { FactList, Loading } from '../kit';
import { StatementView } from '../parts';

const current = (f: FlatFact) => f.from <= ACCESS_DATE && (f.to === undefined || ACCESS_DATE < f.to);
const ICON = { owner: Home, occupant: KeyRound, payer: Wallet } as const;

/**
 * CUS-003 Person 360, society composition. Everything this person is to the society, flat by
 * flat: what they own, where they live, what they pay for (with dates), and the accounts and
 * statements for the flats they are liable for, never another payer's flats.
 */
export default function PersonWorkspace() {
  const { t } = useT();
  const { location } = useNavigation();
  const partyId = new URLSearchParams(location.search).get('record');
  const q = useApiQuery<PersonDetail>(partyId ? { method: 'GET', path: `/people/${partyId}` } : null);
  if (!partyId) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('nav:pages.person')} />
        <EmptyState title={t('sites:person.chooseTitle')} body={t('sites:person.chooseBody')} actions={<Link href={SOCIETY.people()} variant="plain" className={buttonClass('primary')}>{t('nav:party.society')}</Link>} />
      </div>
    );
  }
  if (q.isError && q.error instanceof ApiError && [403, 404].includes(q.error.problem.status)) {
    return (
      <div>
        <h1 id="page-title" className="sr-only">{t('sites:person.notFound')}</h1>
        <NotFoundState />
      </div>
    );
  }
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  return <Workspace data={q.data} />;
}

function Workspace({ data }: { data: PersonDetail }) {
  const { t } = useT();
  const { can } = useSession();
  const [period, setPeriod] = useQueryParam('period');
  const flats = [...new Set(data.facts.map((f) => f.flatCode))];
  const payerAccounts = [...new Set(data.facts.filter((f) => f.role === 'payer').map((f) => f.billingAccountId!))];
  const tabs = [
    { id: 'properties', label: t('sites:person.tabs.properties') },
    ...(can('invoice.view') ? [{ id: 'accounts', label: t('sites:person.tabs.accounts') }] : []),
  ];
  return (
    <div className="@container space-y-6" data-testid="person-workspace" data-person={data.person.id}>
      <Breadcrumbs items={[{ label: t('nav:party.society'), href: SOCIETY.people() }]} />
      <header className="space-y-2">
        <p className="text-sm text-muted">
          <bdi dir="ltr" className="ltr-ref">{data.person.ref}</bdi>
          {data.person.phone && <> · <bdi dir="ltr" className="ltr-ref">{data.person.phone}</bdi></>}
          {data.person.kind === 'organisation' && <> · {t('sites:person.organisation')}</>}
        </p>
        <h1 id="page-title" className="text-[1.75rem] leading-tight font-bold tracking-tight text-text outline-none sm:text-[2rem]"><bdi>{data.person.displayName}</bdi></h1>
        <div className="flex flex-wrap gap-1.5" data-testid="person-roles">
          {data.facts.filter(current).map((f) => (
            <Badge key={f.id} tone={f.role === 'payer' ? 'info' : 'neutral'} icon={ICON[f.role]}>{t(`sites:people.fact.${f.role}`, { flat: f.flatCode })}</Badge>
          ))}
        </div>
      </header>
      <UrlTabs label={t('sites:person.tabsLabel')} items={tabs}>
        {(tab) =>
          tab === 'accounts' ? (
            <div className="space-y-5">
              {data.accounts.map((a) => (
                <Panel
                  key={a.id}
                  title={a.accountNo}
                  description={payerAccounts.includes(a.id) ? t('sites:person.liableLines') : t('sites:person.holderOnly')}
                  actions={<Link href={SOCIETY.account(a.id)} className="inline-flex min-h-10 items-center text-sm">{t('sites:person.openAccount')}</Link>}
                >
                  <p className="mb-4 text-sm text-text">{t('sites:person.balance')} <Money value={a.balance} className="font-semibold" /></p>
                  <StatementView accountId={a.id} payer={payerAccounts.includes(a.id) ? data.person.id : undefined} period={period ?? '2026-11'} onPeriod={(p) => setPeriod(p === '2026-11' ? null : p)} testId={`person-statement-${a.id}`} />
                </Panel>
              ))}
              {data.accounts.length === 0 && <p className="text-sm text-muted">{t('sites:person.noAccounts')}</p>}
            </div>
          ) : (
            <div className="grid gap-5 @4xl:grid-cols-2">
              {flats.map((code) => {
                const facts = data.facts.filter((f) => f.flatCode === code);
                return (
                  <Panel key={code} title={t('sites:flat.flatN', { code })} actions={<Link href={SOCIETY.flat('site_alnoor', facts[0]!.flatId)} className="inline-flex min-h-10 items-center text-sm">{t('sites:person.openFlat')}</Link>}>
                    <div className="space-y-4">
                      {(['owner', 'occupant', 'payer'] as const).map((role) => {
                        const list = facts.filter((f) => f.role === role);
                        if (!list.length) return null;
                        return (
                          <div key={role}>
                            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{t(`sites:roles.${role}`)}</h3>
                            <FactList facts={list} today={ACCESS_DATE} emptyText="" hidePerson />
                          </div>
                        );
                      })}
                    </div>
                  </Panel>
                );
              })}
            </div>
          )
        }
      </UrlTabs>
    </div>
  );
}

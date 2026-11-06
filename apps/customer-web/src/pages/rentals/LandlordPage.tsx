import { ApiError, type LandlordView, type OwnerStatementView } from '@repo/contracts';
import { Badge, Button, Drawer, EmptyState, ErrorState, InlineAlert, Money, Panel, SkeletonBlock, useApiQuery, useQueryParam, useT } from '@repo/ui';
import { CircleDashed, FileText, KeyRound, Printer, ShieldAlert } from 'lucide-react';
import { usePortalFormat } from '../portal/shared';

/**
 * PORTAL-037 "My rental properties" (Gate S.3): a landlord's own let units at sites where the
 * organisation licenses rentals, each tenant's name and this month's rent status (never the tenant's
 * other accounts), the deposit agreed (held: nothing evidenced), the statements issued to them and
 * their payout instructions. Rule R is the server's: without a verified landlord link in force, the
 * resident portal and rentals for that same site, nothing opens. An approved rent demand is not an
 * invoice, and nothing is shown as paid.
 */
const WRAP = 'max-w-full whitespace-normal text-center';
/** A reference or unit code never breaks at its hyphens (320 px with 200 % text). */
const unbroken = (s: string) => s.replace(/[-–]/g, (c) => `${c}\u2060`);

export default function LandlordPage() {
  const { t } = useT();
  const [statement, setStatement] = useQueryParam('statement');
  const q = useApiQuery<LandlordView>({ method: 'GET', path: '/portal/rentals' }, { retry: false });
  if (q.isError) {
    const e = q.error;
    if (e instanceof ApiError && (e.problem.status === 404 || e.problem.status === 403))
      return (
        <div className="space-y-4" data-testid="landlord-unavailable" data-reason={e.problem.status === 404 ? 'no_landlord_link' : e.problem.code}>
          <h1 className="text-xl font-semibold text-text">{t('rentals:portal.title')}</h1>
          <EmptyState title={t(e.problem.status === 404 ? 'rentals:portal.noLink' : 'rentals:portal.notAvailable')} body={t(e.problem.status === 404 ? 'rentals:portal.noLinkHint' : 'rentals:portal.notAvailableHint')} />
        </div>
      );
    return <ErrorState error={e} onRetry={() => void q.refetch()} />;
  }
  if (!q.data) return <SkeletonBlock lines={8} />;
  return <Landlord v={q.data} statement={statement} onStatement={setStatement} />;
}

function Landlord({ v, statement, onStatement }: { v: LandlordView; statement: string | null; onStatement: (id: string | null) => void }) {
  const { t } = useT();
  const fmt = usePortalFormat(v.today);
  const month = new Intl.DateTimeFormat(fmt.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthOf = (p: string) => month.format(new Date(`${p}-01T00:00:00Z`));
  return (
    <div className="space-y-5" data-testid="landlord">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-text">{t('rentals:portal.title')}</h1>
        <p className="text-sm text-muted">{t('rentals:portal.intro')}</p>
      </header>
      <InlineAlert tone="info" data-testid="landlord-boundary">
        {t('rentals:portal.boundary')}
      </InlineAlert>
      <ul className="space-y-3" data-testid="landlord-properties">
        {v.properties.map((p) => (
          <li key={p.unitId} className="space-y-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="landlord-property" data-unit={p.unitCode}>
            <p className="flex flex-wrap items-center gap-2">
              <KeyRound aria-hidden className="size-4 text-muted" />
              <bdi className="font-semibold">{unbroken(p.unitCode)}</bdi>
              <span className="text-sm text-muted">
                · <bdi>{p.siteName}</bdi> · {t('rentals:portal.share', { share: p.share })}
              </span>
            </p>
            {p.lease ? (
              <div className="space-y-1 text-sm">
                <p>
                  {t('rentals:portal.tenant')}: <bdi className="font-medium">{p.lease.tenantName}</bdi> · <bdi dir="ltr">{unbroken(p.lease.ref)}</bdi>
                </p>
                <p className="text-muted">{t('rentals:portal.term', { from: fmt.date(p.lease.from), to: fmt.date(p.lease.to) })}</p>
                <p>
                  {t('rentals:portal.rent')}: <Money value={p.lease.rent} /> {t('rentals:leases.perMonth')}
                </p>
                <p className="flex flex-wrap items-center gap-2" data-testid="landlord-rent-status" data-roll={p.lease.roll}>
                  <span>{t(`rentals:portal.rentStatus.${p.lease.roll}`, { month: monthOf(p.lease.period) })}</span>
                  <Badge tone="neutral" icon={CircleDashed} data-testid="landlord-settlement" data-state={p.lease.settlement}>
                    {t('rentals:settlement.not_settled')}
                  </Badge>
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">{t('rentals:portal.notLet')}</p>
            )}
            {p.deposit && (
              <p className="text-sm text-muted" data-testid="landlord-deposit">
                {t('rentals:portal.deposit')}: <Money value={p.deposit.agreed} /> · {t('rentals:portal.depositHeld')}: <Money value={p.deposit.heldEvidenced} />
              </p>
            )}
          </li>
        ))}
      </ul>
      <Panel title={t('rentals:portal.statementsTitle')}>
        {v.statements.length === 0 ? (
          <p className="text-sm text-muted" data-testid="landlord-no-statements">
            {t('rentals:portal.noStatements')}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="landlord-statements">
            {v.statements.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border/70 p-3 text-sm" data-testid="landlord-statement" data-ref={s.ref} data-partial={s.scopeLimited}>
                <span>
                  <span className="font-medium">{monthOf(s.period)}</span> · <bdi dir="ltr">{unbroken(s.ref)}</bdi> · {t('rentals:portal.closing')}: <Money value={s.closing} />
                  {/* Issue #17: a statement of only some of the owner's sites says so where it is listed. */}
                  {s.scopeLimited && (
                    <>
                      {' '}
                      <Badge tone="neutral" data-testid="landlord-statement-partial">
                        {t('rentals:portal.partial')}
                      </Badge>
                    </>
                  )}
                </span>
                <Button className={WRAP} icon={FileText} onPress={() => onStatement(s.id)} data-testid="landlord-statement-open">
                  {t('rentals:portal.open')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={t('rentals:portal.payoutsTitle')}>
        <div className="space-y-2 text-sm" data-testid="landlord-payouts">
          <p className="text-muted">{t('rentals:portal.noSettled')}</p>
          {v.payouts.pending.length === 0 ? (
            <p className="text-muted">{t('rentals:portal.noPending')}</p>
          ) : (
            <ul className="space-y-1">
              {v.payouts.pending.map((p) => (
                <li key={p.ref} className="flex flex-wrap items-center gap-2">
                  <bdi dir="ltr">{unbroken(p.ref)}</bdi> · <Money value={p.amount} /> · <span>{t(`rentals:payoutState.${p.state}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
      {/* A word joiner after each hyphen keeps "D-33" on one line at 320 px with 200 % text. */}
      <p className="text-xs text-muted">{t('rentals:portal.fictional').replace(/-/g, '-⁠')}</p>
      {statement && <StatementDrawer id={statement} onClose={() => onStatement(null)} monthOf={monthOf} />}
    </div>
  );
}

function StatementDrawer({ id, onClose, monthOf }: { id: string; onClose: () => void; monthOf: (p: string) => string }) {
  const { t } = useT();
  const q = useApiQuery<OwnerStatementView>({ method: 'GET', path: `/portal/rentals/statements/${id}` }, { retry: false });
  const s = q.data;
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={s ? t('rentals:portal.statementTitle', { month: monthOf(s.period) }) : t('rentals:portal.statementsTitle')}
      subtitle={s?.ref ? <bdi dir="ltr">{unbroken(s.ref)}</bdi> : undefined}
      testId="landlord-statement-detail"
      footer={
        s ? (
          <Button className={WRAP} icon={Printer} onPress={() => window.print()} data-testid="landlord-statement-print">
            {t('rentals:portal.print')}
          </Button>
        ) : undefined
      }
    >
      {q.isError ? (
        <EmptyState title={t('rentals:portal.statementMissing')} />
      ) : !s ? (
        <SkeletonBlock lines={6} />
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-muted">{t('rentals:statements.sample')}</p>
          {s.scopeLimited && (
            <InlineAlert tone="info" data-testid="landlord-statement-limited">
              {t('rentals:portal.limited')}
            </InlineAlert>
          )}
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1" data-testid="landlord-statement-totals">
            <dt className="text-muted">{t('rentals:statements.settledRent')}</dt>
            <dd>
              <Money value={s.totals.settledRent} />
            </dd>
            <dt className="text-muted">{t('rentals:statements.fees')}</dt>
            <dd>
              <Money value={s.totals.fees} />
            </dd>
            <dt className="text-muted">{t('rentals:statements.settledPayouts')}</dt>
            <dd>
              <Money value={s.totals.settledPayouts} />
            </dd>
            <dt className="font-semibold">{t('rentals:statements.closing')}</dt>
            <dd className="font-semibold">
              <Money value={s.totals.closing} />
            </dd>
          </dl>
          <p className="flex items-start gap-1.5 text-muted">
            <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t('rentals:portal.settledOnly')}
          </p>
          <ul className="divide-y divide-border rounded-tile border border-border/70" data-testid="landlord-statement-lines">
            {s.lines.map((x, i) => (
              <li key={`${x.source.ref}-${i}`} className="flex flex-wrap items-center justify-between gap-2 p-2.5" data-kind={x.kind}>
                <span className="min-w-0 break-words">
                  {t(`rentals:statements.kind.${x.kind}`)}
                  {x.unitCode ? (
                    <>
                      {' · '}
                      <bdi>{unbroken(x.unitCode)}</bdi>
                    </>
                  ) : null}
                  <span className="block text-xs text-muted">{t(`rentals:statements.state.${x.state}`)}</span>
                </span>
                <Money value={x.amount} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Drawer>
  );
}

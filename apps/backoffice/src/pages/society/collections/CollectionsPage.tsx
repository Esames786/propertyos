import type { CollectionsSummary } from '@repo/contracts';
import { buttonClass, cn, ErrorState, Link, PageHeader, useApiQuery, useSession, useT } from '@repo/ui';
import { Banknote, FileCheck2, FileSpreadsheet, Landmark, PiggyBank, ScrollText } from 'lucide-react';
import { COLLECTIONS } from '../../../nav.config';
import { Loading } from '../kit';
import { CollectionsPanel } from './CollectionsPanel';

/** COL-001 collections dashboard: the month's collection, the queue, aging, blocks and recent payments. */
export default function CollectionsPage() {
  const { t } = useT();
  const { can } = useSession();
  const query = useApiQuery<CollectionsSummary>({ method: 'GET', path: '/collections/summary' });
  const actions = [
    can('finance.evidence.review') && { id: 'review', icon: FileCheck2, label: t('collections:page.actionReview'), href: COLLECTIONS.inbox('to_review') },
    can('payment.receive') && { id: 'office', icon: Banknote, label: t('collections:page.actionOffice'), href: COLLECTIONS.officePayment() },
    can('bank.reconcile') && { id: 'bank', icon: FileSpreadsheet, label: t('collections:page.actionImport'), href: COLLECTIONS.bankFeed() },
    can('bank.view') && { id: 'reconcile', icon: Landmark, label: t('collections:page.actionReconcile'), href: COLLECTIONS.reconciliation },
    { id: 'aging', icon: ScrollText, label: t('collections:page.actionAging'), href: COLLECTIONS.aging() },
    { id: 'credits', icon: PiggyBank, label: t('collections:page.actionCredits'), href: COLLECTIONS.credits },
  ].filter((a): a is Exclude<typeof a, false> => !!a);
  return (
    <div className="@container space-y-8" data-testid="collections-page">
      <PageHeader title={t('nav:pages.collections')} description={t('collections:page.intro')} />
      <nav aria-label={t('collections:page.actionsLabel')} className="flex flex-wrap gap-2" data-testid="collections-actions">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.id} href={a.href} variant="plain" className={cn(buttonClass(a.id === 'review' ? 'primary' : 'secondary'), 'gap-2')} data-testid={`collections-action-${a.id}`}>
              <Icon aria-hidden className="size-4" />
              {a.label}
            </Link>
          );
        })}
      </nav>
      {query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : !query.data ? <Loading lines={10} /> : <CollectionsPanel data={query.data} />}
    </div>
  );
}

import { AUDIT_CATEGORIES, type AuditCategory, type PlatformAuditEvent, type TenantListResponse } from '@repo/contracts';
import { ErrorState, FilterPills, PageHeader, Panel, SelectControl, Skeleton, useApiQuery, useQueryParams, useQueryParam, useT } from '@repo/ui';
import { AuditTrail } from '../../components/audit';

interface AuditResponse {
  items: Array<PlatformAuditEvent & { category: AuditCategory }>;
  total: number;
  counts: Record<AuditCategory, number>;
}

/**
 * The commercial audit trail (Gate B remaining scope): every change to tenants, contracts, grants,
 * approvals, configuration versions, requests and previews, with the principal, the time and what
 * changed. Read-only and filterable by kind, tenant and person; the filters live in the address.
 */
export default function AuditPage() {
  const { t } = useT();
  const [category] = useQueryParam('category');
  const [tenant] = useQueryParam('tenant');
  const [actor] = useQueryParam('actor');
  const setParams = useQueryParams();
  const all = useApiQuery<AuditResponse>({ method: 'GET', path: '/platform/audit' });
  const audit = useApiQuery<AuditResponse>(
    { method: 'GET', path: '/platform/audit', query: { ...(category ? { category } : {}), ...(tenant ? { tenant } : {}), ...(actor ? { actor } : {}) } },
    { placeholderData: (prev) => prev },
  );
  const tenants = useApiQuery<TenantListResponse>({ method: 'GET', path: '/platform/tenants' });
  const filter = (AUDIT_CATEGORIES as readonly string[]).includes(category ?? '') ? (category as AuditCategory) : 'all';
  const actors = [...new Map((all.data?.items ?? []).map((e) => [e.actorId, e.actorName])).entries()];
  return (
    <div className="@container space-y-6" data-testid="audit-page">
      <PageHeader title={t('platform:pages.audit')} description={t('platform:auditLog.intro')} />
      <div className="space-y-4 rounded-card border border-border/70 bg-panel p-4 shadow-card">
        <FilterPills
          label={t('platform:auditLog.category')}
          showLabel
          value={filter}
          testId="audit-category"
          onChange={(v) => setParams({ category: v === 'all' ? null : v })}
          options={[
            { id: 'all', label: t('platform:auditLog.all'), ...(all.data ? { count: all.data.total } : {}) },
            ...AUDIT_CATEGORIES.map((c) => ({ id: c, label: t(`platform:auditLog.categories.${c}`), ...(audit.data ? { count: audit.data.counts[c] } : {}) })),
          ]}
        />
        <div className="grid gap-4 @2xl:grid-cols-2">
          <SelectControl
            label={t('platform:auditLog.tenant')}
            value={tenant ?? 'all'}
            options={[{ id: 'all', label: t('platform:auditLog.allTenants') }, ...(tenants.data?.items ?? []).map((x) => ({ id: x.id, label: x.displayName }))]}
            onChange={(v) => setParams({ tenant: v && v !== 'all' ? v : null })}
            testId="audit-tenant"
          />
          <SelectControl
            label={t('platform:auditLog.actor')}
            value={actor ?? 'all'}
            options={[{ id: 'all', label: t('platform:auditLog.everyone') }, ...actors.map(([id, name]) => ({ id, label: `${name} (${id})` }))]}
            onChange={(v) => setParams({ actor: v && v !== 'all' ? v : null })}
            testId="audit-actor"
          />
        </div>
      </div>
      {audit.isError ? (
        <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
      ) : !audit.data ? (
        <Skeleton className="h-96 rounded-card" />
      ) : (
        <Panel title={t('platform:auditLog.events', { count: audit.data.total })} description={t('platform:auditLog.readOnly')}>
          <AuditTrail events={audit.data.items} testId="audit-log" />
        </Panel>
      )}
    </div>
  );
}

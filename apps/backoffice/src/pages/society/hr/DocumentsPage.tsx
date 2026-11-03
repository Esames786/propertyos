import type { DocumentsOverview, DocumentStatus, EmployeesList } from '@repo/contracts';
import { Button, EmptyState, ErrorState, FilterPills, InlineAlert, Link, PageHeader, useApiQuery, useCan, useQueryParam, useQueryParams, useT } from '@repo/ui';
import { FilePlus2, Lock } from 'lucide-react';
import { useState } from 'react';
import { HR } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { DocumentBadge, HrNav, useRole } from './hkit';
import { DocumentDrawer } from './HrDrawers';

/**
 * HR-009 employee documents: every required document of every current employee, missing, expired,
 * expiring within 30 days or valid. Files are fictional (only their name, type and size are kept);
 * file details and identity numbers are for hr.documents.manage only, everyone else sees the status.
 */
const VIEWS = ['attention', 'missing', 'expired', 'expiring', 'valid', 'all'] as const;
type View = (typeof VIEWS)[number];

export default function DocumentsPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const role = useRole();
  const can = useCan();
  const [status] = useQueryParam('status');
  const setParams = useQueryParams();
  const [adding, setAdding] = useState(false);
  const view: View = (VIEWS as readonly string[]).includes(status ?? '') ? (status as View) : 'attention';
  const q = useApiQuery<DocumentsOverview>({ method: 'GET', path: '/hr/documents', query: { status: view } }, { placeholderData: (prev) => prev });
  const staff = useApiQuery<EmployeesList>(can('hr.documents.manage') ? { method: 'GET', path: '/hr/employees' } : null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  const countOf = (v: View) => (v === 'attention' ? d.counts.missing + d.counts.expired + d.counts.expiring : v === 'all' ? Object.values(d.counts).reduce((a, b) => a + b, 0) : d.counts[v as DocumentStatus]);
  return (
    <div className="@container space-y-5" data-testid="hr-documents">
      <PageHeader
        title={t('hr:documents.title')}
        description={t('hr:documents.intro')}
        actions={
          d.canManage ? (
            <Button variant="primary" icon={FilePlus2} onPress={() => setAdding(true)} data-testid="hr-document-add">
              {t('hr:documents.add')}
            </Button>
          ) : undefined
        }
      />
      <HrNav current="documents" />
      {!d.canManage && (
        <InlineAlert tone="info" data-testid="hr-documents-restricted">
          <Lock aria-hidden className="me-1 inline size-4" />
          {t('hr:documents.restrictedNote')}
        </InlineAlert>
      )}
      <FilterPills label={t('hr:documents.show')} value={view} onChange={(v) => setParams({ status: v === 'attention' ? null : v })} options={VIEWS.map((v) => ({ id: v, label: t(`hr:documents.view.${v}`), count: countOf(v) }))} testId="hr-documents-show" />
      {d.rows.length === 0 ? (
        <EmptyState title={t(`hr:documents.empty.${view === 'attention' ? 'attention' : 'other'}`)} />
      ) : (
        <ul className="space-y-2" data-testid="hr-document-rows">
          {d.rows.map((r) => (
            <li key={`${r.employeeId}-${r.kind}`} className="grid gap-1 rounded-tile border border-border/70 bg-panel p-3 shadow-card @3xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] @3xl:items-center" data-testid="hr-document-row" data-name={r.employeeName} data-kind={r.kind} data-status={r.status}>
              <span className="min-w-0">
                <Link href={HR.employee(r.employeeId, 'documents')} className="font-medium">
                  <bdi>{r.employeeName}</bdi>
                </Link>
                <span className="block text-xs text-muted">{role(r.role)}</span>
              </span>
              <span className="text-sm text-text">
                {t(`hr:documents.kind.${r.kind}`)}
                {!r.required ? ` · ${t('hr:documents.optional')}` : ''}
                {r.expiresOn ? <span className="block text-xs text-muted">{t('hr:documents.expires', { date: fmt.date(r.expiresOn) })}</span> : null}
              </span>
              <DocumentBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
      {staff.data && <DocumentDrawer key={String(adding)} open={adding} onClose={() => setAdding(false)} staff={staff.data.items.filter((e) => e.status !== 'ended').map((e) => ({ id: e.id, name: e.name, role: e.role }))} />}
    </div>
  );
}

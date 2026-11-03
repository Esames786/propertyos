import { HR_DEPARTMENTS, type EmployeesList, type EmploymentView, type HrDepartment } from '@repo/contracts';
import { EmptyState, ErrorState, FilterPills, Link, PageHeader, SelectControl, useApiQuery, useQueryParam, useQueryParams, useT } from '@repo/ui';
import { FileWarning, Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { HR } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { DutyBadge, EmploymentBadge, HrNav, Initials, LinkButton, useRole } from './hkit';

/**
 * HR-002 employees directory: search by name, code or role; filter by status and department; each
 * row opens Employee 360. The directory holds no personal or financial details (identity number,
 * phone, address, pay or advances stay inside Employee 360 for the permissions that allow them).
 */
const VIEWS = ['current', 'active', 'upcoming', 'suspended', 'ended', 'all'] as const;
type View = (typeof VIEWS)[number];

export default function EmployeesPage() {
  const { t } = useT();
  const role = useRole();
  const fmt = useSocietyFormat();
  const [status] = useQueryParam('status');
  const [department] = useQueryParam('department');
  const [qParam] = useQueryParam('q');
  const setParams = useQueryParams();
  const [search, setSearch] = useState(qParam ?? '');
  const view: View = (VIEWS as readonly string[]).includes(status ?? '') ? (status as View) : 'current';
  const dept = (HR_DEPARTMENTS as readonly string[]).includes(department ?? '') ? (department as HrDepartment) : null;
  const term = search.trim();
  const list = useApiQuery<EmployeesList>({ method: 'GET', path: '/hr/employees', query: { status: view === 'current' ? '' : view, ...(dept ? { department: dept } : {}), ...(term ? { q: term } : {}) } }, { placeholderData: (prev) => prev });
  const counts = list.data?.counts;
  const countOf = (v: View) => (!counts ? undefined : v === 'current' ? counts.active + counts.upcoming + counts.suspended : v === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[v as EmploymentView]);
  return (
    <div className="@container space-y-5" data-testid="hr-employees">
      <PageHeader
        title={t('hr:employees.title')}
        description={t('hr:employees.intro')}
        actions={
          list.data?.canCreate ? (
            <LinkButton variant="primary" icon={UserPlus} href={HR.newEmployee} testId="hr-new-employee">
              {t('hr:employees.new')}
            </LinkButton>
          ) : undefined
        }
      />
      <HrNav current="employees" />
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] @2xl:items-end">
        <div className="space-y-1">
          <label htmlFor="hr-search" className="block text-sm font-medium text-text">
            {t('hr:employees.search')}
          </label>
          <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
            <Search aria-hidden className="size-4 shrink-0 text-muted" />
            <input id="hr-search" type="search" value={search} onChange={(e) => setSearch(e.currentTarget.value)} placeholder={t('hr:employees.searchHint')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle" data-testid="hr-search" />
          </div>
        </div>
        <SelectControl
          label={t('hr:employees.department')}
          value={dept ?? 'all'}
          onChange={(v) => setParams({ department: !v || v === 'all' ? null : v })}
          options={[{ id: 'all', label: t('hr:employees.allDepartments') }, ...HR_DEPARTMENTS.map((d) => ({ id: d, label: `${t(`hr:department.${d}`)}${list.data ? ` (${fmt.count(list.data.departments[d])})` : ''}` }))]}
          testId="hr-department"
        />
      </div>
      <FilterPills label={t('hr:employees.show')} value={view} onChange={(v) => setParams({ status: v === 'current' ? null : v })} testId="hr-status" options={VIEWS.map((v) => ({ id: v, label: t(`hr:employees.view.${v}`), ...(countOf(v) !== undefined ? { count: countOf(v)! } : {}) }))} />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <Loading lines={8} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title={t('hr:employees.empty')} body={term ? t('hr:employees.emptySearch', { q: term }) : undefined} />
      ) : (
        <ul className="space-y-2" data-testid="hr-employee-rows" aria-label={t('hr:employees.listLabel', { count: list.data.items.length })}>
          {list.data.items.map((e) => (
            <li key={e.id}>
              <Link href={HR.employee(e.id)} variant="plain" className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-tile border border-border/70 bg-panel p-3 shadow-card hover:bg-raised @3xl:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto]" data-testid="hr-employee-row" data-id={e.id}>
                <Initials text={e.name.split(' ').map((w) => w[0]).join('').slice(0, 2)} />
                <span className="min-w-0">
                  <span className="block font-semibold break-words text-text">
                    <bdi>{e.name}</bdi>
                  </span>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr">{e.code}</bdi> · {role(e.role)}
                  </span>
                </span>
                <span className="col-span-2 text-xs text-muted @3xl:col-span-1">
                  {t(`hr:department.${e.department}`)} · {t(`hr:type.${e.employmentType}`)}
                  {e.endDate ? ` · ${t('hr:employees.until', { date: fmt.date(e.endDate) })}` : ''}
                </span>
                <span className="col-span-2 flex flex-wrap items-center gap-2 @3xl:col-span-1">
                  {e.status === 'active' ? <DutyBadge state={e.today.state} /> : <EmploymentBadge status={e.status} />}
                  {e.documentsAttention > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning" data-testid="hr-row-documents">
                      <FileWarning aria-hidden className="size-3.5" />
                      {t('hr:employees.documentsAttention', { count: e.documentsAttention })}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

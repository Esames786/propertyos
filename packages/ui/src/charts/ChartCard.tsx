import { BarChart3, Table2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { ToggleButton } from 'react-aria-components';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';

export interface LegendItem {
  id: string;
  label: string;
  /** CSS colour (a token var). */
  color: string;
  /** Legend key mirrors the mark: rect for bars/areas, line for lines. */
  shape: 'rect' | 'line';
}

export interface DataTableSpec {
  caption: string;
  columns: Array<{ id: string; label: string; numeric?: boolean }>;
  rows: Array<{ id: string; cells: ReactNode[] }>;
}

/**
 * Card frame shared by every chart: heading, one-line takeaway, legend, a "Data table" toggle and
 * the chart itself. The table is the WCAG-clean twin of the chart (every value reachable without
 * hover or colour), and the takeaway is the text alternative the chart's role="img" points at.
 */
export function ChartCard({
  title,
  summary,
  legend,
  table,
  actions,
  children,
  className,
  testId,
  headingLevel = 2,
}: {
  title: string;
  /** Plain-language takeaway (also the chart's accessible description). */
  summary: ReactNode;
  legend?: LegendItem[];
  table: DataTableSpec;
  actions?: ReactNode;
  children: (ids: { titleId: string; summaryId: string }) => ReactNode;
  className?: string;
  testId?: string;
  headingLevel?: 2 | 3;
}) {
  const { t } = useT();
  const H = `h${headingLevel}` as const;
  const titleId = useId();
  const summaryId = useId();
  const [showTable, setShowTable] = useState(false);
  return (
    <section aria-labelledby={titleId} data-testid={testId} className={cn('@container flex flex-col rounded-card border border-border/70 bg-panel p-5 shadow-card sm:p-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <H id={titleId} className="text-lg font-bold tracking-tight text-text">
            {title}
          </H>
          <p id={summaryId} className="mt-1 max-w-prose text-sm text-muted">
            {summary}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <ToggleButton
            isSelected={showTable}
            onChange={setShowTable}
            data-testid={testId ? `${testId}-table-toggle` : undefined}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-border-control px-3 text-xs font-medium text-text transition-colors duration-[var(--motion-fast)] data-hovered:bg-sunken data-selected:border-primary data-selected:bg-primary-soft data-selected:text-primary pointer-coarse:min-h-11"
          >
            {showTable ? <BarChart3 aria-hidden className="size-4" /> : <Table2 aria-hidden className="size-4" />}
            {t('dashboard:chart.dataTable')}
          </ToggleButton>
        </div>
      </div>
      {legend && legend.length > 1 && !showTable && (
        <ul aria-label={t('dashboard:chart.legend')} className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
          {legend.map((item) => (
            <li key={item.id} className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className={cn('inline-block shrink-0', item.shape === 'rect' ? 'size-2.5 rounded-[3px]' : 'h-0.5 w-3.5 rounded-pill')}
                style={{ background: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 min-h-0 flex-1">{showTable ? <ChartDataTable spec={table} /> : children({ titleId, summaryId })}</div>
    </section>
  );
}

export function ChartDataTable({ spec }: { spec: DataTableSpec }) {
  return (
    // Focusable labelled region so the table can be scrolled with the keyboard when it overflows (WCAG 2.1.1).
    <div
      role="region"
      aria-label={spec.caption}
      tabIndex={0}
      className="overflow-x-auto rounded-tile border border-border outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      data-testid="chart-data-table"
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{spec.caption}</caption>
        <thead className="bg-raised text-xs text-muted">
          <tr>
            {spec.columns.map((c) => (
              <th key={c.id} scope="col" className={cn('px-3 py-2 font-medium', c.numeric ? 'text-end' : 'text-start')}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.rows.map((row) => (
            <tr key={row.id} className="border-t border-border">
              {row.cells.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="px-3 py-2 text-start font-medium text-text">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className={cn('px-3 py-2 text-text', spec.columns[i]?.numeric && 'text-end tabular')}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

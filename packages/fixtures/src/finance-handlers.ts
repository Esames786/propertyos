import type { InvoiceHistoryItem, InvoiceHistoryResponse, InvoiceSettlement } from '@repo/contracts';
import { projectName } from './crm-data';
import { invoiceRecord, matches, permits, requires, type Handler } from './handler-types';
import { fromPaisa, toPaisa } from './portal';

const PAGE_SIZE = 15;
const SETTLEMENTS: readonly InvoiceSettlement[] = ['unpaid', 'partially_paid', 'paid'];

/**
 * FIN-002 invoices, read-only (CP2 security correction 4). Financial history: it stays readable
 * while the organisation is suspended, when every operational action is refused. Each invoice is
 * checked as a record (site licence, scope, unit and billing account), never trusted from a filter.
 */
export const FINANCE_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/finance\/invoices$/,
    access: requires('receivables', 'invoice.view', 'history_read'),
    handle: (ctx): InvoiceHistoryResponse => {
      const { q, settlement = 'all', page = 1 } = (ctx.req.query ?? {}) as Record<string, string | number | undefined>;
      const d = ctx.data;
      const rows = d.invoices
        .filter((i) => ctx.allowsProject(i.projectId))
        .filter((i) => {
          const record = invoiceRecord(ctx, i);
          return record !== null && permits(ctx, 'receivables', record, 'invoice.view');
        })
        .map((i): InvoiceHistoryItem => ({
          id: i.id,
          ref: i.ref,
          kind: i.kind,
          partyName: d.parties.find((p) => p.id === i.partyId)?.displayName ?? '—',
          unitRef: d.units.find((u) => u.id === i.unitId)?.ref ?? '—',
          projectName: projectName(d, i.projectId),
          total: i.total,
          paid: i.paid,
          dueDate: i.dueDate,
          settlement: i.settlement,
        }))
        .filter((i) => !q || !String(q).trim() || matches(String(q).trim(), i.ref, i.partyName, i.unitRef))
        .filter((i) => settlement === 'all' || !SETTLEMENTS.includes(settlement as InvoiceSettlement) || i.settlement === settlement)
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || a.ref.localeCompare(b.ref));
      const billed = rows.reduce((s, i) => s + toPaisa(i.total.amount), 0n);
      const collected = rows.reduce((s, i) => s + toPaisa(i.paid.amount), 0n);
      const pageNo = Math.max(1, Number(page) || 1);
      return {
        items: rows.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE),
        total: rows.length,
        page: pageNo,
        pageSize: PAGE_SIZE,
        totals: {
          billed: { amount: fromPaisa(billed), currency: 'PKR' },
          collected: { amount: fromPaisa(collected), currency: 'PKR' },
          outstanding: { amount: fromPaisa(billed - collected), currency: 'PKR' },
        },
      };
    },
  },
];

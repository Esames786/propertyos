/** Office addresses of the S.1 screens (the screen register's routes; drawers are query parameters). */
const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return s ? `?${s}` : '';
};

export const FIN_ROUTES = {
  dashboard: (period?: string) => `/backoffice/fin/finance-dashboard${q({ period })}`,
  accounts: '/backoffice/bank/bank-accounts',
  account: (id: string, tab?: string) => `/backoffice/bank/bank-account-360-workspace${q({ record: id, tab })}`,
  cashbook: (params: Record<string, string | undefined> = {}) => `/backoffice/bank/cashbook${q(params)}`,
  voucher: (id: string) => `/backoffice/bank/cashbook${q({ voucher: id })}`,
  close: (period: string) => `/backoffice/bank/cashbook${q({ period, drawer: 'close' })}`,
  transfers: (status?: string) => `/backoffice/bank/transfers${q({ status })}`,
  transfer: (id: string) => `/backoffice/bank/transfers${q({ record: id })}`,
  batches: (status?: string) => `/backoffice/fin/office-collections${q({ status })}`,
  batch: (id: string) => `/backoffice/fin/office-collections${q({ batch: id })}`,
  cheques: (status?: string) => `/backoffice/fin/office-collections${q({ tab: 'cheques', status })}`,
  cheque: (id: string) => `/backoffice/fin/office-collections${q({ tab: 'cheques', cheque: id })}`,
  approvals: (tab?: string) => `/backoffice/apr/my-approvals${q({ tab })}`,
  approval: (id: string) => `/backoffice/apr/approval-360-view${q({ record: id })}`,
  policies: (tab?: string) => `/backoffice/apr/approval-settings${q({ tab })}`,
  delegation: '/backoffice/apr/delegation',
  committee: (tab?: string) => `/backoffice/committee${q({ tab })}`,
  reminders: (tab?: string) => `/backoffice/col/reminders${q({ tab })}`,
  ownership: (status?: string) => `/backoffice/own/transfers-list${q({ status })}`,
  ownershipTransfer: (id: string) => `/backoffice/own/transfer-review-approval${q({ record: id })}`,
  payment: (id: string) => `/backoffice/fin/payment-workspace${q({ record: id })}`,
  payments: (params: Record<string, string | undefined> = {}) => `/backoffice/fin/payment-list${q(params)}`,
  bankFeed: (state?: string) => `/backoffice/bank/bank-transaction-feed${q({ state })}`,
  reconciliation: '/backoffice/bank/reconciliation-workspace',
  inbox: (state?: string) => `/backoffice/fin/unverified-transfers-queue${q({ state })}`,
  aging: (bucket?: string) => `/backoffice/col/aging-breakdown${q({ bucket })}`,
  runs: '/backoffice/billing/runs',
  run: (id: string) => `/backoffice/billing/runs/${id}`,
  invoices: (params: Record<string, string | undefined> = {}) => `/backoffice/fin/invoices-list${q(params)}`,
  invoice: (id: string) => `/backoffice/fin/invoice-workspace${q({ record: id })}`,
  payerChanges: (state?: string) => `/backoffice/billing/payer-changes${q({ state })}`,
} as const;

import type { RecordRef } from '@repo/contracts';
import { can, matches, type HandlerContext } from '../../handler-types';
import type { RecordProvider } from '../workspace/records';
import { mayUse } from './scope';
import { ledgerState, type LedgerState, type StoredGlAccount, type StoredJournal } from './state';

/**
 * Wave 1 integration (Issue #25): E.7's accounts and journals in E.13's record registry. A ledger record
 * resolves only for a reader whose scope covers its whole legal entity with `gl.view` (E.7's own rule, E.0's
 * `entityWhole`): a project-limited reader finds no ledger record, so no search hit or favourite can reveal one.
 * A reference names only the account's code and name or the journal's reference and memo: never a bank
 * account, statement line or amount (the `bank.view` boundary stays with the ledger screens).
 */
const readable = (ctx: HandlerContext, entityId: string) => can(ctx, 'gl.view', 'history_read') && mayUse({ ...ctx, suspension: 'history_read' }, 'accounting', entityId, 'gl.view');

function accountRef(a: StoredGlAccount): RecordRef {
  return {
    type: 'account',
    id: a.id,
    ref: a.code,
    title: a.name,
    subtitleKey: `ledger:accountType.${a.type}`,
    href: `/backoffice/acc/account-workspace?record=${a.id}`,
    module: 'accounting',
    favouritable: true,
  };
}

function journalRef(j: StoredJournal): RecordRef {
  return {
    type: 'journal',
    id: j.id,
    ref: j.ref,
    title: j.memo,
    subtitleKey: `ledger:journalState.${j.state}`,
    href: `/backoffice/acc/journal-entries?record=${j.id}`,
    module: 'accounting',
    favouritable: true,
  };
}

const accountsOf = (ctx: HandlerContext, st: LedgerState) => st.accounts.filter((a) => a.state !== 'rejected' && readable(ctx, a.entityId));
const journalsOf = (ctx: HandlerContext, st: LedgerState) => st.journals.filter((j) => j.state !== 'cancelled' && readable(ctx, j.entityId));

export const LEDGER_RECORD_PROVIDERS: readonly RecordProvider[] = [
  {
    type: 'account',
    owns: (id) => id.startsWith('gla_'),
    resolve: (ctx, id) => {
      const a = accountsOf(ctx, ledgerState(ctx)).find((x) => x.id === id);
      return a ? accountRef(a) : null;
    },
    searchable: (ctx) => can(ctx, 'gl.view', 'history_read'),
    search: (ctx, q, limit) => accountsOf(ctx, ledgerState(ctx)).filter((a) => matches(q, a.code, a.name)).slice(0, limit).map(accountRef),
  },
  {
    type: 'journal',
    owns: (id) => id.startsWith('jnl_'),
    resolve: (ctx, id) => {
      const j = journalsOf(ctx, ledgerState(ctx)).find((x) => x.id === id);
      return j ? journalRef(j) : null;
    },
    searchable: (ctx) => can(ctx, 'gl.view', 'history_read'),
    search: (ctx, q, limit) => journalsOf(ctx, ledgerState(ctx)).filter((j) => matches(q, j.ref, j.memo)).slice(0, limit).map(journalRef),
  },
];

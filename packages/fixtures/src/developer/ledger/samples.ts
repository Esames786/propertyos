import type { BankImportSample } from '@repo/contracts';

/**
 * Labelled sample statement files for BANK-005 (Demo documents, fictional data). Every name, account,
 * reference and amount is invented. The first file overlaps the statement already imported in the demo
 * (two transactions), repeats one transaction inside itself and has one row with an impossible date, so
 * the preview shows each kind of duplicate and an invalid row. The second overlaps the first. The third
 * belongs to the operating account (choose the collection account for it and the import is refused).
 * Amounts: positive = money in (credit), negative = money out (debit).
 */
const accountLine = (iban: string) => `# Account: ${iban}`;

const HEADER = 'Transaction ID,Value date,Amount,Narration,Reference,Counterparty';

/** The statement already imported and approved in the demo (1–9 October). */
export const priorStatement = (iban: string) => [
  '# Sample: Larkspur collection account, 1–9 October 2026 (Demo document, fictional data)',
  accountLine(iban),
  HEADER,
  'LKC-261002-0001,2026-10-02,250000.00,IBFT credit,LH-T2-1203 token,Ayesha Karim',
  'LKC-261005-0002,2026-10-05,180000.00,IBFT credit,LG-B-07 instalment 4,Omar Shafiq',
  'LKC-261007-0003,2026-10-07,95000.00,Cash deposit,LH-T1-0402,Sana Javed',
  'LKC-261009-0004,2026-10-09,-1500.00,Bank charges October,CHG-OCT,Demo Bank (fictional)',
].join('\n');

export function ledgerSamples(accounts: { collection: { id: string; iban: string }; operating: { id: string; iban: string } }): BankImportSample[] {
  return [
    {
      n: 1,
      accountId: accounts.collection.id,
      fileName: 'sample-larkspur-collection-2026-10-01-15.csv',
      labelKey: 'ledger:bank.samples.one',
      content: [
        '# Sample: Larkspur collection account, 1–15 October 2026 (Demo document, fictional data)',
        accountLine(accounts.collection.iban),
        HEADER,
        'LKC-261002-0001,2026-10-02,250000.00,IBFT credit,LH-T2-1203 token,Ayesha Karim',
        'LKC-261005-0002,2026-10-05,180000.00,IBFT credit,LG-B-07 instalment 4,Omar Shafiq',
        'LKC-261012-0005,2026-10-12,320000.00,IBFT credit,LH-T3-0805 instalment 2,Bilal Qadir',
        'LKC-261013-0006,2026-10-13,150000.00,Cheque deposit,LG-A-12 token,Hina Farooq',
        'LKC-261013-0006,2026-10-13,150000.00,Cheque deposit,LG-A-12 token,Hina Farooq',
        'LKC-261014-0007,2026-10-34,75000.00,IBFT credit,LH-T1-1101,Zara Ahmed',
        'LKC-261015-0008,2026-10-15,-2500.00,Bank charges,CHG-1015,Demo Bank (fictional)',
      ].join('\n'),
    },
    {
      n: 2,
      accountId: accounts.collection.id,
      fileName: 'sample-larkspur-collection-2026-10-10-25.csv',
      labelKey: 'ledger:bank.samples.two',
      content: [
        '# Sample: Larkspur collection account, 10–25 October 2026 (Demo document, fictional data)',
        accountLine(accounts.collection.iban),
        HEADER,
        'LKC-261012-0005,2026-10-12,320000.00,IBFT credit,LH-T3-0805 instalment 2,Bilal Qadir',
        'LKC-261013-0006,2026-10-13,150000.00,Cheque deposit,LG-A-12 token,Hina Farooq',
        'LKC-261019-0009,2026-10-19,210000.00,IBFT credit,LH-T2-0907 instalment 5,Rehan Malik',
        'LKC-261022-0010,2026-10-22,60000.00,Cash deposit,LG-C-03,Nimra Aziz',
      ].join('\n'),
    },
    {
      n: 3,
      accountId: accounts.operating.id,
      fileName: 'sample-larkspur-operating-2026-10.csv',
      labelKey: 'ledger:bank.samples.three',
      content: [
        '# Sample: Larkspur operating account, October 2026 (Demo document, fictional data)',
        accountLine(accounts.operating.iban),
        HEADER,
        'LKO-261003-0001,2026-10-03,-450000.00,Funds transfer out,RENT-OCT,Demo Properties (fictional)',
        'LKO-261010-0002,2026-10-10,-1200000.00,Funds transfer out,CONSULT-SEP,Demo Consulting (fictional)',
        'LKO-261020-0003,2026-10-20,2000000.00,Transfer in,FUND-OCT,Larkspur Estates (Demo)',
      ].join('\n'),
    },
  ];
}

# S.1 hotfix (GitHub Issue #18): checkpoint

Branch `fix/s1-bank-feed-and-idempotency` from `474e4ae` (feature/gate-s2b-society-payroll), worktree
`D:\laragon2\www\propertyos-s1fix`. `E2E_PORT_OFFSET=800` = ports 5973-5975 (5173 + 800).

## Status: complete, committed and pushed; STOPPED for GPT and owner review
- [x] Issue #18 and audit FIN-01/FIN-02 (`docs/frontend-ux-audit@1a0779e`) read; not merged.
- [x] FIN-02 server: bound idempotency on the six S.1 creates (`common.ts` `replayOf`/`remember`).
- [x] FIN-01 server: `finance/bank-scope.ts` on every path (FINDINGS.md, FUNCTION_MATRIX.md).
- [x] UI: `useCreateKey`/`isKeyReused` (4 pages); `BankRestricted` reasons; `ibanWrap`; 16 new EN/UR keys.
- [x] Tests: API 13, UI hook 3, e2e 11, evidence 6, smoke 2; mutations 35/36 (I5 equivalent).
- [x] Final: tsc, lint+i18n, Vitest 1,517/1,517, combined Playwright 406/406 twice, axe 1,426 scans 0 violations,
      smoke 43/44 twice (pre-existing WebKit S.2a flake, A/B against base). See test-results.md.
- [x] Lock `D:\laragon2\www\.e2e-busy` released; no previews left running.

## Next (not started; needs review first)
- GPT/owner review of the decisions in FINDINGS.md (payee IBAN on configuration screens, close-check outcome).
- S.3 Rentals to take this branch after acceptance (bank-derived reads through `bank-scope.ts`; creates through `replayOf`).

import type { Page } from '@playwright/test';
import { E3QA_TEST_PRINCIPALS } from '../../packages/fixtures/src/developer/pricing/test-principals';
import type { Locale } from './fixtures';

/**
 * Gate E.3 local validation (Issue #33): browser sessions for the **test-only** pricing principals.
 *
 * They exist only in Playwright's own build (`PROPERTYOS_E2E_PRINCIPALS=1`, see playwright.config.ts and
 * apps/backoffice/vite.config.ts); the shipped demo build has no such identities, so a stored session that
 * names one is simply signed out there. No demo role or persona gains `pricing.manage` (E-07 / E-30 open).
 */
export type E3Principal = 'res_e3qa_pricing' | 'res_e3qa_pricing_peer' | 'res_e3qa_pricing_heights' | 'res_e3qa_pricing_revoked' | 'res_e3qa_cb_pricing';

export const principalOf = (id: E3Principal) => E3QA_TEST_PRINCIPALS.find((p) => p.id === id)!;

export interface PrincipalSeed {
  locale?: Locale;
  /** Header project ('all' or a project id): narrows what the API answers, like the project switcher. */
  projectId?: string;
  /** Office display record: text size (1 or 2 = 200 %) and theme. */
  textScale?: 1 | 2;
  theme?: 'light' | 'dark';
}

const onboarding = (tenant: string, persona: string) =>
  JSON.stringify({ profile: { tenantId: tenant, personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

/** Seeds the backoffice once per browser context as a test-only principal (later reloads keep what the test changed). */
export async function seedPrincipal(page: Page, id: E3Principal, options: PrincipalSeed = {}) {
  const p = principalOf(id);
  const { locale = 'en-PK', projectId = 'all', textScale = 1, theme = 'light' } = options;
  await page.addInitScript(
    ({ id, tenant, principal, locale, projectId, onboardingRecord, display }) => {
      if (localStorage.getItem('e2e:seeded')) return;
      localStorage.setItem('e2e:seeded', '1');
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: id, projectId }));
      localStorage.setItem('pref:locale', locale);
      localStorage.setItem('demo:mock', JSON.stringify({ mode: 'fast' }));
      localStorage.setItem(`onboarding:v1:${tenant}:${id}:backoffice`, onboardingRecord);
      localStorage.setItem(`pref:display:v1:backoffice:${tenant}:${principal}`, display);
    },
    {
      id,
      tenant: p.tenantId,
      principal: p.principalId,
      locale,
      projectId,
      onboardingRecord: onboarding(p.tenantId, id),
      display: JSON.stringify({ version: 2, textScale, theme, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' }),
    },
  );
}

/** Signs this tab in as another principal (same tab, so the session-kept demo data stays) and reloads. */
export async function becomePrincipal(page: Page, id: E3Principal | 'sales' | 'manager', projectId = 'all') {
  const tenant = id === 'sales' || id === 'manager' ? 'tnt_larkspur' : principalOf(id).tenantId;
  await page.evaluate(
    ({ id, projectId, tenant, record }) => {
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: id, projectId }));
      localStorage.setItem(`onboarding:v1:${tenant}:${id}:backoffice`, record);
    },
    { id, projectId, tenant, record: onboarding(tenant, id) },
  );
  await page.reload();
}

/**
 * The tenant's business state as the mock server keeps it (the session demo overlay), with the identity
 * section left out: the session gate legitimately records sign-ins there (GPT pass 3). Every pricing section,
 * sequence counter and request-key map is included, byte for byte.
 */
export async function businessState(page: Page): Promise<string> {
  return page.evaluate(() => {
    window.__prototype!.transport.demo.save();
    const raw = sessionStorage.getItem('demo:store:v2');
    if (!raw) return '';
    const value = JSON.parse(raw) as { partitions?: Record<string, { sections?: Record<string, unknown> }> };
    for (const partition of Object.values(value.partitions ?? {})) delete partition.sections?.identity;
    return JSON.stringify(value);
  });
}

/** One pricing section of the overlay (parsed), or null. */
export async function pricingSection<T = unknown>(page: Page, section: string, tenant = 'tnt_larkspur'): Promise<T | null> {
  return page.evaluate(
    ({ section, tenant }) => {
      window.__prototype!.transport.demo.save();
      const raw = sessionStorage.getItem('demo:store:v2');
      const value = raw ? (JSON.parse(raw) as { partitions?: Record<string, { sections?: Record<string, unknown> }> }) : null;
      return (value?.partitions?.[tenant]?.sections?.[section] ?? null) as never;
    },
    { section, tenant },
  );
}

export interface Refusal {
  status: number;
  code: string;
  changed: boolean;
}

/** Sends one request through the in-page mock server; a refusal comes back as its problem (no correlation id). */
export async function call<T = unknown>(page: Page, request: { method: 'GET' | 'POST'; path: string; body?: unknown; idempotencyKey?: string; query?: Record<string, string> }): Promise<{ ok: true; body: T } | { ok: false; problem: Refusal }> {
  return page.evaluate(async (req) => {
    try {
      return { ok: true as const, body: (await window.__prototype!.transport.request(req)) as never };
    } catch (e) {
      const p = (e as { problem?: { status: number; code: string; changed: boolean } }).problem;
      return { ok: false as const, problem: { status: p?.status ?? -1, code: p?.code ?? String(e), changed: p?.changed ?? true } };
    }
  }, request);
}

/**
 * Fault injection for the in-page mock server (test-only; through the prototype inspection hook):
 * - `lose`: the next POST whose path matches reaches the server and is applied, but the caller gets a
 *   network error instead of the answer (a lost response);
 * - `failGets`: GETs whose path matches fail (503 by default, or the status given) until healed with `null`
 *   (a read failing after a write succeeded).
 * The injected failures are real `ApiError`s (the class is taken from a genuine 404 of the in-page server),
 * so the screens treat them exactly as they would a real refusal. Every request the page sends is recorded
 * with its idempotency keys (header and body).
 */
export async function installFaults(page: Page) {
  await page.evaluate(async () => {
    type Req = { method: string; path: string; idempotencyKey?: string; body?: unknown };
    const transport = window.__prototype!.transport as unknown as { request: (req: Req) => Promise<unknown>; __faults?: unknown };
    if (transport.__faults) return;
    const original = transport.request.bind(transport);
    let ApiErrorClass: new (problem: Record<string, unknown>) => Error = Error as never;
    try { await original({ method: 'GET', path: '/__e3qa_no_such_endpoint__' }); } catch (e) { ApiErrorClass = (e as object).constructor as typeof ApiErrorClass; }
    const fail = (status: number, code: string, messageKey: string) => new ApiErrorClass({ status, code, messageKey, correlationId: 'e3qa-injected', changed: false });
    const state = { lose: null as string | null, failGets: null as string | null, failStatus: 503, sent: [] as Array<{ method: string; path: string; header?: string; body?: string; outcome: string }> };
    transport.__faults = state;
    transport.request = async (req) => {
      const bodyKey = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>).idempotencyKey : undefined;
      const row = { method: req.method, path: req.path, ...(req.idempotencyKey ? { header: req.idempotencyKey } : {}), ...(typeof bodyKey === 'string' ? { body: bodyKey } : {}), outcome: 'pending' };
      state.sent.push(row);
      if (req.method === 'GET' && state.failGets && new RegExp(state.failGets).test(req.path)) {
        row.outcome = 'failed-get';
        throw state.failStatus === 404 ? fail(404, 'not_found', 'errors:api.notFound') : fail(state.failStatus, 'service_unavailable', 'errors:network.unavailable');
      }
      const result = await original(req);
      if (req.method === 'POST' && state.lose && new RegExp(state.lose).test(req.path)) {
        state.lose = null;
        row.outcome = 'applied-but-lost';
        throw fail(0, 'offline', 'errors:network.offline');
      }
      row.outcome = 'ok';
      return result;
    };
  });
}

export async function loseNextPost(page: Page, pathPattern: string) {
  await page.evaluate((p) => { (window.__prototype!.transport as unknown as { __faults: { lose: string | null } }).__faults.lose = p; }, pathPattern);
}
export async function failGets(page: Page, pathPattern: string | null, status = 503) {
  await page.evaluate(({ p, status }) => {
    const faults = (window.__prototype!.transport as unknown as { __faults: { failGets: string | null; failStatus: number } }).__faults;
    faults.failGets = p;
    faults.failStatus = status;
  }, { p: pathPattern, status });
}
export async function sentRequests(page: Page) {
  return page.evaluate(() => (window.__prototype!.transport as unknown as { __faults: { sent: Array<{ method: string; path: string; header?: string; body?: string; outcome: string }> } }).__faults.sent);
}

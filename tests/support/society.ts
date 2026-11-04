import type { Page } from '@playwright/test';
import { BO, CU, displayKey, type Locale, type PersonaId } from './fixtures';

/**
 * Gate C.2 helpers: the Al-Noor society demo told in both apps of one browser (the resident in the
 * customer app, a colleague in the office app), sharing the society through the labelled demo link.
 */
export interface SocietySeed {
  resident?: PersonaId;
  staff?: PersonaId;
  locale?: Locale;
  /** The resident's saved text size; 'first-run' leaves it unset (the first-run step is shown). */
  textScale?: number | 'first-run';
  /** 'fresh': the resident has not answered the welcome yet (tours are offered). */
  residentOnboarding?: 'done' | 'fresh';
}

const record = (persona: string, app: string) =>
  JSON.stringify({
    profile: {
      tenantId: 'tnt_alnoor',
      personaId: persona,
      app,
      welcomeDecision: 'declined',
      autoOffer: false,
      seenModules: ['lab'],
      updatedAt: '2026-10-26T00:00:00Z',
    },
    progress: {},
  });

/** One seed for both apps (each origin runs it once, the office's bridge frame included). */
export async function seedSociety(page: Page, options: SocietySeed = {}) {
  const {
    resident = 'alnoor_resident_a101',
    staff = 'alnoor_accounts',
    locale = 'en-PK',
    textScale = 1,
    residentOnboarding = 'done',
  } = options;
  const display =
    textScale === 'first-run'
      ? null
      : {
          key: displayKey(resident),
          value: JSON.stringify({ version: 1, textScale, chosenAt: '2026-10-26T00:00:00Z' }),
        };
  await page.addInitScript(
    ({ resident, staff, locale, display, records }) => {
      if (localStorage.getItem('e2e:seeded')) return;
      localStorage.setItem('e2e:seeded', '1');
      localStorage.setItem('pref:locale', locale);
      localStorage.setItem('demo:mock', JSON.stringify({ mode: 'fast' }));
      localStorage.setItem(
        'demo:session:customer',
        JSON.stringify({ personaId: resident, projectId: 'all' }),
      );
      localStorage.setItem(
        'demo:session:backoffice',
        JSON.stringify({ personaId: staff, projectId: 'all' }),
      );
      if (records.customer)
        localStorage.setItem(`onboarding:v1:tnt_alnoor:${resident}:customer`, records.customer);
      localStorage.setItem(`onboarding:v1:tnt_alnoor:${staff}:backoffice`, records.backoffice);
      if (display) localStorage.setItem(display.key, display.value);
    },
    {
      resident,
      staff,
      locale,
      display,
      records: {
        customer: residentOnboarding === 'fresh' ? null : record(resident, 'customer'),
        backoffice: record(staff, 'backoffice'),
      },
    },
  );
}

/** Become another colleague (office app) or resident (customer app); each app keeps its own session. */
export async function become(page: Page, app: 'backoffice' | 'customer', persona: PersonaId) {
  const origin = app === 'backoffice' ? BO : CU;
  if (!page.url().startsWith(origin))
    await page.goto(
      `${origin}${app === 'backoffice' ? '/backoffice/global/my-access' : '/customer/portal/home'}`,
    );
  await page.evaluate(
    ({ app, persona, value, display }) => {
      localStorage.setItem(
        `demo:session:${app}`,
        JSON.stringify({ personaId: persona, projectId: 'all' }),
      );
      localStorage.setItem(`onboarding:v1:tnt_alnoor:${persona}:${app}`, value);
      if (display && !localStorage.getItem(display))
        localStorage.setItem(
          display,
          JSON.stringify({ version: 1, textScale: 1, chosenAt: '2026-10-26T00:00:00Z' }),
        );
    },
    {
      app,
      persona,
      value: record(persona, app),
      display: app === 'customer' ? displayKey(persona) : null,
    },
  );
}

export type ApiResult<T> = { ok: true; res: T } | { ok: false; code: string; status: number };

/** A request through the current page's own mock server (setup and the checks the UI cannot show). */
export async function societyApi<T = unknown>(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  body: unknown = {},
  query?: Record<string, string>,
): Promise<ApiResult<T>> {
  return page.evaluate(
    async ({ path, method, body, query }) => {
      try {
        const res = await window.__prototype!.transport.request({
          method,
          path,
          ...(method !== 'GET' ? { body } : {}),
          ...(query ? { query } : {}),
        });
        return { ok: true as const, res: res as T };
      } catch (e) {
        return {
          ok: false as const,
          code: (e as { problem?: { code: string } }).problem?.code ?? 'error',
          status: (e as { problem?: { status: number } }).problem?.status ?? 0,
        };
      }
    },
    { path, method, body, query },
  );
}

/** The shared guard of the browser's multi-site case (Issue #14): main site and Block C. */
export const SHARED_GUARD = { id: 'emp_anr_901', name: 'Rashid Latif', blockC: 'site_anc_demo' } as const;

/**
 * Gate S.2a closure (Issue #14): the fictional multi-site case in this browser's demo, as in
 * `multisite.fixture.ts` for the API tests. The demo itself has one site.
 * - **Block C (Demo)**, owned by Al-Noor's own association, is added to the HR state.
 * - **Rashid Latif**, a guard employed by the association, works at the main site and at Block C.
 * - With `narrow`, the persona's organisation-wide scope is narrowed to the main site in this tab
 *   (the demo-only, narrow-only `demo:site-scope`). That makes a single-site manager.
 *
 * The page must be an office page whose HR state exists (any HR screen opened once). Returns the main site.
 */
export async function addSharedGuard(page: Page, narrow: string[] = []): Promise<string> {
  const main = await page.evaluate((g) => {
    type Site = { siteId: string; legalEntityId: string; legalEntityName: string; name: string; code: string };
    const part = window.__prototype!.transport.demo.partition('tnt_alnoor');
    const hr = part.section<{ sites: Site[]; employees: Array<{ id: string }> }>('hr', () => {
      throw new Error('HR state not created yet');
    });
    const first = hr.sites[0]!;
    if (!hr.sites.some((s) => s.siteId === g.blockC)) {
      hr.sites.push({ ...first, siteId: g.blockC, name: 'Al-Noor Block C (Demo)', code: 'ANC' });
      hr.employees.push({
        id: g.id,
        code: 'ANR-E-901',
        name: g.name,
        role: 'security_guard',
        department: 'security',
        employmentType: 'permanent',
        legalEntityId: first.legalEntityId,
        status: 'active',
        startDate: '2025-01-01',
        periods: [{ from: '2025-01-01', type: 'permanent' }],
        sites: [
          { siteId: first.siteId, from: '2025-01-01' },
          { siteId: g.blockC, from: '2025-01-01' },
        ],
        personal: { cnic: '35202-9000003-3', phone: '+92 300 0000903', address: 'House 9, Rashid Latif Street, Lahore (Demo)' },
        supervises: [],
        profile: { consent: false, showName: false, showPhoto: false },
        history: [],
      } as { id: string });
      part.save();
    }
    return first.siteId;
  }, SHARED_GUARD);
  if (narrow.length) await page.evaluate(({ personas, site }) => sessionStorage.setItem('demo:site-scope', JSON.stringify(Object.fromEntries(personas.map((p) => [p, [site]])))), { personas: narrow, site: main });
  return main;
}

export const textScaleOf = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim(),
  );

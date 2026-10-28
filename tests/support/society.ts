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

export const textScaleOf = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim(),
  );

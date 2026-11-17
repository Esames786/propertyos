import { ACCESS_TODAY, BACKOFFICE_TENANTS, DemoStore, demoAccessFor, localSharedPartitions, MockTransport, ALL_PERSONAS, TENANT } from '@repo/fixtures';
import { E3QA_TEST_PRINCIPALS } from '@repo/fixtures/testing';
import { getMissingKeys } from '@repo/i18n';
import { AppProviders } from '@repo/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './prototype/routes';
import './styles.css';

declare global {
  interface Window {
    /** Prototype-only inspection hook for tests (mutation log, missing translations). Fictional data only. */
    __prototype?: { transport: MockTransport; missingKeys: typeof getMissingKeys };
  }
}

/** One transport per page load (StrictMode may call state initialisers twice in development). */
let transport: MockTransport | undefined;

/** Gate D.3: the same access for the screens and the mock server (a demo can withdraw an add-on, never grant one). */
const accessFor = demoAccessFor();

/**
 * Gate E.3 local validation (Issue #33; provisional, reconcile at integration): `true` only in Playwright's build
 * (PROPERTYOS_E2E_PRINCIPALS=1, see vite.config.ts), where the unlisted test-only pricing principals are added for the
 * screens and the mock server alike. Elsewhere it is the literal `false` and the bundler drops them: the shipped demo
 * has exactly ALL_PERSONAS.
 */
declare const __E2E_TEST_PRINCIPALS__: boolean;
const personas = __E2E_TEST_PRINCIPALS__ ? [...ALL_PERSONAS, ...E3QA_TEST_PRINCIPALS] : ALL_PERSONAS;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders
      app="backoffice"
      tenant={TENANT}
      tenants={BACKOFFICE_TENANTS}
      personas={personas}
      accessFor={accessFor}
      accessDate={ACCESS_TODAY}
      createTransport={(getContext, getMode) => {
        // The society demo is shared with the customer app of this browser (see shared-demo.ts).
        transport ??= new MockTransport({ getContext, getMode, accessFor, personas, demo: new DemoStore(undefined, localSharedPartitions()) });
        window.__prototype = { transport, missingKeys: getMissingKeys };
        return transport;
      }}
    >
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);

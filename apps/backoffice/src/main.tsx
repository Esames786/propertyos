import { ACCESS_TODAY, BACKOFFICE_TENANTS, DemoStore, demoAccessFor, localSharedPartitions, MockTransport, ALL_PERSONAS, TENANT } from '@repo/fixtures';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders
      app="backoffice"
      tenant={TENANT}
      tenants={BACKOFFICE_TENANTS}
      personas={ALL_PERSONAS}
      accessFor={accessFor}
      accessDate={ACCESS_TODAY}
      createTransport={(getContext, getMode) => {
        // The society demo is shared with the customer app of this browser (see shared-demo.ts).
        transport ??= new MockTransport({ getContext, getMode, accessFor, demo: new DemoStore(undefined, localSharedPartitions()) });
        window.__prototype = { transport, missingKeys: getMissingKeys };
        return transport;
      }}
    >
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);

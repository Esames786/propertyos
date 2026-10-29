import { ACCESS_TODAY, bridgedSharedPartitions, CUSTOMER_TENANTS, DemoStore, effectiveAccessFor, MockTransport, ALL_PERSONAS, TENANT } from '@repo/fixtures';
import { getMissingKeys } from '@repo/i18n';
import { AppProviders } from '@repo/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { officeOrigin } from './nav.config';
import { router } from './prototype/routes';
import './styles.css';

declare global {
  interface Window {
    __prototype?: { transport: MockTransport; missingKeys: typeof getMissingKeys };
  }
}

let transport: MockTransport | undefined;

/**
 * Prototype: the office app's bridge page, which keeps the society demo both apps share in this
 * browser (a resident's proof reaches the accounts officer; the receipt comes back). Same host
 * name, the office app's port (5173) unless VITE_OFFICE_ORIGIN says otherwise.
 */


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders
      app="customer"
      tenant={TENANT}
      tenants={CUSTOMER_TENANTS}
      personas={ALL_PERSONAS}
      accessFor={effectiveAccessFor}
      accessDate={ACCESS_TODAY}
      createTransport={(getContext, getMode) => {
        transport ??= new MockTransport({ getContext, getMode, demo: new DemoStore(undefined, bridgedSharedPartitions(`${officeOrigin()}/demo-bridge.html`)) });
        window.__prototype = { transport, missingKeys: getMissingKeys };
        return transport;
      }}
    >
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);

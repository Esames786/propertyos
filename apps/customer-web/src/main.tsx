import { MockTransport, PERSONAS, TENANT } from '@repo/fixtures';
import { getMissingKeys } from '@repo/i18n';
import { AppProviders } from '@repo/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './prototype/routes';
import './styles.css';

declare global {
  interface Window {
    __prototype?: { transport: MockTransport; missingKeys: typeof getMissingKeys };
  }
}

let transport: MockTransport | undefined;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders
      app="customer"
      tenant={TENANT}
      personas={PERSONAS}
      createTransport={(getContext, getMode) => {
        transport ??= new MockTransport({ getContext, getMode });
        window.__prototype = { transport, missingKeys: getMissingKeys };
        return transport;
      }}
    >
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);

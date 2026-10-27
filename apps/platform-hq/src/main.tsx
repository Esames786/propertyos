import { PLATFORM_OPERATOR, PLATFORM_PERSONAS, PlatformMockTransport } from '@repo/fixtures/platform';
import { getMissingKeys } from '@repo/i18n';
import { AppProviders } from '@repo/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './prototype/routes';
import './styles.css';

declare global {
  interface Window {
    /** Prototype-only inspection hook for HQ tests (store writes, missing translations). Fictional data only. */
    __hq?: { transport: PlatformMockTransport; missingKeys: typeof getMissingKeys };
  }
}

/** One transport per page load (StrictMode may call state initialisers twice in development). */
let transport: PlatformMockTransport | undefined;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders
      app="platform"
      tenant={PLATFORM_OPERATOR}
      personas={PLATFORM_PERSONAS}
      createTransport={(getContext, getMode) => {
        transport ??= new PlatformMockTransport({ getContext, getMode });
        window.__hq = { transport, missingKeys: getMissingKeys };
        return transport;
      }}
    >
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);

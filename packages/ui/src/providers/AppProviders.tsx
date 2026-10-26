import type { AppId, Persona } from '@repo/contracts';
import { LocaleProvider } from '@repo/i18n';
import type { ReactNode } from 'react';
import { LiveAnnouncerProvider } from '../a11y/LiveAnnouncer';
import { TransportProvider, type TransportFactory } from '../data/TransportProvider';
import { ToastProvider } from '../feedback/Toast';
import { TrainingProvider } from '../onboarding/TrainingProvider';
import { SessionProvider } from '../permissions/SessionProvider';
import { PreferencesProvider } from '../preferences/PreferencesProvider';

/**
 * Cross-cutting providers shared by every app. The app supplies its identity, demo personas and
 * data transport; nothing here imports fixtures, so production builds can swap in the real API.
 */
export function AppProviders({
  app,
  tenant,
  personas,
  createTransport,
  children,
}: {
  app: AppId;
  tenant: { id: string; name: string };
  personas: readonly Persona[];
  createTransport: TransportFactory;
  children: ReactNode;
}) {
  return (
    <LocaleProvider>
      <PreferencesProvider>
        <LiveAnnouncerProvider>
          <SessionProvider app={app} tenant={tenant} personas={personas}>
            <TransportProvider createTransport={createTransport}>
              <ToastProvider>
                <TrainingProvider>{children}</TrainingProvider>
              </ToastProvider>
            </TransportProvider>
          </SessionProvider>
        </LiveAnnouncerProvider>
      </PreferencesProvider>
    </LocaleProvider>
  );
}

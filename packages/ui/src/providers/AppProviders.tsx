import type { AppId, EffectiveAccess, Persona } from '@repo/contracts';
import { LocaleProvider } from '@repo/i18n';
import type { ReactNode } from 'react';
import { LiveAnnouncerProvider } from '../a11y/LiveAnnouncer';
import { TransportProvider, type TransportFactory } from '../data/TransportProvider';
import { ToastProvider } from '../feedback/Toast';
import { TrainingProvider } from '../onboarding/TrainingProvider';
import { SessionProvider, type SessionTenant } from '../permissions/SessionProvider';
import { PreferencesProvider } from '../preferences/PreferencesProvider';

/**
 * Cross-cutting providers shared by every app. The app supplies its identity, demo personas and
 * data transport; nothing here imports fixtures, so production builds can swap in the real API.
 */
export function AppProviders({
  app,
  tenant,
  tenants,
  personas,
  accessFor,
  accessDate,
  createTransport,
  children,
}: {
  app: AppId;
  tenant: SessionTenant;
  /** Tenants whose people can sign in to this app (the session follows the signed-in person). */
  tenants?: readonly SessionTenant[];
  personas: readonly Persona[];
  /** Effective access of a signed-in person; supplied by the app (fixtures now, the API later). */
  accessFor?: (persona: Persona) => EffectiveAccess | null;
  accessDate?: string;
  createTransport: TransportFactory;
  children: ReactNode;
}) {
  return (
    <LocaleProvider>
      <PreferencesProvider>
        <LiveAnnouncerProvider>
          <SessionProvider app={app} tenant={tenant} personas={personas} {...(tenants ? { tenants } : {})} {...(accessFor ? { accessFor } : {})} {...(accessDate ? { accessDate } : {})}>
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

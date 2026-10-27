import type { ApiTransport, Persona } from '@repo/contracts';
import { render } from '@testing-library/react';
import { useCallback, useState, type ReactNode } from 'react';
import { NavigationProvider, type AppLocation } from '../navigation/RouterAdapter';
import { AppProviders } from '../providers/AppProviders';

export const TEST_PERSONA: Persona = {
  id: 'manager',
  tenantId: 'tnt_test',
  app: 'backoffice',
  principalId: 'usr_test_0001',
  displayName: 'Test Manager',
  roleKey: 'common:persona.manager',
  email: 'test@example.com',
  permissions: ['quickcreate.use', 'lead.create', 'lead.view', 'unit.view', 'project.context.use', 'customer.view'],
  projectScope: 'all',
};

const stubTransport: ApiTransport = {
  request: async <T,>() => [] as unknown as T,
};

function MemoryNavigation({ initial, children }: { initial: string; children: ReactNode }) {
  const [location, setLocation] = useState<AppLocation>(() => {
    const url = new URL(initial, 'http://test.local');
    return { pathname: url.pathname, search: url.search, hash: url.hash };
  });
  const navigate = useCallback((href: string) => {
    const url = new URL(href, 'http://test.local');
    setLocation({ pathname: url.pathname, search: url.search, hash: url.hash });
  }, []);
  return (
    <NavigationProvider navigate={navigate} location={location}>
      <span data-testid="location">{`${location.pathname}${location.search}`}</span>
      {children}
    </NavigationProvider>
  );
}

/** Renders inside the real provider stack with a signed-in test persona and in-memory navigation. */
export function renderWithProviders(ui: ReactNode, { url = '/test', transport = stubTransport }: { url?: string; transport?: ApiTransport } = {}) {
  localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: 'manager', projectId: 'all' }));
  return render(
    <AppProviders app="backoffice" tenant={{ id: 'tnt_test', name: 'Test Tenant' }} personas={[TEST_PERSONA]} createTransport={() => transport}>
      <MemoryNavigation initial={url}>{ui}</MemoryNavigation>
    </AppProviders>,
  );
}

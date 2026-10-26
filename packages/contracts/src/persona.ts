import type { Permission } from './permissions';

export type AppId = 'backoffice' | 'customer' | 'public';

/** A fictional demo identity used to simulate sign-in and role scope in the prototype. */
export interface Persona {
  id: 'manager' | 'sales' | 'finance' | 'resident';
  tenantId: string;
  app: AppId;
  /** Person's name as entered (free text is never translated). */
  displayName: string;
  /** Translation key for the role title. */
  roleKey: string;
  email: string;
  permissions: readonly Permission[];
  /** Project ids the persona may see, or 'all'. */
  projectScope: 'all' | readonly string[];
  /** For residents: the party they are. */
  partyId?: string;
}

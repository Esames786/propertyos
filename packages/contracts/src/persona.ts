import type { Permission } from './permissions';

export type AppId = 'backoffice' | 'customer' | 'public' | 'platform';

/** A fictional demo identity used to simulate sign-in and role scope in the prototype. */
export interface Persona {
  id:
    | 'manager'
    | 'sales'
    | 'finance'
    | 'resident'
    | 'facility_manager'
    | 'society_admin'
    | 'cb_manager'
    | 'cedar_treasurer'
    | 'alnoor_manager'
    | 'alnoor_treasurer'
    | 'alnoor_guard'
    | 'alnoor_accounts'
    | 'alnoor_maintenance'
    | 'alnoor_technician'
    | 'alnoor_resident_a101'
    | 'alnoor_tenant_a102'
    | 'alnoor_owner_a201'
    | 'alnoor_tenant_a202'
    | 'alnoor_admin'
    | 'supreme_admin'
    | 'commercial_approver'
    | 'platform_support'
    /** Gate S.3: Riverbend Estate Managers (Demo) staff, landlords and a lessee. */
    | 'rb_director'
    | 'rb_manager'
    | 'rb_finance'
    | 'rb_accounts'
    | 'rb_landlord_tahira'
    | 'rb_landlord_kashif'
    | 'rb_tenant_adeel'
    /** Gate E.1 (provisional; reconcile with E.0): Larkspur's sales manager (decision E-06). */
    | 'sales_manager'
    /** Gate D.1: a resident who joined by invitation (generated from the society register). */
    | `res_${string}`;
  tenantId: string;
  app: AppId;
  /**
   * Stable identity of the person (a user id once real sign-in exists). Maker-checker, ownership
   * and audit compare this, never the display name, which can change or be shared by two people.
   */
  principalId: string;
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
  /** Staff: the tenant role they hold (its permissions are theirs). */
  roleId?: string;
  /**
   * Gate D.1: not offered on the demo sign-in pages. Residents who joined by invitation sign in with
   * their phone and a one-time code (AUTH-006), never by picking a name.
   */
  unlisted?: boolean;
}

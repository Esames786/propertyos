import type { AppNotification, Floor, Invoice, Lead, Party, PartyLink, Project, SiteVisit, Tower, Unit } from '@repo/contracts';

/**
 * One tenant's records. The mock server serves every request from the signed-in person's own
 * tenant dataset, so another organisation's records cannot be reached by any filter mistake: they
 * are simply not in the data the handler sees (V3.1 tenant partition, CP2 security correction 5).
 */
export interface TenantDataset {
  tenantId: string;
  projects: readonly Project[];
  towers: readonly Tower[];
  floors: readonly Floor[];
  /** Phase/block labels for projects without towers. */
  blocks: ReadonlyArray<{ id: string; projectId: string; label: string }>;
  units: readonly Unit[];
  parties: readonly Party[];
  leads: readonly Lead[];
  invoices: readonly Invoice[];
  visits: readonly SiteVisit[];
  notifications: readonly AppNotification[];
  /**
   * Verified (or claimed) relationships between residents and the flats and billing accounts they
   * are liable for, effective-dated (CP2 security correction 3). A resident reaches only what a
   * verified link in force on the record's date covers.
   */
  partyLinks: ReadonlyArray<PartyLink & { partyId: string }>;
  /** Reference prefixes and default city for records created in the demo session. */
  refs: { party: string; lead: string; city: string };
}

/** Billing account liable for a unit's invoices (one per unit in the demo). */
export const billingAccountOf = (unitId: string) => `ba_${unitId.replace(/^unt_/, '')}`;

/** The site a project-bound record belongs to (undefined when the project is unknown: fail closed). */
export const siteOfProject = (d: TenantDataset, projectId: string | undefined) => (projectId ? d.projects.find((p) => p.id === projectId)?.siteId : undefined);
export const entityOfProject = (d: TenantDataset, projectId: string | undefined) => (projectId ? d.projects.find((p) => p.id === projectId)?.legalEntityId : undefined);

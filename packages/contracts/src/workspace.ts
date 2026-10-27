import type { ProjectKind } from './entities';

/**
 * Developer-workspace setup (Stage 1.5R prototype). The wizard collects these fields and the mock
 * records them in the demo session only: no account, email, SMS or tenant is created anywhere.
 */
export const ORGANISATION_TYPES = ['private_limited', 'partnership', 'sole_proprietor', 'public_limited'] as const;
export type OrganisationType = (typeof ORGANISATION_TYPES)[number];

export const WORKSPACE_ROLES = ['manager', 'sales', 'finance'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const PROJECT_TYPES = ['towers', 'plots', 'mixed'] as const;
export type ProjectTypeChoice = (typeof PROJECT_TYPES)[number];

export interface WorkspaceSetup {
  account: { fullName: string; email: string; phone: string };
  organisation: {
    name: string;
    type: OrganisationType;
    city: string;
    officePhone?: string;
    currency: 'PKR';
    language: 'en-PK' | 'ur-PK';
  };
  /** Null when the step was skipped. */
  project: { name: string; type: ProjectTypeChoice; city: string; expectedUnits: number } | null;
  invites: Array<{ email: string; role: WorkspaceRole }>;
}

export interface WorkspaceProfile extends WorkspaceSetup {
  createdAt: string;
  /** Always true in the prototype: shown so no screen implies a real workspace exists. */
  simulated: true;
}

/**
 * What the demo environment contains for the signed-in demo identity (Get started → "Demo ready").
 * Counts follow the persona's project scope; `null` means the role cannot see that kind of record.
 */
export interface DemoOverview {
  tenantName: string;
  projects: Array<{ id: string; name: string; city: string; kind: ProjectKind }>;
  counts: {
    projects: number;
    units: number | null;
    customers: number | null;
    leads: number | null;
    siteVisits: number | null;
    openFollowUps: number | null;
  };
}

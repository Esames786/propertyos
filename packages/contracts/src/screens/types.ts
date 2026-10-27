export type ScreenApp = 'backoffice' | 'customer' | 'public' | 'saas' | 'shared' | 'platform';
export type ScreenStatus = 'planned' | 'partial' | 'implemented';
export type UiTemplate =
  | 'dashboard'
  | 'index'
  | 'workspace'
  | 'form'
  | 'wizard'
  | 'approval'
  | 'calendar'
  | 'matrix'
  | 'report'
  | 'reconciliation'
  | 'settings'
  | 'auth'
  | 'public-story'
  | 'onboarding';

/**
 * One row of the V3.1 screen register (docs/ui/screen-register.csv, adopted in Gate B). The first
 * fields keep their V2.1 meaning so existing routes, links and tests are unchanged.
 */
export interface ScreenEntry {
  id: string;
  /** App that serves the register address (V2.1 meaning; 'platform' for Platform HQ rows). */
  app: string;
  domain: string;
  name: string;
  surface: string;
  /** Template as written in the owner's V2.1 register (coarse; see Stage 0 conflict C7). */
  registerTemplate: string;
  uiTemplate: string;
  /** URL from the owner's V2.1 register (or the V3.1 route for new rows); always resolvable when concrete. */
  registerRoute: string;
  /** Where the screen lives now. */
  route: string;
  status: string;
  /** V2.1 stage (0 for rows added in V3.1). */
  stage: number;
  // V3.1 fields
  application: string;
  edition: string;
  module: string;
  permission: string;
  scope: string;
  /** keep | merge->ID | state-of->ID | supersede->ID | new … */
  disposition: string;
  /** The screen this row counts as (itself unless merged, a state, or superseded). */
  canonicalId: string;
  /** Gate that builds it ('built' when done; merged rows show their canonical screen's gate). */
  gate: string;
  /** Has an address a browser can open (rows that are tabs, drawers or parameterised routes do not). */
  concrete: boolean;
}

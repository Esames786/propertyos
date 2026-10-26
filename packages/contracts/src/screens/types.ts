export type ScreenApp = 'backoffice' | 'customer' | 'public' | 'saas' | 'shared';
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

export interface ScreenEntry {
  id: string;
  app: string;
  domain: string;
  name: string;
  surface: string;
  /** Template as written in the owner's register (coarse; see Stage 0 conflict C7). */
  registerTemplate: string;
  uiTemplate: string;
  /** URL exactly as in the owner's register; always resolvable. */
  registerRoute: string;
  /** Where the screen actually lives (differs when the register route needed a fix). */
  route: string;
  status: string;
  stage: number;
}

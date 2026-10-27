import type { EditionKey, EditionPreset, ModuleCatalog, ModuleCatalogEntry, ModuleKey } from '@repo/contracts';

/**
 * The module catalogue (Gate A, A1 §5): 27 modules, their scope, hard requirements ("requires") and
 * soft links ("integrates"), and which edition presets include them. An edition only pre-fills
 * grants; access is decided by grants alone (D-2).
 */
const ALL: EditionKey[] = ['developer', 'community', 'portfolio', 'custom'];
const DEV: EditionKey[] = ['developer'];
const COMM: EditionKey[] = ['community', 'portfolio'];
const BOTH: EditionKey[] = ['developer', 'community', 'portfolio'];

const m = (
  key: ModuleKey,
  category: ModuleCatalogEntry['category'],
  scope: ModuleCatalogEntry['scope'],
  requires: ModuleKey[],
  integrates: ModuleKey[],
  includedIn: EditionKey[],
  addonFor: EditionKey[] = [],
  features: ModuleCatalogEntry['features'] = [],
): ModuleCatalogEntry => ({ key, category, scope, alwaysOn: key === 'core', requires, integrates, features, includedIn, addonFor: [...new Set([...addonFor, 'custom' as const])].filter((e) => !includedIn.includes(e)) });

export const MODULES: readonly ModuleCatalogEntry[] = [
  m('core', 'foundation', 'tenant', [], [], ALL, [], ['core.multi_entity', 'core.practice_mode']),
  m('crm', 'sales', 'tenant', ['core'], ['sales', 'communications', 'public_website'], DEV),
  m('projects', 'property', 'tenant', ['core'], ['construction', 'accounting'], DEV),
  m('inventory', 'sales', 'site', ['projects'], ['crm', 'sales'], DEV),
  m('sales', 'sales', 'tenant', ['inventory', 'receivables'], ['crm', 'accounting'], DEV),
  m('construction', 'property', 'site', ['projects'], ['resident_portal'], DEV),
  m('handover', 'property', 'site', ['sales'], ['construction', 'residents'], DEV),
  m('receivables', 'finance', 'tenant', ['core'], ['accounting', 'banking', 'online_payments'], BOTH, [], ['receivables.office_collections']),
  m('dues', 'community', 'site', ['receivables', 'residents'], ['accounting', 'communications'], COMM, DEV, ['dues.utility_meters', 'dues.late_fees']),
  m('residents', 'community', 'site', ['core'], ['dues', 'maintenance', 'visitors'], BOTH),
  m('resident_portal', 'community', 'site', ['residents'], ['receivables', 'maintenance', 'visitors', 'amenities', 'construction'], BOTH),
  m('online_payments', 'finance', 'site', ['receivables'], ['resident_portal'], [], BOTH),
  m('banking', 'finance', 'tenant', ['core'], ['receivables', 'payables', 'accounting'], BOTH),
  m('accounting', 'finance', 'tenant', ['core'], ['receivables', 'payables', 'payroll', 'banking'], DEV, COMM),
  m('payables', 'finance', 'tenant', ['core'], ['accounting', 'procurement', 'maintenance'], DEV, COMM),
  m('procurement', 'finance', 'tenant', ['payables'], ['projects'], DEV),
  m('hr', 'people', 'tenant', ['core'], ['payroll'], DEV),
  m('payroll', 'people', 'tenant', ['hr'], ['accounting'], DEV),
  m('maintenance', 'community', 'site', ['core'], ['residents', 'resident_portal', 'payables', 'dues'], BOTH),
  m('visitors', 'community', 'site', ['residents'], ['resident_portal'], BOTH),
  m('parking', 'community', 'site', ['core'], ['residents', 'dues'], BOTH),
  m('amenities', 'community', 'site', ['residents'], ['dues'], BOTH),
  m('communications', 'channels', 'tenant', ['core'], ['crm', 'dues', 'maintenance'], BOTH, [], ['communications.sms', 'communications.whatsapp']),
  m('reports', 'foundation', 'tenant', ['core'], [], BOTH),
  m('public_website', 'channels', 'tenant', ['projects', 'inventory'], ['crm'], [], DEV),
  m('white_label', 'channels', 'tenant', ['core'], [], [], BOTH),
  m('api_access', 'channels', 'tenant', ['core'], [], [], BOTH),
];

const preset = (key: EditionKey, components: string[]): EditionPreset => ({
  key,
  tenantType: ({ developer: 'developer', community: 'association', portfolio: 'portfolio_manager', custom: 'custom' } as const)[key],
  modules: MODULES.filter((mod) => mod.includedIn.includes(key)).map((mod) => mod.key),
  components,
});

export const PRESETS: readonly EditionPreset[] = [
  preset('developer', ['rc_dev_base', 'rc_dev_seat', 'rc_onboarding_dev']),
  preset('community', ['rc_comm_base', 'rc_unit_eligible', 'rc_site', 'rc_onboarding_comm']),
  preset('portfolio', ['rc_comm_base', 'rc_unit_eligible', 'rc_site', 'rc_building', 'rc_onboarding_comm']),
  preset('custom', []),
];

export const CATALOG: ModuleCatalog = { version: '2026.10-1', modules: MODULES, presets: PRESETS };

export const moduleEntry = (key: ModuleKey) => MODULES.find((mod) => mod.key === key)!;
export const presetFor = (edition: EditionKey) => PRESETS.find((p) => p.key === edition)!;

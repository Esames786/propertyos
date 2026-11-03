import type { EditionKey, EditionPreset, ModuleCatalog, ModuleCatalogEntry, ModuleKey } from '@repo/contracts';

/**
 * The staged module catalogue (Gate D.3): 29 modules (27 baseline + two opt-in engagement add-ons), their scope, hard requirements ("requires") and
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
  m('receivables', 'finance', 'tenant', ['core'], ['accounting', 'banking', 'online_payments'], BOTH, [], ['receivables.office_collections', 'receivables.bulk_office_collection', 'receivables.reminders']),
  m('dues', 'community', 'site', ['receivables', 'residents'], ['accounting', 'communications'], COMM, DEV, ['dues.utility_meters', 'dues.late_fees']),
  m('residents', 'community', 'site', ['core'], ['dues', 'maintenance', 'visitors'], BOTH, [], ['residents.committee', 'residents.transfer_clearance']),
  m('resident_portal', 'community', 'site', ['residents'], ['receivables', 'maintenance', 'visitors', 'amenities', 'construction'], BOTH),
  m('online_payments', 'finance', 'site', ['receivables'], ['resident_portal'], [], BOTH),
  m('banking', 'finance', 'tenant', ['core'], ['receivables', 'payables', 'accounting'], BOTH, [], ['banking.cashbook']),
  m('accounting', 'finance', 'tenant', ['core'], ['receivables', 'payables', 'payroll', 'banking'], DEV, COMM),
  m('payables', 'finance', 'tenant', ['core'], ['accounting', 'procurement', 'maintenance'], DEV, COMM),
  m('procurement', 'finance', 'tenant', ['payables'], ['projects'], DEV),
  // S.2a: society HR is an OPTIONAL add-on, not part of the community preset.
  m('hr', 'people', 'tenant', ['core'], ['payroll'], DEV, COMM, ['hr.shifts']),
  m('payroll', 'people', 'tenant', ['hr'], ['accounting'], DEV),
  m('maintenance', 'community', 'site', ['core'], ['residents', 'resident_portal', 'payables', 'dues'], BOTH, [], ['maintenance.community_issues']),
  m('visitors', 'community', 'site', ['residents'], ['resident_portal'], BOTH, [], ['visitors.live_queue']),
  m('parking', 'community', 'site', ['core'], ['residents', 'dues'], BOTH, [], ['parking.vehicle_approvals']),
  m('amenities', 'community', 'site', ['residents'], ['dues'], BOTH),
  m('communications', 'channels', 'tenant', ['core'], ['crm', 'dues', 'maintenance'], BOTH, [], ['communications.sms', 'communications.whatsapp']),
  m('reports', 'foundation', 'tenant', ['core'], [], BOTH),
  m('public_website', 'channels', 'tenant', ['projects', 'inventory'], ['crm'], [], DEV),
  m('white_label', 'channels', 'tenant', ['core'], [], [], BOTH),
  m('api_access', 'channels', 'tenant', ['core'], [], [], BOTH),
  // HR, chat and payables are integrations, not mandatory for independent society engagement.
  // Resident operations always enter through resident_portal first (Rule R) before checking an add-on.
  m('community_chat', 'community', 'site', ['resident_portal', 'communications', 'residents'], ['hr', 'community_hub'], [], BOTH),
  m('community_hub', 'community', 'site', ['resident_portal', 'communications', 'residents'], ['community_chat', 'payables'], [], BOTH, [
    'community_hub.services_directory', 'community_hub.polls', 'community_hub.resources', 'community_hub.marketplace',
  ]),
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

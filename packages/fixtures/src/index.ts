export { FIXTURE_NOW, createRandom } from './seed';
export { TENANT, SHALIMAR, BACKOFFICE_TENANTS, PARTIES, PERSONAS, findPersona, CITIES } from './people';
export { TENANT_DIRECTORY, directoryTenant, effectiveAccessFor, grantsOf, ACCESS_TODAY, type DirectoryTenant } from './tenant-directory';
export { PROJECTS, TOWERS, FLOORS, UNITS, GARDEN_BLOCKS } from './inventory';
export { LEADS, INVOICES, NOTIFICATIONS, LEAD_ACTIVITY, DEMO_COLLECTION_ACCOUNT } from './records';
export { MockTransport, MOCK_MODES, type MockMode, type MockContext, type MutationLogEntry } from './mock-transport';
export { TrainingStore, type TrainingRecord } from './training-store';
export { DemoStore, DEMO_STORE_KEY, type DemoOverlay } from './demo-store';
export { VISITS, leadHistory, unitSummary, unitDetail } from './crm-data';

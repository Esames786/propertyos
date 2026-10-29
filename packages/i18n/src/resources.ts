import enA11y from '../locales/en-PK/a11y.json';
import enCommon from '../locales/en-PK/common.json';
import enDashboard from '../locales/en-PK/dashboard.json';
import enErrors from '../locales/en-PK/errors.json';
import enForms from '../locales/en-PK/forms.json';
import enHelp from '../locales/en-PK/help.json';
import enLab from '../locales/en-PK/lab.json';
import enNav from '../locales/en-PK/nav.json';
import enOnboarding from '../locales/en-PK/onboarding.json';
import enStatus from '../locales/en-PK/status.json';
import enStart from '../locales/en-PK/start.json';
import enCrm from '../locales/en-PK/crm.json';
import enPortal from '../locales/en-PK/portal.json';
import enPlatform from '../locales/en-PK/platform.json';
import enWorkspace from '../locales/en-PK/workspace.json';
import enSites from '../locales/en-PK/sites.json';
import enBilling from '../locales/en-PK/billing.json';
import enCollections from '../locales/en-PK/collections.json';
import enDues from '../locales/en-PK/dues.json';
import enIdentity from '../locales/en-PK/identity.json';
import urA11y from '../locales/ur-PK/a11y.json';
import urCommon from '../locales/ur-PK/common.json';
import urDashboard from '../locales/ur-PK/dashboard.json';
import urErrors from '../locales/ur-PK/errors.json';
import urForms from '../locales/ur-PK/forms.json';
import urHelp from '../locales/ur-PK/help.json';
import urLab from '../locales/ur-PK/lab.json';
import urNav from '../locales/ur-PK/nav.json';
import urOnboarding from '../locales/ur-PK/onboarding.json';
import urStatus from '../locales/ur-PK/status.json';
import urStart from '../locales/ur-PK/start.json';
import urCrm from '../locales/ur-PK/crm.json';
import urPortal from '../locales/ur-PK/portal.json';
import urPlatform from '../locales/ur-PK/platform.json';
import urWorkspace from '../locales/ur-PK/workspace.json';
import urSites from '../locales/ur-PK/sites.json';
import urBilling from '../locales/ur-PK/billing.json';
import urCollections from '../locales/ur-PK/collections.json';
import urDues from '../locales/ur-PK/dues.json';
import urIdentity from '../locales/ur-PK/identity.json';

export const NAMESPACES = [
  'common',
  'nav',
  'forms',
  'errors',
  'status',
  'help',
  'onboarding',
  'a11y',
  'lab',
  'dashboard',
  'start',
  'crm',
  'portal',
  'platform',
  'workspace',
  'sites',
  'billing',
  'collections',
  'dues',
  'identity',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

const en = {
  common: enCommon,
  nav: enNav,
  forms: enForms,
  errors: enErrors,
  status: enStatus,
  help: enHelp,
  onboarding: enOnboarding,
  a11y: enA11y,
  lab: enLab,
  dashboard: enDashboard,
  start: enStart,
  crm: enCrm,
  portal: enPortal,
  platform: enPlatform,
  workspace: enWorkspace,
  sites: enSites,
  billing: enBilling,
  collections: enCollections,
  dues: enDues,
  identity: enIdentity,
};

const ur: typeof en = {
  common: urCommon,
  nav: urNav,
  forms: urForms,
  errors: urErrors,
  status: urStatus,
  help: urHelp,
  onboarding: urOnboarding,
  a11y: urA11y,
  lab: urLab,
  dashboard: urDashboard,
  start: urStart,
  crm: urCrm,
  portal: urPortal,
  platform: urPlatform,
  workspace: urWorkspace,
  sites: urSites,
  billing: urBilling,
  collections: urCollections,
  dues: urDues,
  identity: urIdentity,
};

export const resources = { 'en-PK': en, 'ur-PK': ur };
export type Resources = typeof en;

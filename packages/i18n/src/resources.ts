import enA11y from '../locales/en-PK/a11y.json';
import enCommon from '../locales/en-PK/common.json';
import enErrors from '../locales/en-PK/errors.json';
import enForms from '../locales/en-PK/forms.json';
import enHelp from '../locales/en-PK/help.json';
import enLab from '../locales/en-PK/lab.json';
import enNav from '../locales/en-PK/nav.json';
import enOnboarding from '../locales/en-PK/onboarding.json';
import enStatus from '../locales/en-PK/status.json';
import urA11y from '../locales/ur-PK/a11y.json';
import urCommon from '../locales/ur-PK/common.json';
import urErrors from '../locales/ur-PK/errors.json';
import urForms from '../locales/ur-PK/forms.json';
import urHelp from '../locales/ur-PK/help.json';
import urLab from '../locales/ur-PK/lab.json';
import urNav from '../locales/ur-PK/nav.json';
import urOnboarding from '../locales/ur-PK/onboarding.json';
import urStatus from '../locales/ur-PK/status.json';

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
};

export const resources = { 'en-PK': en, 'ur-PK': ur };
export type Resources = typeof en;

import {
  ORGANISATION_TYPES,
  PROJECT_TYPES,
  WORKSPACE_ROLES,
  type OrganisationType,
  type ProjectTypeChoice,
  type WorkspaceRole,
  type WorkspaceSetup,
} from '@repo/contracts';
import { normalizePkPhone, type AppLocale } from '@repo/i18n';

/** Wizard steps in order (the "done" screen follows the review and is not a step). */
export const SETUP_STEPS = ['account', 'verify', 'organisation', 'project', 'team', 'review'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
export type WizardScreen = SetupStep | 'done';

export const SKIPPABLE: readonly SetupStep[] = ['project', 'team'];

/** Cities offered in the pickers (ids are the English names; labels come from `start:cities`). */
export const CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Sialkot', 'Hyderabad', 'Gujranwala'] as const;
export type City = (typeof CITIES)[number];

export const MAX_INVITES = 8;

export interface InviteRow {
  key: string;
  email: string;
  role: WorkspaceRole | null;
}

/**
 * Everything typed into the wizard except the password. Lives in the page's state (so it survives
 * Back/Next and a language switch) and is mirrored to sessionStorage (so it survives a reload).
 */
export interface SetupDraft {
  version: 1;
  account: { fullName: string; email: string; phone: string };
  accountDone: boolean;
  /** The address the simulated code was accepted for; changing the email asks for the code again. */
  verifiedEmail: string | null;
  organisation: { name: string; type: OrganisationType | null; city: City | null; officePhone: string; language: AppLocale };
  organisationDone: boolean;
  project: { name: string; type: ProjectTypeChoice | null; city: City | null; expectedUnits: string };
  projectState: 'pending' | 'done' | 'skipped';
  invites: InviteRow[];
  teamState: 'pending' | 'done' | 'skipped';
}

/** Held in memory only: never written to any storage. */
export interface SetupSecrets {
  password: string;
  confirm: string;
}

export const DRAFT_KEY = 'demo:setup-draft';

let rowCounter = 0;
export const newRow = (): InviteRow => ({ key: `r${Date.now().toString(36)}${(rowCounter += 1)}`, email: '', role: null });

export const emptyDraft = (language: AppLocale): SetupDraft => ({
  version: 1,
  account: { fullName: '', email: '', phone: '' },
  accountDone: false,
  verifiedEmail: null,
  organisation: { name: '', type: null, city: null, officePhone: '', language },
  organisationDone: false,
  project: { name: '', type: null, city: null, expectedUnits: '' },
  projectState: 'pending',
  invites: [newRow()],
  teamState: 'pending',
});

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => (list.includes(v as T) ? (v as T) : null);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Reads the mirrored draft, keeping only well-formed fields (the storage is user-editable). */
export function loadDraft(language: AppLocale): SetupDraft {
  const base = emptyDraft(language);
  try {
    const raw = globalThis.sessionStorage?.getItem(DRAFT_KEY);
    if (!raw) return base;
    const d = JSON.parse(raw) as Partial<SetupDraft>;
    if (d.version !== 1) return base;
    const invites = Array.isArray(d.invites)
      ? d.invites.slice(0, MAX_INVITES).map((r) => ({ key: str(r?.key) || newRow().key, email: str(r?.email), role: oneOf(WORKSPACE_ROLES, r?.role) }))
      : base.invites;
    return {
      version: 1,
      account: { fullName: str(d.account?.fullName), email: str(d.account?.email), phone: str(d.account?.phone) },
      accountDone: d.accountDone === true,
      verifiedEmail: typeof d.verifiedEmail === 'string' ? d.verifiedEmail : null,
      organisation: {
        name: str(d.organisation?.name),
        type: oneOf(ORGANISATION_TYPES, d.organisation?.type),
        city: oneOf(CITIES, d.organisation?.city),
        officePhone: str(d.organisation?.officePhone),
        language: oneOf(['en-PK', 'ur-PK'] as const, d.organisation?.language) ?? language,
      },
      organisationDone: d.organisationDone === true,
      project: {
        name: str(d.project?.name),
        type: oneOf(PROJECT_TYPES, d.project?.type),
        city: oneOf(CITIES, d.project?.city),
        expectedUnits: str(d.project?.expectedUnits),
      },
      projectState: oneOf(['pending', 'done', 'skipped'] as const, d.projectState) ?? 'pending',
      invites: invites.length ? invites : base.invites,
      teamState: oneOf(['pending', 'done', 'skipped'] as const, d.teamState) ?? 'pending',
    };
  } catch {
    return base;
  }
}

export function saveDraft(draft: SetupDraft): void {
  try {
    globalThis.sessionStorage?.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* the in-memory draft is kept */
  }
}

export function clearDraft(): void {
  try {
    globalThis.sessionStorage?.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function isStepComplete(step: SetupStep, d: SetupDraft): boolean {
  switch (step) {
    case 'account':
      return d.accountDone;
    case 'verify':
      return d.accountDone && d.verifiedEmail !== null && d.verifiedEmail === d.account.email;
    case 'organisation':
      return d.organisationDone;
    case 'project':
      return d.projectState !== 'pending';
    case 'team':
      return d.teamState !== 'pending';
    case 'review':
      return false;
  }
}

/** The earliest step still to do; a visitor may open any step up to and including this one. */
export function firstOpenStep(d: SetupDraft): SetupStep {
  return SETUP_STEPS.find((s) => !isStepComplete(s, d)) ?? 'review';
}

export const stepIndex = (s: WizardScreen) => (s === 'done' ? SETUP_STEPS.length : SETUP_STEPS.indexOf(s));

/** The request body for POST /workspace. */
export function toWorkspaceSetup(d: SetupDraft): WorkspaceSetup {
  return {
    account: { fullName: d.account.fullName.trim(), email: d.account.email.trim(), phone: normalizePkPhone(d.account.phone) ?? d.account.phone.trim() },
    organisation: {
      name: d.organisation.name.trim(),
      type: d.organisation.type ?? 'private_limited',
      city: d.organisation.city ?? '',
      ...(d.organisation.officePhone.trim() ? { officePhone: normalizePkPhone(d.organisation.officePhone) ?? d.organisation.officePhone.trim() } : {}),
      currency: 'PKR',
      language: d.organisation.language,
    },
    project:
      d.projectState === 'done' && d.project.type && d.project.city
        ? { name: d.project.name.trim(), type: d.project.type, city: d.project.city, expectedUnits: Number(d.project.expectedUnits) }
        : null,
    invites: d.teamState === 'done' ? d.invites.filter((r) => r.role).map((r) => ({ email: r.email.trim(), role: r.role! })) : [],
  };
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** 1 weak · 2 fair · 3 good · 4 strong (a hint only; the rules are length plus a number or symbol). */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 10) score += 1;
  if (pw.length >= 14) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (pw.length < 10) return 1;
  return Math.min(4, Math.max(1, score)) as 1 | 2 | 3 | 4;
}

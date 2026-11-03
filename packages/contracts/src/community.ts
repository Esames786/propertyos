import type { ResidentStaffOnDuty } from './hr';
import type { AudienceRole, OpsEvent, OpsFile } from './operations';

/**
 * Gate D.3: community engagement (V3.2 F01 chat, F14 local services, F15 polls, resources and the
 * resident Community home). Two optional, site-licensed add-ons: `community_chat` and
 * `community_hub` (features `services_directory`, `polls`, `resources`; `marketplace` stays off until
 * the owner decides D-31). Official notices stay in D.2 and need neither add-on (D-49). Resident
 * screens enter through `resident_portal` + `portal.use` first (rule R), then need the add-on for
 * the same site. Prototype contracts: the mock server enforces every rule; nothing is delivered to
 * real people, and the backend decides the final shape at Gate H.
 */

// ---------------------------------------------------------------------------------------------
// Community chat (CHAT-001…004, PORTAL-031/032)
// ---------------------------------------------------------------------------------------------

/**
 * Smart groups follow verified facts (D-25): the whole site, a block and a floor (current occupants),
 * the committee (members whose term is in force) and the office team (staff who may chat). Custom
 * groups follow an audience the office chose (part of the site and relationship to the flat).
 */
export type ChatGroupKind = 'site' | 'block' | 'floor' | 'committee' | 'staff' | 'custom';
/** Who may post: every member, or only the office (residents read). */
export type ChatPostingPolicy = 'everyone' | 'office_only';

export interface ChatGroupSummary {
  id: string;
  kind: ChatGroupKind;
  /** Block code ("A") or block and floor ("A-2") of a smart group. */
  code?: string;
  /** A custom group's name, exactly as the office typed it. */
  name?: string;
  unread: number;
  muted: boolean;
  /** The reader may read but not post (an office-only group, for a resident). */
  readOnly: boolean;
  /** Only custom groups can be left (smart groups follow where you live and what you do). */
  canLeave: boolean;
  last?: { at: string; senderName: string; preview: string; removed: boolean };
}

export interface ChatGroups {
  /** False until the society sets a retention period (D-25 (5)): nothing can be read or posted. */
  available: boolean;
  reason?: 'retention_not_set';
  /** D-25 (1): direct messages between residents are off; this phase has no way to turn them on. */
  directMessages: false;
  retentionDays: number | null;
  groups: ChatGroupSummary[];
  /** Custom groups the reader left (and may join again, without the history in between). */
  left: Array<{ id: string; name: string }>;
}

export type ChatSenderKind = 'resident' | 'office';

export interface ChatMessageView {
  id: string;
  groupId: string;
  /** Absent when a moderator removed the message, or the reader blocked its sender. */
  text?: string;
  state: 'visible' | 'removed' | 'blocked';
  sender: {
    /** Opaque key (never a person id): used only to block someone. */
    key: string;
    name: string;
    kind: ChatSenderKind;
    isMe: boolean;
  };
  at: string;
  reportedByMe: boolean;
}

export interface ChatConversation {
  group: ChatGroupSummary;
  /** D-25 (2): the reader sees nothing written before they joined this group. */
  visibleFrom: string;
  retentionDays: number;
  messages: ChatMessageView[];
  /** Older messages exist (load with `?before=`). */
  hasMore: boolean;
  canPost: boolean;
  etiquette: string;
  /** People the reader blocked in this organisation (to unblock them). */
  blocked: Array<{ key: string; name: string }>;
}

export interface ChatSendResult {
  message: ChatMessageView;
  /** The same client key was sent before (a retry): nothing was posted twice. */
  duplicate: boolean;
}

export const CHAT_REPORT_REASONS = ['abusive', 'spam', 'personal_info', 'off_topic', 'other'] as const;
export type ChatReportReason = (typeof CHAT_REPORT_REASONS)[number];

// Office: groups, policy and the reports queue (CHAT-003)

export interface ChatAudience {
  scope: 'site' | 'blocks';
  /** Building ids for `blocks`; empty for the whole site. */
  ids: string[];
  roles: AudienceRole[];
}

export interface ChatRuleView {
  id: string;
  kind: ChatGroupKind;
  code?: string;
  name?: string;
  enabled: boolean;
  postingPolicy: ChatPostingPolicy;
  memberCount: number;
  /** Custom groups: who they follow ("A, B" and the roles), and who created them. */
  audience?: ChatAudience & { label: string };
  createdByName?: string;
  createdAt?: string;
}

export interface ChatRules {
  groups: ChatRuleView[];
  blocks: Array<{ id: string; code: string }>;
}

export type ChatMemberReason = 'occupant' | 'owner' | 'payer' | 'committee' | 'staff';

export interface ChatRulePreview {
  group: ChatRuleView;
  asOf: string;
  /** Who is in the group today and why (verified links, occupancy, committee terms, staff roles). */
  members: Array<{ name: string; reasons: Array<{ reason: ChatMemberReason; flat?: string; since?: string }> }>;
}

export interface ChatPolicyVersion {
  version: number;
  retentionDays: number;
  etiquette: string;
  changedByName: string;
  changedAt: string;
}

export interface ChatPolicy {
  retentionDays: number | null;
  directMessages: false;
  etiquette: string;
  versions: ChatPolicyVersion[];
  /** Reported messages past the retention period kept as evidence for moderators (never shown in chats). */
  held: number;
  actions: { manage: boolean };
}

export type ChatReportState = 'open' | 'hidden' | 'warned' | 'dismissed';

export interface ChatReportView {
  id: string;
  ref: string;
  state: ChatReportState;
  reasons: ChatReportReason[];
  /** Notes as reporters typed them (reporters are never named). */
  notes: string[];
  reporters: number;
  reportedAt: string;
  group: { id: string; kind: ChatGroupKind; code?: string; name?: string };
  /**
   * Only the reported message: moderators never browse conversations (D-25 (4)). Past the retention
   * period the text is kept only as evidence while the report is open (`evidenceHold`), for
   * moderators only; once the report is decided it is no longer shown (`text: null`).
   */
  message: { id: string; text: string | null; senderName: string; at: string; pastRetention: boolean; evidenceHold: boolean };
  decision?: { at: string; byName: string; note: string };
  history: OpsEvent[];
}

export interface ChatReports {
  items: ChatReportView[];
  counts: Record<ChatReportState, number>;
}

// ---------------------------------------------------------------------------------------------
// Local services directory (CMTY-001, Community home "Local services")
// ---------------------------------------------------------------------------------------------

export const PROVIDER_CATEGORIES = ['plumbing', 'electrical', 'carpentry', 'cleaning', 'appliance_repair', 'pest_control', 'tutoring', 'other'] as const;
export type ProviderCategory = (typeof PROVIDER_CATEGORIES)[number];
export type ProviderStatus = 'pending' | 'listed' | 'rejected' | 'suspended';

/** D-32: contact details are listed only with the provider's recorded consent. */
export interface ProviderConsent {
  /** May residents see the contact number? (Listing without it is allowed.) */
  showContact: boolean;
  method: 'written' | 'verbal' | 'form';
  recordedAt: string;
  recordedByName: string;
}

export interface ProviderReportView {
  id: string;
  reason: string;
  at: string;
  state: 'open' | 'dismissed' | 'actioned';
}

export interface ServiceProviderOffice {
  id: string;
  ref: string;
  name: string;
  category: ProviderCategory;
  description: string;
  serves: string;
  phone: string | null;
  consent: ProviderConsent;
  status: ProviderStatus;
  addedByName: string;
  addedAt: string;
  vettedByName?: string;
  vettedAt?: string;
  /** Why it was rejected or suspended. */
  reason?: string;
  /** Residents who recommend it (a count; no free-text reviews in this phase). */
  recommendations: number;
  reports: ProviderReportView[];
  history: OpsEvent[];
  actions: { vet: boolean; reject: boolean; suspend: boolean; reinstate: boolean };
}

export interface ServiceDirectoryOffice {
  items: ServiceProviderOffice[];
  counts: Record<ProviderStatus, number> & { reports: number };
  categories: Array<{ key: ProviderCategory; listed: number }>;
}

export interface ServiceProviderResident {
  id: string;
  name: string;
  category: ProviderCategory;
  description: string;
  serves: string;
  /** Only when the provider consented to show it. */
  phone: string | null;
  recommendations: number;
  recommendedByMe: boolean;
  reportedByMe: boolean;
}

export interface ServiceDirectoryResident {
  items: ServiceProviderResident[];
  categories: Array<{ key: ProviderCategory; listed: number }>;
}

// ---------------------------------------------------------------------------------------------
// Polls and surveys (CMTY-002, CMTY-004, PORTAL-039)
// ---------------------------------------------------------------------------------------------

export type PollState = 'draft' | 'open' | 'closed' | 'published' | 'withdrawn';
/** One response per person, or one per flat (whoever eligible in the household answers first). */
export type PollUnit = 'person' | 'flat';

export interface PollOption {
  id: string;
  label: string;
}

/**
 * D-47 with Issue #9's ruling: nothing when fewer than 3 answered or the audience has fewer than 5
 * households; the turnout alone when the answers per option could point at one or two people
 * (`options: null`: the whole breakdown is withheld, never a single masked cell); otherwise every
 * option's count, and the blocks whose breakdown, and every difference with the shown figures, is
 * safe too.
 */
export type PollResults =
  | { shown: false; reason: 'below_threshold' | 'audience_too_small' | 'unavailable' }
  | { shown: true; total: number; options: Array<PollOption & { count: number }> | null; blocks: Array<{ code: string; total: number; options: Array<{ id: string; count: number }> }> };

export interface PollOffice {
  id: string;
  ref: string;
  title: string;
  question: string;
  options: PollOption[];
  audience: ChatAudience & { label: string };
  unit: PollUnit;
  anonymous: boolean;
  /** The last day to answer (inclusive, the society's time zone). */
  closesOn: string;
  state: PollState;
  /** People (or flats) who may answer today. */
  eligible: number;
  /** How many answered so far: turnout only, never how they answered while open. */
  responses: number;
  createdByName: string;
  createdAt: string;
  withdrawnReason?: string;
  /**
   * After closing, the answers per option. A named poll shows every count (its answers are given with
   * names, and the office sees who answered what); an anonymous poll shows the office only what the
   * privacy rule allows residents to see (`null`: withheld).
   */
  totals?: Array<PollOption & { count: number }> | null;
  /** Named polls only, after closing: who answered what. Anonymous polls never record it. */
  respondents?: Array<{ name: string; flat: string; optionId: string }>;
  /** What residents see once published (D-47). */
  published?: PollResults;
  history: OpsEvent[];
  actions: { edit: boolean; open: boolean; close: boolean; publish: boolean; withdraw: boolean };
}

export interface PollsOffice {
  items: PollOffice[];
  counts: Record<PollState, number>;
  blocks: Array<{ id: string; code: string }>;
}

export interface PollResident {
  id: string;
  title: string;
  question: string;
  options: PollOption[];
  unit: PollUnit;
  anonymous: boolean;
  closesOn: string;
  state: Exclude<PollState, 'draft'>;
  /** Flats the reader may answer for (unit = flat), or one entry for the reader (unit = person). */
  answerable: Array<{ flatId?: string; flatCode?: string }>;
  /** Already answered (by the reader, or by their household for a per-flat poll). */
  answered: Array<{ flatCode?: string; byMe: boolean; optionId?: string }>;
  withdrawnReason?: string;
  results?: PollResults;
}

export interface PollsResident {
  items: PollResident[];
}

// ---------------------------------------------------------------------------------------------
// Resources published to residents (DOC-001 "Published to residents", Community home "Resources")
// ---------------------------------------------------------------------------------------------

export const RESOURCE_CATEGORIES = ['bylaws', 'forms', 'guides', 'minutes', 'other'] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export interface ResourceOffice {
  id: string;
  ref: string;
  title: string;
  category: ResourceCategory;
  description: string;
  file: Omit<OpsFile, 'id' | 'alt'>;
  audience: ChatAudience & { label: string };
  state: 'published' | 'withdrawn';
  publishedAt: string;
  publishedByName: string;
  withdrawn?: { at: string; byName: string; reason: string };
  /** People in the audience today. */
  reach: number;
}

export interface ResourcesOffice {
  items: ResourceOffice[];
  blocks: Array<{ id: string; code: string }>;
}

export interface ResourceResident {
  id: string;
  title: string;
  category: ResourceCategory;
  description: string;
  file: Omit<OpsFile, 'id' | 'alt'>;
  publishedAt: string;
}

// ---------------------------------------------------------------------------------------------
// Community home (PORTAL-036)
// ---------------------------------------------------------------------------------------------

export type CommunityTab = 'notices' | 'polls' | 'services' | 'resources' | 'staff';

export interface CommunityHome {
  siteName: string;
  /** Always (needs only the resident app): the latest official notices; "All notices" opens PORTAL-023. */
  notices: { unread: number; latest: Array<{ id: string; title: string; publishedAt: string; needsAck: boolean; unread: boolean }> };
  /** The chat add-on for this site: null when it is not in the plan. */
  chat: { available: boolean; unread: number } | null;
  /** Community issues (D.2) when licensed. */
  issues: boolean;
  /** Hub tabs the plan includes for this site (each needs community_hub and its feature). */
  tabs: CommunityTab[];
  polls: { open: number; toAnswer: number } | null;
  services: { listed: number } | null;
  resources: { count: number; latest?: { id: string; title: string } } | null;
  /**
   * Gate S.2a: staff on duty from the published roster. Needs `hr` with `hr.shifts` for the site
   * (never the chat or hub add-ons); null when not in the plan.
   */
  staff: ResidentStaffOnDuty | null;
}

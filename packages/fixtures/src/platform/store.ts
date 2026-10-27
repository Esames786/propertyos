import type { ContractApproval, PlatformAuditEvent, SignupPolicy, TenantDetail, TenantDraft, WorkspaceRequest } from '@repo/contracts';
import { SEED_APPROVALS, SEED_AUDIT, SEED_REQUESTS, SEED_TENANTS } from './tenants';

export const PLATFORM_STORE_KEY = 'demo:platform:v1';

interface Overlay {
  v: 1;
  seq: number;
  drafts: Record<string, TenantDraft & { activatedTenantId?: string }>;
  /** Tenants created in this session. */
  created: TenantDetail[];
  /** Changes to seeded tenants (e.g. an approved contract). */
  patched: Record<string, TenantDetail>;
  /** Approvals created or decided in this session (by id). */
  approvals: Record<string, ContractApproval>;
  audit: PlatformAuditEvent[];
  readNotifications: string[];
  requests: Record<string, WorkspaceRequest['status']>;
  signupPolicy: SignupPolicy;
}

const empty = (): Overlay => ({ v: 1, seq: 0, drafts: {}, created: [], patched: {}, approvals: {}, audit: [], readNotifications: [], requests: {}, signupPolicy: 'approval_required' });

const storage = (): Storage | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
};

/**
 * Session overlay of the platform plane over immutable seeds (same pattern as the tenant DemoStore).
 * It survives a reload, ends with the tab, and "Reset demo data" clears it. `writes` counts store
 * mutations so tests can prove that previews and simulations never write.
 */
export class PlatformStore {
  private state: Overlay;
  writes = 0;

  constructor(private readonly persist = true) {
    this.state = empty();
    if (persist) {
      try {
        const raw = storage()?.getItem(PLATFORM_STORE_KEY);
        if (raw) this.state = { ...empty(), ...(JSON.parse(raw) as Overlay) };
      } catch {
        this.state = empty();
      }
    }
  }

  private save() {
    this.writes++;
    if (!this.persist) return;
    try {
      storage()?.setItem(PLATFORM_STORE_KEY, JSON.stringify(this.state));
    } catch {
      /* storage full or blocked: the session continues in memory */
    }
  }

  nextId(prefix: string): string {
    this.state.seq += 1;
    return `${prefix}_s${String(this.state.seq).padStart(3, '0')}`;
  }

  // Tenants
  tenants(): TenantDetail[] {
    return [...this.state.created, ...SEED_TENANTS.map((t) => this.state.patched[t.id] ?? t)];
  }
  tenant(id: string): TenantDetail | undefined {
    return this.tenants().find((t) => t.id === id);
  }
  saveTenant(tenant: TenantDetail) {
    if (SEED_TENANTS.some((t) => t.id === tenant.id)) this.state.patched[tenant.id] = tenant;
    else {
      const i = this.state.created.findIndex((t) => t.id === tenant.id);
      if (i >= 0) this.state.created[i] = tenant;
      else this.state.created.unshift(tenant);
    }
    this.save();
  }

  // Drafts
  draft(id: string) {
    return this.state.drafts[id];
  }
  drafts() {
    return Object.values(this.state.drafts).filter((d) => !d.activatedTenantId);
  }
  saveDraft(draft: TenantDraft & { activatedTenantId?: string }) {
    this.state.drafts[draft.id] = draft;
    this.save();
  }
  removeDraft(id: string) {
    delete this.state.drafts[id];
    this.save();
  }

  // Approvals
  approvals(): ContractApproval[] {
    const seeded = SEED_APPROVALS.map((a) => this.state.approvals[a.id] ?? a);
    const session = Object.values(this.state.approvals).filter((a) => !SEED_APPROVALS.some((s) => s.id === a.id));
    return [...session, ...seeded];
  }
  saveApproval(approval: ContractApproval) {
    this.state.approvals[approval.id] = approval;
    this.save();
  }

  // Audit, notifications, requests, policy
  audit(): PlatformAuditEvent[] {
    return [...this.state.audit, ...SEED_AUDIT];
  }
  addAudit(event: Omit<PlatformAuditEvent, 'id'>) {
    this.state.audit.unshift({ ...event, id: this.nextId('aud') });
    this.save();
  }
  readNotifications(): readonly string[] {
    return this.state.readNotifications;
  }
  markRead(ids: string[]) {
    this.state.readNotifications = [...new Set([...this.state.readNotifications, ...ids])];
    this.save();
  }
  requests(): WorkspaceRequest[] {
    return SEED_REQUESTS.map((r) => ({ ...r, status: this.state.requests[r.id] ?? r.status }));
  }
  signupPolicy(): SignupPolicy {
    return this.state.signupPolicy;
  }

  reset() {
    this.state = empty();
    this.save();
  }
}

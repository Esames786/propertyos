import type { ActivityEvent, Lead, SiteVisit, WorkspaceProfile } from '@repo/contracts';

/**
 * Session overlay for the demo environment (Stage 1.5R). Static fixtures stay immutable; actions a
 * visitor takes in the demo (create a lead, log a call, book a visit, hold a unit, upload proof …)
 * are recorded here and merged into every read, so the change shows up on every connected screen.
 *
 * Persistence is intentional and documented: the overlay lives in sessionStorage, so it survives a
 * reload and is discarded when the browser tab closes. "Reset demo" clears it. No real record,
 * message or transaction is ever created.
 */
export interface DemoOverlay {
  version: 1;
  counter: number;
  /** Leads created in this session, newest first. */
  leads: Lead[];
  leadPatches: Record<string, Partial<Lead>>;
  /** Activity added in this session per lead id, newest first. */
  activity: Record<string, ActivityEvent[]>;
  visits: SiteVisit[];
  visitPatches: Record<string, Partial<SiteVisit>>;
  /** Unit holds placed in this session (unit id → hold). */
  holds: Record<string, { leadId: string; leadRef: string; until: string }>;
  workspace: WorkspaceProfile | null;
  /** Feature-owned state (e.g. the customer portal), created lazily with `section()`. */
  sections: Record<string, unknown>;
}

export const DEMO_STORE_KEY = 'demo:store:v1';

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const empty = (): DemoOverlay => ({
  version: 1,
  counter: 0,
  leads: [],
  leadPatches: {},
  activity: {},
  visits: [],
  visitPatches: {},
  holds: {},
  workspace: null,
  sections: {},
});

function defaultStorage(): SessionStorageLike | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export class DemoStore {
  private overlay: DemoOverlay;
  private readonly storage: SessionStorageLike | undefined;

  constructor(storage: SessionStorageLike | undefined = defaultStorage()) {
    this.storage = storage;
    this.overlay = this.load();
  }

  private load(): DemoOverlay {
    try {
      const raw = this.storage?.getItem(DEMO_STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoOverlay;
        if (parsed.version === 1) return { ...empty(), ...parsed };
      }
    } catch {
      /* corrupt or unavailable: start clean */
    }
    return empty();
  }

  save(): void {
    try {
      this.storage?.setItem(DEMO_STORE_KEY, JSON.stringify(this.overlay));
    } catch {
      /* memory copy is kept */
    }
  }

  reset(): void {
    this.overlay = empty();
    try {
      this.storage?.removeItem(DEMO_STORE_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Session-unique id with a readable prefix (`led_s3`, `vst_s4` …). */
  nextId(prefix: string): string {
    this.overlay.counter += 1;
    return `${prefix}_s${this.overlay.counter}`;
  }

  get counter(): number {
    return this.overlay.counter;
  }

  /** Leads created this session first (newest first), then the fixture leads, with session patches applied. */
  leads(base: readonly Lead[]): Lead[] {
    return [...this.overlay.leads, ...base].map((l) => {
      const patch = this.overlay.leadPatches[l.id];
      return patch ? { ...l, ...patch } : l;
    });
  }

  isSessionLead(id: string): boolean {
    return this.overlay.leads.some((l) => l.id === id);
  }

  addLead(lead: Lead): void {
    this.overlay.leads.unshift(lead);
    this.save();
  }

  patchLead(id: string, patch: Partial<Lead>): void {
    this.overlay.leadPatches[id] = { ...this.overlay.leadPatches[id], ...patch };
    this.save();
  }

  sessionActivity(leadId: string): ActivityEvent[] {
    return this.overlay.activity[leadId] ?? [];
  }

  addActivity(leadId: string, event: ActivityEvent): void {
    this.overlay.activity[leadId] = [event, ...(this.overlay.activity[leadId] ?? [])];
    this.save();
  }

  visits(base: readonly SiteVisit[]): SiteVisit[] {
    return [...this.overlay.visits, ...base].map((v) => {
      const patch = this.overlay.visitPatches[v.id];
      return patch ? { ...v, ...patch } : v;
    });
  }

  addVisit(visit: SiteVisit): void {
    this.overlay.visits.unshift(visit);
    this.save();
  }

  patchVisit(id: string, patch: Partial<SiteVisit>): void {
    this.overlay.visitPatches[id] = { ...this.overlay.visitPatches[id], ...patch };
    this.save();
  }

  holds(): DemoOverlay['holds'] {
    return this.overlay.holds;
  }

  hold(unitId: string, hold: DemoOverlay['holds'][string]): void {
    this.overlay.holds[unitId] = hold;
    this.save();
  }

  release(unitId: string): void {
    delete this.overlay.holds[unitId];
    this.save();
  }

  get workspace(): WorkspaceProfile | null {
    return this.overlay.workspace;
  }

  set workspace(profile: WorkspaceProfile | null) {
    this.overlay.workspace = profile;
    this.save();
  }

  /**
   * Feature-owned mutable state. The returned object is live: mutate it, then call `save()`.
   * `init` runs once per session (or after a reset).
   */
  section<T extends object>(name: string, init: () => T): T {
    if (!(name in this.overlay.sections)) this.overlay.sections[name] = init();
    return this.overlay.sections[name] as T;
  }
}

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

export const DEMO_STORE_KEY = 'demo:store:v2';

/** Partition for requests made before anyone signs in (the workspace-setup simulation). */
export const VISITOR_PARTITION = 'visitor';

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface DemoSessionState {
  version: 2;
  /** One overlay per tenant (and one for visitors): another organisation's changes are never read. */
  partitions: Record<string, DemoOverlay>;
}

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

/**
 * The browser session's demo changes, partitioned by tenant (CP2 security correction 5). Handlers
 * only ever receive the signed-in person's own partition, so switching identity or organisation can
 * neither show nor change another tenant's session records.
 */
export class DemoStore {
  private state: DemoSessionState;
  private readonly storage: SessionStorageLike | undefined;

  constructor(storage: SessionStorageLike | undefined = defaultStorage()) {
    this.storage = storage;
    this.state = this.load();
  }

  private load(): DemoSessionState {
    try {
      const raw = this.storage?.getItem(DEMO_STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoSessionState;
        if (parsed.version === 2 && parsed.partitions && typeof parsed.partitions === 'object') {
          return { version: 2, partitions: Object.fromEntries(Object.entries(parsed.partitions).map(([k, v]) => [k, { ...empty(), ...v }])) };
        }
      }
    } catch {
      /* corrupt or unavailable: start clean */
    }
    return { version: 2, partitions: {} };
  }

  save(): void {
    try {
      this.storage?.setItem(DEMO_STORE_KEY, JSON.stringify(this.state));
    } catch {
      /* memory copy is kept */
    }
  }

  /** Discards every partition (the visitor's "Reset demo"). */
  reset(): void {
    this.state = { version: 2, partitions: {} };
    try {
      this.storage?.removeItem(DEMO_STORE_KEY);
    } catch {
      /* ignore */
    }
  }

  /** The overlay of one tenant (or the visitor partition), created on first use. */
  partition(key: string): DemoPartition {
    return new DemoPartition(this, () => (this.state.partitions[key] ??= empty()));
  }

  /** Partitions that hold changes (tests and the leakage checks). */
  partitionKeys(): string[] {
    return Object.keys(this.state.partitions);
  }
}

/** One tenant's view of the session overlay; every read and write stays inside it. */
export class DemoPartition {
  constructor(
    private readonly store: DemoStore,
    private readonly current: () => DemoOverlay,
  ) {}

  private get overlay(): DemoOverlay {
    return this.current();
  }

  save(): void {
    this.store.save();
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

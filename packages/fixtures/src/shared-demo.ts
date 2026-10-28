import type { DemoOverlay } from './demo-store';

/**
 * Demo partitions shared by the apps of one browser (prototype only, clearly labelled in the UI).
 *
 * The society demo is one story told in two apps: a resident sends a proof in the customer app and
 * the accounts officer verifies it in the office app. Each app runs its own mock server in its own
 * origin, so the society's partition is kept in one place, the office app's local storage, and the
 * customer app reaches it through a small same-site page (`/demo-bridge.html`) in a hidden frame.
 * When that page cannot be reached the customer app keeps its own copy and says so. Nothing leaves
 * the browser; "Reset demo" clears it.
 */
export interface SharedPartitions {
  /** Whether this partition is kept here instead of the tab's session. */
  shares(key: string): boolean;
  /** The latest copy known (call `sync` first to pick up another app's writes). */
  read(key: string): DemoOverlay | undefined;
  write(key: string, overlay: DemoOverlay): void;
  remove(key: string): void;
  /** Fetch the latest copy (the bridge is asynchronous; local storage needs nothing). */
  sync(key: string): Promise<void>;
  /** Called when another app or tab changed a shared partition. */
  subscribe(listener: (key: string) => void): () => void;
  /** 'linked': shared with the other app; 'local': this app's own copy (the link is unavailable). */
  status(): 'linked' | 'local';
}

export const SHARED_PREFIX = 'demo:shared:';
const LOCAL_PREFIX = 'demo:shared-local:';
/** Tenants whose demo spans the office and the resident app. */
export const SHARED_TENANTS: readonly string[] = ['tnt_alnoor'];

const parse = (raw: string | null): DemoOverlay | undefined => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as DemoOverlay;
  } catch {
    return undefined;
  }
};

/** The office app: the shared partitions live in its own local storage. */
export function localSharedPartitions(keys: readonly string[] = SHARED_TENANTS, storage: Storage | undefined = safeLocalStorage()): SharedPartitions {
  return {
    shares: (key) => keys.includes(key),
    read: (key) => parse(storage?.getItem(SHARED_PREFIX + key) ?? null),
    write: (key, overlay) => {
      try {
        storage?.setItem(SHARED_PREFIX + key, JSON.stringify(overlay));
      } catch {
        /* quota or privacy mode: the memory copy is kept */
      }
    },
    remove: (key) => storage?.removeItem(SHARED_PREFIX + key),
    sync: () => Promise.resolve(),
    subscribe: (listener) => {
      if (typeof window === 'undefined') return () => {};
      const on = (e: StorageEvent) => {
        if (e.key?.startsWith(SHARED_PREFIX)) listener(e.key.slice(SHARED_PREFIX.length));
      };
      window.addEventListener('storage', on);
      return () => window.removeEventListener('storage', on);
    },
    status: () => 'linked',
  };
}

interface BridgeMessage {
  source: 'propertyos-demo';
  id?: number;
  op?: 'ready' | 'changed' | 'get' | 'set' | 'remove';
  key?: string;
  value?: string | null;
  ok?: boolean;
}

/**
 * The customer app: shared partitions reached through the office app's bridge page. Falls back to
 * this tab's session storage (status 'local') when the bridge does not answer in time, and links
 * later if it answers before anything was saved locally.
 */
export function bridgedSharedPartitions(bridgeUrl: string, keys: readonly string[] = SHARED_TENANTS, timeoutMs = 5000): SharedPartitions {
  const cache = new Map<string, DemoOverlay | undefined>();
  const listeners = new Set<(key: string) => void>();
  const pending = new Map<number, (m: BridgeMessage) => void>();
  const session = safeSessionStorage();
  let linked: boolean | null = null;
  /** Something was saved in this app's own copy (then a late link is not taken: nothing is lost). */
  let wroteLocally = false;
  let frame: HTMLIFrameElement | null = null;
  let target = '*';
  let seq = 0;
  let ready: Promise<boolean> | null = null;

  const local = {
    read: (key: string) => parse(session?.getItem(LOCAL_PREFIX + key) ?? null),
    write: (key: string, o: DemoOverlay) => {
      try {
        session?.setItem(LOCAL_PREFIX + key, JSON.stringify(o));
      } catch {
        /* memory copy only */
      }
    },
  };

  const connect = (): Promise<boolean> => {
    if (ready) return ready;
    ready = new Promise<boolean>((resolve) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return resolve(false);
      try {
        target = new URL(bridgeUrl, window.location.href).origin;
      } catch {
        return resolve(false);
      }
      const timer = setTimeout(() => resolve(false), timeoutMs);
      window.addEventListener('message', (e: MessageEvent<BridgeMessage>) => {
        if (e.origin !== target || e.data?.source !== 'propertyos-demo') return;
        if (e.data.op === 'ready') {
          clearTimeout(timer);
          resolve(true);
          // The office app answered after the wait (a slow first load): link now, unless this app
          // has already kept something of its own, and let the screens read the shared copy.
          if (linked === false && !wroteLocally) {
            linked = true;
            ready = Promise.resolve(true);
            for (const key of keys) for (const l of listeners) l(key);
          }
        } else if (e.data.op === 'changed' && e.data.key) {
          for (const l of listeners) l(e.data.key);
        } else if (e.data.id !== undefined) {
          pending.get(e.data.id)?.(e.data);
          pending.delete(e.data.id);
        }
      });
      frame = document.createElement('iframe');
      frame.src = bridgeUrl;
      frame.title = 'Demo link';
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(frame);
    }).then((ok) => {
      linked = ok;
      return ok;
    });
    return ready;
  };

  const ask = (msg: Omit<BridgeMessage, 'source' | 'id'> & { op: 'get' | 'set' | 'remove' }): Promise<BridgeMessage | null> =>
    new Promise((resolve) => {
      if (!frame?.contentWindow) return resolve(null);
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(null);
      }, timeoutMs);
      pending.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      frame.contentWindow.postMessage({ source: 'propertyos-demo', id, ...msg }, target);
    });

  return {
    shares: (key) => keys.includes(key),
    read: (key) => (linked ? cache.get(key) : local.read(key)),
    write: (key, overlay) => {
      if (!linked) {
        wroteLocally = true;
        return local.write(key, overlay);
      }
      cache.set(key, overlay);
      void ask({ op: 'set', key, value: JSON.stringify(overlay) });
    },
    remove: (key) => {
      cache.delete(key);
      session?.removeItem(LOCAL_PREFIX + key);
      if (linked) void ask({ op: 'remove', key });
    },
    sync: async (key) => {
      if (!(await connect())) return;
      const reply = await ask({ op: 'get', key });
      if (reply) cache.set(key, parse(reply.value ?? null));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    status: () => (linked === false ? 'local' : 'linked'),
  };
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function safeSessionStorage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

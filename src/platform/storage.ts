// Local persistence. localStorage survives app restarts in Capacitor's WKWebView and in browsers.
// Every access is guarded: private browsing or blocked storage falls back to memory for the session.

const memory = new Map<string, string>();

export const KEYS = {
  save: 'bloq.game',
  stats: 'bloq.stats',
  settings: 'bloq.settings',
  tutorialDone: 'bloq.tutorialDone',
  analytics: 'bloq.analytics',
  // Build 4
  dailySave: 'bloq.daily.game',
  dailyRun: 'bloq.daily.run',
  dailyRecords: 'bloq.daily.records',
  gcQueue: 'bloq.gc.pending',
} as const;

export function load(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch { /* fall back */ }
  return memory.get(key) ?? null;
}

export function store(key: string, value: string) {
  memory.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* memory only */ }
}

export function remove(key: string) {
  memory.delete(key);
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

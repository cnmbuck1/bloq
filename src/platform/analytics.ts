// Build 1 analytics: local only. Events go to a capped ring buffer in local storage, with a
// timestamp and an anonymous random session id. No network, no SDKs, no personal data.
// Swap `sink` for a real provider later without touching call sites.

import { KEYS, load, store } from './storage';

export type AnalyticsEvent =
  | 'game_launched' | 'tutorial_started' | 'tutorial_completed' | 'tutorial_skipped'
  | 'game_started' | 'piece_placed' | 'invalid_placement' | 'lines_cleared' | 'pulse_activated'
  | 'chain_size' | 'game_ended' | 'game_restarted' | 'game_abandoned' | 'share_selected'
  | 'rotation_performed' | 'rotation_denied' | 'rotation_then_placed' | 'rotation_then_clear' | 'save_reset';

export interface LoggedEvent { t: number; s: string; e: AnalyticsEvent; d?: Record<string, number | string | boolean> }

const MAX_EVENTS = 3000;
const sessionId = (() => {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
})();

let buffer: LoggedEvent[] | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function events(): LoggedEvent[] {
  if (!buffer) {
    try { buffer = JSON.parse(load(KEYS.analytics) ?? '[]'); } catch { buffer = []; }
    if (!Array.isArray(buffer)) buffer = [];
  }
  return buffer!;
}

export function flushAnalytics() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  store(KEYS.analytics, JSON.stringify(events()));
}

export function track(e: AnalyticsEvent, d?: LoggedEvent['d']) {
  const list = events();
  list.push({ t: Date.now(), s: sessionId, e, d });
  if (list.length > MAX_EVENTS) list.splice(0, list.length - MAX_EVENTS);
  // Batch writes so a fast run of placements doesn't hit storage every time.
  if (!flushTimer) flushTimer = setTimeout(flushAnalytics, 2000);
}

/** Development export for playtesting: the whole log as pretty JSON. */
export function exportAnalytics(): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), session: sessionId, events: events() }, null, 2);
}

export function clearAnalytics() { buffer = []; flushAnalytics(); }

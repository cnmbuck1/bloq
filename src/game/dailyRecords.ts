// Build 4 Daily Challenge records: per-day best and first completed attempt, streaks and the calendar.
// Pure functions; persistence is in platform/storage. Days are challenge ids (UTC dates, YYYY-MM-DD).
// No penalties, no paid protection: a missed day simply ends the current streak.

import { addDays } from '../engine/daily';

export interface DailyRunSummary {
  score: number;
  placements: number;
  lines: number;
  maxCombo: number;
  maxChain: number;
  overdrives: number;
  /** The run reached the placement limit (rather than running out of legal moves). */
  fullRun: boolean;
}

export interface DailyDayRecord {
  best: number;
  /** Score of the first completed attempt (kept separately; replays never change it). */
  first: number | null;
  attempts: number;
  completed: boolean;
  bestRun: DailyRunSummary | null;
}

export interface DailyRecords {
  version: 1;
  days: Record<string, DailyDayRecord>;
  /** Run ids already recorded, so a restored or reopened result never counts twice. */
  recorded: string[];
}

export const emptyDailyRecords = (): DailyRecords => ({ version: 1, days: {}, recorded: [] });

const blankDay = (): DailyDayRecord => ({ best: 0, first: null, attempts: 0, completed: false, bestRun: null });

export function parseDailyRecords(raw: string | null): DailyRecords {
  if (!raw) return emptyDailyRecords();
  try {
    const d = JSON.parse(raw);
    if (d && d.version === 1 && d.days && typeof d.days === 'object') return { ...emptyDailyRecords(), ...d };
  } catch { /* fall through */ }
  return emptyDailyRecords();
}

/** A new attempt at a day's challenge. Returns whether it is a replay. */
export function recordDailyStart(r: DailyRecords, id: string): { records: DailyRecords; replay: boolean } {
  const day = r.days[id] ?? blankDay();
  return { records: { ...r, days: { ...r.days, [id]: { ...day, attempts: day.attempts + 1 } } }, replay: day.attempts > 0 };
}

export interface DailyResultUpdate {
  records: DailyRecords;
  newBest: boolean;
  previousBest: number;
  firstCompletion: boolean;
  /** False when this run id was already recorded (nothing changed). */
  counted: boolean;
}

/** A finished run (placement limit reached or no legal move). Idempotent per run id. */
export function recordDailyResult(r: DailyRecords, id: string, runId: string, run: DailyRunSummary): DailyResultUpdate {
  const day = r.days[id] ?? blankDay();
  if (r.recorded.includes(runId)) return { records: r, newBest: false, previousBest: day.best, firstCompletion: false, counted: false };
  const newBest = run.score > day.best || !day.completed;
  const next: DailyDayRecord = {
    best: Math.max(day.best, run.score),
    first: day.first ?? run.score,
    attempts: Math.max(1, day.attempts),
    completed: true,
    bestRun: newBest ? run : day.bestRun,
  };
  const recorded = [...r.recorded, runId].slice(-200);
  return { records: { ...r, days: { ...r.days, [id]: next }, recorded }, newBest, previousBest: day.best, firstCompletion: !day.completed, counted: true };
}

export interface StreakSummary {
  current: number;
  longest: number;
  completed: number;
  thisMonth: number;
  best: number;
}

/**
 * Streaks over completed days. The current streak counts back from today if today is done, otherwise from
 * yesterday, so an unfinished today never reads as a broken streak.
 */
export function streaks(r: DailyRecords, today: string): StreakSummary {
  const done = Object.keys(r.days).filter((k) => r.days[k].completed).sort();
  const set = new Set(done);
  let current = 0;
  let d = set.has(today) ? today : addDays(today, -1);
  while (set.has(d)) { current++; d = addDays(d, -1); }
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of done) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = k;
  }
  const month = today.slice(0, 7);
  return {
    current, longest, completed: done.length,
    thisMonth: done.filter((k) => k.startsWith(month)).length,
    best: done.reduce((m, k) => Math.max(m, r.days[k].best), 0),
  };
}

export type CalendarState = 'completed' | 'today' | 'missed' | 'future' | 'before';

export interface CalendarDay { id: string; day: number; state: CalendarState }

/** One month of the calendar (month is 1–12). Days before the player's first Daily are neutral, not missed. */
export function monthCalendar(r: DailyRecords, today: string, year: number, month: number): { leading: number; days: CalendarDay[] } {
  const first = Object.keys(r.days).sort()[0] ?? today;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const days: CalendarDay[] = [];
  for (let i = 1; i <= count; i++) {
    const id = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const rec = r.days[id];
    const state: CalendarState = rec?.completed ? 'completed' : id === today ? 'today' : id > today ? 'future' : id < first ? 'before' : 'missed';
    days.push({ id, day: i, state });
  }
  return { leading, days };
}

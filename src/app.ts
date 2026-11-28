// App shell: screens, the game loop and the glue between engine, renderer, input, audio,
// haptics, persistence and analytics.

import { drawOrbIcon } from './brand/cnmbuck-orb';
import { DEFAULT_CONFIG, type GameConfig, type LevelUpEnergy, type MaterialDef, type OverdriveRotation, type RotationMode } from './engine/config';
import { levelForScore, levelProgress, levelThreshold, levelTitle } from './engine/progression';
import { effectiveRotation, newGame, overState, rulesFor, stateIsOver, type GameState, type MoveResult } from './engine/game';
import { inspectSave, serializeGame, type SaveData } from './engine/save';
import { addDays, challengeId, dailyChallenge, dailyGame, generateChallenge, msUntilNextChallenge, validateChallenge } from './engine/daily';
import { rotationCost } from './engine/rotation';
import { SCENARIOS } from './dev/scenarios';
import { boardFromArt } from './game/boardArt';
import { GameSession } from './game/session';
import {
  ACHIEVEMENTS, achievementProgress, achievementWeight, achievementsInOrder, activeMaterial, grantProgress, nextMaterial, nextMilestone, type AchievementDef, type AchievementIcon,
} from './game/achievements';
import { loadSettings, saveSettings, type Settings } from './game/settings';
import {
  addPlayTime, averageRotations, averageScore, averageSessionMs, parseStats, recordGameEnd, recordMove, recordOverdriveActivation, recordRotation,
  recordSessionGames, syncDaily, type LifetimeStats, type RecordContext,
} from './game/stats';
import {
  monthCalendar, parseDailyRecords, recordDailyResult, recordDailyStart, streaks, weekStrip, bestDays, labelShift, recordsByLabel, localDateId, type DailyRecords,
} from './game/dailyRecords';
import {
  LEADERBOARDS, flushQueue, gameCenterSupported, loadBoard, openDashboard, pruneExpired, queueSubmission, type LeaderboardKey, type PendingSubmission,
} from './platform/gameCenter';
import { TUTORIAL_STEPS, tutorialState } from './game/tutorial';
import { exportAnalytics, flushAnalytics, track } from './platform/analytics';
import { haptic, setHapticIntensity, setHapticsEnabled, type HapticIntensity } from './platform/haptics';
import { music, setMusicEnabled, setMusicVolume, setSfxVolume, setSoundEnabled, sfx, suspendAudio, unlockAudio } from './platform/audio';
import { shareImage } from './platform/share';
import { KEYS, load, remove, store } from './platform/storage';
import { preloadGems } from './render/gems';
import { DEFAULT_VISUALS, currentMaterial, setBlockStyle, setHighContrast, type BlockStyle, setMaterial, setVisualParams, type VisualParams } from './render/blocks';
import { GameView } from './render/gameView';
import { paintDailyPreview, paintHomeArt, paintLogoCanvas, paintMaterialSwatch, paintSplash, renderDailyShareCard, renderShareCard, type DailyShareInfo, type ShareInfo } from './ui/art';
import { InputController } from './ui/input';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (n: number) => n.toLocaleString('en-US');
const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
};
const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

/** Development tunables, stored locally in development builds only. */
interface DevConfig {
  rotationMode: RotationMode; startCharges: number; maxCharges: number; cost: number; energyPerLine: number;
  pulseChance: number; clearMs: number; particles: 'low' | 'medium' | 'high'; haptic: HapticIntensity;
  // Build 3
  levelUpEnergy: LevelUpEnergy; levelMs: number; materialMs: number; visuals: VisualParams;
  /** Advanced overrides (progression, difficulty, materials, scoring, overdrive, daily), edited as JSON. */
  advanced: Partial<Pick<GameConfig, 'progression' | 'difficulty' | 'materials' | 'scoring' | 'overdrive' | 'daily'>>;
  // Build 4
  protection: number; odDuration: number; odMultiplier: number; odRotation: OverdriveRotation; ruleset: number;
  dailyLimit: number; /** Simulated challenge day (YYYY-MM-DD), '' = today. */ dailyDate: string;
}
const ADVANCED_KEYS = ['progression', 'difficulty', 'materials', 'scoring', 'overdrive', 'daily'] as const;
const DEV_KEY = 'bloq.dev';

const svg = (d: string) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${d}</svg>`;
const ACH_ICONS: Record<AchievementIcon, string> = {
  line: svg('<rect x="3" y="10" width="18" height="4.5" rx="1.2" fill="currentColor"/>'),
  rotate: svg('<path d="M18 8.5A7 7 0 1 0 19 13" stroke="currentColor" stroke-width="2.3" fill="none" stroke-linecap="round"/><path d="M19.5 4v5h-5" stroke="currentColor" stroke-width="2.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  pulse: svg('<rect x="5" y="5" width="14" height="14" rx="3" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
  chain: svg('<circle cx="6" cy="12" r="3" fill="currentColor"/><circle cx="18" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor" opacity=".6"/>'),
  clear: svg('<rect x="3" y="5" width="18" height="3.5" rx="1" fill="currentColor"/><rect x="3" y="10.25" width="18" height="3.5" rx="1" fill="currentColor"/><rect x="3" y="15.5" width="18" height="3.5" rx="1" fill="currentColor" opacity=".5"/>'),
  combo: svg('<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" fill="currentColor"/>'),
  level: svg('<path d="M12 4 20 12h-5v8H9v-8H4z" fill="currentColor"/>'),
  games: svg('<rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="13" y="4" width="7" height="7" rx="1.5" fill="currentColor" opacity=".6"/><rect x="4" y="13" width="7" height="7" rx="1.5" fill="currentColor" opacity=".6"/><rect x="13" y="13" width="7" height="7" rx="1.5" fill="currentColor"/>'),
  points: svg('<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="currentColor"/>'),
  material: svg('<path d="M12 3 21 8v8l-9 5-9-5V8z" fill="none" stroke="currentColor" stroke-width="2"/><path d="m3 8 9 5 9-5M12 13v8" stroke="currentColor" stroke-width="1.6" fill="none"/>'),
  overdrive: svg('<path d="M12 2.5 14.6 9H21l-5.2 4 2 6.5L12 15.6 6.2 19.5l2-6.5L3 9h6.4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><text x="12" y="14.2" font-size="6.5" font-weight="900" text-anchor="middle" fill="currentColor">2×</text>'),
  perfect: svg('<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="m8 12.5 2.8 2.8L16.5 9" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  shield: svg('<path d="M12 2.8 19.5 5.6v5.6c0 4.6-3.1 8.4-7.5 10-4.4-1.6-7.5-5.4-7.5-10V5.6z" fill="currentColor"/>'),
  daily: svg('<rect x="4" y="5.5" width="16" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="7.5" y="13" width="3.5" height="3.5" rx=".8" fill="currentColor"/>'),
  streak: svg('<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2-4.6.3 1.6 1 2.6 2 3 0-3 0-5.5 1-8.4z" fill="currentColor"/>'),
};
const defaultDev = (): DevConfig => ({
  rotationMode: DEFAULT_CONFIG.rotation.mode, startCharges: DEFAULT_CONFIG.rotation.startCharges, maxCharges: DEFAULT_CONFIG.rotation.maxCharges,
  cost: DEFAULT_CONFIG.rotation.cost, energyPerLine: DEFAULT_CONFIG.rotation.energyPerLine, pulseChance: DEFAULT_CONFIG.generation.pulseChance,
  clearMs: 340, particles: 'medium', haptic: 'medium',
  levelUpEnergy: DEFAULT_CONFIG.progression.levelUpEnergy, levelMs: 950, materialMs: 560, visuals: { ...DEFAULT_VISUALS }, advanced: {},
  protection: DEFAULT_CONFIG.combo.protection, odDuration: DEFAULT_CONFIG.overdrive.duration, odMultiplier: DEFAULT_CONFIG.overdrive.multiplier,
  odRotation: DEFAULT_CONFIG.overdrive.rotation, ruleset: DEFAULT_CONFIG.ruleset, dailyLimit: DEFAULT_CONFIG.daily.placementLimit, dailyDate: '',
});

type ScreenId = 'splash' | 'home' | 'game';
type OverlayId = 'pause' | 'confirmNew' | 'results' | 'stats' | 'how' | 'settings' | 'materials' | 'dailyResults' | 'dailyHub' | 'dailyHistory' | 'rankings';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** A challenge id as a friendly date ("27 November 2026"); it is a UTC date, shown as such. */
const dayLabel = (id: string, year = true) => { const [y, m, d] = id.split('-').map(Number); return `${d} ${MONTHS[m - 1]}${year ? ` ${y}` : ''}`; };
const fmtCountdown = (ms: number) => { const m = Math.max(0, Math.floor(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

export class App {
  private cfg: GameConfig = structuredClone(DEFAULT_CONFIG);
  private dev: DevConfig = defaultDev();
  private settings: Settings = loadSettings();
  private stats: LifetimeStats = parseStats(load(KEYS.stats));
  private session: GameSession = new GameSession(newGame(newSeed(), this.cfg), this.cfg);
  private view: GameView;
  private screen: ScreenId = 'splash';
  private overlay: OverlayId | null = null;
  private overlayReturn: OverlayId | null = null;

  private elapsedMs = 0;
  private unbankedMs = 0;
  private bestAtStart = 0;
  private chainRecordAtStart = 0;
  private celebratedBest = false;
  private displayedScore = 0;
  private gamesThisSession = 0;
  /** Slots whose current piece the player rotated (for analytics). */
  private rotatedSlots = new Set<number>();
  private lastResultInfo: ShareInfo | null = null;
  // Build 3 progression
  /** Level shown in the HUD (catches up with the state when the level-up celebration plays). */
  private displayedLevel = 1;
  private highestLevelAtStart = 1;
  private levelStartedMs = 0;
  private levelStartedMoves = 0;
  /** What this game earned for the first time (results screen). */
  private earned = { materials: [] as MaterialDef[], achievements: [] as AchievementDef[], chainRecord: false };
  // Build 4
  private daily: DailyRecords = parseDailyRecords(load(KEYS.dailyRecords));
  private gcQueue: PendingSubmission[] = (() => {
    try { const q = JSON.parse(load(KEYS.gcQueue) ?? '[]'); return Array.isArray(q) ? q : []; } catch { return []; }
  })();
  /** The Daily attempt in progress (its number makes each run's record unique). */
  private dailyRun: { id: string; attempt: number } | null = null;
  private lastDailyInfo: DailyShareInfo | null = null;
  private calMonth = { y: 0, m: 0 };
  private rankBoard: LeaderboardKey = 'classic';
  /** Firsts in this game, for time-to-first analytics. */
  private firsts = { line: false, pulse: false, od: false };
  private lastEndAt = 0;

  private tutorialIndex = -1;
  private editMode = false;
  private devEnabled = !__RELEASE__ && (import.meta.env.DEV || new URLSearchParams(location.search).has('dev'));

  private raf = 0;
  private lastFrame = 0;
  /** Build 9 HUD note: a short move callout (wins the slot while it shows), queued notices, and a dismissible tip. */
  private note: { text: string; kind: string; at: number; until: number } | null = null;
  private noteQueue: { text: string; kind: string; ms: number }[] = [];
  private noteTip: { text: string; left: number } | null = null;
  private tipShownAt = 0;
  private noteTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private rotateBtns: HTMLButtonElement[];

  constructor() {
    if (!__RELEASE__) this.loadDev();
    const canvas = $<HTMLCanvasElement>('board');
    this.view = new GameView(canvas, () => this.session.state);
    this.view.rotation = this.cfg.rotation;
    this.view.effective = (st) => effectiveRotation(this.cfg, st);
    this.syncViewConfig();
    this.rotateBtns = [...document.querySelectorAll<HTMLButtonElement>('.rotate-btn')];
    new InputController(canvas, this.view, () => this.session.state, {
      canPick: () => !this.session.locked && !this.view.animator.busy && !this.session.state.over && !this.overlay,
      onPick: () => { sfx.select(); haptic('select'); },
      onDrop: (slot, r, c) => this.drop(slot, r, c),
      onInvalidDrop: (_slot, overBoard) => {
        if (!overBoard) return;
        sfx.invalid(); haptic('invalid');
        track('invalid_placement');
      },
      editMode: () => this.editMode,
      onCellTap: (r, c) => this.editCell(r, c),
      wake: () => this.wake(),
    });
    this.applySettings();
    this.bindUi();
    this.lifecycle();
    track('game_launched');
    track('session_started', { games: this.stats.gamesPlayed, days: this.stats.days.length, firstDay: this.stats.days[0] ?? '' });
    this.checkSave();
    this.creditEarlier();
    this.flushGameCenter();
    this.startSplash();
  }

  // ---------------------------------------------------------------- screens

  private show(id: ScreenId) {
    this.screen = id;
    if (id !== 'game') this.clearNotes();
    document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === id));
    if (id === 'home') this.refreshHome();
    if (id === 'game') this.layoutGame();
    this.wake();
  }

  private layoutGame() {
    this.view.resize();
    // Build 10: build glow, shard and Overdrive crystal sprites in idle time, not on the frame that first needs them.
    this.view.warmOverdrive();
    paintLogoCanvas($<HTMLCanvasElement>('navLogo'));
    this.refreshRotateButtons();
    this.updateOverdriveHud();
  }

  /** Renderer settings that follow the config (Overdrive look, rotation rules). */
  private syncViewConfig() {
    const O = this.cfg.overdrive;
    this.view.rotation = this.cfg.rotation;
    this.view.odRotation = O.rotation;
    this.view.odDuration = O.duration;
    this.view.odMult = O.multiplier;
  }

  private openOverlay(id: OverlayId) {
    if (this.overlay) $(this.overlay).hidden = true;
    this.overlay = id;
    $(id).hidden = false;
    ($(id).querySelector<HTMLElement>('[data-focus]') ?? $(id).querySelector<HTMLElement>('button, input'))?.focus({ preventScroll: true });
  }

  private closeOverlay() {
    if (!this.overlay) return;
    $(this.overlay).hidden = true;
    this.overlay = null;
    if (this.overlayReturn) { const back = this.overlayReturn; this.overlayReturn = null; this.openOverlay(back); }
    this.wake();
  }

  private startSplash() {
    const splash = $<HTMLCanvasElement>('splashCanvas');
    requestAnimationFrame(() => paintSplash(splash));
    let done = false;
    const go = () => { if (done) return; done = true; this.show('home'); };
    setTimeout(go, this.settings.reducedMotion ? 900 : 1600);
    $('splash').addEventListener('pointerdown', go, { once: true });
  }

  private refreshHome() {
    paintLogoCanvas($<HTMLCanvasElement>('logo'));
    const orb = $<HTMLCanvasElement>('studioOrb');
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    orb.width = orb.height = Math.round(18 * dpr);
    const og = orb.getContext('2d')!;
    og.setTransform(1, 0, 0, 1, 0, 0); og.clearRect(0, 0, orb.width, orb.height);
    drawOrbIcon(og, orb.width, 0, 0, 0, false);
    const s = this.stats;
    $('homeBest').innerHTML = s.bestScore > 0 ? `Personal best <b>${fmt(s.bestScore)}</b>` : s.legacyBestScore > 0 ? `Build 3 rules best <b>${fmt(s.legacyBestScore)}</b>` : 'Place, clear and chain Pulses';
    $('homeLevel').innerHTML = s.highestLevel > 1 ? `Highest level <b>${s.highestLevel}</b> · ${levelTitle(this.cfg.progression, s.highestLevel)}` : '';
    // Build 9: a saved Classic run makes Continue the primary action; starting fresh is the smaller action below it.
    const run = inspectSave(load(KEYS.save), this.cfg).data;
    $('btnContinue').hidden = !run;
    $('btnNewRun').hidden = !run;
    $('btnPlay').hidden = !!run;
    if (run) {
      $('homeSaved').innerHTML = `Score <b>${fmt(run.state.score)}</b> · Level <b>${run.state.level ?? 1}</b>`;
      $('homeSavedBest').innerHTML = s.bestScore > 0 ? `Personal best <b>${fmt(s.bestScore)}</b>` : '';
    }
    // Daily card: today's state with the best that applies to it, then the streak. Never truncated: it wraps instead.
    const id = this.today();
    const day = this.daily.days[id];
    const sk = streaks(this.daily, id);
    const saved = this.dailySave();
    const bestDaily = Math.max(sk.best, this.stats.bestDaily);
    $('homeDaily').innerHTML = day?.completed ? `Completed · Best <b>${fmt(day.best)}</b>`
      : saved ? `In progress · <b>${saved.state.stats.moves} of ${saved.state.daily?.limit ?? 30}</b> placements`
      : bestDaily > 0 ? `Ready to play · Best <b>${fmt(bestDaily)}</b>` : 'Ready to play';
    const streakText = sk.current > 0 ? `Streak <b>${sk.current} day${sk.current === 1 ? '' : 's'}</b>` : sk.longest > 0 ? `Longest streak <b>${sk.longest}</b>` : 'Start a streak today';
    $('homeStreak').innerHTML = day?.completed ? `${streakText} · Next at ${this.resetClock()}` : streakText;
    $('btnDaily').classList.toggle('done', !!day?.completed);
    this.applyMaterial(s.highestLevel);
    this.flushGameCenter();
  }

  /**
   * Build 10: credits achievements the saved career already proves (Daily completions from the Daily records, levels,
   * Overdrive use), once, quietly at launch. Unlocks are stored with their time, so nothing is ever granted twice.
   */
  private creditEarlier() {
    const sk = streaks(this.daily, this.today());
    const synced = syncDaily(this.stats, { completed: sk.completed, current: sk.current, longest: sk.longest, best: sk.best });
    const g = grantProgress(synced, this.cfg);
    if (g.stats !== this.stats) { this.stats = g.stats; store(KEYS.stats, JSON.stringify(this.stats)); }
  }

  /** Build 1 saves migrate; anything that can't be restored is cleared with an explanation. Records are kept. */
  private checkSave() {
    const raw = load(KEYS.save);
    const { problem } = inspectSave(raw, this.cfg);
    if (raw && (problem === 'corrupt' || problem === 'unsupported')) {
      remove(KEYS.save);
      track('save_reset', { problem });
      setTimeout(() => this.toast("Your unfinished game couldn't be restored after the update. Your records are safe."), 1800);
    }
  }

  // ---------------------------------------------------------------- game flow

  private startClassic(state?: GameState, restore?: { elapsedMs: number; bestAtStart: number }) {
    this.view.animator.finish();
    this.clearNotes();
    this.tutorialIndex = -1;
    this.view.tutorialTarget = null;
    $('tutorial').hidden = true;
    $('btnSkip').hidden = true;
    $('btnGameSettings').hidden = false;
    // Build 7: the practice round hides the HUD rows entirely (no reserved blank space); real games restore them.
    $('game').classList.remove('tut-mode');
    this.session = new GameSession(state ?? this.freshClassic(), this.cfg);
    const daily = this.session.state.mode === 'daily';
    if (!daily) this.dailyRun = null;
    $('levelHud').classList.toggle('daily', daily);
    this.firsts = { line: false, pulse: false, od: false };
    this.view.odAvailable = this.session.state.od ? overState(this.session.state, this.cfg).odAvailable : false;
    this.odRunScore = this.session.state.od?.active ? this.session.state.od.score : 0;
    music.setIntensity(this.session.state.od?.active ? 1 : 0);
    const lvl = this.session.state.level ?? 1;
    this.displayedLevel = lvl;
    this.highestLevelAtStart = this.stats.highestLevel;
    this.levelStartedMs = restore?.elapsedMs ?? 0;
    this.levelStartedMoves = this.session.state.stats.moves;
    this.earned = { materials: [], achievements: [], chainRecord: false };
    this.applyMaterial(lvl);
    this.rotatedSlots.clear();
    this.elapsedMs = restore?.elapsedMs ?? 0;
    this.bestAtStart = restore?.bestAtStart ?? (daily ? this.daily.days[this.session.state.daily!.id]?.best ?? 0
      : (this.session.state.ruleset ?? 2) < 2 ? this.stats.legacyBestScore : this.stats.bestScore);
    this.chainRecordAtStart = this.stats.maxChain;
    this.celebratedBest = this.session.state.score > this.bestAtStart;
    this.displayedScore = this.session.state.score;
    this.view.fade = 0;
    this.updateHud(true);
    this.setCombo(this.session.state.combo, false);
    $('chain').classList.remove('on');
    this.updateOverdriveHud();
    this.show('game');
    if (this.session.state.od && (this.session.state.od.active > 0 || this.session.state.od.charge >= 100)) this.view.warmOverdrive();
    if (!restore) {
      track('game_started', { seed: this.session.state.seed, mode: this.session.state.mode, ruleset: this.session.state.ruleset ?? 2, rotationMode: this.cfg.rotation.mode, gameInSession: this.gamesThisSession + 1 });
      // Played again within 10 s of a result: an immediate replay.
      if (this.lastEndAt && Date.now() - this.lastEndAt < 10000) track('immediate_replay', { mode: this.session.state.mode });
    }
    this.persist();
    if (this.session.state.over) setTimeout(() => this.endGame(), 600);
  }

  /** A new Classic game under the current ruleset (dev: optionally ruleset 1 for comparison). Dev games never submit. */
  private freshClassic(): GameState {
    const st = newGame(newSeed(), this.cfg, { ruleset: this.dev.ruleset === 1 ? 1 : undefined });
    return this.devEnabled ? { ...st, dev: true } : st;
  }

  /** Build 10: day shift from a shared challenge id to the local date it is shown as (see labelShift). */
  private dayShift(): number { return labelShift(new Date().getTimezoneOffset()); }
  /** The local date a challenge is shown as. */
  private labelOf(id: string): string { return addDays(id, this.dayShift()); }
  /** The challenge's local date in words. */
  private dailyDate(id: string, year = true): string { return dayLabel(this.labelOf(id), year); }
  /** True while the current challenge is labelled with today's local date ("today" reads naturally). */
  private dailyIsLocalToday(): boolean { return this.labelOf(this.today()) === localDateId(); }
  /** The shared reset as a local clock time, e.g. "7:00 PM". */
  private resetClock(): string { return new Date(Date.now() + this.msToNext()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

  /** Today's challenge id (UTC). The developer menu can simulate another day. */
  private today(): string {
    return (!__RELEASE__ && /^\d{4}-\d{2}-\d{2}$/.test(this.dev.dailyDate)) ? this.dev.dailyDate : challengeId();
  }

  /** The ruleset-aware config for the running game (ruleset 1 games keep Build 3 thresholds). */
  private rules(st: GameState = this.session.state): GameConfig { return rulesFor(this.cfg, st); }

  private play() {
    unlockAudio();
    const existing = inspectSave(load(KEYS.save), this.cfg).data;
    if (existing) this.abandon(existing);
    if (load(KEYS.tutorialDone) !== '1') this.startTutorial();
    else this.startClassic();
  }

  // ---------------------------------------------------------------- Build 4 Daily Challenge

  /** A saved Daily for today, if any (an unfinished run from an earlier day is dropped: its day is over). */
  private dailySave(): SaveData | null {
    const save = inspectSave(load(KEYS.dailySave), this.cfg).data;
    if (save && save.state.daily?.id !== this.today()) { remove(KEYS.dailySave); return null; }
    return save;
  }

  private openDailyHub() {
    const id = this.today();
    const [y, m] = id.split('-').map(Number);
    const [ly, lm] = this.labelOf(id).split('-').map(Number);
    if (!this.calMonth.y) this.calMonth = { y: ly, m: lm };
    void y; void m;
    this.renderDailyHub();
    this.openOverlay('dailyHub');
    this.wake();
  }

  /**
   * Build 5 Daily landing: play first. Date, a little art, the one-line rules, the primary action, three compact
   * figures, this week's strip and the countdown, all inside the safe area with no scrolling. Everything else
   * (the month calendar and detailed records) lives on the history screen.
   */
  private previewDay: { id: string; cells: ({ pulse?: boolean } | null)[] } | null = null;

  private dhTimer = 0;

  private renderDailyHub() {
    const id = this.today();
    const day = this.daily.days[id];
    const st = streaks(this.daily, id);
    const saved = this.dailySave();
    const limit = this.dev.dailyLimit || this.cfg.daily.placementLimit;
    const localToday = this.dailyIsLocalToday();
    $('dhDate').textContent = localToday ? this.dailyDate(id) : `Current challenge · ${this.dailyDate(id)}`;
    $('dhLead').innerHTML = saved ? `Challenge in progress · <b>${saved.state.stats.moves} of ${saved.state.daily?.limit ?? limit}</b> moves`
      : day?.completed ? `Completed · best <b>${fmt(day.best)}</b>` : localToday ? 'Today&rsquo;s puzzle awaits' : 'Current challenge awaits';
    $('dhRules').textContent = `${limit} moves · Same puzzle for everyone · No timer`;
    $('btnDailyStart').textContent = saved ? 'CONTINUE CHALLENGE' : day?.completed ? 'PLAY AGAIN' : 'START CHALLENGE';
    const best = Math.max(st.best, this.stats.bestDaily);
    const stat = (v: string, k: string, cls = '') => `<div class="dl-stat ${cls}"><b>${v}</b><span>${k}</span></div>`;
    $('dhStats').innerHTML = stat(`${st.current}`, st.current === 1 ? 'day streak' : 'day streak', 'streak')
      + stat(`${st.completed}`, 'completed') + stat(best ? fmt(best) : '–', 'best daily');
    const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    // Build 10: each box shows its local date; a completed day shows the date and a check; the current challenge
    // keeps its own outline. Boxes are local dates, each standing for the shared challenge that starts on it.
    const word = { completed: 'completed', today: 'current challenge, not played yet', missed: 'missed', future: 'upcoming', before: 'before your first challenge' } as const;
    $('dhWeek').innerHTML = weekStrip(recordsByLabel(this.daily, this.dayShift()), this.labelOf(id)).map((d) =>
      `<div class="wk ${d.state}${d.isToday ? ' is-today' : ''}" role="listitem" aria-label="${dayLabel(d.id, false)}, ${d.isToday && d.state === 'completed' ? 'current challenge, completed' : word[d.state]}">`
      + `<span class="wk-dow">${DOW[d.dow]}</span><span class="wk-dot"><b class="wk-num">${d.day}</b>${d.state === 'completed' ? '<i class="wk-check" aria-hidden="true">✓</i>' : ''}</span></div>`).join('');
    $('dhNext').innerHTML = this.nextLine();
    // Build 6: the countdown stays live while the screen is open (and the screen refreshes itself at the UTC reset).
    clearInterval(this.dhTimer);
    this.dhTimer = window.setInterval(() => {
      if (this.overlay !== 'dailyHub') { clearInterval(this.dhTimer); return; }
      if (this.today() !== id) { this.renderDailyHub(); return; }
      $('dhNext').innerHTML = this.nextLine();
    }, 20000);
    // Completion animation: today's mark pops the first time this screen shows it completed.
    if (day?.completed && load('bloq.dailyPop') !== id) {
      store('bloq.dailyPop', id);
      document.querySelector('#dhWeek .wk.is-today')?.classList.add('just-done');
    }
    // Build 6: today's actual starting board (generated once per day, the same puzzle the Start button plays).
    if (this.previewDay?.id !== id) {
      const cfg = { ...this.cfg, daily: { ...this.cfg.daily, placementLimit: limit } };
      this.previewDay = { id, cells: dailyChallenge(id, cfg).board.cells };
    }
    const cells = this.previewDay.cells;
    requestAnimationFrame(() => { if (this.overlay === 'dailyHub') paintDailyPreview($<HTMLCanvasElement>('dhArt'), cells); });
  }

  /** Countdown to the shared reset, with its local clock time. */
  private nextLine(): string { return `Next challenge at ${this.resetClock()} · in <b>${fmtCountdown(this.msToNext())}</b>`; }

  /** The secondary screen: full month calendar, detailed streak figures and personal records. Scrolls if needed. */
  private openDailyHistory() {
    this.renderDailyHistory();
    this.openOverlay('dailyHistory');
  }

  private renderDailyHistory() {
    const id = this.today();
    const day = this.daily.days[id];
    const st = streaks(this.daily, id);
    const rows: [string, string][] = [
      ['Current streak', `${st.current}`], ['Longest streak', `${Math.max(st.longest, this.stats.longestStreak)}`],
      ['Completed', `${st.completed}`], ['This month', `${st.thisMonth}`],
      ['Best daily', st.best || this.stats.bestDaily ? fmt(Math.max(st.best, this.stats.bestDaily)) : '–'], [this.dailyIsLocalToday() ? 'Today\u2019s best' : 'Current challenge best', day?.completed ? fmt(day.best) : '–'],
    ];
    $('dhHistStats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    this.renderCalendar();
    const recs = bestDays(this.daily, 5);
    $('dhRecords').innerHTML = recs.length
      ? recs.map((r, i) => `<li><span class="rk">${i + 1}</span><span class="rd">${this.dailyDate(r.id)}</span><b>${fmt(r.best)}</b></li>`).join('')
      : '<li class="empty">Complete a Daily Challenge to set your first record.</li>';
    $('dhNote').textContent = `A new challenge starts every day at ${this.resetClock()} your time, the same moment for every player. Everyone plays the same board and pieces; replays are allowed and your first and best scores are both kept.`;
  }

  private msToNext() {
    if (this.dev.dailyDate) return msUntilNextChallenge(Date.parse(`${this.today()}T12:00:00Z`));
    return msUntilNextChallenge();
  }

  private renderCalendar() {
    const today = this.labelOf(this.today());
    const { y, m } = this.calMonth;
    const cal = monthCalendar(recordsByLabel(this.daily, this.dayShift()), today, y, m);
    $('calMonth').textContent = `${MONTHS[m - 1]} ${y}`;
    const dows = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="dow">${d}</span>`).join('');
    const label = { completed: 'completed', today: 'current challenge', missed: 'not played', future: 'upcoming', before: '' } as const;
    $('calGrid').innerHTML = dows + '<span></span>'.repeat(cal.leading) + cal.days.map((d) =>
      `<span class="d ${d.state}${d.id === today ? ' today' : ''}" aria-label="${dayLabel(d.id, false)}${label[d.state] ? `, ${label[d.state]}` : ''}">${d.day}${d.state === 'completed' ? '<i aria-hidden="true">✓</i>' : ''}</span>`).join('');
    const [ty, tm] = today.split('-').map(Number);
    $<HTMLButtonElement>('calNext').disabled = y > ty || (y === ty && m >= tm);
  }

  private shiftMonth(delta: number) {
    let { y, m } = this.calMonth;
    m += delta;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    this.calMonth = { y, m };
    this.renderCalendar();
  }

  /** Starts (or continues) today's Daily Challenge. Identical for every player; replays allowed. */
  private startDaily() {
    unlockAudio();
    this.overlayReturn = null;
    if (this.overlay) this.closeOverlay();
    const id = this.today();
    const saved = this.dailySave();
    if (saved) {
      try { this.dailyRun = JSON.parse(load(KEYS.dailyRun) ?? 'null'); } catch { this.dailyRun = null; }
      if (this.dailyRun?.id !== id) this.dailyRun = { id, attempt: this.daily.days[id]?.attempts ?? 1 };
      this.startClassic(saved.state, { elapsedMs: saved.elapsedMs, bestAtStart: saved.bestAtStart });
      return;
    }
    const cfg = { ...this.cfg, daily: { ...this.cfg.daily, placementLimit: this.dev.dailyLimit || this.cfg.daily.placementLimit } };
    const ch = dailyChallenge(id, cfg);
    const start = recordDailyStart(this.daily, id);
    this.daily = start.records;
    store(KEYS.dailyRecords, JSON.stringify(this.daily));
    this.dailyRun = { id, attempt: this.daily.days[id].attempts };
    let state = dailyGame(ch, cfg);
    if (this.devEnabled) state = { ...state, dev: true };
    track(start.replay ? 'daily_replayed' : 'daily_started', { day: id, attempt: this.dailyRun.attempt });
    this.startClassic(state);
    this.callout(`DAILY CHALLENGE · ${ch.placementLimit} PLACEMENTS`, 'daily', 2000);
    this.tip('daily-rules', `Same board for everyone today. ${ch.placementLimit} placements.`, 2100);
  }

  /** Build 9: New Classic Run with a saved run asks first. Cancel keeps the run and stays on Home. */
  private confirmNewRun() {
    const run = inspectSave(load(KEYS.save), this.cfg).data;
    if (!run) { this.play(); return; }
    $('cnText').innerHTML = `Your saved run (<b>${fmt(run.state.score)}</b> points, Level ${run.state.level ?? 1}) will end and its score is recorded as it stands.`;
    this.openOverlay('confirmNew');
  }

  private continueGame() {
    unlockAudio();
    const save = inspectSave(load(KEYS.save), this.cfg).data;
    if (!save) { this.refreshHome(); return; }
    this.startClassic(save.state, { elapsedMs: save.elapsedMs, bestAtStart: save.bestAtStart });
  }

  private abandon(save: { state: GameState }) {
    const st = save.state;
    track('game_abandoned', { score: st.score, mode: st.mode, moves: st.stats.moves });
    this.stats = recordGameEnd(this.stats, st.score, this.recordCtx(st));
    store(KEYS.stats, JSON.stringify(this.stats));
    remove(st.mode === 'daily' ? KEYS.dailySave : KEYS.save);
  }

  private recordCtx(st: GameState): RecordContext {
    return { mode: st.mode, ruleset: st.ruleset ?? 2, game: st.stats };
  }

  private rotate(slot: number) {
    if (this.overlay || this.view.animator.busy || this.view.drag || this.editMode) return;
    const st = this.session.state;
    const piece = st.tray[slot];
    if (!piece) return;
    const out = this.session.tryRotate(slot);
    if (!out) {
      if (this.session.lastRejection === 'no-energy') {
        sfx.denied(); haptic('invalid');
        this.view.denied = performance.now();
        if (st.mode !== 'tutorial') track('rotation_denied', { piece: piece.defId });
        this.wake();
      }
      return;
    }
    const now = performance.now();
    this.view.rotating.set(slot, now);
    if (out.cost > 0) this.view.drain = { seg: out.state.energy, start: now };
    sfx.rotate(); haptic('rotate');
    if (st.mode !== 'tutorial') {
      this.rotatedSlots.add(slot);
      track('rotation_performed', { piece: piece.defId, cost: out.cost, energyLeft: out.state.energy, free: out.free, mode: st.mode });
      this.stats = recordRotation(this.stats, out.cost, out.free);
      this.grant();
      this.persist();
    }
    this.refreshRotateButtons();
    this.wake();
  }

  private drop(slot: number, row: number, col: number): boolean {
    const result = this.session.tryPlace(slot, row, col);
    if (!result) return false;
    const tutorial = this.session.state.mode === 'tutorial';
    if (tutorial) this.view.tutorialTarget = null;
    const lines = result.rows.length + result.cols.length;
    sfx.place(); haptic('place');
    if (result.odGained > 0) { this.view.odPulse = performance.now(); sfx.odCharge(result.odChargeAfter); }
    if (result.odActive) this.odRunScore += result.points.total;
    if (!tutorial) {
      const rotated = this.rotatedSlots.has(slot);
      track('piece_placed', { piece: result.piece.defId, rot: result.piece.rot ?? 0, lines, combo: result.combo, chain: result.chain, rotated });
      if (rotated) {
        track('rotation_then_placed', { piece: result.piece.defId });
        if (lines) track('rotation_then_clear', { lines });
      }
      if (result.newTray) this.rotatedSlots.clear(); else this.rotatedSlots.delete(slot);
      if (lines) track('lines_cleared', { count: lines, combo: result.combo, energyGained: result.energyGained });
      if (result.chain) { track('pulse_activated', { count: result.chain }); track('chain_size', { size: result.chain }); }
      const st = this.session.state;
      const ms = Math.round(this.elapsedMs);
      if (st.stats.moves === 1) track('first_placement', { ms, mode: st.mode });
      if (lines && !this.firsts.line) { this.firsts.line = true; track('first_line', { ms, placements: st.stats.moves, mode: st.mode }); }
      if (result.chain && !this.firsts.pulse) { this.firsts.pulse = true; track('first_pulse', { ms, placements: st.stats.moves, mode: st.mode }); }
      if (result.comboProtected) track('combo_protected', { combo: result.combo });
      if (result.odGained > 0) track('overdrive_energy_earned', { amount: result.odGained, meter: result.odChargeAfter });
      if (result.odReady) track('overdrive_ready', { ms, placements: st.stats.moves, first: !this.firsts.od });
      if (result.perfect) track('perfect_clear', { lines, chain: result.chain, overdrive: result.odActive });
      if (result.odEnded) track('overdrive_completed', { score: st.stats.odBestScore, placements: this.cfg.overdrive.duration });
      // Daily credit keys include the attempt, so replays of the same seed are credited separately.
      const creditSeed = st.mode === 'daily' ? (st.seed ^ ((this.dailyRun?.attempt ?? 0) * 2654435761)) >>> 0 : st.seed;
      this.stats = recordMove(this.stats, result, { seed: creditSeed, moves: st.stats.moves }, undefined, this.recordCtx(st));
      if (result.chain >= 2 && result.chain > this.chainRecordAtStart && this.chainRecordAtStart > 0) this.earned.chainRecord = true;
      if (result.levelAfter > result.levelBefore) {
        for (let L = result.levelBefore + 1; L <= result.levelAfter; L++) {
          track('level_reached', { level: L, ms: Math.round(this.elapsedMs - this.levelStartedMs), placements: st.stats.moves - this.levelStartedMoves, score: result.scoreAfter });
        }
        this.levelStartedMs = this.elapsedMs; this.levelStartedMoves = st.stats.moves;
        if (result.levelEnergy > 0) track('energy_restored_level_up', { amount: result.levelEnergy, level: result.levelAfter });
      }
      // Unlocks and achievements are granted and saved now, before any animation, so nothing can be lost or doubled.
      this.grant({ quiet: true });
      this.persist();
    }
    // Build 9: a level-up celebration from the previous move may still be playing (input stays live through it).
    // Settle it first so the material below is the real current one.
    this.view.animator.finish();
    // A level-up in progressive mode may bring a new material: the wave plays after the celebration starts.
    const fromMat = currentMaterial();
    const toMat = tutorial ? fromMat : activeMaterial(this.cfg, this.stats, result.levelAfter);
    const A = this.view.animator;
    A.reduced = this.settings.reducedMotion;
    A.showPoints = !tutorial;
    A.play(result, performance.now(), {
      onLines: (r) => {
        const n = r.rows.length + r.cols.length;
        sfx.clear(n, r.combo);
        sfx.comboUp(r.combo);
        haptic(n >= 4 ? 'quad' : n === 3 ? 'big' : n === 2 ? 'multi' : 'clear');
        if (r.shieldRestored) this.animateShield('restore');
        this.displayedScore = tutorial ? 0 : r.scoreAfter;
        this.updateHud();
        this.setCombo(r.combo, true);
        if (!tutorial) this.affirm(r.rows.length);
        this.celebrate(r, 'lines');
      },
      onWave: (i, wave, r) => {
        sfx.pulse(i, wave.pulses.length);
        haptic(r.chain >= 4 && i === r.waves.length - 1 ? 'majorChain' : i >= 1 || wave.pulses.length > 1 ? 'big' : 'pulse');
        const activated = r.waves.slice(0, i + 1).reduce((s, w) => s + w.pulses.length, 0);
        if (activated >= 2) this.setChain(activated);
        if (i === r.waves.length - 1) this.celebrate(r, 'chain');
      },
      onEnergy: (seg) => { sfx.energy(seg); this.refreshRotateButtons(); this.wake(); },
      onOdMote: () => { sfx.odAbsorb(this.session.state.od?.charge ?? 0); },
      onLevelUp: (r) => this.levelUp(r, fromMat.id !== toMat.id ? this.cfg.materials.find((m) => m.id === toMat.id) ?? null : null),
      onDone: (r) => this.afterResolution(r),
    }, { material: fromMat.id !== toMat.id ? { from: fromMat, to: toMat } : undefined, levelMs: this.dev.levelMs, materialMs: this.dev.materialMs, overdrive: result.odActive });
    if (lines === 0) {
      this.displayedScore = tutorial ? 0 : result.scoreAfter;
      this.updateHud();
      this.setCombo(result.combo, false);
      if (result.comboProtected) {
        // Build 9: the combo indicator itself lights up; the multiplier stays in view.
        this.flash('combo', 'saved');
        sfx.shield(); haptic('shield');
        this.animateShield('used');
        this.tip('shield', 'Combo saved! Clear a line next move to keep it.', 900);
      }
    }
    this.updateOverdriveHud();
    this.refreshRotateButtons();
    this.wake();
    return true;
  }

  private afterResolution(r: MoveResult) {
    this.session.finishResolution();
    this.refreshRotateButtons();
    setTimeout(() => $('chain').classList.remove('on'), 1000);
    if (this.session.state.mode === 'tutorial') {
      const step = TUTORIAL_STEPS[this.tutorialIndex];
      if (step?.outro) this.callout(step.outro.toUpperCase(), 'big', 1100);
      setTimeout(() => this.nextTutorialStep(), (this.settings.reducedMotion ? 350 : 700) + (step?.outro ? 700 : 0));
      return;
    }
    this.flushProgressNotices();
    if (r.levelAfter === r.levelBefore) this.contextTip(r);
    // Overdrive notices come after the move's own celebration.
    // Build 9: Overdrive states live on the meter and the HUD chip, never over the board.
    if (r.odReady) {
      this.view.warmOverdrive();
      sfx.odReady(); haptic('record');
      this.flash('btnOverdrive', 'ping');
      this.tip('od-ready', `Overdrive ready: tap the gold meter for ${this.cfg.overdrive.multiplier}× points.`, 600);
    }
    if (r.odEnded) {
      sfx.odEnd(); music.setIntensity(0);
      this.callout(`OVERDRIVE +${fmt(this.odRunScore)}`, 'od', 1800);
    }
    if (r.odGained > 0 && !r.odReady && !this.firsts.od && r.odChargeAfter >= 10) {
      this.firsts.od = true;
      this.tip('od-meter', 'Clear lines and fire Pulses to charge Overdrive.', 700);
    }
    this.view.odAvailable = r.odAvailable;
    if (r.odAvailable) {
      this.hudTip('No moves left. Tap Overdrive to keep playing.', Infinity);
      this.flash('btnOverdrive', 'ping');
      haptic('invalid');
    }
    if (r.limitReached) this.callout('CHALLENGE COMPLETE', 'daily', 1500);
    this.updateOverdriveHud();
    if (r.gameOver) {
      remove(this.session.state.mode === 'daily' ? KEYS.dailySave : KEYS.save);
      setTimeout(() => this.endGame(), r.limitReached ? 1300 : 650);
    }
  }

  /** Points earned in the current (or just finished) Overdrive activation. */
  private odRunScore = 0;

  /** Line messages when lines clear; chain messages when the last wave lands. Ordinary moves stay quiet. */
  private celebrate(r: MoveResult, phase: 'lines' | 'chain') {
    const lines = r.rows.length + r.cols.length;
    const tutorial = this.session.state.mode === 'tutorial';
    const out: { t: string; k: string }[] = [];
    const add = (t: string, k = '') => out.push({ t, k });
    const mult = this.rules().scoring.comboMultipliers;
    if (phase === 'lines' && r.chain === 0) {
      // Build 10: two or more rows get their affirmation by the score instead (Great! / Excellent! / Amazing!).
      if (tutorial || r.rows.length < 2) {
        if (lines >= 4) add(lines >= 5 ? 'MEGA CLEAR' : 'QUAD CLEAR', 'big');
        else if (lines === 3) add('TRIPLE CLEAR', 'big');
        else if (lines === 2) add('DOUBLE CLEAR');
      }
      // Top multiplier reached (and every move it holds there): 3.0× with the default table.
      if (r.combo === mult.length) add('MASSIVE COMBO ×' + Math.max(...mult).toFixed(1), 'big');
      else if (lines < 2 && r.combo >= 3) add('GREAT MOVE');
    }
    if (phase === 'chain') {
      const c = r.chain;
      add(c >= 5 ? `MASSIVE REACTION ×${c}` : c >= 3 ? `CHAIN REACTION ×${c}` : c === 2 ? 'DOUBLE PULSE' : 'PULSE ACTIVATED', c >= 2 ? 'big' : '');
      if (!tutorial && c >= 2 && c > this.chainRecordAtStart && this.chainRecordAtStart > 0) { add('NEW CHAIN RECORD', 'record'); this.chainRecordAtStart = c; }
      if (c >= 4) sfx.majorChain(c);
    }
    const last = phase === 'chain' || r.chain === 0;
    if (last && !tutorial) {
      // Perfect Board Clear: one combined celebration that leads, with its bonus.
      if (r.perfect) {
        const bonus = Math.round(this.rules().scoring.perfectClear * r.points.multiplier * r.points.overdrive);
        out.unshift({ t: bonus > 0 ? `PERFECT CLEAR +${fmt(bonus)}` : 'PERFECT CLEAR', k: 'perfect' });
        setTimeout(() => { sfx.perfect(); haptic('perfect'); }, 250);
        this.tip('perfect', 'Perfect Clear! An empty board earns a big bonus.', 1800);
      }
      if (!this.celebratedBest && this.bestAtStart > 0 && r.scoreAfter > this.bestAtStart) {
        this.celebratedBest = true;
        add(this.session.state.mode === 'daily' ? 'NEW DAILY BEST' : 'NEW PERSONAL BEST', 'record');
      }
    }
    // Build 9: everything one move earned shares one line in the HUD slot (the Overdrive chip already shows 2×).
    if (!out.length) return;
    const rank = ['', 'big', 'unlock', 'record', 'perfect'];
    const kind = out.reduce((k, m) => (rank.indexOf(m.k) > rank.indexOf(k) ? m.k : k), '');
    if (out.some((m) => m.k === 'record')) { sfx.record(); haptic('record'); }
    this.callout(out.map((m) => m.t).join(' · '), kind, out.length > 1 ? 1900 : 1400);
  }

  // ---------------------------------------------------------------- Build 3 progression

  /** Sets the standard-block material for a level (progressive) or the player's fixed choice. */
  private applyMaterial(level: number) {
    const m = activeMaterial(this.cfg, this.stats, level);
    setMaterial(m);
    if (this.screen === 'game') this.view.warmOverdrive();
    this.materialCss(m);
  }

  /** Interface accents (level bar, unlock banner) follow the current material. */
  private materialCss(m: MaterialDef) {
    const root = document.documentElement.style;
    root.setProperty('--mat', m.color); root.setProperty('--mat-hi', m.highlight); root.setProperty('--mat-lo', m.shadow);
  }

  private pendingNotices: { materials: MaterialDef[]; achievements: AchievementDef[] } = { materials: [], achievements: [] };

  /** Grants newly earned materials and achievements, saves them at once, and queues their notices. */
  private grant(opts: { quiet?: boolean } = {}) {
    const g = grantProgress(this.stats, this.cfg);
    if (!g.newMaterials.length && !g.newAchievements.length) return;
    this.stats = g.stats;
    store(KEYS.stats, JSON.stringify(this.stats));
    for (const m of g.newMaterials) track('material_unlocked', { material: m.id, level: this.session.state.level });
    for (const a of g.newAchievements) track('achievement_unlocked', { id: a.id });
    this.earned.materials.push(...g.newMaterials);
    this.earned.achievements.push(...g.newAchievements);
    this.pendingNotices.materials.push(...g.newMaterials);
    this.pendingNotices.achievements.push(...g.newAchievements);
    if (!opts.quiet) this.flushProgressNotices();
  }

  /** Material unlocks get the message banner; achievements share one quiet toast. */
  private flushProgressNotices() {
    const { materials, achievements } = this.pendingNotices;
    this.pendingNotices = { materials: [], achievements: [] };
    for (const m of materials) {
      this.callout(`NEW MATERIAL · ${m.name.toUpperCase()}`, 'unlock', 2000);
      sfx.unlock(); haptic('unlock');
    }
    if (achievements.length) {
      const n = achievements.length;
      const text = n === 1 ? `Achievement: ${achievements[0].name}` : n === 2 ? `Achievements: ${achievements[0].name} and ${achievements[1].name}`
        : `${n} achievements: ${achievements[0].name}, ${achievements[1].name} and ${n - 2} more`;
      // In a game it waits its turn in the HUD slot; elsewhere (results, menus) it is a toast.
      if (this.screen === 'game' && !this.overlay) this.queueNote(text.toUpperCase(), 'achv', 2200);
      else this.toast(text, 'achv');
      sfx.achievement();
    }
    if (materials.length) this.tip('unlock', 'Unlocked materials stay yours. See Materials.', 2600);
  }

  /** One consolidated celebration, however many levels this move gained. */
  private levelUp(r: MoveResult, newMaterial: MaterialDef | null) {
    // Build 9: the level row in the score area is the celebration: new number and rank, a short gold highlight,
    // and the bar restarting toward the next level. Nothing covers the board, and input stays live.
    this.displayedLevel = r.levelAfter;
    this.updateLevelHud();
    this.flash('levelHud', 'up');
    // A permanent unlock earned by this level-up gets the HUD slot (the material wave shows it on the board).
    const unlocked = this.pendingNotices.materials.splice(0);
    if (unlocked.length) {
      this.callout(`NEW MATERIAL · ${unlocked.map((m) => m.name.toUpperCase()).join(' · ')}`, 'unlock', 2000);
      setTimeout(() => { sfx.unlock(); haptic('unlock'); }, 600);
      this.tip('unlock', 'Unlocked materials stay yours. See Materials.', 4000);
    }
    sfx.levelUp(); haptic('levelup');
    if (r.levelEnergy > 0) setTimeout(() => sfx.recharge(), 420);
    if (newMaterial) { this.materialCss(newMaterial); setTimeout(() => sfx.materialSweep(), 320); track('material_tier_reached', { material: newMaterial.id, level: r.levelAfter }); }
    // Contextual teaching for the first level-up and the first material change.
    if (newMaterial && this.tip('material', `New material: ${newMaterial.name}. No matching needed.`, 2100)) return;
    this.tip('levelup', 'Level up! Energy refills; pieces get tougher.', 1200);
  }

  /** Shows a one-time contextual tip (saved so it never repeats). Returns whether it showed. */
  private tip(id: string, text: string, delay = 0): boolean {
    if (this.session.state.mode === 'tutorial' || this.stats.tipsSeen.includes(id)) return false;
    this.stats = { ...this.stats, tipsSeen: [...this.stats.tipsSeen, id] };
    store(KEYS.stats, JSON.stringify(this.stats));
    // Build 9: tips use the dismissible line in the top bar, outside the board and tray.
    const show = () => {
      // The game ended meanwhile: keep the tip for another time rather than covering the results.
      if (this.overlay || this.screen !== 'game') {
        this.stats = { ...this.stats, tipsSeen: this.stats.tipsSeen.filter((t) => t !== id) };
        store(KEYS.stats, JSON.stringify(this.stats));
        return;
      }
      this.hudTip(text);
    };
    setTimeout(() => show(), delay);
    return true;
  }

  /** After the first line ever: explain the level bar. */
  private contextTip(r: MoveResult) {
    if (this.session.state.mode === 'classic' && r.rows.length + r.cols.length > 0) this.tip('progress', `Points fill the level bar. ${fmt(levelProgress(this.rules().progression, r.scoreAfter).next)} for Level 2.`, 400);
  }

  /** Level row: title, score against the next threshold, a bar relative to this level's own start. */
  private updateLevelHud() {
    const st = this.session.state;
    if (st.mode === 'daily' && st.daily) {
      // Daily: the bar shows placements used of the limit; no levels.
      const used = st.stats.moves, limit = st.daily.limit;
      $('levelNum').textContent = 'DAILY';
      $('levelTitle').textContent = this.dailyDate(st.daily.id, false).toUpperCase();
      $('levelPts').innerHTML = `<b>${used}</b> / ${limit} placements`;
      $('levelLeft').textContent = used >= limit ? 'COMPLETE' : `${limit - used} left`;
      $<HTMLElement>('levelFill').style.width = `${((used / limit) * 100).toFixed(1)}%`;
      const el = $('levelHud');
      el.classList.toggle('near', limit - used <= 3 && used < limit);
      el.classList.remove('full');
      el.setAttribute('aria-label', `Daily Challenge, ${used} of ${limit} placements used.`);
      return;
    }
    const P = this.rules().progression;
    const score = this.displayedScore, level = this.displayedLevel;
    const start = levelThreshold(P, level), next = levelThreshold(P, level + 1);
    // Once the score crosses the threshold the bar holds full until the level-up celebration plays.
    const full = score >= next;
    const fraction = Math.max(0, Math.min(1, (score - start) / Math.max(1, next - start)));
    $('levelNum').textContent = `LEVEL ${level}`;
    $('levelTitle').textContent = levelTitle(P, level).toUpperCase();
    $('levelPts').innerHTML = `<b>${fmt(score)}</b> / ${fmt(next)}`;
    $('levelLeft').textContent = full ? 'LEVEL UP' : `${fmt(next - score)} points to Level ${level + 1}`;
    $<HTMLElement>('levelFill').style.width = `${(fraction * 100).toFixed(1)}%`;
    const el = $('levelHud');
    el.classList.toggle('near', fraction >= 0.8);
    el.classList.toggle('full', full);
    el.setAttribute('aria-label', `Level ${level}, ${levelTitle(P, level)}. ${fmt(score)} of ${fmt(next)} points. ${fmt(Math.max(0, next - score))} to go.`);
  }

  /** The game ended (no legal move, or the Daily placement limit). */
  private endGame() {
    const st = this.session.state;
    this.gamesThisSession++;
    this.stats = recordSessionGames(recordGameEnd(addPlayTime(this.stats, this.unbankedMs), st.score, this.recordCtx(st)), this.gamesThisSession);
    this.unbankedMs = 0;
    store(KEYS.stats, JSON.stringify(this.stats));
    this.lastEndAt = Date.now();
    music.setIntensity(0);
    this.view.odAvailable = false;
    const occupancy = st.board.cells.filter(Boolean).length;
    track('game_ended', { score: st.score, mode: st.mode, ruleset: st.ruleset ?? 2, level: st.level, material: currentMaterial().id, moves: st.stats.moves, lines: st.stats.linesCleared, ms: Math.round(this.elapsedMs), occupancy, energyLeft: st.energy, rotations: st.stats.rotations, overdrives: st.stats.odActivations, perfect: st.stats.perfectClears, gameInSession: this.gamesThisSession });
    track('game_completed', { mode: st.mode, score: st.score, ms: Math.round(this.elapsedMs) });
    if (st.mode === 'daily') { this.dailyOver(); return; }
    this.gameOver();
  }

  /**
   * Build 6 results: the score counts up (ease-out, about 0.9 s; instant with reduced motion). A new record gets the
   * gold treatment and a short burst of crystal sparks around the number.
   */
  private countUp(el: HTMLElement, to: number, record: boolean) {
    const sheet = el.closest('.sheet');
    sheet?.classList.toggle('is-record', record);
    sheet?.querySelectorAll('.res-spark').forEach((n) => n.remove());
    if (this.settings.reducedMotion || to <= 0) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = Math.min(1100, 500 + to / 60);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(to * e));
      if (p < 1) requestAnimationFrame(step);
      else if (record) {
        el.classList.remove('landed'); void el.offsetWidth; el.classList.add('landed');
        const host = el.parentElement!;
        for (let i = 0; i < (this.settings.reducedEffects ? 8 : 18); i++) {
          const sp = document.createElement('i');
          sp.className = 'res-spark';
          const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3, d = 50 + Math.random() * 60;
          sp.style.setProperty('--dx', `${Math.cos(a) * d}px`); sp.style.setProperty('--dy', `${Math.sin(a) * d * 0.6}px`);
          sp.style.left = `${el.offsetLeft + el.offsetWidth / 2}px`; sp.style.top = `${el.offsetTop + el.offsetHeight / 2}px`;
          sp.style.animationDelay = `${Math.random() * 80}ms`;
          host.appendChild(sp);
          setTimeout(() => sp.remove(), 1000);
        }
      }
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  }

  private gameOver() {
    const st = this.session.state;
    const prevBest = this.bestAtStart;
    const legacy = (st.ruleset ?? 2) < 2;
    // Classic ruleset 2 records go to Game Center (best scores only; the queue keeps the best per board).
    if (!legacy) {
      this.submit('classic', st.score);
      this.submit('level', st.level ?? 1);
    }
    if (st.stats.maxChain > 0) this.submit('chain', st.stats.maxChain);
    const newRecord = st.score > prevBest && st.score > 0;
    sfx.gameOver(); haptic(newRecord ? 'record' : 'clear');
    if (newRecord) setTimeout(() => sfx.record(), 500);
    const level = st.level ?? 1;
    const levelRecord = level > this.highestLevelAtStart && level > 1;
    // One highlighted accomplishment: the most significant thing this game did that the headline doesn't already say.
    const kicker = newRecord ? 'NEW PERSONAL BEST' : levelRecord ? 'NEW LEVEL RECORD' : 'GAME OVER';
    const candidates: ([string, string] | false)[] = [
      newRecord && ['NEW PERSONAL BEST', ''],
      levelRecord && ['NEW LEVEL RECORD', ''],
      (st.stats.maxChain >= 4 || this.earned.chainRecord) && ['MASSIVE CHAIN REACTION', ''],
      st.stats.perfectClears > 0 && [st.stats.perfectClears > 1 ? `PERFECT CLEAR ×${st.stats.perfectClears}` : 'PERFECT CLEAR', ''],
      (st.stats.odActivations >= 2 || st.stats.odBestScore >= 5000) && ['OVERDRIVE MASTER', ''],
    ];
    const top = (candidates.filter(Boolean) as [string, string][]).find(([t]) => t !== kicker) ?? null;
    $('resAcc').innerHTML = top ? `<li class="${[top[1], 'top'].join(' ').trim()}">${top[0]}</li>` : '';
    $('resAcc').hidden = !top;
    const P = this.rules(st).progression;
    const title = levelTitle(P, level);
    $('resLevel').innerHTML = `LEVEL <b>${level}</b> — <b>${title.toUpperCase()}</b>${legacy ? ' · BUILD 3 RULES' : ''}`;
    $('resLvl').textContent = String(level);
    $('resLvlBest').textContent = String(this.stats.highestLevel);
    // Build 10: a material unlocked this run is celebrated here; otherwise the next one to aim for.
    const unlocked = this.earned.materials[this.earned.materials.length - 1];
    $('resUnlock').hidden = !unlocked;
    if (unlocked) {
      $('resUnlockName').textContent = `${unlocked.name.toUpperCase()}${this.earned.materials.length > 1 ? ` +${this.earned.materials.length - 1} MORE` : ''}`;
      requestAnimationFrame(() => paintMaterialSwatch($<HTMLCanvasElement>('resUnlockSwatch'), unlocked, false));
    }
    // Newly earned achievements: the most meaningful leads; the rest wait in Achievements.
    const achs = [...this.earned.achievements].sort((a, b) => achievementWeight(b) - achievementWeight(a));
    $('resAch').hidden = !achs.length;
    if (achs.length) {
      $('resAchIco').innerHTML = ACH_ICONS[achs[0].icon];
      $('resAchName').textContent = achs[0].name;
      $('resAchMore').textContent = achs.length > 1 ? `+${achs.length - 1} more in Achievements` : achs[0].description;
    }
    const nm = nextMaterial(this.stats, this.cfg);
    const dailyDone = !!this.daily.days[this.today()]?.completed;
    $('resNext').innerHTML = nm ? `Next unlock · <b>${nm.name} at Level ${nm.minLevel}</b>`
      : `Next: <b>${!dailyDone ? 'Complete the current Daily Challenge' : nextMilestone(this.stats, this.cfg) ?? `Beat your personal best of ${fmt(this.stats.bestScore)}`}</b>`;
    const mat = activeMaterial(this.cfg, this.stats, level);
    const message = this.earned.chainRecord && st.stats.maxChain >= 3 ? 'Can you trigger a bigger chain reaction?'
      : level >= 3 && (levelRecord || level >= 6) ? `I reached Level ${level} in BLOQ.`
      : 'Can you beat my score?';
    this.lastResultInfo = { score: st.score, best: legacy ? this.stats.legacyBestScore : this.stats.bestScore, combo: st.stats.maxCombo, chain: st.stats.maxChain, lines: st.stats.linesCleared, newRecord, level, title, material: mat, message, overdrives: st.stats.odActivations };
    $('resKicker').textContent = kicker;
    $('resKicker').classList.toggle('record', kicker !== 'GAME OVER');
    this.countUp($('resScore'), st.score, newRecord);
    const bestNow = legacy ? this.stats.legacyBestScore : this.stats.bestScore;
    $('resBest').textContent = newRecord ? (prevBest > 0 ? `Previous best ${fmt(prevBest)}` : 'Your first record') : `Personal best ${fmt(bestNow)}${legacy ? ' (Build 3 rules)' : ''}`;
    $('resLines').textContent = fmt(st.stats.linesCleared);
    $('resMaxLines').textContent = st.stats.maxLinesAtOnce ? `${st.stats.maxLinesAtOnce}` : '–';
    const mult = this.rules(st).scoring.comboMultipliers;
    $('resCombo').textContent = st.stats.maxCombo ? `×${mult[Math.min(st.stats.maxCombo, mult.length) - 1].toFixed(1)}` : '–';
    $('resChain').textContent = st.stats.maxChain ? `×${st.stats.maxChain}` : '–';
    $('resOd').textContent = fmt(st.stats.odActivations ?? 0);
    $('resPerfect').textContent = fmt(st.stats.perfectClears ?? 0);
    this.view.fade = 1;
    $('toast').classList.remove('on');
    this.openOverlay('results');
    // After the first finished Classic game, introduce the Daily Challenge once.
    if (!dailyDone && this.stats.gamesPlayed >= 1) this.tipAnywhere('daily-intro', "New: the Daily Challenge. Everyone plays the same board and pieces each day. Find it on the home screen.", 1500);
  }

  /** Records a finished Daily run once, updates streaks, queues the score, and shows the Daily results. */
  private dailyOver() {
    const st = this.session.state;
    const id = st.daily!.id;
    const run = this.dailyRun ?? { id, attempt: this.daily.days[id]?.attempts ?? 1 };
    const summary = { score: st.score, placements: st.stats.moves, lines: st.stats.linesCleared, maxCombo: st.stats.maxCombo, maxChain: st.stats.maxChain, overdrives: st.stats.odActivations, fullRun: st.stats.moves >= st.daily!.limit };
    const up = recordDailyResult(this.daily, id, `${id}#${run.attempt}`, summary);
    this.daily = up.records;
    store(KEYS.dailyRecords, JSON.stringify(this.daily));
    remove(KEYS.dailyRun);
    const today = this.today();
    const sk = streaks(this.daily, today);
    this.stats = syncDaily(this.stats, { completed: sk.completed, current: sk.current, longest: sk.longest, best: sk.best });
    store(KEYS.stats, JSON.stringify(this.stats));
    this.grant();
    if (up.counted) track('daily_completed', { day: id, score: st.score, attempt: run.attempt, first: up.firstCompletion, placements: st.stats.moves, streak: sk.current });
    // Only today's challenge is submitted, and only its best score (dev games never submit).
    if (id === today && up.newBest) this.submit('daily', st.score, id);
    const day = this.daily.days[id];
    sfx.gameOver(); haptic(up.newBest ? 'record' : 'clear');
    if (up.newBest && up.previousBest > 0) setTimeout(() => sfx.record(), 500);
    $('drKicker').textContent = up.newBest && up.previousBest > 0 ? 'NEW DAILY BEST' : summary.fullRun ? 'DAILY CHALLENGE COMPLETE' : 'NO MOVES LEFT';
    $('drDate').textContent = this.dailyDate(id);
    this.countUp($('drScore'), st.score, false);
    $('drBest').textContent = up.newBest && up.previousBest > 0 ? `Previous best ${fmt(up.previousBest)}` : `Best ${fmt(day.best)}`;
    $('drFirst').textContent = day.first !== null && (run.attempt > 1 || !up.firstCompletion) ? `First attempt ${fmt(day.first)} · attempt ${run.attempt}` : 'First attempt';
    $('drPlaced').textContent = `${st.stats.moves}/${st.daily!.limit}`;
    $('drLines').textContent = fmt(st.stats.linesCleared);
    const mult = this.cfg.scoring.comboMultipliers;
    $('drCombo').textContent = st.stats.maxCombo ? `×${mult[Math.min(st.stats.maxCombo, mult.length) - 1].toFixed(1)}` : '–';
    $('drChain').textContent = st.stats.maxChain ? `×${st.stats.maxChain}` : '–';
    $('drOd').textContent = fmt(st.stats.odActivations);
    $('drDone').textContent = `${Math.round((st.stats.moves / st.daily!.limit) * 100)}%`;
    $('drStreak').textContent = `${sk.current} day${sk.current === 1 ? '' : 's'}`;
    $('drRank').textContent = '–';
    $('drNext').innerHTML = `Next challenge in <b>${fmtCountdown(this.msToNext())}</b>`;
    // The share card shows the challenge's local date.
    this.lastDailyInfo = { day: this.labelOf(id), score: st.score, rank: null, streak: sk.current, message: up.newBest && up.previousBest > 0 ? 'Can you beat my daily score?' : "Today's BLOQ challenge is complete.", material: currentMaterial() };
    this.view.fade = 1;
    $('toast').classList.remove('on');
    this.openOverlay('dailyResults');
    // A rank is shown only if Game Center actually returns one.
    if (id === today && gameCenterSupported()) {
      this.flushGameCenter().then(() => loadBoard('daily')).then((b) => {
        const rank = b?.player?.rank;
        if (rank && this.overlay === 'dailyResults') {
          $('drRank').textContent = `#${fmt(rank)}`;
          if (this.lastDailyInfo) this.lastDailyInfo.rank = rank;
        }
      });
    }
  }

  // ---------------------------------------------------------------- Build 4 Game Center

  /** Queues a score (best per board, today's only for the Daily) and tries to send the queue. Dev games never submit. */
  private submit(board: LeaderboardKey, score: number, day?: string) {
    const st = this.session.state;
    if (st.dev || st.mode === 'tutorial' || !(score > 0)) return;
    this.gcQueue = queueSubmission(this.gcQueue, { board, score, day, t: Date.now() });
    store(KEYS.gcQueue, JSON.stringify(this.gcQueue));
    this.flushGameCenter();
  }

  private async flushGameCenter() {
    this.gcQueue = pruneExpired(this.gcQueue, this.today());
    store(KEYS.gcQueue, JSON.stringify(this.gcQueue));
    if (!gameCenterSupported() || !this.gcQueue.length) return;
    this.gcQueue = await flushQueue(this.gcQueue, this.today());
    store(KEYS.gcQueue, JSON.stringify(this.gcQueue));
  }

  private openRankings(board: LeaderboardKey = this.rankBoard) {
    this.rankBoard = board;
    track('leaderboard_viewed', { board, gameCenter: gameCenterSupported() });
    this.renderRankings();
    if (this.overlay !== 'rankings') this.openOverlay('rankings');
  }

  /** Game Center entries when they can be retrieved; otherwise the player's own records, clearly labelled. */
  private renderRankings() {
    const key = this.rankBoard;
    document.querySelectorAll<HTMLButtonElement>('#rankings .seg-btn').forEach((b) => {
      const on = b.dataset.board === key;
      b.setAttribute('aria-checked', String(on)); b.setAttribute('aria-selected', String(on));
    });
    $('btnGameCenter').hidden = !gameCenterSupported();
    const personal = (): string => {
      const s = this.stats;
      const today = this.today();
      const days = Object.entries(this.daily.days).filter(([, d]) => d.completed).sort((a, b) => b[1].best - a[1].best).slice(0, 8);
      const rows: [string, string][] = key === 'classic' ? [['Personal best', fmt(s.bestScore)], ...(s.legacyBestScore ? [['Build 3 rules best', fmt(s.legacyBestScore)] as [string, string]] : [])]
        : key === 'level' ? [['Highest level', `${s.highestLevel} · ${levelTitle(this.cfg.progression, s.highestLevel)}`]]
        : key === 'chain' ? [['Largest chain', s.maxChain ? `×${s.maxChain}` : '–'], ['Largest in Overdrive', s.odMaxChain ? `×${s.odMaxChain}` : '–']]
        : [[this.dailyIsLocalToday() ? "Today's best" : 'Current challenge best', this.daily.days[today]?.completed ? fmt(this.daily.days[today].best) : 'Not played yet'], ...days.map(([id, d]) => [this.dailyDate(id), fmt(d.best)] as [string, string])];
      return rows.map(([k, v], i) => `<li class="${i === 0 ? 'me' : ''}"><span class="rk">${i === 0 ? '★' : ''}</span><span>${k}</span><span class="sc">${v}</span></li>`).join('');
    };
    $('rankList').innerHTML = personal();
    $('rankNote').textContent = gameCenterSupported() ? 'Connecting to Game Center…' : 'Game Center is not available here. Showing your personal records.';
    if (!gameCenterSupported()) return;
    loadBoard(key).then((b) => {
      if (this.overlay !== 'rankings' || this.rankBoard !== key) return;
      if (!b || !b.entries.length) { $('rankNote').textContent = b ? 'No scores on this leaderboard yet. Showing your personal records.' : 'Game Center unavailable right now. Showing your personal records.'; return; }
      $('rankNote').textContent = `${LEADERBOARDS[key].name} · Game Center`;
      const meRank = b.player?.rank;
      $('rankList').innerHTML = b.entries.map((e) => `<li class="${e.rank === meRank ? 'me' : ''}"><span class="rk">#${e.rank}</span><span>${e.name}</span><span class="sc">${fmt(e.score)}</span></li>`).join('')
        + (b.player && !b.entries.some((e) => e.rank === meRank) ? `<li class="me"><span class="rk">#${b.player.rank}</span><span>You</span><span class="sc">${fmt(b.player.score)}</span></li>` : '');
    });
  }

  // ---------------------------------------------------------------- Build 4 Overdrive and Combo Protection

  private activateOverdrive() {
    if (this.overlay || this.view.drag || this.editMode || this.screen !== 'game') return;
    const st0 = this.session.state;
    if (st0.mode === 'tutorial' || !this.cfg.overdrive.enabled) return;
    if (this.view.animator.busy) return;
    const st = this.session.tryActivateOverdrive();
    if (!st) {
      if (this.session.lastRejection === 'not-charged') {
        this.view.odPulse = performance.now();
        if (!this.tip('od-meter', 'Clear lines and fire Pulses to charge Overdrive.')) this.callout(`OVERDRIVE ${Math.floor(st0.od?.charge ?? 0)}% CHARGED`, '', 1400);
        this.wake();
      }
      return;
    }
    const O = this.cfg.overdrive;
    this.odRunScore = 0;
    this.view.odAvailable = false;
    this.view.animator.reduced = this.settings.reducedMotion;
    this.view.animator.overdrive(performance.now());
    sfx.odActivate(); haptic('overdrive'); music.setIntensity(1);
    // Build 9: the gold frame and the live HUD chip (2× POINTS · 5 LEFT) announce it; the board stays clear.
    if (this.noteTip?.left === Infinity) this.dismissTip();
    this.tip('od-active', `Overdrive: ${O.multiplier}× points${this.odBenefit() ? ` and ${this.odBenefit().toLowerCase()}` : ''}, ${O.duration} moves.`, 300);
    this.stats = recordOverdriveActivation(this.stats);
    this.grant();
    this.persist();
    track('overdrive_activated', { placements: st.stats.moves, score: st.score, ms: Math.round(this.elapsedMs), mode: st.mode, rescue: !!overState({ ...st0, od: st0.od }, this.cfg).odAvailable });
    this.updateOverdriveHud();
    this.refreshRotateButtons();
    this.wake();
  }

  /** The rotation benefit while Overdrive is active, as a short label. */
  private odBenefit(): string {
    const O = this.cfg.overdrive;
    return O.rotation === 'free' ? 'FREE ROTATIONS' : O.rotation === 'limited' ? `${O.limitedFree} FREE ROTATIONS` : O.rotation === 'reduced' ? 'CHEAPER ROTATIONS' : '';
  }

  /** Compact HUD while Overdrive runs, and the activation control's state. */
  private updateOverdriveHud() {
    const st = this.session.state;
    const od = st.od;
    const hud = $('odHud');
    const active = !!od && od.active > 0 && st.mode !== 'tutorial';
    if (active && hud.hidden) requestAnimationFrame(() => this.flash('odHud', 'in'));
    hud.hidden = !active;
    document.getElementById('app')?.classList.toggle('od', active);
    if (active) {
      const benefit = this.cfg.overdrive.rotation === 'free' ? 'FREE TURNS' : this.cfg.overdrive.rotation === 'limited' ? `${od!.freeLeft} FREE TURNS` : this.cfg.overdrive.rotation === 'reduced' ? 'CHEAPER TURNS' : '';
      // Compact: the rotation benefit shows on the energy meter itself (FREE TURNS).
      hud.textContent = `${this.cfg.overdrive.multiplier}× POINTS · ${od!.active} LEFT`;
      hud.classList.toggle('last', od!.active === 1);
      hud.setAttribute('aria-label', `Overdrive active. ${this.cfg.overdrive.multiplier} times points${benefit ? `, ${benefit.toLowerCase()}` : ''}. ${od!.active} placement${od!.active === 1 ? '' : 's'} remaining.`);
    }
    const b = $<HTMLButtonElement>('btnOverdrive');
    const show = !!od && st.mode !== 'tutorial' && this.cfg.overdrive.enabled && !!this.view.layout;
    b.hidden = !show;
    if (!show) return;
    const r = this.view.odRect();
    b.style.left = `${r.x}px`; b.style.top = `${r.y}px`; b.style.width = `${r.w}px`; b.style.height = `${r.h}px`;
    const ready = od!.active === 0 && od!.charge >= 100;
    b.classList.toggle('ready', ready);
    b.setAttribute('aria-label', active ? `Overdrive active, ${od!.active} placements left` : ready ? 'Overdrive ready. Activate Overdrive' : `Overdrive ${Math.floor(od!.charge)} percent charged`);
    b.setAttribute('aria-disabled', String(!ready));
  }

  private animateShield(kind: 'restore' | 'used') {
    const el = $('comboShield');
    el.classList.remove('restore', 'used'); void el.offsetWidth; el.classList.add(kind);
    if (kind === 'restore') sfx.shieldRestore();
  }

  /** A one-time tip that may show over the results screen (not tied to a running game). */
  private tipAnywhere(id: string, text: string, delay = 0) {
    if (this.stats.tipsSeen.includes(id)) return;
    this.stats = { ...this.stats, tipsSeen: [...this.stats.tipsSeen, id] };
    store(KEYS.stats, JSON.stringify(this.stats));
    setTimeout(() => this.toast(text, 'tip'), delay);
  }

  /** Saves after placements, rotations, Overdrive activation, level-ups and grants. Classic and Daily saves are separate. */
  private persist() {
    const st = this.session.state;
    if (st.mode === 'tutorial') return;
    if (this.unbankedMs > 0) { this.stats = addPlayTime(this.stats, this.unbankedMs); this.unbankedMs = 0; }
    store(KEYS.stats, JSON.stringify(this.stats));
    const key = st.mode === 'daily' ? KEYS.dailySave : KEYS.save;
    if (st.over) remove(key);
    else store(key, serializeGame(st, this.elapsedMs, this.bestAtStart));
    if (st.mode === 'daily' && this.dailyRun) store(KEYS.dailyRun, JSON.stringify(this.dailyRun));
  }

  // ---------------------------------------------------------------- tutorial

  private startTutorial() {
    track('tutorial_started');
    this.view.animator.finish();
    this.clearNotes();
    this.tutorialIndex = -1;
    $('btnSkip').hidden = false;
    $('btnGameSettings').hidden = true;
    $('game').classList.add('tut-mode');
    setMaterial(this.cfg.materials[0]);
    this.displayedScore = 0;
    this.updateHud(true);
    this.setCombo(0, false);
    this.show('game');
    this.nextTutorialStep();
  }

  private nextTutorialStep() {
    if (this.screen !== 'game' || this.tutorialIndex < -1) return;
    this.tutorialIndex++;
    if (this.tutorialIndex >= TUTORIAL_STEPS.length) { this.finishTutorial(false); return; }
    const step = TUTORIAL_STEPS[this.tutorialIndex];
    this.session = new GameSession(tutorialState(step), this.cfg);
    this.session.requiredTarget = step.target;
    this.session.rotationAllowed = !!step.rotate;
    this.view.tutorialTarget = step.target;
    $('tutorial').hidden = false;
    $('tutStep').textContent = `STEP ${this.tutorialIndex + 1} OF ${TUTORIAL_STEPS.length}`;
    $('tutTitle').textContent = step.title;
    $('tutHint').textContent = step.hint;
    this.layoutGame();
    this.wake();
  }

  private finishTutorial(skipped: boolean) {
    store(KEYS.tutorialDone, '1');
    track(skipped ? 'tutorial_skipped' : 'tutorial_completed');
    this.startClassic();
    if (!skipped) this.callout("YOU'RE READY", 'big', 1400);
  }

  // ---------------------------------------------------------------- HUD

  private updateHud(instant = false) {
    const scoreEl = $('score');
    const target = this.displayedScore;
    const cur = Number(scoreEl.dataset.v ?? 0);
    if (instant || this.settings.reducedMotion || target <= cur) {
      scoreEl.dataset.v = String(target);
      scoreEl.textContent = fmt(target);
    } else {
      const start = performance.now(), from = cur, dur = Math.min(550, 180 + (target - from) * 0.6);
      const step = (now: number) => {
        if (scoreEl.dataset.v !== String(target)) return;
        const t = Math.min(1, (now - start) / dur);
        scoreEl.textContent = fmt(Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3))));
        if (t < 1) requestAnimationFrame(step);
      };
      scoreEl.dataset.v = String(target);
      requestAnimationFrame(step);
      if (target - from >= 100) { scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump'); }
    }
    scoreEl.setAttribute('aria-label', `Current score ${target}`);
    const st = this.session.state;
    const live = st.mode === 'tutorial' ? 0 : st.score;
    // Daily shows the day's best; a ruleset 1 game shows the labelled legacy record; Classic the ruleset 2 record.
    const record = st.mode === 'daily' ? this.bestAtStart : (st.ruleset ?? 2) < 2 ? this.stats.legacyBestScore : this.stats.bestScore;
    $('bestLabel').textContent = st.mode === 'daily' ? 'DAILY BEST' : (st.ruleset ?? 2) < 2 ? 'BEST (BUILD 3 RULES)' : 'PERSONAL BEST';
    const best = Math.max(record, live);
    $('best').textContent = fmt(best);
    $('best').classList.toggle('record', live > 0 && live >= this.bestAtStart && live === best && this.bestAtStart > 0);
    this.updateLevelHud();
  }

  private setCombo(combo: number, animate: boolean) {
    const el = $('combo');
    const m = this.cfg.scoring.comboMultipliers;
    const mult = combo > 0 ? m[Math.min(combo, m.length) - 1] : 1;
    $('comboMult').textContent = `×${mult.toFixed(1)}`;
    el.classList.toggle('on', combo >= 1);
    el.setAttribute('aria-label', `Combo multiplier ${mult.toFixed(1)}`);
    [...$('comboMeter').children].forEach((seg, i) => seg.classList.toggle('lit', i < Math.min(combo, m.length)));
    // Combo Protection: lit while it can save the combo, dim once spent (restored by the next clear).
    const st = this.session.state;
    const shieldOn = this.cfg.combo.protection > 0 && st.mode !== 'tutorial';
    const sh = $('comboShield');
    sh.hidden = !shieldOn;
    const spent = (st.shield ?? 0) <= 0;
    sh.classList.toggle('spent', spent);
    sh.setAttribute('aria-label', combo > 0 ? (spent ? 'Combo Protection used: the next move must clear a line' : 'Combo Protection ready') : 'Combo Protection');
    if (animate && combo >= 2) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }

  private setChain(n: number) {
    const el = $('chain');
    $('chainValue').textContent = `×${n}`;
    el.classList.add('on');
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  /**
   * Build 10: one short affirmation by the score for rows cleared by a single placement (columns keep their own
   * feedback). Fixed in place, it never moves the HUD; a new qualifying clear replaces one still showing.
   */
  private affirm(rows: number) {
    if (rows < 2) return;
    const el = $('affirm');
    const [text, kind] = rows >= 4 ? ['Amazing!', 'amazing'] : rows === 3 ? ['Excellent!', 'excellent'] : ['Great!', 'great'];
    el.textContent = text;
    el.className = 'affirm';
    void el.offsetWidth;
    el.className = `affirm on ${kind}`;
    clearTimeout(this.affirmTimer);
    this.affirmTimer = window.setTimeout(() => { el.className = 'affirm'; }, 1300);
  }
  private affirmTimer = 0;

  /** Restarts a short CSS highlight on an element (class removed and re-added). */
  private flash(id: string, cls: string) {
    const el = $(id);
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  }

  /**
   * Build 9 HUD note. One fixed slot in the top bar (where the small logo sits) carries a move's callout, queued
   * notices and first-use tips, so nothing ever covers the board or tray or moves them. A new callout replaces the
   * current one at once (no backlog of late pop-ups); a tip steps aside for a callout and comes back afterwards.
   */
  private callout(text: string, kind = '', ms = 1400) {
    const now = performance.now();
    // Two notices from the same instant share one line.
    if (this.note && now - this.note.at < 150 && this.note.until > now && this.note.text !== text) text = `${this.note.text} · ${text}`;
    this.pauseTip(now);
    this.note = { text, kind, at: now, until: now + ms };
    this.renderNote();
  }

  /** A notice that waits for the slot (achievements), instead of replacing a move callout. */
  private queueNote(text: string, kind: string, ms: number) {
    if (this.note && this.note.until > performance.now()) { this.noteQueue.push({ text, kind, ms }); return; }
    this.callout(text, kind, ms);
  }

  /** A short, dismissible line. Shows for about seven seconds of visible time (Infinity: until dismissed). */
  private hudTip(text: string, ms = 7000) {
    this.noteTip = { text, left: ms };
    this.tipShownAt = 0;
    this.renderNote();
  }

  private dismissTip() {
    this.noteTip = null;
    this.tipShownAt = 0;
    this.renderNote();
  }

  private pauseTip(now: number) {
    if (this.noteTip && this.tipShownAt) { this.noteTip.left -= now - this.tipShownAt; this.tipShownAt = 0; }
  }

  private clearNotes() {
    this.note = null; this.noteQueue = []; this.noteTip = null; this.tipShownAt = 0;
    this.renderNote();
  }

  private renderNote() {
    const el = $('hudNote'), txt = $('hudNoteText');
    if (this.noteTimer) { clearTimeout(this.noteTimer); this.noteTimer = null; }
    const now = performance.now();
    if (this.note && this.note.until <= now) this.note = null;
    if (!this.note && this.noteQueue.length) {
      const q = this.noteQueue.shift()!;
      this.note = { text: q.text, kind: q.kind, at: now, until: now + q.ms };
    }
    const set = (cls: string, text: string) => {
      txt.textContent = text;
      el.className = `hud-note on ${cls}`;
      el.closest('.nav-top')?.classList.add('noting');
    };
    if (this.note) {
      set(`callout ${this.note.kind}`, this.note.text);
      this.noteTimer = setTimeout(() => this.renderNote(), this.note.until - now);
      return;
    }
    if (this.noteTip && this.noteTip.left > 0) {
      set('tip', this.noteTip.text);
      if (!this.tipShownAt) this.tipShownAt = now;
      if (Number.isFinite(this.noteTip.left)) {
        const end = this.tipShownAt + this.noteTip.left;
        this.noteTimer = setTimeout(() => { if (this.noteTip && performance.now() >= end - 5) this.noteTip = null; this.tipShownAt = 0; this.renderNote(); }, Math.max(0, end - now));
      }
      return;
    }
    this.noteTip = null;
    el.className = 'hud-note';
    el.closest('.nav-top')?.classList.remove('noting');
  }

  private toast(text: string, kind = '') {
    const el = $('toast');
    el.textContent = text;
    el.className = `toast on ${kind}`;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('on'), kind === 'tip' ? 4200 : 3200);
  }

  /** Rotate buttons sit on the bottom edge of each tray slot; their state follows energy and playability. */
  private refreshRotateButtons() {
    if (!this.view.layout) return;
    const st = this.session.state;
    const eff = effectiveRotation(this.cfg, st);
    const rc = eff.rc;
    const odFree = !!st.od?.active && this.cfg.rotation.mode === 'energy' && rc.mode === 'unlimited';
    const step = st.mode === 'tutorial' ? TUTORIAL_STEPS[this.tutorialIndex] : null;
    this.rotateBtns.forEach((b, slot) => {
      const piece = st.tray[slot];
      const hiddenByTutorial = st.mode === 'tutorial' && (!step?.rotate || this.view.tutorialTarget?.slot !== slot);
      b.hidden = !piece || rc.mode === 'none' || hiddenByTutorial || st.over;
      if (b.hidden || !piece) return;
      const pos = this.view.rotateButtonCenter(slot);
      b.style.left = `${pos.x}px`; b.style.top = `${pos.y}px`;
      const cost = rotationCost(rc, piece);
      const affordable = rc.mode !== 'energy' || cost <= eff.energy;
      b.classList.toggle('off', !affordable);
      b.classList.toggle('free', affordable && cost === 0 && rc.mode === 'energy');
      b.classList.toggle('odfree', odFree);
      const play = this.view.playabilityOf(slot);
      b.classList.toggle('hint', affordable && play === 'after-rotation' && !this.view.animator.busy && st.mode === 'classic');
      b.classList.toggle('tut', !!step?.rotate && (piece.rot ?? 0) !== (step.target.rot ?? 0));
      b.setAttribute('aria-label', `Rotate piece ${slot + 1}${odFree ? ' (free during Overdrive)' : rc.mode !== 'energy' ? '' : cost === 0 ? ' (free, looks the same)' : affordable ? `, uses ${cost} energy` : ', no energy left'}`);
      b.setAttribute('aria-disabled', String(!affordable));
    });
  }

  // ---------------------------------------------------------------- loop

  private wake() {
    if (!this.raf) { this.lastFrame = performance.now(); this.raf = requestAnimationFrame(this.frame); }
  }

  private frame = (now: number) => {
    this.raf = 0;
    const dt = Math.min(250, now - this.lastFrame);
    this.lastFrame = now;
    let keepGoing = false;
    if (this.screen === 'game') {
      const st = this.session.state;
      if (st.mode !== 'tutorial' && !st.over && !this.overlay && document.visibilityState === 'visible') {
        this.elapsedMs += dt; this.unbankedMs += dt;
        keepGoing = true;
      }
      const wasActive = this.view.animator.active;
      this.view.animator.update(now, dt);
      this.view.render(now);
      if (wasActive && !this.view.animator.active) this.refreshRotateButtons();
      keepGoing = keepGoing || this.view.needsFrames;
    } else if (this.screen === 'home') {
      paintHomeArt($<HTMLCanvasElement>('homeArt'), now, this.settings.reducedMotion);
      keepGoing = !this.settings.reducedMotion && !this.overlay;
    }
    if (keepGoing) this.raf = requestAnimationFrame(this.frame);
  };

  // ---------------------------------------------------------------- settings

  private applySettings() {
    const s = this.settings;
    setSoundEnabled(s.sound);
    setSfxVolume(s.sfxVolume);
    setMusicVolume(s.musicVolume);
    setMusicEnabled(s.music);
    setHapticsEnabled(s.haptics);
    setHighContrast(s.highContrast);
    this.view.reduced = s.reducedMotion;
    this.view.animator.reduced = s.reducedMotion;
    this.view.lowFx = s.reducedEffects;
    this.view.animator.lowFx = s.reducedEffects;
    document.documentElement.classList.toggle('reduced', s.reducedMotion);
    document.documentElement.classList.toggle('contrast', s.highContrast);
    $<HTMLInputElement>('setSound').checked = s.sound;
    $<HTMLInputElement>('setHaptics').checked = s.haptics;
    $<HTMLInputElement>('setMotion').checked = s.reducedMotion;
    $<HTMLInputElement>('setContrast').checked = s.highContrast;
    $<HTMLInputElement>('setEffects').checked = s.reducedEffects;
    $<HTMLInputElement>('setMusic').checked = s.music;
    $<HTMLInputElement>('setSfxVol').value = String(s.sfxVolume);
    $<HTMLInputElement>('setMusicVol').value = String(s.musicVolume);
    $<HTMLInputElement>('setSfxVol').disabled = !s.sound;
    $<HTMLInputElement>('setMusicVol').disabled = !s.music;
    if (this.screen === 'game') this.view.resize();
    this.wake();
  }

  private renderStats() {
    const s = this.stats;
    const rows: [string, string][] = [
      ['Personal best', fmt(s.bestScore)],
      ...(s.legacyBestScore ? [['Best, Build 3 rules', fmt(s.legacyBestScore)] as [string, string]] : []),
      ['Highest level', `${s.highestLevel} · ${levelTitle(this.cfg.progression, s.highestLevel)}`],
      ['Overdrives', fmt(s.odActivations)],
      ['Best Overdrive', s.odBestScore ? fmt(s.odBestScore) : '–'],
      ['Largest Overdrive clear', s.odMaxLines ? `${s.odMaxLines} line${s.odMaxLines === 1 ? '' : 's'}` : '–'],
      ['Free rotations used', fmt(s.odFreeRotations)],
      ['Perfect clears', fmt(s.perfectClears)],
      ['Combos protected', fmt(s.comboProtected)],
      ['Daily completed', fmt(s.dailyCompleted)],
      ['Current streak', `${streaks(this.daily, this.today()).current}`],
      ['Longest streak', fmt(s.longestStreak)],
      ['Best daily', s.bestDaily ? fmt(s.bestDaily) : '–'],
      ['Lifetime points', fmt(s.lifetimePoints)],
      ['Materials unlocked', `${s.unlockedMaterials.length} / ${this.cfg.materials.length}`],
      ['Games played', fmt(s.gamesPlayed)],
      ['Average score', fmt(averageScore(s))],
      ['Average game', fmtTime(averageSessionMs(s))],
      ['Lines cleared', fmt(s.totalLines)],
      ['Largest clear', fmt(s.maxLinesAtOnce)],
      ['Longest combo', s.maxCombo ? `${s.maxCombo} move${s.maxCombo === 1 ? '' : 's'}` : '–'],
      ['Biggest chain', s.maxChain ? `×${s.maxChain}` : '–'],
      ['Pulses activated', fmt(s.totalPulses)],
      ['Rotations', fmt(s.totalRotations)],
      ['Rotations per game', `${averageRotations(s)}`],
      ['Energy earned / spent', `${fmt(s.energyEarned)} / ${fmt(s.energySpent)}`],
      ['Most games in a row', fmt(Math.max(s.maxGamesInSession, this.gamesThisSession))],
      ['Time played', fmtTime(s.totalPlayMs + this.unbankedMs)],
      ['Days played', fmt(s.days.length)],
    ];
    $('statGrid').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    this.renderAchievements();
  }

  private statsTab(which: 'stats' | 'ach') {
    const a = which === 'ach';
    $('tabStats').classList.toggle('on', !a); $('tabStats').setAttribute('aria-selected', String(!a));
    $('tabAch').classList.toggle('on', a); $('tabAch').setAttribute('aria-selected', String(a));
    $('statsPane').hidden = a; $('achPane').hidden = !a;
  }

  private renderAchievements() {
    const s = this.stats;
    let done = 0;
    $('achList').innerHTML = achievementsInOrder().map((a) => {
      const p = achievementProgress(a, s, this.cfg);
      if (p.done) done++;
      const pct = p.done ? 100 : Math.round((p.value / p.target) * 100);
      const status = p.done ? 'DONE' : a.target > 1 ? `${a.target >= 10000 ? fmt(p.value) : p.value} / ${fmt(a.target)}${a.unit ? ` <small>${a.unit}</small>` : ''}` : '';
      return `<li class="ach${p.done ? ' done' : ''}"><span class="ico">${ACH_ICONS[a.icon]}</span>`
        + `<div><div class="nm">${a.name}</div><div class="ds">${a.description}</div>${p.done ? '' : `<div class="pg"><i style="width:${pct}%"></i></div>`}</div>`
        + `<span class="st">${status}</span></li>`;
    }).join('');
    $('achCount').textContent = `${done}/${ACHIEVEMENTS.length}`;
  }

  /** Materials: Progressive follows the level; Fixed uses any unlocked material. Selections save at once. */
  private renderMaterials() {
    const s = this.stats;
    const fixed = s.materialMode === 'fixed';
    $('matProgressive').setAttribute('aria-checked', String(!fixed));
    $('matFixed').setAttribute('aria-checked', String(fixed));
    $('matNote').textContent = fixed
      ? 'Your chosen material is used at every level. Pulse Blocks always stay cyan.'
      : 'Blocks evolve with your level in every game. Reach new levels to unlock materials for good.';
    const list = $('matList');
    list.innerHTML = '';
    for (const m of this.cfg.materials) {
      const unlocked = s.unlockedMaterials.includes(m.id);
      const selected = fixed && s.fixedMaterial === m.id;
      const li = document.createElement('li');
      li.className = `mat${unlocked ? '' : ' locked'}${selected ? ' sel' : ''}`;
      const cv = document.createElement('canvas');
      li.appendChild(cv);
      const range = this.materialRange(m);
      li.insertAdjacentHTML('beforeend', `<div><div class="nm">${m.name}</div><div class="ds">${unlocked ? `Levels ${range}` : `Reach Level ${m.minLevel} to unlock`}</div></div>`);
      const b = document.createElement('button');
      b.textContent = !unlocked ? 'LOCKED' : selected ? 'IN USE' : 'USE';
      b.disabled = !unlocked;
      b.setAttribute('aria-pressed', String(selected));
      b.setAttribute('aria-label', unlocked ? `Use ${m.name}` : `${m.name}, locked. Reach Level ${m.minLevel}.`);
      b.addEventListener('click', () => this.selectMaterial('fixed', m.id));
      li.appendChild(b);
      list.appendChild(li);
      requestAnimationFrame(() => paintMaterialSwatch(cv, m, !unlocked));
    }
  }

  private materialRange(m: MaterialDef): string {
    const mats = this.cfg.materials, i = mats.indexOf(m);
    const next = mats[i + 1];
    return next ? (next.minLevel - 1 > m.minLevel ? `${m.minLevel}–${next.minLevel - 1}` : `${m.minLevel}`) : `${m.minLevel}+`;
  }

  private selectMaterial(mode: 'progressive' | 'fixed', id?: string) {
    const s = this.stats;
    const fixedMaterial = id ?? (s.unlockedMaterials.includes(s.fixedMaterial) ? s.fixedMaterial : s.unlockedMaterials[s.unlockedMaterials.length - 1]);
    this.stats = { ...s, materialMode: mode, fixedMaterial };
    store(KEYS.stats, JSON.stringify(this.stats));
    track('material_selected', { mode, material: mode === 'fixed' ? fixedMaterial : 'progressive' });
    haptic('select'); sfx.select();
    this.renderMaterials();
    this.applyMaterial(this.screen === 'game' ? this.session.state.level ?? 1 : this.stats.highestLevel);
    this.wake();
  }

  // ---------------------------------------------------------------- dev tools (never in release builds)

  private loadDev() {
    if (__RELEASE__) return;
    try { this.dev = { ...defaultDev(), ...JSON.parse(load(DEV_KEY) ?? '{}') }; } catch { this.dev = defaultDev(); }
    this.applyDev();
  }

  private applyDev() {
    const d = this.dev, r = this.cfg.rotation;
    r.mode = d.rotationMode; r.startCharges = d.startCharges; r.maxCharges = Math.max(1, d.maxCharges);
    r.cost = d.cost; r.energyPerLine = d.energyPerLine;
    this.cfg.generation.pulseChance = d.pulseChance;
    // Advanced overrides replace whole sections; anything not overridden returns to the defaults.
    for (const k of ADVANCED_KEYS) {
      (this.cfg as unknown as Record<string, unknown>)[k] = structuredClone(d.advanced[k] ?? DEFAULT_CONFIG[k]);
    }
    this.cfg.progression.levelUpEnergy = d.levelUpEnergy;
    this.cfg.combo = { protection: d.protection };
    this.cfg.overdrive = { ...this.cfg.overdrive, duration: d.odDuration, multiplier: d.odMultiplier, rotation: d.odRotation };
    if (this.view) this.syncViewConfig();
    setVisualParams(d.visuals);
    if (this.view) {
      this.view.animator.speed = d.clearMs / 340;
      this.view.animator.particleScale = { low: 0.5, medium: 1, high: 1.6 }[d.particles];
    }
    setHapticIntensity(d.haptic);
  }

  private saveDev() {
    if (__RELEASE__) return;
    store(DEV_KEY, JSON.stringify(this.dev)); this.applyDev(); this.refreshRotateButtons(); this.wake();
  }

  private editCell(r: number, c: number) {
    if (__RELEASE__) return;
    const st = this.session.state;
    const board = { size: st.board.size, cells: st.board.cells.slice() };
    const k = r * 8 + c, cur = board.cells[k];
    board.cells[k] = !cur ? { color: 0 } : !cur.pulse ? { color: 0, pulse: true } : null;
    const next = { ...st, board };
    next.over = stateIsOver(next, this.cfg);
    this.session.state = next;
    this.persist();
  }

  private setupDev() {
    if (__RELEASE__) { document.getElementById('devSection')?.remove(); document.getElementById('devBanner')?.remove(); return; }
    $('devSection').hidden = !this.devEnabled;
    if (!this.devEnabled) return;
    const sel = $<HTMLSelectElement>('devScenario');
    if (!sel.options.length) {
      const groups = [...new Set(SCENARIOS.map((s) => s.group ?? ''))];
      sel.innerHTML = groups.map((g) => `<optgroup label="${g}">${SCENARIOS.map((s, i) => (s.group ?? '') === g ? `<option value="${i}">${s.name}</option>` : '').join('')}</optgroup>`).join('');
    }
    const d = this.dev;
    $<HTMLSelectElement>('devRotMode').value = d.rotationMode;
    $<HTMLInputElement>('devStart').value = String(d.startCharges);
    $<HTMLInputElement>('devMax').value = String(d.maxCharges);
    $<HTMLInputElement>('devCost').value = String(d.cost);
    $<HTMLInputElement>('devPerLine').value = String(d.energyPerLine);
    $<HTMLInputElement>('devPulse').value = String(d.pulseChance);
    $('devPulseOut').textContent = `${Math.round(d.pulseChance * 100)}%`;
    $<HTMLInputElement>('devClear').value = String(d.clearMs);
    $('devClearOut').textContent = `${d.clearMs} ms`;
    $<HTMLSelectElement>('devParticles').value = d.particles;
    $<HTMLSelectElement>('devHaptic').value = d.haptic;
    $<HTMLSelectElement>('devLevelEnergy').value = d.levelUpEnergy;
    const range = (id: string, v: number, label: string) => { $<HTMLInputElement>(id).value = String(v); $(`${id}Out`).textContent = label; };
    range('devLevelMs', d.levelMs, `${d.levelMs} ms`);
    range('devMatMs', d.materialMs, `${d.materialMs} ms`);
    range('devBright', d.visuals.brightness, d.visuals.brightness.toFixed(2));
    range('devRefl', d.visuals.reflectivity, d.visuals.reflectivity.toFixed(1));
    range('devEdge', d.visuals.edge, d.visuals.edge.toFixed(1));
    range('devGlow', d.visuals.pulseGlow, d.visuals.pulseGlow.toFixed(1));
    range('devWave', d.visuals.wave, d.visuals.wave.toFixed(1));
    const v = { ...DEFAULT_VISUALS, ...d.visuals };
    range('devDepth', v.depth, v.depth.toFixed(1));
    range('devShadow', v.shadow, v.shadow.toFixed(1));
    range('devBoardLight', v.boardLight, v.boardLight.toFixed(1));
    range('devOdLight', v.odLight, v.odLight.toFixed(1));
    $<HTMLSelectElement>('devProtect').value = String(d.protection);
    $<HTMLSelectElement>('devOdDur').value = String(d.odDuration);
    $<HTMLSelectElement>('devOdMult').value = String(d.odMultiplier);
    $<HTMLSelectElement>('devOdRot').value = d.odRotation;
    $<HTMLSelectElement>('devRuleset').value = String(d.ruleset);
    $<HTMLInputElement>('devDailyLimit').value = String(d.dailyLimit);
    $<HTMLInputElement>('devDailyDate').value = d.dailyDate;
    const st = this.session.state;
    $<HTMLInputElement>('devSetScore').value = String(st.score);
    $<HTMLInputElement>('devSetLevel').value = String(st.level ?? 1);
    $<HTMLInputElement>('devSetEnergy').value = String(st.energy);
    $<HTMLInputElement>('devSetOd').value = String(Math.round(st.od?.charge ?? 0));
    const c = this.cfg;
    $<HTMLTextAreaElement>('devJson').value = JSON.stringify({ progression: c.progression, difficulty: c.difficulty, materials: c.materials, scoring: c.scoring, overdrive: c.overdrive, daily: c.daily }, null, 1);
  }

  private bindDev() {
    if (__RELEASE__) return;
    const num = (id: string, key: 'startCharges' | 'maxCharges' | 'cost' | 'energyPerLine') => $<HTMLInputElement>(id).addEventListener('change', (e) => {
      const v = Math.max(0, Math.min(9, Math.round(Number((e.target as HTMLInputElement).value) || 0)));
      this.dev = { ...this.dev, [key]: v };
      this.saveDev();
    });
    num('devStart', 'startCharges'); num('devMax', 'maxCharges'); num('devCost', 'cost'); num('devPerLine', 'energyPerLine');
    $<HTMLSelectElement>('devRotMode').addEventListener('change', (e) => { this.dev.rotationMode = (e.target as HTMLSelectElement).value as RotationMode; this.saveDev(); });
    $<HTMLSelectElement>('devParticles').addEventListener('change', (e) => { this.dev.particles = (e.target as HTMLSelectElement).value as DevConfig['particles']; this.saveDev(); });
    $<HTMLSelectElement>('devHaptic').addEventListener('change', (e) => { this.dev.haptic = (e.target as HTMLSelectElement).value as HapticIntensity; this.saveDev(); haptic('clear'); });
    $<HTMLInputElement>('devPulse').addEventListener('input', (e) => {
      this.dev.pulseChance = Number((e.target as HTMLInputElement).value);
      $('devPulseOut').textContent = `${Math.round(this.dev.pulseChance * 100)}%`;
      this.saveDev();
    });
    $<HTMLInputElement>('devClear').addEventListener('input', (e) => {
      this.dev.clearMs = Number((e.target as HTMLInputElement).value);
      $('devClearOut').textContent = `${this.dev.clearMs} ms`;
      this.saveDev();
    });
    $<HTMLSelectElement>('devLevelEnergy').addEventListener('change', (e) => { this.dev.levelUpEnergy = (e.target as HTMLSelectElement).value as LevelUpEnergy; this.saveDev(); this.setupDev(); });
    const slide = (id: string, set: (v: number) => void) => $<HTMLInputElement>(id).addEventListener('input', (e) => {
      set(Number((e.target as HTMLInputElement).value));
      this.saveDev(); this.setupDev();
    });
    slide('devLevelMs', (v) => { this.dev.levelMs = v; });
    slide('devMatMs', (v) => { this.dev.materialMs = v; });
    const vis = (k: keyof VisualParams) => (v: number) => { this.dev.visuals = { ...this.dev.visuals, [k]: v }; };
    slide('devBright', vis('brightness')); slide('devRefl', vis('reflectivity')); slide('devEdge', vis('edge'));
    slide('devGlow', vis('pulseGlow')); slide('devWave', vis('wave'));
    slide('devDepth', vis('depth')); slide('devShadow', vis('shadow')); slide('devBoardLight', (n) => { vis('boardLight')(n); this.view.resize(); });
    slide('devOdLight', vis('odLight'));
    const pick = <K extends keyof DevConfig>(id: string, key: K, parse: (v: string) => DevConfig[K]) => $<HTMLSelectElement>(id).addEventListener('change', (e) => {
      this.dev = { ...this.dev, [key]: parse((e.target as HTMLSelectElement).value) };
      this.saveDev(); this.setupDev(); this.updateOverdriveHud(); this.setCombo(this.session.state.combo, false);
    });
    pick('devProtect', 'protection', Number); pick('devOdDur', 'odDuration', Number); pick('devOdMult', 'odMultiplier', Number);
    pick('devOdRot', 'odRotation', (v) => v as OverdriveRotation); pick('devRuleset', 'ruleset', Number);
    $<HTMLInputElement>('devDailyLimit').addEventListener('change', (e) => {
      this.dev.dailyLimit = Math.max(5, Math.min(60, Math.round(Number((e.target as HTMLInputElement).value) || 30))); this.saveDev(); this.setupDev();
    });
    $<HTMLInputElement>('devDailyDate').addEventListener('change', (e) => {
      this.dev.dailyDate = (e.target as HTMLInputElement).value; this.saveDev();
      this.toast(this.dev.dailyDate ? `Daily date simulated: ${this.dev.dailyDate}` : 'Daily date: today (UTC)');
    });
    const tap = (id: string, fn: () => void) => $(id).addEventListener('click', fn);
    // Testing: change the running game directly (marked as a developer game, never submitted).
    const edit = (fn: (st: GameState) => GameState) => {
      if (this.screen !== 'game' || this.session.state.mode === 'tutorial') { this.toast('Start a game first'); return; }
      const next = { ...fn(this.session.state), dev: true };
      next.over = stateIsOver(next, this.cfg);
      this.session.state = next;
      this.displayedScore = next.score; this.displayedLevel = next.level ?? 1;
      this.applyMaterial(this.displayedLevel);
      this.updateHud(true); this.updateOverdriveHud(); this.refreshRotateButtons(); this.persist(); this.wake();
    };
    const val = (id: string) => Number($<HTMLInputElement>(id).value) || 0;
    tap('devApplyScore', () => edit((st) => ({ ...st, score: Math.max(0, Math.round(val('devSetScore'))), level: st.mode === 'classic' ? Math.max(st.level ?? 1, levelForScore(this.rules(st).progression, val('devSetScore'))) : st.level })));
    tap('devApplyLevel', () => edit((st) => { const L = Math.max(1, Math.round(val('devSetLevel'))); return { ...st, level: L, score: Math.max(st.score, levelThreshold(this.rules(st).progression, L)) }; }));
    tap('devApplyEnergy', () => edit((st) => ({ ...st, energy: Math.max(0, Math.min(this.cfg.rotation.maxCharges, Math.round(val('devSetEnergy')))) })));
    tap('devApplyOd', () => edit((st) => ({ ...st, od: { ...(st.od ?? { charge: 0, active: 0, freeLeft: 0, score: 0 }), charge: Math.max(0, Math.min(100, val('devSetOd'))), active: 0 } })));
    tap('devActivateOd', () => {
      this.overlayReturn = null; this.closeOverlay(); this.closeOverlay();
      if (this.screen !== 'game' || this.session.state.mode === 'tutorial') this.startClassic();
      edit((st) => ({ ...st, od: { ...(st.od ?? { charge: 0, active: 0, freeLeft: 0, score: 0 }), charge: 100, active: 0 } }));
      this.activateOverdrive();
    });
    tap('devPieces', () => {
      // Loads today's Daily piece order into a Classic test game, to inspect the sequence.
      const ch = dailyChallenge(this.today(), this.cfg);
      this.overlayReturn = null; this.closeOverlay(); this.closeOverlay();
      const st: GameState = { ...dailyGame(ch, this.cfg), mode: 'classic', daily: undefined, dev: true };
      this.startClassic(st);
      this.toast(`Daily ${ch.id} sequence: ${ch.sequence.slice(0, 9).map((p) => p.defId).join(', ')}…`, 'tip');
    });
    tap('devValidate', () => {
      const t0 = performance.now();
      const out: string[] = [];
      let ok = 0, retried = 0, total = 0;
      for (let i = 0; i < 30; i++) {
        const id = addDays(this.today(), i);
        const ch = dailyChallenge(id, this.cfg);
        const rep = validateChallenge(ch, this.cfg);
        if (rep.ok) ok++;
        if (ch.attempt > 0) retried++;
        total += rep.botScore;
        if (i < 5) out.push(`${id}: bot ${fmt(rep.botScore)} in ${rep.botPlacements} placements${ch.attempt ? ` (attempt ${ch.attempt + 1})` : ''}`);
      }
      const first = validateChallenge(generateChallenge(this.today(), this.cfg, 0), this.cfg);
      this.toast(`${ok}/30 valid, ${retried} regenerated, bot average ${fmt(Math.round(total / 30))}. ${Math.round(performance.now() - t0)} ms. Today: ${first.ok ? 'first attempt valid' : first.problems.join('; ')}`, 'tip');
      console.info('[BLOQ] Daily validation', out);
    });
    tap('devTestAch', () => {
      const pending = ACHIEVEMENTS.filter((a) => !this.stats.achievements[a.id]);
      const a = pending[0] ?? ACHIEVEMENTS[0];
      this.toast(`Achievement: ${a.name}`, 'achv'); sfx.achievement(); haptic('unlock');
    });
    const on = (id: string, fn: () => void) => $(id).addEventListener('click', fn);
    on('devJsonApply', () => {
      try {
        const j = JSON.parse($<HTMLTextAreaElement>('devJson').value);
        const adv: DevConfig['advanced'] = {};
        if (j.progression) {
          const t = j.progression.thresholds;
          if (!Array.isArray(t) || t.length < 2 || t[0] !== 0 || t.some((x: number, i: number) => i > 0 && !(x > t[i - 1]))) throw new Error('thresholds must start at 0 and rise');
          adv.progression = { ...DEFAULT_CONFIG.progression, ...j.progression };
        }
        if (j.difficulty) {
          if (!Array.isArray(j.difficulty.bands) || !j.difficulty.bands.length) throw new Error('difficulty.bands is required');
          adv.difficulty = { ...DEFAULT_CONFIG.difficulty, ...j.difficulty };
        }
        if (j.materials) {
          if (!Array.isArray(j.materials) || !j.materials.length || j.materials.some((m: MaterialDef) => !m.id || !/^#[0-9a-f]{6}$/i.test(m.color))) throw new Error('each material needs an id and a #rrggbb color');
          adv.materials = j.materials;
        }
        if (j.scoring) adv.scoring = { ...DEFAULT_CONFIG.scoring, ...j.scoring };
        if (j.overdrive) {
          const o = { ...DEFAULT_CONFIG.overdrive, ...j.overdrive };
          if (!Array.isArray(o.chargeLines) || o.chargeLines.some((x: number) => !(x >= 0))) throw new Error('overdrive.chargeLines must be numbers ≥ 0');
          if (!(o.duration >= 1) || !(o.multiplier >= 1)) throw new Error('overdrive duration and multiplier must be ≥ 1');
          adv.overdrive = o;
          this.dev.odDuration = o.duration; this.dev.odMultiplier = o.multiplier; this.dev.odRotation = o.rotation;
        }
        if (j.daily) adv.daily = { ...DEFAULT_CONFIG.daily, ...j.daily };
        // Keep only the sections that differ from the defaults.
        for (const k of Object.keys(adv) as (keyof typeof adv)[]) if (JSON.stringify(adv[k]) === JSON.stringify(DEFAULT_CONFIG[k])) delete adv[k];
        this.dev.advanced = adv;
        if (adv.progression?.levelUpEnergy) this.dev.levelUpEnergy = adv.progression.levelUpEnergy;
        this.saveDev(); this.setupDev();
        this.toast(Object.keys(adv).length ? `Applied: ${Object.keys(adv).join(', ')}` : 'All sections at defaults');
      } catch (err) {
        this.toast(`JSON not applied: ${(err as Error).message}`);
      }
    });
    on('devJsonReset', () => { this.dev.advanced = {}; this.saveDev(); this.setupDev(); this.toast('Advanced settings reset'); });
    on('devLoad', () => {
      const sc = SCENARIOS[Number($<HTMLSelectElement>('devScenario').value)];
      if (sc.career) { this.stats = { ...this.stats, ...structuredClone(sc.career) }; store(KEYS.stats, JSON.stringify(this.stats)); }
      const base = newGame(newSeed(), this.cfg, { board: boardFromArt(sc.board), energy: sc.energy, score: sc.score });
      const state: GameState = {
        ...base, tray: sc.tray.map((p) => (p ? { ...p } : null)), energy: sc.energy, combo: sc.combo ?? 0, dev: true,
        shield: sc.shield ?? (sc.combo ? this.cfg.combo.protection : 0),
        od: sc.od ? { charge: sc.od.charge, active: sc.od.active ?? 0, freeLeft: this.cfg.overdrive.limitedFree, score: 0 } : base.od,
      };
      state.over = stateIsOver(state, this.cfg);
      this.overlayReturn = null;
      this.closeOverlay(); this.closeOverlay();
      this.startClassic(state);
      this.toast(sc.hint ? `${sc.name}: ${sc.hint}` : `Scenario: ${sc.name}`, 'tip');
    });
    on('devEdit', () => {
      this.overlayReturn = null;
      this.closeOverlay(); this.closeOverlay();
      if (this.screen !== 'game' || this.session.state.mode !== 'classic') this.startClassic();
      this.editMode = true;
      $('devBanner').hidden = false;
    });
    on('btnEditDone', () => { this.editMode = false; $('devBanner').hidden = true; this.refreshRotateButtons(); });
    on('devExport', () => {
      flushAnalytics();
      const blob = new Blob([exportAnalytics()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `bloq-analytics-${Date.now()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      this.toast('Analytics exported');
    });
    on('devReset', () => {
      Object.values(KEYS).forEach(remove);
      remove(DEV_KEY);
      this.dev = defaultDev(); this.applyDev(); this.setupDev();
      this.stats = parseStats(null);
      this.daily = parseDailyRecords(null); this.gcQueue = [];
      this.toast('Local data reset');
    });
  }

  // ---------------------------------------------------------------- wiring

  /**
   * Build 5 graphics prototype selector (development builds only; release builds ship one style). Switching only
   * swaps the block sprites: the game state, score and rules are untouched.
   */
  private bindGraphics() {
    const box = document.getElementById('gfxProto');
    if (__RELEASE__) { box?.remove(); return; }
    const apply = (st: BlockStyle) => {
      setBlockStyle(st);
      document.querySelectorAll<HTMLButtonElement>('#gfxProto .seg-btn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.gfx === st)));
      if (this.screen === 'game') this.view.resize();
      this.wake();
    };
    // Build 8: the gemstone style is the default; earlier prototype choices are kept under the old key only.
    const saved8 = load('bloq.graphics8');
    apply(saved8 === 'b4' || saved8 === 'b5b' || saved8 === 'b5c' || saved8 === 'b6' || saved8 === 'b8' ? saved8 : 'b8');
    document.querySelectorAll<HTMLButtonElement>('#gfxProto .seg-btn').forEach((b) => b.addEventListener('click', () => {
      const st = b.dataset.gfx as BlockStyle;
      store('bloq.graphics8', st); apply(st); sfx.select();
      this.toast({ b4: 'Build 4 graphics', b5b: 'Build 5B: anodized metal', b5c: 'Build 5C: crystal-metal hybrid', b6: 'Build 6: energy crystal', b8: 'Build 8: gemstones' }[st]);
    }));
  }

  private bindUi() {
    // Build 6: every interface button gives a soft click (game sounds stay separate; respects the sound setting).
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('button, .btn, .seg button, [role="button"]')) sfx.click();
    }, { capture: true });
    this.bindGraphics();
    // Build 8: decode the gemstone renders once; until they are ready the Build 6 crystals stand in.
    void preloadGems().then(() => { if (this.screen === 'game') this.view.resize(); this.wake(); });
    const on = (id: string, fn: () => void) => $(id).addEventListener('click', () => { unlockAudio(); fn(); });
    on('btnPlay', () => this.play());
    on('btnContinue', () => this.continueGame());
    on('btnNewRun', () => this.confirmNewRun());
    // Build 9: a tip goes away the moment it is tapped (the board and tray never wait on it).
    $('hudNote').addEventListener('click', () => { if (this.noteTip && !this.note) this.dismissTip(); });
    on('btnCnKeep', () => { this.closeOverlay(); this.refreshHome(); });
    on('btnCnReplace', () => { this.closeOverlay(); track('saved_run_replaced'); this.play(); });
    on('btnStats', () => { this.renderStats(); this.statsTab('stats'); this.openOverlay('stats'); });
    on('btnAchievements', () => { this.renderStats(); this.statsTab('ach'); this.openOverlay('stats'); });
    on('btnRankings', () => this.openRankings());
    on('btnDaily', () => this.openDailyHub());
    on('btnDailyStart', () => { sfx.select(); haptic('select'); this.startDaily(); });
    on('btnDailyHistory', () => { sfx.select(); this.openDailyHistory(); });
    on('dhHistBack', () => { this.renderDailyHub(); this.openOverlay('dailyHub'); });
    on('calPrev', () => this.shiftMonth(-1));
    on('calNext', () => this.shiftMonth(1));
    on('btnOverdrive', () => this.activateOverdrive());
    on('btnResDaily', () => { this.closeOverlay(); this.show('home'); this.openDailyHub(); });
    on('btnDailyAgain', () => { this.closeOverlay(); this.startDaily(); });
    on('btnDrRank', () => { this.overlayReturn = 'dailyResults'; this.openRankings('daily'); });
    on('btnDrShare', () => this.shareDaily());
    on('btnDrHome', () => { this.closeOverlay(); this.show('home'); });
    on('btnGameCenter', () => openDashboard(this.rankBoard));
    document.querySelectorAll<HTMLButtonElement>('#rankings .seg-btn').forEach((b) => b.addEventListener('click', () => this.openRankings(b.dataset.board as LeaderboardKey)));
    on('tabStats', () => this.statsTab('stats'));
    on('tabAch', () => this.statsTab('ach'));
    on('btnMaterials', () => { this.renderMaterials(); this.openOverlay('materials'); });
    on('matProgressive', () => this.selectMaterial('progressive'));
    on('matFixed', () => this.selectMaterial('fixed'));
    on('btnHow', () => this.openOverlay('how'));
    on('btnSettings', () => { this.setupDev(); this.openOverlay('settings'); });
    on('btnGameSettings', () => { this.view.animator.finish(); this.persist(); this.setupDev(); this.openOverlay('settings'); });
    on('btnPause', () => { this.view.animator.finish(); this.persist(); this.openOverlay('pause'); });
    on('btnResume', () => this.closeOverlay());
    on('btnRestart', () => {
      this.closeOverlay();
      if (this.session.state.mode === 'tutorial') { this.startTutorial(); return; }
      const daily = this.session.state.mode === 'daily';
      this.abandon({ state: this.session.state });
      track('game_restarted', { mode: this.session.state.mode });
      if (daily) this.startDaily(); else this.startClassic();
    });
    on('btnPauseSettings', () => { this.overlayReturn = 'pause'; this.setupDev(); this.openOverlay('settings'); });
    on('btnPauseHome', () => {
      this.closeOverlay();
      if (this.session.state.mode === 'tutorial') { this.view.tutorialTarget = null; this.tutorialIndex = -2; }
      this.persist();
      this.show('home');
    });
    on('btnSkip', () => { this.view.animator.finish(); this.tutorialIndex = -2; this.finishTutorial(true); });
    on('btnAgain', () => { this.closeOverlay(); track('game_restarted'); this.startClassic(); });
    on('btnResHome', () => { this.closeOverlay(); this.show('home'); });
    on('resAch', () => { this.overlayReturn = 'results'; this.renderStats(); this.statsTab('ach'); this.openOverlay('stats'); });
    on('btnShare', () => this.share());
    on('btnTutorial', () => {
      this.closeOverlay();
      if (this.screen === 'game' && this.session.state.mode === 'classic') this.persist();
      this.startTutorial();
    });
    this.rotateBtns.forEach((b, slot) => b.addEventListener('click', (e) => { e.preventDefault(); unlockAudio(); this.rotate(slot); }));
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closeOverlay()));
    document.querySelectorAll('.overlay').forEach((o) => o.addEventListener('click', (e) => {
      if (e.target === o && o.id !== 'results') this.closeOverlay();
    }));

    const toggle = (id: string, key: keyof Settings) => $<HTMLInputElement>(id).addEventListener('change', (e) => {
      this.settings = { ...this.settings, [key]: (e.target as HTMLInputElement).checked };
      saveSettings(this.settings);
      this.applySettings();
      if (key === 'sound' && this.settings.sound) { unlockAudio(); sfx.select(); }
      if (key === 'haptics' && this.settings.haptics) haptic('place');
    });
    toggle('setSound', 'sound');
    toggle('setHaptics', 'haptics');
    toggle('setMotion', 'reducedMotion');
    toggle('setContrast', 'highContrast');
    toggle('setEffects', 'reducedEffects');
    toggle('setMusic', 'music');
    const vol = (id: string, key: 'sfxVolume' | 'musicVolume') => $<HTMLInputElement>(id).addEventListener('input', (e) => {
      this.settings = { ...this.settings, [key]: Number((e.target as HTMLInputElement).value) };
      saveSettings(this.settings);
      this.applySettings();
    });
    vol('setSfxVol', 'sfxVolume'); vol('setMusicVol', 'musicVolume');
    $<HTMLInputElement>('setSfxVol').addEventListener('change', () => { unlockAudio(); sfx.select(); });

    if (!__RELEASE__) {
      // Development builds: tap the version label five times to show the developer section.
      let taps = 0;
      $('version').addEventListener('click', () => {
        if (++taps >= 5 && !this.devEnabled) { this.devEnabled = true; this.setupDev(); this.toast('Developer tools on'); }
      });
      this.bindDev();
    }

    window.addEventListener('resize', () => { if (this.screen === 'game') this.layoutGame(); if (this.screen === 'home') this.refreshHome(); this.wake(); });
    window.addEventListener('pointerdown', () => unlockAudio(), { once: true });
  }

  private async share() {
    if (!this.lastResultInfo) return;
    track('share_selected', { mode: 'classic', level: this.lastResultInfo.level, message: this.lastResultInfo.message });
    const card = renderShareCard(this.lastResultInfo);
    const outcome = await shareImage(card, `I scored ${fmt(this.lastResultInfo.score)} in BLOQ and reached Level ${this.lastResultInfo.level}. ${this.lastResultInfo.message}`);
    if (outcome === 'downloaded') this.toast('Result image saved');
  }

  private async shareDaily() {
    const info = this.lastDailyInfo;
    if (!info) return;
    track('share_selected', { mode: 'daily', day: info.day, message: info.message, rank: info.rank ?? 0 });
    const card = renderDailyShareCard(info);
    const outcome = await shareImage(card, `I scored ${fmt(info.score)} in the BLOQ Daily Challenge for ${dayLabel(info.day)}. ${info.message}`);
    if (outcome === 'downloaded') this.toast('Result image saved');
  }

  private lifecycle() {
    const hide = () => {
      this.view.animator.finish();
      if (this.screen === 'game') this.persist();
      flushAnalytics();
      suspendAudio();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') hide();
      else this.wake();
    });
    window.addEventListener('pagehide', hide);
  }
}

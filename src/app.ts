// App shell: screens, the game loop and the glue between engine, renderer, input, audio,
// haptics, persistence and analytics.

import { drawOrbIcon } from './brand/cnmbuck-orb';
import { DEFAULT_CONFIG, type GameConfig, type RotationMode } from './engine/config';
import { newGame, stateIsOver, type GameState, type MoveResult } from './engine/game';
import { inspectSave, serializeGame } from './engine/save';
import { rotationCost } from './engine/rotation';
import { SCENARIOS } from './dev/scenarios';
import { boardFromArt } from './game/boardArt';
import { GameSession } from './game/session';
import { loadSettings, saveSettings, type Settings } from './game/settings';
import {
  addPlayTime, averageRotations, averageScore, averageSessionMs, parseStats, recordGameEnd, recordMove, recordRotation,
  recordSessionGames, type LifetimeStats,
} from './game/stats';
import { TUTORIAL_STEPS, tutorialState } from './game/tutorial';
import { exportAnalytics, flushAnalytics, track } from './platform/analytics';
import { haptic, setHapticIntensity, setHapticsEnabled, type HapticIntensity } from './platform/haptics';
import { setSoundEnabled, sfx, suspendAudio, unlockAudio } from './platform/audio';
import { shareImage } from './platform/share';
import { KEYS, load, remove, store } from './platform/storage';
import { setHighContrast } from './render/blocks';
import { GameView } from './render/gameView';
import { paintHomeArt, paintLogoCanvas, paintSplash, renderShareCard } from './ui/art';
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
}
const DEV_KEY = 'bloq.dev';
const defaultDev = (): DevConfig => ({
  rotationMode: DEFAULT_CONFIG.rotation.mode, startCharges: DEFAULT_CONFIG.rotation.startCharges, maxCharges: DEFAULT_CONFIG.rotation.maxCharges,
  cost: DEFAULT_CONFIG.rotation.cost, energyPerLine: DEFAULT_CONFIG.rotation.energyPerLine, pulseChance: DEFAULT_CONFIG.generation.pulseChance,
  clearMs: 340, particles: 'medium', haptic: 'medium',
});

type ScreenId = 'splash' | 'home' | 'game';
type OverlayId = 'pause' | 'results' | 'stats' | 'how' | 'settings';

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
  private lastResultInfo: { score: number; best: number; combo: number; chain: number; lines: number; newRecord: boolean } | null = null;

  private tutorialIndex = -1;
  private editMode = false;
  private devEnabled = !__RELEASE__ && (import.meta.env.DEV || new URLSearchParams(location.search).has('dev'));

  private raf = 0;
  private lastFrame = 0;
  private messageQueue: { text: string; kind: string }[] = [];
  private messageTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private rotateBtns: HTMLButtonElement[];

  constructor() {
    if (!__RELEASE__) this.loadDev();
    const canvas = $<HTMLCanvasElement>('board');
    this.view = new GameView(canvas, () => this.session.state);
    this.view.rotation = this.cfg.rotation;
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
    this.checkSave();
    this.startSplash();
  }

  // ---------------------------------------------------------------- screens

  private show(id: ScreenId) {
    this.screen = id;
    document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === id));
    if (id === 'home') this.refreshHome();
    if (id === 'game') this.layoutGame();
    this.wake();
  }

  private layoutGame() {
    this.view.resize();
    paintLogoCanvas($<HTMLCanvasElement>('navLogo'));
    this.refreshRotateButtons();
  }

  private openOverlay(id: OverlayId) {
    if (this.overlay) $(this.overlay).hidden = true;
    this.overlay = id;
    $(id).hidden = false;
    $(id).querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
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
    $('homeBest').innerHTML = this.stats.bestScore > 0 ? `PERSONAL BEST <b>${fmt(this.stats.bestScore)}</b>` : '';
    $('btnContinue').hidden = !inspectSave(load(KEYS.save), this.cfg).data;
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
    this.clearMessages();
    this.tutorialIndex = -1;
    this.view.tutorialTarget = null;
    $('tutorial').hidden = true;
    $('btnSkip').hidden = true;
    $('btnGameSettings').hidden = false;
    $('scores').style.visibility = '';
    $('status').style.visibility = '';
    this.session = new GameSession(state ?? newGame(newSeed(), this.cfg), this.cfg);
    this.rotatedSlots.clear();
    this.elapsedMs = restore?.elapsedMs ?? 0;
    this.bestAtStart = restore?.bestAtStart ?? this.stats.bestScore;
    this.chainRecordAtStart = this.stats.maxChain;
    this.celebratedBest = this.session.state.score > this.bestAtStart;
    this.displayedScore = this.session.state.score;
    this.view.fade = 0;
    this.updateHud(true);
    this.setCombo(this.session.state.combo, false);
    $('chain').classList.remove('on');
    this.show('game');
    if (!restore) track('game_started', { seed: this.session.state.seed, rotationMode: this.cfg.rotation.mode });
    this.persist();
    if (this.session.state.over) setTimeout(() => this.gameOver(), 600);
  }

  private play() {
    unlockAudio();
    const existing = inspectSave(load(KEYS.save), this.cfg).data;
    if (existing) this.abandon(existing.state.score);
    if (load(KEYS.tutorialDone) !== '1') this.startTutorial();
    else this.startClassic();
  }

  private continueGame() {
    unlockAudio();
    const save = inspectSave(load(KEYS.save), this.cfg).data;
    if (!save) { this.refreshHome(); return; }
    this.startClassic(save.state, { elapsedMs: save.elapsedMs, bestAtStart: save.bestAtStart });
  }

  private abandon(score: number) {
    track('game_abandoned', { score });
    this.stats = recordGameEnd(this.stats, score);
    store(KEYS.stats, JSON.stringify(this.stats));
    remove(KEYS.save);
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
        if (st.mode === 'classic') track('rotation_denied', { piece: piece.defId });
        this.wake();
      }
      return;
    }
    const now = performance.now();
    this.view.rotating.set(slot, now);
    if (out.cost > 0) this.view.drain = { seg: out.state.energy, start: now };
    sfx.rotate(); haptic('rotate');
    if (st.mode === 'classic') {
      this.rotatedSlots.add(slot);
      track('rotation_performed', { piece: piece.defId, cost: out.cost, energyLeft: out.state.energy });
      this.stats = recordRotation(this.stats, out.cost);
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
      this.stats = recordMove(this.stats, result);
      this.persist();
    }
    const A = this.view.animator;
    A.reduced = this.settings.reducedMotion;
    A.showPoints = !tutorial;
    A.play(result, performance.now(), {
      onLines: (r) => {
        const n = r.rows.length + r.cols.length;
        sfx.clear(n, r.combo);
        haptic(n >= 3 ? 'big' : 'clear');
        this.displayedScore = tutorial ? 0 : r.scoreAfter;
        this.updateHud();
        this.setCombo(r.combo, true);
        this.celebrate(r, 'lines');
      },
      onWave: (i, wave, r) => {
        sfx.pulse(i, wave.pulses.length);
        haptic(i >= 1 || wave.pulses.length > 1 ? 'big' : 'pulse');
        const activated = r.waves.slice(0, i + 1).reduce((s, w) => s + w.pulses.length, 0);
        if (activated >= 2) this.setChain(activated);
        if (i === r.waves.length - 1) this.celebrate(r, 'chain');
      },
      onEnergy: (seg) => { sfx.energy(seg); this.refreshRotateButtons(); this.wake(); },
      onDone: (r) => this.afterResolution(r),
    });
    if (lines === 0) {
      this.displayedScore = tutorial ? 0 : result.scoreAfter;
      this.updateHud();
      this.setCombo(result.combo, false);
    }
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
      if (step?.outro) this.message(step.outro.toUpperCase(), 'big');
      setTimeout(() => this.nextTutorialStep(), (this.settings.reducedMotion ? 350 : 700) + (step?.outro ? 700 : 0));
      return;
    }
    if (r.gameOver) {
      remove(KEYS.save);
      setTimeout(() => this.gameOver(), 650);
    }
  }

  /** Line messages when lines clear; chain messages when the last wave lands. Ordinary moves stay quiet. */
  private celebrate(r: MoveResult, phase: 'lines' | 'chain') {
    const lines = r.rows.length + r.cols.length;
    const tutorial = this.session.state.mode === 'tutorial';
    const out: [string, string][] = [];
    if (phase === 'lines' && r.chain === 0) {
      if (lines >= 4) out.push([lines >= 5 ? 'MEGA CLEAR' : 'QUAD CLEAR', 'big']);
      else if (lines === 3) out.push(['TRIPLE CLEAR', 'big']);
      else if (lines === 2) out.push(['DOUBLE CLEAR', '']);
      else if (r.combo >= 3) out.push(['GREAT MOVE', '']);
    }
    if (phase === 'chain') {
      const c = r.chain;
      out.push([c >= 5 ? `MASSIVE REACTION ×${c}` : c >= 3 ? `CHAIN REACTION ×${c}` : c === 2 ? 'DOUBLE PULSE' : 'PULSE ACTIVATED', c >= 2 ? 'big' : '']);
      if (!tutorial && c >= 2 && c > this.chainRecordAtStart && this.chainRecordAtStart > 0) { out.push(['NEW CHAIN RECORD', 'record']); this.chainRecordAtStart = c; }
    }
    const last = phase === 'chain' || r.chain === 0;
    if (last && !tutorial) {
      const boardClear = r.boardAfterPlace.cells.every((c, k) => !c || r.lineCells.includes(k) || r.waves.some((w) => w.cleared.includes(k)));
      if (boardClear) out.push(['BOARD CLEAR', 'big']);
      if (!this.celebratedBest && this.bestAtStart > 0 && r.scoreAfter > this.bestAtStart) {
        this.celebratedBest = true;
        out.push(['NEW PERSONAL BEST', 'record']);
      }
    }
    for (const [text, kind] of out) this.message(text, kind);
  }

  private gameOver() {
    const st = this.session.state;
    const prevBest = this.bestAtStart;
    this.gamesThisSession++;
    this.stats = recordSessionGames(recordGameEnd(addPlayTime(this.stats, this.unbankedMs), st.score), this.gamesThisSession);
    this.unbankedMs = 0;
    store(KEYS.stats, JSON.stringify(this.stats));
    const occupancy = st.board.cells.filter(Boolean).length;
    track('game_ended', { score: st.score, moves: st.stats.moves, lines: st.stats.linesCleared, ms: Math.round(this.elapsedMs), occupancy, energyLeft: st.energy, rotations: st.stats.rotations, gameInSession: this.gamesThisSession });
    const newRecord = st.score > prevBest && st.score > 0;
    sfx.gameOver(); haptic(newRecord ? 'record' : 'clear');
    if (newRecord) setTimeout(() => sfx.record(), 500);
    this.lastResultInfo = { score: st.score, best: this.stats.bestScore, combo: st.stats.maxCombo, chain: st.stats.maxChain, lines: st.stats.linesCleared, newRecord };
    $('resKicker').textContent = newRecord ? 'NEW PERSONAL BEST' : 'GAME OVER';
    $('resKicker').classList.toggle('record', newRecord);
    $('resScore').textContent = fmt(st.score);
    $('resBest').textContent = newRecord ? (prevBest > 0 ? `Previous best ${fmt(prevBest)}` : 'Your first record') : `Personal best ${fmt(this.stats.bestScore)}`;
    $('resLines').textContent = fmt(st.stats.linesCleared);
    $('resMaxLines').textContent = st.stats.maxLinesAtOnce ? `${st.stats.maxLinesAtOnce}` : '–';
    const mult = this.cfg.scoring.comboMultipliers;
    $('resCombo').textContent = st.stats.maxCombo ? `×${mult[Math.min(st.stats.maxCombo, mult.length) - 1].toFixed(1)}` : '–';
    $('resChain').textContent = st.stats.maxChain ? `×${st.stats.maxChain}` : '–';
    $('resRot').textContent = fmt(st.stats.rotations);
    $('resTime').textContent = fmtTime(this.elapsedMs);
    this.view.fade = 1;
    this.openOverlay('results');
  }

  private persist() {
    const st = this.session.state;
    if (st.mode !== 'classic') return;
    if (this.unbankedMs > 0) { this.stats = addPlayTime(this.stats, this.unbankedMs); this.unbankedMs = 0; }
    store(KEYS.stats, JSON.stringify(this.stats));
    if (st.over) remove(KEYS.save);
    else store(KEYS.save, serializeGame(st, this.elapsedMs, this.bestAtStart));
  }

  // ---------------------------------------------------------------- tutorial

  private startTutorial() {
    track('tutorial_started');
    this.view.animator.finish();
    this.clearMessages();
    this.tutorialIndex = -1;
    $('btnSkip').hidden = false;
    $('btnGameSettings').hidden = true;
    $('scores').style.visibility = 'hidden';
    $('status').style.visibility = 'hidden';
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
    if (!skipped) this.message("YOU'RE READY", 'big');
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
    const live = this.session.state.mode === 'classic' ? this.session.state.score : 0;
    const best = Math.max(this.stats.bestScore, live);
    $('best').textContent = fmt(best);
    $('best').classList.toggle('record', live > 0 && live >= this.bestAtStart && live === best && this.bestAtStart > 0);
  }

  private setCombo(combo: number, animate: boolean) {
    const el = $('combo');
    const m = this.cfg.scoring.comboMultipliers;
    const mult = combo > 0 ? m[Math.min(combo, m.length) - 1] : 1;
    $('comboMult').textContent = `×${mult.toFixed(1)}`;
    el.classList.toggle('on', combo >= 2);
    el.setAttribute('aria-label', `Combo multiplier ${mult.toFixed(1)}`);
    [...$('comboMeter').children].forEach((seg, i) => seg.classList.toggle('lit', i < Math.min(combo, m.length)));
    if (animate && combo >= 2) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }

  private setChain(n: number) {
    const el = $('chain');
    $('chainValue').textContent = `×${n}`;
    el.classList.add('on');
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  /** Messages queue so two never overwrite each other. */
  private message(text: string, kind = '') {
    this.messageQueue.push({ text, kind });
    if (!this.messageTimer) this.nextMessage();
  }

  private clearMessages() {
    this.messageQueue = [];
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageTimer = null;
    $('message').className = 'message';
  }

  private nextMessage() {
    const el = $('message');
    const m = this.messageQueue.shift();
    if (!m) { el.className = 'message'; this.messageTimer = null; return; }
    el.textContent = m.text;
    el.className = 'message';
    void el.offsetWidth;
    el.className = `message on ${m.kind}`;
    if (m.kind === 'record') { sfx.record(); haptic('record'); }
    this.messageTimer = setTimeout(() => {
      el.className = `message ${m.kind}`;
      this.messageTimer = setTimeout(() => this.nextMessage(), 180);
    }, m.kind ? 1150 : 900);
  }

  private toast(text: string) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('on');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('on'), 3200);
  }

  /** Rotate buttons sit on the bottom edge of each tray slot; their state follows energy and playability. */
  private refreshRotateButtons() {
    if (!this.view.layout) return;
    const st = this.session.state;
    const rc = this.cfg.rotation;
    const step = st.mode === 'tutorial' ? TUTORIAL_STEPS[this.tutorialIndex] : null;
    this.rotateBtns.forEach((b, slot) => {
      const piece = st.tray[slot];
      const hiddenByTutorial = st.mode === 'tutorial' && (!step?.rotate || this.view.tutorialTarget?.slot !== slot);
      b.hidden = !piece || rc.mode === 'none' || hiddenByTutorial || st.over;
      if (b.hidden || !piece) return;
      const pos = this.view.rotateButtonCenter(slot);
      b.style.left = `${pos.x}px`; b.style.top = `${pos.y}px`;
      const cost = rotationCost(rc, piece);
      const affordable = rc.mode !== 'energy' || cost <= st.energy;
      b.classList.toggle('off', !affordable);
      b.classList.toggle('free', affordable && cost === 0 && rc.mode === 'energy');
      const play = this.view.playabilityOf(slot);
      b.classList.toggle('hint', affordable && play === 'after-rotation' && !this.view.animator.busy && st.mode === 'classic');
      b.classList.toggle('tut', !!step?.rotate && (piece.rot ?? 0) !== (step.target.rot ?? 0));
      b.setAttribute('aria-label', `Rotate piece ${slot + 1}${rc.mode !== 'energy' ? '' : cost === 0 ? ' (free, looks the same)' : affordable ? `, uses ${cost} energy` : ', no energy left'}`);
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
      if (st.mode === 'classic' && !st.over && !this.overlay && document.visibilityState === 'visible') {
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
    setHapticsEnabled(s.haptics);
    setHighContrast(s.highContrast);
    this.view.reduced = s.reducedMotion;
    this.view.animator.reduced = s.reducedMotion;
    document.documentElement.classList.toggle('reduced', s.reducedMotion);
    document.documentElement.classList.toggle('contrast', s.highContrast);
    $<HTMLInputElement>('setSound').checked = s.sound;
    $<HTMLInputElement>('setHaptics').checked = s.haptics;
    $<HTMLInputElement>('setMotion').checked = s.reducedMotion;
    $<HTMLInputElement>('setContrast').checked = s.highContrast;
    if (this.screen === 'game') this.view.resize();
    this.wake();
  }

  private renderStats() {
    const s = this.stats;
    const rows: [string, string][] = [
      ['Personal best', fmt(s.bestScore)],
      ['Games played', fmt(s.gamesPlayed)],
      ['Average score', fmt(averageScore(s))],
      ['Average game', fmtTime(averageSessionMs(s))],
      ['Lines cleared', fmt(s.totalLines)],
      ['Largest clear', fmt(s.maxLinesAtOnce)],
      ['Longest combo', s.maxCombo ? `${s.maxCombo} moves` : '–'],
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
    if (!sel.options.length) sel.innerHTML = SCENARIOS.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
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
    const on = (id: string, fn: () => void) => $(id).addEventListener('click', fn);
    on('devLoad', () => {
      const sc = SCENARIOS[Number($<HTMLSelectElement>('devScenario').value)];
      const base = newGame(newSeed(), this.cfg, { board: boardFromArt(sc.board), energy: sc.energy });
      const state: GameState = { ...base, tray: sc.tray.map((p) => (p ? { ...p } : null)), energy: sc.energy };
      state.over = stateIsOver(state, this.cfg);
      this.overlayReturn = null;
      this.closeOverlay(); this.closeOverlay();
      this.startClassic(state);
      this.toast(`Scenario: ${sc.name}`);
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
      this.toast('Local data reset');
    });
  }

  // ---------------------------------------------------------------- wiring

  private bindUi() {
    const on = (id: string, fn: () => void) => $(id).addEventListener('click', () => { unlockAudio(); fn(); });
    on('btnPlay', () => this.play());
    on('btnContinue', () => this.continueGame());
    on('btnStats', () => { this.renderStats(); this.openOverlay('stats'); });
    on('btnHow', () => this.openOverlay('how'));
    on('btnSettings', () => { this.setupDev(); this.openOverlay('settings'); });
    on('btnGameSettings', () => { this.view.animator.finish(); this.persist(); this.setupDev(); this.openOverlay('settings'); });
    on('btnPause', () => { this.view.animator.finish(); this.persist(); this.openOverlay('pause'); });
    on('btnResume', () => this.closeOverlay());
    on('btnRestart', () => {
      this.closeOverlay();
      if (this.session.state.mode === 'tutorial') { this.startTutorial(); return; }
      this.abandon(this.session.state.score);
      track('game_restarted');
      this.startClassic();
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
    track('share_selected');
    const card = renderShareCard(this.lastResultInfo);
    const outcome = await shareImage(card, `I scored ${fmt(this.lastResultInfo.score)} in BLOQ. Can you beat my score?`);
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

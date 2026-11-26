// App shell: screens, the game loop and the glue between engine, renderer, input, audio,
// haptics, persistence and analytics.

import { drawOrbIcon } from './brand/cnmbuck-orb';
import { DEFAULT_CONFIG, type GameConfig } from './engine/config';
import { newGame, type GameState, type MoveResult } from './engine/game';
import { deserializeGame, serializeGame } from './engine/save';
import { isGameOver } from './engine/board';
import { SCENARIOS } from './dev/scenarios';
import { boardFromArt } from './game/boardArt';
import { GameSession } from './game/session';
import { loadSettings, saveSettings, type Settings } from './game/settings';
import { addPlayTime, averageScore, parseStats, recordGameEnd, recordMove, type LifetimeStats } from './game/stats';
import { TUTORIAL_STEPS, tutorialState } from './game/tutorial';
import { exportAnalytics, flushAnalytics, track } from './platform/analytics';
import { haptic, setHapticsEnabled } from './platform/haptics';
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

type ScreenId = 'splash' | 'home' | 'game';
type OverlayId = 'pause' | 'results' | 'stats' | 'how' | 'settings';

export class App {
  private cfg: GameConfig = structuredClone(DEFAULT_CONFIG);
  private settings: Settings = loadSettings();
  private stats: LifetimeStats = parseStats(load(KEYS.stats));
  private session: GameSession = new GameSession(newGame(newSeed(), this.cfg), this.cfg);
  private view: GameView;
  private screen: ScreenId = 'splash';
  private overlay: OverlayId | null = null;
  private overlayReturn: OverlayId | null = null;

  /** Active play time for the current game and the slice not yet added to lifetime stats. */
  private elapsedMs = 0;
  private unbankedMs = 0;
  private bestAtStart = 0;
  private celebratedBest = false;
  private displayedScore = 0;
  private lastResultInfo: { score: number; best: number; combo: number; chain: number; lines: number; newRecord: boolean } | null = null;

  private tutorialIndex = -1;
  private editMode = false;
  private devEnabled = import.meta.env.DEV || new URLSearchParams(location.search).has('dev');

  private raf = 0;
  private lastFrame = 0;
  private messageTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const canvas = $<HTMLCanvasElement>('board');
    this.view = new GameView(canvas, () => this.session.state);
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
    this.startSplash();
  }

  // ---------------------------------------------------------------- screens

  private show(id: ScreenId) {
    this.screen = id;
    document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === id));
    if (id === 'home') this.refreshHome();
    if (id === 'game') this.view.resize();
    this.wake();
  }

  private openOverlay(id: OverlayId) {
    if (this.overlay) $(this.overlay).hidden = true;
    this.overlay = id;
    $(id).hidden = false;
    const first = $(id).querySelector<HTMLElement>('button, input');
    first?.focus({ preventScroll: true });
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
    orb.width = orb.height = Math.round(20 * dpr);
    const og = orb.getContext('2d')!;
    og.setTransform(1, 0, 0, 1, 0, 0); og.clearRect(0, 0, orb.width, orb.height);
    drawOrbIcon(og, orb.width, 0, 0, 0, false);
    $('homeBest').innerHTML = this.stats.bestScore > 0 ? `Best <b>${fmt(this.stats.bestScore)}</b>` : '';
    $('btnContinue').hidden = !deserializeGame(load(KEYS.save));
  }

  // ---------------------------------------------------------------- game flow

  private startClassic(state?: GameState, restore?: { elapsedMs: number; bestAtStart: number }) {
    this.view.animator.finish();
    this.tutorialIndex = -1;
    this.view.tutorialTarget = null;
    $('tutorial').hidden = true;
    $('btnSkip').hidden = true;
    $('bestWrap').hidden = false;
    $('score').style.visibility = '';
    this.session = new GameSession(state ?? newGame(newSeed(), this.cfg), this.cfg);
    this.elapsedMs = restore?.elapsedMs ?? 0;
    this.bestAtStart = restore?.bestAtStart ?? this.stats.bestScore;
    this.celebratedBest = this.session.state.score > this.bestAtStart;
    this.displayedScore = this.session.state.score;
    this.view.fade = 0;
    this.updateHud(true);
    this.setCombo(this.session.state.combo);
    $('chain').classList.remove('on');
    this.show('game');
    if (!restore) track('game_started', { seed: this.session.state.seed });
    this.persist();
  }

  private play() {
    unlockAudio();
    const existing = deserializeGame(load(KEYS.save));
    if (existing) this.abandon(existing.state.score, existing.elapsedMs);
    if (load(KEYS.tutorialDone) !== '1') this.startTutorial();
    else this.startClassic();
  }

  private continueGame() {
    unlockAudio();
    const save = deserializeGame(load(KEYS.save));
    if (!save) { this.refreshHome(); return; }
    this.startClassic(save.state, { elapsedMs: save.elapsedMs, bestAtStart: save.bestAtStart });
  }

  private abandon(score: number, _elapsed: number) {
    track('game_abandoned', { score });
    this.stats = recordGameEnd(this.stats, score);
    store(KEYS.stats, JSON.stringify(this.stats));
    remove(KEYS.save);
  }

  private drop(slot: number, row: number, col: number): boolean {
    const result = this.session.tryPlace(slot, row, col);
    if (!result) return false;
    const st = this.session.state;
    const tutorial = st.mode === 'tutorial';
    if (tutorial) this.view.tutorialTarget = null;
    sfx.place(); haptic('place');
    if (!tutorial) {
      track('piece_placed', { piece: result.piece.defId, lines: result.rows.length + result.cols.length, combo: result.combo, chain: result.chain });
      if (result.rows.length + result.cols.length) track('lines_cleared', { count: result.rows.length + result.cols.length, combo: result.combo });
      if (result.chain) { track('pulse_activated', { count: result.chain }); track('chain_size', { size: result.chain }); }
      this.stats = recordMove(this.stats, result);
      this.persist();
    }
    this.view.animator.reduced = this.settings.reducedMotion;
    this.view.animator.showPoints = !tutorial;
    this.view.animator.play(result, performance.now(), {
      onLines: (r) => {
        const lines = r.rows.length + r.cols.length;
        sfx.clear(lines, r.combo);
        haptic(lines >= 3 ? 'big' : 'clear');
        this.displayedScore = r.scoreAfter - (tutorial ? r.scoreAfter : 0);
        this.updateHud();
        this.setCombo(r.combo);
        this.celebrate(r, 'lines');
      },
      onWave: (i, wave, r) => {
        sfx.pulse(i, wave.pulses.length);
        haptic(i >= 1 ? 'big' : 'pulse');
        const activated = r.waves.slice(0, i + 1).reduce((s, w) => s + w.pulses.length, 0);
        if (activated >= 2) this.setChain(activated);
        if (i === r.waves.length - 1 && r.chain >= 2) this.celebrate(r, 'chain');
      },
      onDone: (r) => this.afterResolution(r),
    });
    if (result.rows.length + result.cols.length === 0) {
      this.displayedScore = tutorial ? 0 : result.scoreAfter;
      this.updateHud();
      this.setCombo(result.combo);
    }
    this.wake();
    return true;
  }

  private afterResolution(r: MoveResult) {
    this.session.finishResolution();
    setTimeout(() => $('chain').classList.remove('on'), 900);
    if (this.session.state.mode === 'tutorial') {
      setTimeout(() => this.nextTutorialStep(), this.settings.reducedMotion ? 350 : 650);
      return;
    }
    if (r.gameOver) {
      remove(KEYS.save);
      setTimeout(() => this.gameOver(), 650);
    }
  }

  /** Line messages when the lines clear; chain messages when the last wave lands. Ordinary moves stay quiet. */
  private celebrate(r: MoveResult, phase: 'lines' | 'chain') {
    const lines = r.rows.length + r.cols.length;
    const tutorial = this.session.state.mode === 'tutorial';
    const queue: [string, string][] = [];
    if (phase === 'lines') {
      const names = ['', '', 'Double Clear!', 'Triple Clear!', 'Quad Clear!'];
      if (r.chain === 1) queue.push(['Pulse Activated!', '']);
      else if (r.chain === 0) {
        if (lines >= 5) queue.push(['Mega Clear!', 'big']);
        else if (lines >= 2) queue.push([names[lines], lines >= 3 ? 'big' : '']);
        else if (r.combo >= 3) queue.push(['Great Move!', '']);
      }
    } else if (r.chain >= 2) queue.push([`Chain Reaction ×${r.chain}!`, 'big']);
    const last = phase === 'chain' || r.chain === 0 || (r.chain === 1 && phase === 'lines');
    if (last && !tutorial) {
      const boardClear = r.boardAfterPlace.cells.every((c, k) => !c || r.lineCells.includes(k) || r.waves.some((w) => w.cleared.includes(k)));
      if (boardClear) queue.push(['Board Clear!', 'big']);
      if (!this.celebratedBest && this.bestAtStart > 0 && r.scoreAfter > this.bestAtStart) {
        this.celebratedBest = true;
        queue.push(['New Personal Best!', 'record']);
      }
    }
    queue.forEach(([text, kind], i) => setTimeout(() => {
      this.message(text, kind);
      if (kind === 'record') { sfx.record(); haptic('record'); }
    }, i * 1100));
  }

  private gameOver() {
    const st = this.session.state;
    const prevBest = this.bestAtStart;
    this.stats = recordGameEnd(addPlayTime(this.stats, this.unbankedMs), st.score);
    this.unbankedMs = 0;
    store(KEYS.stats, JSON.stringify(this.stats));
    track('game_ended', { score: st.score, moves: st.stats.moves, lines: st.stats.linesCleared, ms: Math.round(this.elapsedMs) });
    const newRecord = st.score > prevBest && st.score > 0;
    sfx.gameOver(); haptic(newRecord ? 'record' : 'clear');
    this.lastResultInfo = { score: st.score, best: this.stats.bestScore, combo: st.stats.maxCombo, chain: st.stats.maxChain, lines: st.stats.linesCleared, newRecord };
    $('resKicker').textContent = newRecord ? 'NEW PERSONAL BEST!' : 'GAME OVER';
    $('resKicker').classList.toggle('record', newRecord);
    $('resScore').textContent = fmt(st.score);
    $('resBest').textContent = newRecord ? (prevBest > 0 ? `Previous best ${fmt(prevBest)}` : 'Your first record') : `Best ${fmt(this.stats.bestScore)}`;
    $('resLines').textContent = fmt(st.stats.linesCleared);
    $('resCombo').textContent = st.stats.maxCombo ? `×${st.stats.maxCombo}` : '–';
    $('resChain').textContent = st.stats.maxChain ? `×${st.stats.maxChain}` : '–';
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
    this.tutorialIndex = -1;
    $('btnSkip').hidden = false;
    $('bestWrap').hidden = true;
    $('score').style.visibility = 'hidden';
    this.displayedScore = 0;
    this.updateHud(true);
    this.setCombo(0);
    this.show('game');
    this.nextTutorialStep();
  }

  private nextTutorialStep() {
    this.tutorialIndex++;
    if (this.tutorialIndex >= TUTORIAL_STEPS.length) {
      this.finishTutorial(false);
      return;
    }
    const step = TUTORIAL_STEPS[this.tutorialIndex];
    this.session = new GameSession(tutorialState(step), this.cfg);
    this.session.requiredTarget = step.target;
    this.view.tutorialTarget = step.target;
    $('tutorial').hidden = false;
    $('tutStep').textContent = `STEP ${this.tutorialIndex + 1} OF ${TUTORIAL_STEPS.length}`;
    $('tutTitle').textContent = step.title;
    $('tutHint').textContent = step.hint;
    this.view.resize();
    this.wake();
  }

  private finishTutorial(skipped: boolean) {
    store(KEYS.tutorialDone, '1');
    track(skipped ? 'tutorial_skipped' : 'tutorial_completed');
    this.startClassic();
    if (!skipped) this.message("You're ready. Plan your Pulses!", 'big');
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
      const start = performance.now(), from = cur, dur = Math.min(600, 200 + (target - from));
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const v = Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3)));
        scoreEl.textContent = fmt(v);
        if (t < 1 && scoreEl.dataset.v === String(target)) requestAnimationFrame(step);
      };
      scoreEl.dataset.v = String(target);
      requestAnimationFrame(step);
      if (target - from >= 100) { scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump'); }
    }
    scoreEl.setAttribute('aria-label', `Score ${target}`);
    const best = Math.max(this.stats.bestScore, this.session.state.mode === 'classic' ? this.session.state.score : 0);
    $('best').textContent = fmt(best);
  }

  private setCombo(combo: number) {
    const el = $('combo');
    const mult = this.cfg.scoring.comboMultipliers[Math.min(Math.max(combo, 1), this.cfg.scoring.comboMultipliers.length) - 1];
    if (combo >= 2) { el.textContent = `COMBO ×${mult.toFixed(1)}`; el.classList.add('on'); }
    else el.classList.remove('on');
  }

  private setChain(n: number) {
    const el = $('chain');
    el.textContent = `CHAIN ×${n}`;
    el.classList.add('on');
  }

  private message(text: string, kind = '') {
    const el = $('message');
    el.textContent = text;
    el.className = `message on ${kind}`;
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => { el.className = 'message'; }, kind ? 1500 : 1100);
  }

  private toast(text: string) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('on');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('on'), 2000);
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
        keepGoing = true; // the play clock
      }
      this.view.animator.update(now, dt);
      this.view.render(now);
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
    this.wake();
  }

  private renderStats() {
    const s = this.stats;
    const rows: [string, string][] = [
      ['Best score', fmt(s.bestScore)],
      ['Games played', fmt(s.gamesPlayed)],
      ['Average score', fmt(averageScore(s))],
      ['Lines cleared', fmt(s.totalLines)],
      ['Most lines at once', fmt(s.maxLinesAtOnce)],
      ['Longest combo', s.maxCombo ? `×${s.maxCombo}` : '–'],
      ['Pulses activated', fmt(s.totalPulses)],
      ['Biggest chain', s.maxChain ? `×${s.maxChain}` : '–'],
      ['Time played', fmtTime(s.totalPlayMs + this.unbankedMs)],
      ['Days played', fmt(s.days.length)],
    ];
    $('statGrid').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }

  // ---------------------------------------------------------------- dev tools

  private editCell(r: number, c: number) {
    const st = this.session.state;
    const board = { size: st.board.size, cells: st.board.cells.slice() };
    const k = r * 8 + c, cur = board.cells[k];
    board.cells[k] = !cur ? { color: (r + c) % 5 } : !cur.pulse ? { color: cur.color, pulse: true } : null;
    this.session.state = { ...st, board, over: isGameOver(board, st.tray) };
    this.persist();
  }

  private setupDev() {
    $('devSection').hidden = !this.devEnabled;
    const sel = $<HTMLSelectElement>('devScenario');
    if (!sel.options.length) sel.innerHTML = SCENARIOS.map((s, i) => `<option value="${i}">${s.name}</option>`).join('');
    const pulse = $<HTMLInputElement>('devPulse');
    pulse.value = String(this.cfg.generation.pulseChance);
    $('devPulseOut').textContent = `${Math.round(this.cfg.generation.pulseChance * 100)}%`;
  }

  // ---------------------------------------------------------------- wiring

  private bindUi() {
    const on = (id: string, fn: () => void) => $(id).addEventListener('click', () => { unlockAudio(); fn(); });
    on('btnPlay', () => this.play());
    on('btnContinue', () => this.continueGame());
    on('btnStats', () => { this.renderStats(); this.openOverlay('stats'); });
    on('btnHow', () => this.openOverlay('how'));
    on('btnSettings', () => { this.setupDev(); this.openOverlay('settings'); });
    on('btnPause', () => { this.view.animator.finish(); this.persist(); this.openOverlay('pause'); });
    on('btnResume', () => this.closeOverlay());
    on('btnRestart', () => {
      this.closeOverlay();
      if (this.session.state.mode === 'tutorial') { this.startTutorial(); return; }
      this.abandon(this.session.state.score, this.elapsedMs);
      track('game_restarted');
      this.startClassic();
    });
    on('btnPauseSettings', () => { this.overlayReturn = 'pause'; this.setupDev(); this.openOverlay('settings'); });
    on('btnPauseHome', () => {
      this.closeOverlay();
      if (this.session.state.mode === 'tutorial') this.view.tutorialTarget = null;
      this.persist();
      this.show('home');
    });
    on('btnSkip', () => { this.view.animator.finish(); this.finishTutorial(true); });
    on('btnAgain', () => { this.closeOverlay(); track('game_restarted'); this.startClassic(); });
    on('btnResHome', () => { this.closeOverlay(); this.show('home'); });
    on('btnShare', () => this.share());
    on('btnTutorial', () => {
      this.closeOverlay();
      if (this.screen === 'game' && this.session.state.mode === 'classic') this.persist();
      this.startTutorial();
    });
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

    // Developer section: tap the version label five times.
    let taps = 0;
    $('version').addEventListener('click', () => {
      if (++taps >= 5 && !this.devEnabled) { this.devEnabled = true; this.setupDev(); this.toast('Developer tools on'); }
    });
    on('devLoad', () => {
      const sc = SCENARIOS[Number($<HTMLSelectElement>('devScenario').value)];
      const base = newGame(newSeed(), this.cfg, { board: boardFromArt(sc.board) });
      const state: GameState = { ...base, tray: sc.tray.map((p) => ({ ...p })) };
      state.over = isGameOver(state.board, state.tray);
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
    on('btnEditDone', () => { this.editMode = false; $('devBanner').hidden = true; });
    $<HTMLInputElement>('devPulse').addEventListener('input', (e) => {
      this.cfg.generation.pulseChance = Number((e.target as HTMLInputElement).value);
      $('devPulseOut').textContent = `${Math.round(this.cfg.generation.pulseChance * 100)}%`;
    });
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
      this.stats = parseStats(null);
      this.toast('Local data reset');
    });

    window.addEventListener('resize', () => { if (this.screen === 'game') this.view.resize(); if (this.screen === 'home') this.refreshHome(); this.wake(); });
    // First touch anywhere unlocks audio on iOS.
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
      // Resolve any running sequence instantly, then save: the state is already final.
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

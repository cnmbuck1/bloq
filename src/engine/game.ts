// The game: one immutable state and one pure move function, shared by Classic, Daily Challenge and the tutorial.
// applyMove computes the whole resolution in one step and returns a new state:
//   place → lines → Pulses → score (placement + clears × combo, then × Overdrive) → combo and Combo Protection →
//   line energy → Overdrive charge → level-up and its energy → Overdrive duration → next tray → game over.
// Animations replay the returned MoveResult; they never touch state, so an interrupted or skipped animation
// cannot corrupt the board.

import { CURRENT_RULESET, DEFAULT_CONFIG, LEGACY_RULESET_1, type GameConfig, type RotationConfig } from './config';
import {
  canPlace, emptyBoard, findCompletedLines, fitsAnywhere, lineCells, placePiece, shapeOf,
  type Board, type PieceInstance,
} from './board';
import { generateTray } from './generator';
import { isGameOverWithRotation, rotated, rotationAllowed, rotationCost } from './rotation';
import { resolvePulses, type PulseWave } from './pulse';
import { Rng } from './rng';
import { scoreMove, type ScoreBreakdown } from './scoring';
import { levelForScore } from './progression';

export type GameMode = 'classic' | 'tutorial' | 'daily';

export interface GameStats {
  moves: number;
  linesCleared: number;
  maxLinesAtOnce: number;
  maxCombo: number;
  pulsesActivated: number;
  maxChain: number;
  blocksPlaced: number;
  rotations: number;
  energySpent: number;
  energyEarned: number;
  /** Build 3: energy restored by level-ups. */
  energyFromLevels: number;
  /** Build 4. */
  perfectClears: number;
  comboProtected: number;
  odActivations: number;
  odFreeRotations: number;
  /** Most points earned during one Overdrive activation. */
  odBestScore: number;
  /** Most lines cleared in one move during Overdrive. */
  odMaxLines: number;
  /** Largest chain during Overdrive. */
  odMaxChain: number;
}

/** Build 4: Overdrive state inside a game. */
export interface OverdriveState {
  /** Stored charge, 0..100. Never rises while active. */
  charge: number;
  /** Successful placements left in the active Overdrive (0 = inactive). */
  active: number;
  /** Free turns left in this activation ('limited' rotation benefit). */
  freeLeft: number;
  /** Points earned in the current activation so far. */
  score: number;
}

/** Build 4: Daily Challenge progress inside a game. The whole piece sequence is fixed in advance. */
export interface DailyProgress {
  id: string;
  limit: number;
  /** Pre-generated pieces, dealt three at a time; never adapted to the board. */
  sequence: PieceInstance[];
  /** Index of the next piece to deal. */
  seqPos: number;
}

export interface GameState {
  mode: GameMode;
  seed: number;
  rngState: number;
  board: Board;
  tray: (PieceInstance | null)[];
  /** Recently generated piece ids (repetition control). */
  recent: string[];
  score: number;
  /** Consecutive clearing moves so far (0 = none). */
  combo: number;
  /** Rotation Energy charges available. */
  energy: number;
  /** Build 3: current level (1-based). Only ever rises within a Classic game. Tutorial and Daily stay at 1. */
  level: number;
  stats: GameStats;
  over: boolean;
  /** Pulse chance override (tutorial / tests / daily). undefined = config. */
  pulseChance?: number;
  /** Build 4: scoring ruleset the game was started under (1 = Builds 1–3). */
  ruleset?: number;
  /** Build 4: protected setup moves left for the current combo. */
  shield?: number;
  /** Build 4: Overdrive. */
  od?: OverdriveState;
  /** Build 4: Daily Challenge progress (mode 'daily'). */
  daily?: DailyProgress;
  /** Build 4: game set up with developer tools; never submits scores. */
  dev?: boolean;
}

export interface MoveResult {
  slot: number;
  piece: PieceInstance;
  row: number;
  col: number;
  placed: number[];
  /** Board right after placement, before anything clears (what animations start from). */
  boardAfterPlace: Board;
  rows: number[];
  cols: number[];
  lineCells: number[];
  waves: PulseWave[];
  chain: number;
  points: ScoreBreakdown;
  combo: number;
  scoreBefore: number;
  scoreAfter: number;
  /** Rotation Energy restored by this move's completed lines (after the cap). */
  energyGained: number;
  /** Energy after line restores, before any level-up restore. */
  energyAfterLines: number;
  /** Energy restored by this move's level-up (0 when no level was gained). */
  levelEnergy: number;
  energyAfter: number;
  levelBefore: number;
  levelAfter: number;
  newTray: boolean;
  gameOver: boolean;
  /** Build 4. The board was empty after the full resolution (Perfect Board Clear). */
  perfect: boolean;
  /** A non-clearing move kept the combo by spending protection. */
  comboProtected: boolean;
  /** Protection restored by this clearing move (was spent before). */
  shieldRestored: boolean;
  shieldAfter: number;
  /** Overdrive charge gained by this move, and the meter after it. */
  odGained: number;
  odChargeBefore: number;
  odChargeAfter: number;
  /** The meter reached 100% on this move. */
  odReady: boolean;
  /** Overdrive was active for this move (its points were multiplied). */
  odActive: boolean;
  /** Active placements left after this move (0 when it just ended or was never on). */
  odLeft: number;
  /** This move was the last Overdrive placement. */
  odEnded: boolean;
  /** No move is possible without activating the charged Overdrive (game over is held off). */
  odAvailable: boolean;
  /** Daily: placements used after this move, and whether the limit ended the challenge. */
  placementsUsed: number;
  limitReached: boolean;
}

export type MoveOutcome =
  | { ok: true; state: GameState; result: MoveResult }
  | { ok: false; reason: 'over' | 'empty-slot' | 'blocked' };

export type RotateOutcome =
  | { ok: true; state: GameState; cost: number; piece: PieceInstance; free: boolean }
  | { ok: false; reason: 'over' | 'empty-slot' | 'disabled' | 'no-energy' };

export type OverdriveOutcome =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'over' | 'disabled' | 'not-charged' | 'active' };

export const freshStats = (): GameStats => ({
  moves: 0, linesCleared: 0, maxLinesAtOnce: 0, maxCombo: 0, pulsesActivated: 0, maxChain: 0, blocksPlaced: 0,
  rotations: 0, energySpent: 0, energyEarned: 0, energyFromLevels: 0,
  perfectClears: 0, comboProtected: 0, odActivations: 0, odFreeRotations: 0, odBestScore: 0, odMaxLines: 0, odMaxChain: 0,
});

export const freshOverdrive = (charge = 0): OverdriveState => ({ charge, active: 0, freeLeft: 0, score: 0 });

/** The config a game plays under: games started before Build 4 keep ruleset 1 scoring and thresholds. */
export function rulesFor(cfg: GameConfig, state: Pick<GameState, 'ruleset'>): GameConfig {
  if ((state.ruleset ?? CURRENT_RULESET) !== 1) return cfg;
  const L = LEGACY_RULESET_1;
  return { ...cfg, scoring: L.scoring, progression: { ...cfg.progression, thresholds: L.thresholds, extraGapStep: L.extraGapStep } };
}

/**
 * The rotation rules in force right now, and the energy they can spend. During Overdrive the benefit applies:
 * free (any turn costs nothing), limited (free turns count as extra energy), reduced (cost − 1), or none.
 */
export function effectiveRotation(cfg: GameConfig, s: Pick<GameState, 'energy' | 'od'>): { rc: RotationConfig; energy: number } {
  const rc = cfg.rotation;
  const od = s.od;
  if (!od?.active || rc.mode !== 'energy' || !cfg.overdrive.enabled) return { rc, energy: s.energy };
  switch (cfg.overdrive.rotation) {
    case 'free': return { rc: { ...rc, mode: 'unlimited' }, energy: s.energy };
    case 'limited': return { rc, energy: s.energy + od.freeLeft * rc.cost };
    case 'reduced': return { rc: { ...rc, cost: Math.max(0, rc.cost - 1) }, energy: s.energy };
    default: return { rc, energy: s.energy };
  }
}

/** Rotation rules the player would have if they activated a charged Overdrive now. */
function rotationIfActivated(cfg: GameConfig, s: Pick<GameState, 'energy' | 'od'>) {
  return effectiveRotation(cfg, { energy: s.energy, od: { ...(s.od ?? freshOverdrive()), active: cfg.overdrive.duration, freeLeft: cfg.overdrive.limitedFree } });
}

export const overdriveCharged = (s: Pick<GameState, 'od'>) => !!s.od && s.od.active === 0 && s.od.charge >= 100;

type OverCheck = Pick<GameState, 'board' | 'tray' | 'energy'> & Partial<Pick<GameState, 'od' | 'daily' | 'stats' | 'mode'>>;

/**
 * Rotation- and Overdrive-aware game over. Over when the Daily placement limit is used, or when no remaining
 * piece fits in any orientation the player can reach: with Rotation Energy, with active Overdrive's free turns,
 * or (held off, not auto-activated) by activating a charged Overdrive.
 */
export function overState(s: OverCheck, cfg: GameConfig = DEFAULT_CONFIG): { over: boolean; odAvailable: boolean; limit: boolean } {
  if (s.daily && (s.stats?.moves ?? 0) >= s.daily.limit) return { over: true, odAvailable: false, limit: true };
  const { rc, energy } = effectiveRotation(cfg, s);
  if (!isGameOverWithRotation(rc, s.board, s.tray, energy)) return { over: false, odAvailable: false, limit: false };
  if (cfg.overdrive.enabled && overdriveCharged(s)) {
    const alt = rotationIfActivated(cfg, s);
    if (!isGameOverWithRotation(alt.rc, s.board, s.tray, alt.energy)) return { over: false, odAvailable: true, limit: false };
  }
  return { over: true, odAvailable: false, limit: false };
}

export function stateIsOver(s: OverCheck, cfg: GameConfig = DEFAULT_CONFIG): boolean {
  return overState(s, cfg).over;
}

/** Deal the next Daily tray from the fixed sequence (never from the board). */
function dealDaily(d: DailyProgress, traySize: number): { tray: (PieceInstance | null)[]; daily: DailyProgress } {
  const tray: (PieceInstance | null)[] = [];
  let pos = d.seqPos;
  for (let i = 0; i < traySize; i++) tray.push(pos < d.sequence.length ? { ...d.sequence[pos++] } : null);
  return { tray, daily: { ...d, seqPos: pos } };
}

export interface NewGameOptions {
  board?: Board; pulseChance?: number; mode?: GameMode; energy?: number; score?: number;
  /** Build 4. */
  overdrive?: number; daily?: Omit<DailyProgress, 'seqPos'>; ruleset?: number;
}

export function newGame(seed: number, cfg: GameConfig = DEFAULT_CONFIG, opts: NewGameOptions = {}): GameState {
  const rng = new Rng(seed);
  const board = opts.board ?? emptyBoard(cfg.boardSize);
  const energy = opts.energy ?? cfg.rotation.startCharges;
  const mode = opts.mode ?? (opts.daily ? 'daily' : 'classic');
  const ruleset = opts.ruleset ?? cfg.ruleset;
  const rules = rulesFor(cfg, { ruleset });
  // A starting score (developer scenarios) starts at the level that score has reached.
  const score = opts.score ?? 0;
  const level = mode === 'classic' ? levelForScore(rules.progression, score) : 1;
  let tray: (PieceInstance | null)[], recent: string[] = [], daily: DailyProgress | undefined;
  if (opts.daily) {
    ({ tray, daily } = dealDaily({ ...opts.daily, seqPos: 0 }, cfg.traySize));
  } else {
    ({ tray, recent } = generateTray(cfg, board, rng, { score, level, recent: [], pulseChance: opts.pulseChance, energy }));
  }
  const state: GameState = {
    mode, seed, rngState: rng.state, board, tray, recent, score, combo: 0, energy, level,
    stats: freshStats(), over: false, pulseChance: opts.pulseChance,
    ruleset, shield: 0, od: freshOverdrive(Math.min(100, opts.overdrive ?? 0)), ...(daily ? { daily } : {}),
  };
  state.over = stateIsOver(state, cfg);
  return state;
}

/** Rotate a tray piece 90° clockwise, paying Rotation Energy when the turn changes the piece (Overdrive may make it free). */
export function rotatePiece(state: GameState, slot: number, cfg: GameConfig = DEFAULT_CONFIG): RotateOutcome {
  if (state.over) return { ok: false, reason: 'over' };
  const piece = state.tray[slot];
  if (!piece) return { ok: false, reason: 'empty-slot' };
  if (cfg.rotation.mode === 'none') return { ok: false, reason: 'disabled' };
  const { rc, energy: canSpend } = effectiveRotation(cfg, state);
  if (!rotationAllowed(rc, piece, canSpend)) return { ok: false, reason: 'no-energy' };
  const base = rotationCost(cfg.rotation, piece);
  let cost = rotationCost(rc, piece);
  let od = state.od;
  let freeUsed = base > 0 && cost < base;
  // Limited benefit: spend free turns before real energy.
  if (od?.active && cfg.overdrive.rotation === 'limited' && base > 0 && od.freeLeft > 0) {
    od = { ...od, freeLeft: od.freeLeft - 1 };
    cost = 0; freeUsed = true;
  }
  const next = rotated(piece);
  const tray = state.tray.slice();
  tray[slot] = next;
  const energy = state.energy - cost;
  const st = state.stats;
  const stats = { ...st, rotations: st.rotations + 1, energySpent: st.energySpent + cost, odFreeRotations: (st.odFreeRotations ?? 0) + (freeUsed ? 1 : 0) };
  const s: GameState = { ...state, tray, energy, stats, od };
  s.over = stateIsOver(s, cfg);
  return { ok: true, state: s, cost, piece: next, free: freeUsed };
}

/** Activate a fully charged Overdrive. Not a placement; never automatic. */
export function activateOverdrive(state: GameState, cfg: GameConfig = DEFAULT_CONFIG): OverdriveOutcome {
  if (!cfg.overdrive.enabled || state.mode === 'tutorial') return { ok: false, reason: 'disabled' };
  if (state.over) return { ok: false, reason: 'over' };
  const od = state.od ?? freshOverdrive();
  if (od.active > 0) return { ok: false, reason: 'active' };
  if (od.charge < 100) return { ok: false, reason: 'not-charged' };
  const s: GameState = {
    ...state,
    od: { charge: 0, active: cfg.overdrive.duration, freeLeft: cfg.overdrive.limitedFree, score: 0 },
    stats: { ...state.stats, odActivations: (state.stats.odActivations ?? 0) + 1 },
  };
  s.over = stateIsOver(s, cfg);
  return { ok: true, state: s };
}

/** Overdrive charge earned by one move: one line reward (not the sum of smaller ones), plus Pulses, chain and perfect bonuses. */
export function overdriveCharge(cfg: GameConfig, lineCount: number, pulses: number, perfect: boolean): number {
  const o = cfg.overdrive;
  let c = 0;
  if (lineCount > 0) {
    const last = o.chargeLines.length - 1;
    c += lineCount <= last ? o.chargeLines[lineCount] : o.chargeLines[last] + (lineCount - last) * o.chargeExtraLine;
  }
  c += pulses * o.chargePerPulse;
  if (pulses >= o.chainBonusAt) c += o.chargeChainBonus;
  if (perfect) c += o.chargePerfect;
  return c;
}

export function applyMove(state: GameState, slot: number, row: number, col: number, cfgIn: GameConfig = DEFAULT_CONFIG): MoveOutcome {
  if (state.over) return { ok: false, reason: 'over' };
  const piece = state.tray[slot];
  if (!piece) return { ok: false, reason: 'empty-slot' };
  if (!canPlace(state.board, shapeOf(piece), row, col)) return { ok: false, reason: 'blocked' };
  const cfg = rulesFor(cfgIn, state);

  const { board: afterPlace, placed } = placePiece(state.board, piece, row, col);
  const { rows, cols } = findCompletedLines(afterPlace);
  const lines = lineCells(afterPlace, rows, cols);
  const pulse = resolvePulses(afterPlace, lines);
  const lineCount = rows.length + cols.length;

  const board: Board = { size: afterPlace.size, cells: afterPlace.cells.slice() };
  for (const k of pulse.allCleared) board.cells[k] = null;
  // Perfect Board Clear: this placement's full resolution emptied the board (a fresh empty board never counts).
  const perfect = lineCount > 0 && board.cells.every((c) => !c);

  // Combo and Combo Protection. A clear raises the combo and refills protection; a setup move spends it.
  const protection = Math.max(0, cfg.combo.protection);
  const shieldBefore = state.shield ?? 0;
  let combo: number, shield: number, comboProtected = false;
  if (lineCount > 0) { combo = state.combo + 1; shield = protection; }
  else if (state.combo > 0 && shieldBefore > 0) { combo = state.combo; shield = shieldBefore - 1; comboProtected = true; }
  else { combo = 0; shield = 0; }
  const shieldRestored = lineCount > 0 && state.combo > 0 && shieldBefore < protection;

  // Overdrive applies to this move if it was active when the piece went down.
  const odBefore = state.od ?? freshOverdrive();
  const odActive = cfg.overdrive.enabled && odBefore.active > 0;
  const points = scoreMove(cfg.scoring, {
    blocksPlaced: placed.length, lineCount, pulsesActivated: pulse.activated, pulseCleared: pulse.pulseCleared, combo,
    perfect, overdrive: odActive ? cfg.overdrive.multiplier : 1,
  });

  // Rotation Energy: one charge back per completed line (Pulse-only removals restore nothing), capped.
  const rc = cfg.rotation;
  const energy = rc.mode === 'energy' ? Math.min(rc.maxCharges, state.energy + lineCount * rc.energyPerLine) : state.energy;
  const energyGained = energy - state.energy;

  // Overdrive charge: never while active, capped at 100, no carry-over.
  const gain = !cfg.overdrive.enabled || odActive || state.mode === 'tutorial' ? 0 : overdriveCharge(cfg, lineCount, pulse.activated, perfect);
  const chargeAfter = Math.min(100, odBefore.charge + gain);
  const odGained = chargeAfter - odBefore.charge;

  const score = state.score + points.total;
  // Level-ups are evaluated after the whole score is in (Classic only). Several levels in one move restore energy once.
  const levelBefore = state.level ?? 1;
  const levelAfter = state.mode === 'classic' ? Math.max(levelBefore, levelForScore(cfg.progression, score)) : levelBefore;
  let energyAfter = energy;
  if (levelAfter > levelBefore && rc.mode === 'energy') {
    const lu = cfg.progression.levelUpEnergy;
    energyAfter = lu === 'full' ? Math.max(energy, rc.maxCharges) : lu === 'one' ? Math.min(rc.maxCharges, energy + 1) : energy;
  }
  const levelEnergy = energyAfter - energy;

  // Overdrive duration: the move fully resolves with its benefits, then the count drops (and may end).
  const odLeft = odActive ? odBefore.active - 1 : 0;
  const odEnded = odActive && odLeft === 0;
  const odScore = odActive ? odBefore.score + points.total : 0;
  const od: OverdriveState = { charge: chargeAfter, active: odLeft, freeLeft: odLeft > 0 ? odBefore.freeLeft : 0, score: odLeft > 0 ? odScore : 0 };

  let tray = state.tray.slice();
  tray[slot] = null;
  let recent = state.recent;
  let rngState = state.rngState;
  let daily = state.daily;
  const newTray = tray.every((p) => !p);
  if (newTray) {
    if (daily) {
      ({ tray, daily } = dealDaily(daily, cfg.traySize));
    } else {
      // The new level's difficulty only reaches trays generated from now on.
      const rng = new Rng(rngState);
      const gen = generateTray(cfg, board, rng, { score, level: levelAfter, recent, pulseChance: state.pulseChance, energy: energyAfter });
      tray = gen.tray; recent = gen.recent; rngState = rng.state;
    }
  }

  const s = state.stats;
  const stats: GameStats = {
    moves: s.moves + 1,
    linesCleared: s.linesCleared + lineCount,
    maxLinesAtOnce: Math.max(s.maxLinesAtOnce, lineCount),
    maxCombo: Math.max(s.maxCombo, combo),
    pulsesActivated: s.pulsesActivated + pulse.activated,
    maxChain: Math.max(s.maxChain, pulse.activated),
    blocksPlaced: s.blocksPlaced + placed.length,
    rotations: s.rotations ?? 0,
    energySpent: s.energySpent ?? 0,
    energyEarned: (s.energyEarned ?? 0) + energyGained,
    energyFromLevels: (s.energyFromLevels ?? 0) + levelEnergy,
    perfectClears: (s.perfectClears ?? 0) + (perfect ? 1 : 0),
    comboProtected: (s.comboProtected ?? 0) + (comboProtected ? 1 : 0),
    odActivations: s.odActivations ?? 0,
    odFreeRotations: s.odFreeRotations ?? 0,
    odBestScore: Math.max(s.odBestScore ?? 0, odScore),
    odMaxLines: Math.max(s.odMaxLines ?? 0, odActive ? lineCount : 0),
    odMaxChain: Math.max(s.odMaxChain ?? 0, odActive ? pulse.activated : 0),
  };
  // Game over is checked last, on the fully resolved state: every clear, chain, energy restore, level-up,
  // Overdrive update and new tray, against every orientation the player can reach.
  const next: GameState = {
    ...state, board, tray, recent, rngState, score, combo, energy: energyAfter, level: levelAfter, stats, over: false,
    shield, od, ...(daily ? { daily } : {}),
  };
  const os = overState(next, cfg);
  next.over = os.over;

  return {
    ok: true,
    state: next,
    result: {
      slot, piece, row, col, placed, boardAfterPlace: afterPlace, rows, cols, lineCells: lines,
      waves: pulse.waves, chain: pulse.activated, points, combo, scoreBefore: state.score, scoreAfter: score,
      energyGained, energyAfterLines: energy, levelEnergy, energyAfter, levelBefore, levelAfter, newTray, gameOver: os.over,
      perfect, comboProtected, shieldRestored, shieldAfter: shield,
      odGained, odChargeBefore: odBefore.charge, odChargeAfter: chargeAfter, odReady: odBefore.charge < 100 && chargeAfter >= 100,
      odActive, odLeft, odEnded, odAvailable: os.odAvailable,
      placementsUsed: stats.moves, limitReached: os.limit,
    },
  };
}

/** True when any remaining piece fits somewhere as it is (no rotation). */
export const anyFitsNow = (s: Pick<GameState, 'board' | 'tray'>) => s.tray.some((p) => p && fitsAnywhere(s.board, shapeOf(p)));

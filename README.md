# BLOQ

**Place. Clear. React.** A Cnmbuck Studios block puzzle for iPhone (portrait), built as a TypeScript web app
wrapped with Capacitor, the same stack as Gravitor.

Classic Mode: an 8×8 board, three pieces at a time, row and column clears, consecutive-move combos and the
signature **Pulse Blocks**, which blast their eight neighbours when their line clears and set off any Pulse
Block they hit.

Build 2 adds **Rotation Energy** (turn a tray piece 90° clockwise for one charge; every cleared line gives a
charge back) and a new graphite, titanium and cyan look. See `docs/BUILD2_REPORT.md` for what changed.

Build 3 adds **levels** (score thresholds with titles, endless past Level 15; each level-up restores Rotation
Energy), **evolving materials** (six anodized-metal finishes unlocked for good as you reach levels 3, 5, 7, 9
and 11), level-based piece difficulty, career statistics, 19 achievements, a richer results screen and share
card. See `docs/BUILD3_REPORT.md`.

Build 4, **The Experience Update**, adds scoring ruleset 2 with Perfect Board Clears, **Combo Protection**,
**Overdrive** (a hand-activated ×2 state with free rotations), the **Daily Challenge** with streaks and a
calendar, a Game Center leaderboard layer, 13 more achievements, solid metal block rendering, music and a new
home, results and share cards. See `docs/BUILD4_REPORT.md`.

Build 5 is at its graphics **approval checkpoint**. It has two block renderers built with Three.js physically
based materials and rendered once into cached sprites: **5B anodized metal** and **5C crystal-metal hybrid**. A
selector in Settings (development builds only) switches between them and Build 4. It also has the redesigned Daily
Challenge landing and history screens. See `docs/BUILD5_PROTOTYPE_REPORT.md`.

Build 6, **Premium Design, Graphic Refinement & Game Feel**, takes the 5C crystal direction further into
edge-lit **energy crystals** (drawn procedurally in 2D, so no WebGL is needed), a recessed board with a metal
and glass perimeter, a layered reactor background, a shattering line clear with Overdrive charge that flies into
the meter, refined sounds, tray pedestals, gold and cyan buttons, today's real puzzle on the Daily screen and an
animated results screen. Rules, scoring and saves are unchanged. See `docs/BUILD6_REPORT.md`.

Build 7 made the board the hero (about 93% of the width, a compact HUD, a practice round with no blank rows) and
added a Blender pipeline for pre-rendered crystals (`tools/render/`). Build 8, **Premium Visual Refinement & Game
Feel**, puts those renders in the game: path-traced **gemstones** (one per material) seated in a machined board
of tiled compartments, a 95%-width board, a settle-and-glint placement, random glints, line-completion anticipation,
gem-shard clears with graduated rewards, a crystalline cascade sound, graduated haptics and a gemstone energy core
on the main menu. Rules, scoring and saves are unchanged. See `docs/BUILD8_REPORT.md`.

## Run it

```sh
npm install
npm run dev            # http://localhost:5173 (also on your LAN for a phone)
npm test               # unit tests (Vitest)
npm run typecheck
npm run build          # development web build in dist/ (developer tools included)
npm run build:release  # App Store web build: developer tools are compiled out
npm run build:preview  # one self-contained HTML file in preview/bloq.html (developer tools included)
npm run simulate       # balancing bot: 300 games per rotation mode, writes sim-results.json
```

### iPhone

The Xcode project is committed in `ios/` (Capacitor 8, Swift Package Manager, iPhone only, portrait). The
Game Center plugin lives in `ios/App/App/GameCenterPlugin.swift` and is registered by
`BloqBridgeViewController`.

**TestFlight without a Mac**: `.github/workflows/testflight.yml` runs on GitHub's macOS runners. It builds the
release bundle, archives with Xcode cloud signing and uploads to App Store Connect. It needs four repository
secrets, listed at the top of that file. Without them it still compiles the app unsigned, as a build check.

On a Mac with Xcode:

```sh
npm run ios:sync       # release build + copy into the Xcode project
npm run ios:open
```

Icon and launch artwork are in `resources/` (`icon-1024.png`, `splash-2732.png`), drawn by the game's own
code with `node tools/render-assets.cjs` after `npm run build:preview`. Drop them into the Xcode asset catalog,
or run `npx @capacitor/assets generate --ios`.

### Developer tools

Development builds only. In Settings, tap the "BLOQ Build 8" label five times (or open the page with `?dev=1`).
`npm run build:release` removes all of this from the bundle. You get:

- **Rotation**: mode (energy, unlimited, none), starting charges, max charges, cost per turn, energy per line.
- **Pulse chance**, **clear timing**, **particle intensity** and **haptic intensity**, live.
- **Level-up energy** (full / one / none), **level-up and material-wave length**, and the material look:
  block brightness, reflectivity, edge highlight, Pulse glow and energy-wave intensity.
- **Advanced JSON**: level thresholds, titles and endless formula, difficulty bands and cap, material colours
  and unlock levels, and scoring, edited live and validated before they apply.
- **Build 4**: Combo Protection, Overdrive duration, multiplier and rotation benefit, ruleset, Daily
  placement limit and date override, visual depth and lighting, and testing buttons (set score, level, energy or
  Overdrive, piece sequence, validate 30 Dailies, test achievement).
- **Scenarios**: Build 4 and Build 4 showcase groups (protection, Overdrive, Perfect Clear, big chains, level
  and material transitions), 19 Build 3 scenarios (levels, multi-level moves, unlocks, fixed material, level-up energy,
  high-level generation, five-Pulse chain, multiple achievements, save/restore, beyond Level 15) and the 16
  Build 2 ones. Some Build 3 scenarios rewrite parts of the local career (they say so). `src/dev/scenarios.ts`.
- **Board editor**: tap cells to cycle empty, block, Pulse.
- **Export analytics** as JSON, and reset all local data.

Dev settings persist under `bloq.dev` in local storage.

## Architecture

The engine is pure TypeScript with no DOM, rendering or timing in it. Every move is resolved in one call
(`applyMove`) that returns the new state plus a `MoveResult` describing everything that happened. The UI
then plays the result back as animation. Animations never write to the game state, so backgrounding,
pausing or skipping mid-animation can't corrupt the board.

| Module | File |
|---|---|
| Balancing config (all numbers) | `src/engine/config.ts` |
| Piece definitions | `src/engine/pieces.ts` |
| Seeded RNG | `src/engine/rng.ts` |
| Board, placement validation, line detection | `src/engine/board.ts` |
| Rotation, Rotation Energy, rotation-aware game over | `src/engine/rotation.ts` |
| Pulse resolution | `src/engine/pulse.ts` |
| Score calculation | `src/engine/scoring.ts` |
| Piece generation | `src/engine/generator.ts` |
| Game state and moves | `src/engine/game.ts` |
| Versioned save data | `src/engine/save.ts` |
| Input lock during resolution | `src/game/session.ts` |
| Lifetime statistics | `src/game/stats.ts` |
| Tutorial script | `src/game/tutorial.ts` |
| Settings | `src/game/settings.ts` |
| Animation controller | `src/render/animator.ts` |
| Board and tray renderer (Canvas 2D) | `src/render/gameView.ts`, `src/render/blocks.ts` |
| Input controller (drag and drop) | `src/ui/input.ts` |
| Logo, home art, splash, share card | `src/ui/art.ts` |
| Screens and glue | `src/app.ts`, `index.html`, `src/ui/styles.css` |
| Persistence | `src/platform/storage.ts` |
| Audio (synthesised, no files) | `src/platform/audio.ts` |
| Haptics | `src/platform/haptics.ts` |
| Share sheet | `src/platform/share.ts` |
| Analytics (local only) | `src/platform/analytics.ts` |
| Studio Orb (canonical, unchanged) | `src/brand/cnmbuck-orb.ts` |

### Dependencies

- Runtime: `@capacitor/core`, `@capacitor/ios`, `@capacitor/haptics`, `@capacitor/share`,
  `@capacitor/filesystem` (writes the share image to the cache for the share sheet), and `three`, which the
  canonical Orb file imports. Only the 2D `drawOrbIcon` is used, so three.js is tree-shaken out of the bundle.
- Dev: TypeScript, Vite, Vitest, Capacitor CLI.
- No game engine, UI framework, ad SDK or tracking SDK. No network requests. The JS bundle is about 95 KB (32 KB gzipped).

### Branding

`src/brand/cnmbuck-orb.ts` is copied byte for byte from `cnmbuck1/cnmbuckstudios-brand` and checked with
`cd src/brand && sha256sum -c cnmbuck-orb.ts.sha256`. Build 2's wordmark uses an
illuminated energy ring for the O, as the Build 2 spec asks. The Orb itself stays on the splash, the home
screen footer, the share card and the app icon. There is no Orb in gameplay.

## Balancing parameters

All in `src/engine/config.ts`, passed to the engine as one object.

- **Scoring (ruleset 2)**: 10 per block placed; lines 150 / 400 / 750 / 1,200, +400 for each line past four;
  100 per Pulse activated; 25 per extra block a Pulse clears; 2,000 for a Perfect Board Clear; combo ×1.0 / 1.5 /
  2.0 / 2.5 / 3.0 (applies to everything except placement), then ×2 while Overdrive is active. Totals are rounded.
  Build 1–3 values are kept as `LEGACY_RULESET_1`.
- **Combo Protection** (`combo.protection`): 1 non-clearing placement survived per clear.
- **Overdrive** (`overdrive`): 5 placements, ×2, free rotations; charge 10 / 25 / 40 / 60 for 1–4 lines (+15 per
  extra), +10 per Pulse, +10 for a 3+ chain, +30 for a Perfect Clear.
- **Daily** (`daily`): 30 placements, 3 starting charges, 12% Pulse, piece mix 30/50/20, 6–10 starting blocks.
- **Pulse chance**: 12% of generated pieces, at most one per piece.
- **Repetition control**: pieces from the last 6 generated are weighted ×0.45; a piece already in the tray
  being built is weighted ×0.2.
- **Difficulty by level** (`difficulty` in the config): the small / medium / large piece mix (1–2, 3–4, 5+
  cells) is 40/45/15 at Levels 1–2, 30/50/20 at 3–4, 25/45/30 at 5–6, 20/45/35 at 7–8, 15/45/40 at 9–10 and
  15/40/45 from Level 11 (the cap). A level-up changes only trays generated after it.
- **Levels** (`progression`): 0, 1,500, 4,000, 7,500, 12,000, 17,500, 24,000, 31,500, 40,000, 49,500, 60,000,
  71,500, 84,000, 97,500, 112,000; past Level 15 each gap grows by 1,000. Level-up restores energy to full.
- **Materials** (`materials`): Magenta L1, Electric Violet L3, Emerald L5, Solar Amber L7, Crimson L9,
  Quantum Platinum L11. Pulse Blocks always stay cyan.
- **Fairness**: when a tray is generated, if no chosen piece fits but some library piece does, one slot is
  swapped for a fitting piece (still weighted). Nothing promises all three stay playable.

- **Rotation** (`rotation` in the config): mode `energy`, 3 starting charges, max 3, 1 charge per turn,
  1 charge back per completed line (Pulse-only removals give nothing), 180 ms turn animation.
- **Generation** is rotation-aware: the fairness check counts a piece as playable if it fits now or after
  turns the player can afford. The generator never rotates pieces itself.

## Rules decisions worth knowing

- A Pulse Block cleared by another Pulse's blast scores both its activation (50) and its block (10).
- Game over is checked after all clears and chains, against every remaining piece at every position and
  every orientation the current energy can pay for.
- A turn that leaves the piece looking identical (shape and Pulse position) is free, so a 2×2 or 3×3 without
  an off-centre Pulse never costs energy.
- Rotation earns no points and doesn't break the combo.
- An invalid drop returns the piece to the tray and doesn't touch the combo.
- A drop snaps to the nearest legal grid position within ¾ of a cell; the preview always shows exactly
  where the piece will land.
- Pieces that can't fit anywhere right now are dimmed in the tray. If one fits only after a turn, its rotate
  button glows softly (the spec's subtle hint). The hint never says where to put it.

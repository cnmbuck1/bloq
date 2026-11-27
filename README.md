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

Needs a Mac with Xcode.

```sh
npx cap add ios        # first time only: creates ios/
npm run ios:sync       # release build + copy into the Xcode project
npm run ios:open
```

Icon and launch artwork are in `resources/` (`icon-1024.png`, `splash-2732.png`), drawn by the game's own
code with `node tools/render-assets.cjs` after `npm run build:preview`. Drop them into the Xcode asset catalog,
or run `npx @capacitor/assets generate --ios`.

### Developer tools

Development builds only. In Settings, tap the "BLOQ Build 3" label five times (or open the page with `?dev=1`).
`npm run build:release` removes all of this from the bundle. You get:

- **Rotation**: mode (energy, unlimited, none), starting charges, max charges, cost per turn, energy per line.
- **Pulse chance**, **clear timing**, **particle intensity** and **haptic intensity**, live.
- **Level-up energy** (full / one / none), **level-up and material-wave length**, and the material look:
  block brightness, reflectivity, edge highlight, Pulse glow and energy-wave intensity.
- **Advanced JSON**: level thresholds, titles and endless formula, difficulty bands and cap, material colours
  and unlock levels, and scoring, edited live and validated before they apply.
- **Scenarios**: 19 Build 3 scenarios (levels, multi-level moves, unlocks, fixed material, level-up energy,
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

- **Scoring**: 1 per block placed; lines 100 / 250 / 450 / 700, +250 for each line past four; 50 per Pulse
  activated; 10 per extra block a Pulse clears; combo ×1.0 / 1.5 / 2.0 / 2.5 / 3.0 (applies to line and Pulse
  points, not placement). Totals are rounded.
- **Pulse chance**: 12% of generated pieces, at most one per piece.
- **Repetition control**: pieces from the last 6 generated are weighted ×0.45; a piece already in the tray
  being built is weighted ×0.2.
- **Difficulty by level** (`difficulty` in the config): the small / medium / large piece mix (1–2, 3–4, 5+
  cells) is 40/45/15 at Levels 1–2, 30/50/20 at 3–4, 25/45/30 at 5–6, 20/45/35 at 7–8, 15/45/40 at 9–10 and
  15/40/45 from Level 11 (the cap). A level-up changes only trays generated after it.
- **Levels** (`progression`): 0, 1,000, 2,500, 4,500, 7,000, 10,000, 13,500, 17,500, 22,000, 27,000, 32,500,
  38,500, 45,000, 52,000, 59,500; past Level 15 each gap grows by 500. Level-up restores energy to full.
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

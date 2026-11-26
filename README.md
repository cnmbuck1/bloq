# BLOQ

**Place. Clear. React.** A Cnmbuck Studios block puzzle for iPhone (portrait), built as a TypeScript web app
wrapped with Capacitor, the same stack as Gravitor.

Build 1 is Classic Mode only: an 8×8 board, three pieces at a time, row and column clears, consecutive-move
combos and the signature **Pulse Blocks**, which blast their eight neighbours when their line clears and set
off any Pulse Block they hit.

## Run it

```sh
npm install
npm run dev            # http://localhost:5173 (also on your LAN for a phone)
npm test               # unit tests (Vitest)
npm run typecheck
npm run build          # production web build in dist/
npm run build:preview  # one self-contained HTML file in preview/bloq.html
```

### iPhone

Needs a Mac with Xcode.

```sh
npx cap add ios        # first time only: creates ios/
npm run ios:sync       # build + copy into the Xcode project
npm run ios:open
```

Icon and launch artwork are in `resources/` (`icon-1024.png`, `splash-2732.png`), drawn by the game's own
code with `node tools/render-assets.cjs` after `npm run build:preview`. Drop them into the Xcode asset catalog,
or run `npx @capacitor/assets generate --ios`.

### Developer tools

In Settings, tap the "BLOQ Build 1" label five times (or open the page with `?dev=1`). You get:

- **Scenarios**: prepared boards that reproduce unusual situations (a 4-Pulse chain, row + column cross,
  triple clear, Pulses on the edges, nearly game over, empty board). Defined in `src/dev/scenarios.ts`.
- **Board editor**: tap cells to cycle empty, block, Pulse.
- **Pulse chance** slider, live.
- **Export analytics** as JSON, and reset all local data.

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
| Board, placement validation, line detection, game over | `src/engine/board.ts` |
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
- No game engine, UI framework, ad SDK or tracking SDK. No network requests. The JS bundle is about 65 KB.

### Branding

`src/brand/cnmbuck-orb.ts` is copied byte for byte from `cnmbuck1/cnmbuckstudios-brand` and checked with
`cd src/brand && sha256sum -c cnmbuck-orb.ts.sha256`. The wordmark uses the kit's `drawOrbWordmark` helper,
so the O in BLOQ is the Orb. The splash shows the Orb and "CNMBUCK STUDIOS". There is no Orb in gameplay.

## Balancing parameters

All in `src/engine/config.ts`, passed to the engine as one object.

- **Scoring**: 1 per block placed; lines 100 / 250 / 450 / 700, +250 for each line past four; 50 per Pulse
  activated; 10 per extra block a Pulse clears; combo ×1.0 / 1.5 / 2.0 / 2.5 / 3.0 (applies to line and Pulse
  points, not placement). Totals are rounded.
- **Pulse chance**: 12% of generated pieces, at most one per piece.
- **Repetition control**: pieces from the last 6 generated are weighted ×0.45; a piece already in the tray
  being built is weighted ×0.2.
- **Difficulty tiers** by score (0, 1,500, 5,000, 12,000): multipliers on piece-category weights. Early play
  favours small pieces; later play brings more 3×3 squares, big Ls and 1×5s. This is visible and score-based,
  not hidden manipulation.
- **Fairness**: when a tray is generated, if no chosen piece fits but some library piece does, one slot is
  swapped for a fitting piece (still weighted). Nothing promises all three stay playable.

## Rules decisions worth knowing

- A Pulse Block cleared by another Pulse's blast scores both its activation (50) and its block (10).
- Game over is checked after all clears and chains, against every remaining piece at every position.
- An invalid drop returns the piece to the tray and doesn't touch the combo.
- A drop snaps to the nearest legal grid position within ¾ of a cell; the preview always shows exactly
  where the piece will land.
- Pieces that can't fit anywhere right now are dimmed in the tray. That's state, not strategy, so it isn't
  a hint in the spec's sense, but it's easy to remove if you disagree.

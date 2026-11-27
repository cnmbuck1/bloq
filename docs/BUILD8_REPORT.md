# BLOQ Build 8: Premium Visual Refinement & Game Feel

Build 8 builds on the Build 7 gemstone direction. It refines the existing design and does not replace it. It changes only presentation, audio and haptics. Rules, piece generation, scoring, difficulty, modes, Daily Challenge logic, progression, saved data and monetization are untouched (the engine in `src/engine` has no changes).

## What changed

### Crystals (`src/render/gems.ts`, `src/assets/gems/`)
- **Rendering.** The crystals are path-traced in Blender Cycles with `tools/render/crystal_scene.py`.
  - The princess cut is kept. The girdle is taller (more thickness) and there are two pronounced crown bevels.
  - The pavilion is deeper, so light returns through the table.
  - The camera is 16° off vertical, so the front facet shows.
  - Lighting is retuned: no white strip reflection, and stronger light and shadow on the facets.
- **Colour.** Each colour comes from absorption inside the stone (thicker paths are deeper), with no painted gradients.
- **Material mapping.** The six materials map to gemstones. Materials, names and unlock levels are unchanged.

  | Material | Gemstone |
  |---|---|
  | Magenta | Pink sapphire |
  | Electric Violet | Amethyst |
  | Emerald | Emerald |
  | Solar Amber | Amber |
  | Crimson | Ruby |
  | Quantum Platinum | Diamond |

  - The Pulse Block is an aquamarine with its diamond energy core.
  - Royal sapphire, golden topaz and aquamarine are also rendered. The menu uses them.
  - The game uses one material at a time (progression), so the extra stones aren't used on the board.
- **Delivery.** There are 11 WebP files, 126 KB in total. They're inlined into the bundle and decoded once at start-up, so they're preloaded.
- **Contact shadow.** Each crystal has a soft shadow towards the lower right (the same light direction as the renders).

### Board (`paintBoard8` in `src/render/blocks.ts`)
- **Compartment.** One machined compartment is rendered straight down at exactly one cell pitch, then tiled, so every cell has the same light. It has:
  - a graphite floor;
  - tapered walls lit from the upper left;
  - occlusion in the corners;
  - a 45° chamfer on the upper edge that catches the light.
- **Frame.** Matte gunmetal with a machined bevel.
- **Cyan perimeter.** It stays restrained: a dim line with brighter corner brackets.
- **Seating.** The stone covers 94% of a cell, which is narrower than the compartment opening and wider than its floor. A dark seam and the lit lip show around it, so it reads as sitting inside.

### Screen use (`GameView.resize`)
- The board is 95% of the width on iPhone 14, 13 mini and Pro Max, in Practice and in Classic.
- On iPhone SE it's 94% in Practice and 90% in Classic. That keeps tray pieces large enough to drag (26 px cells rather than 21).
- Tray platforms are shallow machined recesses that match the board (`paintPlatform8`).

| Screen | Practice | Classic |
|---|---|---|
| iPhone 14 (390×763) | 371 px, 95% | 371 px, 95% |
| iPhone 13 mini (375×728) | 356 px, 95% | 356 px, 95% |
| iPhone Pro Max (430×839) | 409 px, 95% | 409 px, 95% |
| iPhone SE (375×647) | 353 px, 94% | 337 px, 90% |

### Placement
- **Selecting.** The piece lifts, gets a soft shadow and becomes slightly brighter.
- **Valid drop: a 140 ms settle.**
  1. The crystal comes down slightly enlarged.
  2. It compresses to 96% as it seats, then rests.
  3. Then a glint travels across each stone, staggered along the piece.
- **Invalid drop.** It shows a faint warm-grey outline with no red fill. The piece glides back.

### Glints
- A narrow band of light crosses the facets from the upper left (the global light direction). It's masked to the stone.
- When idle, one random stone catches the light every 1.5–4.3 s, with at most two at once.
- Reduced Motion turns all glints off. Reduced Effects turns off the idle glints only.

### Line-completion preview
While a drop would complete a row or column:
- the stones in that line brighten slightly;
- a slow light runs along the line through the stones.

It disappears as soon as the piece moves away. It never suggests where to play.

### Clearing
- **Phase 1, build-up (about 80–120 ms).** The stones brighten and light runs through their facets.
- **Phase 2, fracture.** Each stone breaks into shards cut from the gem image itself, so they keep its facets and colour. Gem chips (sharp two-tone triangles) and brief bright flecks replace the round and square particles.
- **Phase 3, board response.** The energy wave runs along the cleared compartments. The cyan perimeter answers in proportion to the clear (it was magenta in Build 6).
- **Phase 4, recovery.** As in Build 6, play is never held up.

Rewards are graduated:

| Clear | Response |
|---|---|
| Single line | Fracture and pulse |
| Two lines | Larger shards, synchronised sweeps, crystalline cascade sound |
| Three lines | Expanded particles, perimeter response, shake, strong triple haptic |
| Four or more lines | Frame celebration, flash, long cascade with a held shimmer, burst haptic |
| Perfect Clear | Gold and cyan wave |
| New best | Gold record chime and success haptic |

### Sound (`src/platform/audio.ts`)
- Clears of two or more lines add a rising cascade of glass chimes. It grows with each extra line, and four or more lines end on a held shimmer.
- Placement and clear sounds already vary their pitch slightly on every play.
- Sound and haptics still have independent settings.

### Haptics (`src/platform/haptics.ts`)
These use native iOS Core Haptics through Capacitor.

| Event | Haptic |
|---|---|
| Two lines | Medium then light |
| Three lines | Heavy, medium, light |
| Four or more lines | Heavy, heavy, medium, success |
| Invalid drop | A selection tick (it was a warning notification) |

### Menu, Daily and version
- **Main menu centrepiece.** The Pulse crystal is an energy core inside a tilted, slowly turning ring of eight gemstones. The far side of the ring passes behind the core and dims. Stones catch the light now and then, and the core discharges a soft cyan ring every 6.5 s.
  - It's static with Reduced Motion.
  - The secondary navigation is fully visible on all four test sizes. On iPhone SE the CNMBUCK Studios footer is slightly clipped.
- **Daily Challenge.** The puzzle preview uses the new board and gems.
  - The Start button ends 424 px down a 763 px screen, with no scrolling.
- **Version label.** It reads "BLOQ Build 8".
- **Graphics selector.** The dev-only selector gains "8 Gems", which is the default. Release builds ship only the gem style. They fall back to the Build 6 crystals if the images can't be decoded.

## Not verified
- **Device testing.** Nothing has been tested on an iPhone: 60 fps, haptics feel, audio levels and timing need checking on device.
  - The renderer draws cached sprites, so per-frame work is about the same as Build 6.
  - Glints use one shared scratch canvas.
  - Particle counts stay capped as before (560, or 220 with Reduced Effects). The particles aren't pooled objects, but the caps bound them.
- **Screenshot and video viewports.** Screenshots and the video come from headless Chromium at app-like viewport sizes.
- **Video timing.** The video was recorded by headless Chromium, which runs slower than real time. Effects in it look longer than they are on device.

## Deliverables
These are in `/mnt/project-files/bloq/build8/`:
- `build8-screens-overview.png`
- `build8-gemstones.png`
- `screens/`, 40 images:
  - menu
  - practice on iPhone 14 and SE
  - Classic, including SE and Pro Max
  - Daily
  - crystal and Pulse close-ups
  - board close-up and corner
  - each material on the board
  - placement preview with line anticipation
  - single, row-plus-column, triple, four-line and Pulse-chain sequences
  - Overdrive active and an Overdrive triple
- `video/build8-game-feel.mp4`
- `gems/`: the graded renders at 384 px.

Tests: 156 passed, 1 skipped (the new `tests/build8.test.ts` covers the gem mapping, the shipped assets and seating).

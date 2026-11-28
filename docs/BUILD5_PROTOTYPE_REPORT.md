# BLOQ Build 5: graphics prototypes and Daily Challenge corrections (approval checkpoint)

This build stops at the checkpoint Chris set. It contains the two block-graphics prototypes, a live selector
and the Daily Challenge usability corrections. The remaining Build 5 enhancements and the rest of the material
collection wait until a direction is chosen. The working notes are in `docs/BUILD5_SPEC_NOTES.md`.

## Rendering approach

I evaluated the options in the brief against the existing Canvas 2D renderer. **Blocks are now real 3D objects,
lit with physically based materials and rendered once into sprites.**

- **Three.js** (`src/render/block3d.ts`) builds each block from procedural geometry:
  - 5B is a rounded square extruded with a real chamfer, plus a subdivided pillowed face.
  - 5C is a cut crystal (an octagonal girdle and a faceted crown) over a mirror pavilion, inside a metal bezel.
- The materials are `MeshPhysicalMaterial`:
  - 5B: metal with an anodized clear coat and anisotropic brushed grain.
  - 5C: a transmissive crystal with refraction, dispersion and slight iridescence.
- **Environment-based reflections** come from a procedural studio (soft boxes and strip lights, prefiltered with
  PMREM). It uses no HDR files, so the light is consistent and controlled. Straight overhead is kept dark, so
  crystal tables stay clear and metal faces get their light from their curvature.
- **Orthographic camera**: straight overhead with an 11° forward tilt. Every block shows its top, bevels and a
  sliver of front wall in the same way. There is no perspective distortion, and the 2D gameplay is unchanged.
- **Contact shadows** are a two-layer soft shadow (a tight core and a wide penumbra) painted under each sprite.
- **Prerendered sprites**: each sprite is rendered at 2× supersampling the first time a size, material and style
  is needed, then cached. During play the 2D canvas only copies sprites, exactly as in Build 4. Nothing runs in
  WebGL per frame, and only one small WebGL context exists. If WebGL is unavailable, the game falls back to the
  Build 4 graphics.
- **Not used:**
  - Custom GLSL shaders: the physical materials covered the look.
  - Real-time ambient occlusion: the occlusion is built into the geometry and the shadow.
  - Prerendered image files: rendering at runtime gives crisp sprites at every screen scale and material.

## The two prototypes

- **5B Anodized metal**:
  - A machined tile with a broad, crisp 45° chamfer. It is lit on the top and left and falls into shade on the
    right and front.
  - The face is a gently pillowed brushed panel with an anisotropic sheen and a thin clear coat.
  - The Pulse is a cyan anodized housing holding a self-lit faceted cyan crystal.
- **5C Crystal-metal hybrid**:
  - A cut magenta crystal set in a thin polished bezel tinted by the crystal.
  - Light refracts through the crown onto mirror pavilion facets, so the colour and sparkle come from inside the
    block, not from a painted gradient.
  - The Pulse is a cyan crystal with an energy core inside.
- Both prototypes keep a soft live glow on the Pulse core, so it still breathes and charges before activation.
  Every material colour works, because the renderer takes the material's colours, but only magenta was tuned.
- Clear, Pulse and placement effects are unchanged from Build 4, as the checkpoint asks.

## Graphics selector

Settings > **Block graphics (prototype)**: Build 4, 5B Metal or 5C Crystal. Switching only swaps sprites. The
board, score, combo and rules are untouched, so you can switch in the middle of a game (open Settings from the
game's gear). The choice is remembered on the device. The selector exists in development and preview builds
only; release builds remove it and ship one style, currently 5C until a direction is picked.

## Comparison screenshots

`/mnt/project-files/bloq/build5/comparison/`. Each shot uses the same iPhone 14 screen, board, pieces, drag path
and timing for all three styles:

1. Enlarged block
2. Pulse Block
3. Four-block piece
4. 8×8 board
5. Tray
6. Placement preview (a real pointer drag held over the board)
7. Line clear (two frames)
8. Pulse detonation (three frames)
9. Home hero (full screen and close-up)
10. One-page side-by-side summary

The individual frames are in `raw/`.

## Daily Challenge corrections

- **Landing screen**, in the spec's order:
  - Back and heading, then the date, then compact block art.
  - "Today's puzzle awaits" with "30 moves · Same puzzle for everyone · No timer".
  - A champagne-gold button: START CHALLENGE, CONTINUE CHALLENGE or PLAY AGAIN. It has a press animation, a
    select sound and a haptic.
  - Three compact figures: day streak, completed, best daily.
  - A Monday-to-Sunday strip: gold with ✓ for completed, cyan ring and dot for today, graphite with – for
    missed, an outline for future days.
  - View Full Calendar, then "Next challenge in 8h 54m".
- **Fit**: no scrolling on 320×568, 375×812 (mini), 390×844 and 430×932. On very short screens the art goes
  first, then spacing.
- **History screen**:
  - Current and longest streak, completed, this month, best daily and today's best.
  - The month calendar with previous and next, and ✓ marks.
  - The top five personal records.
  - The midnight UTC explanation, with your local time. It scrolls if needed.
- **Data**: every screen reads the same Daily records and stats. Rules, scoring, generation, saves and leaderboard
  eligibility are untouched.
- **Tests**: new tests for the week strip (it agrees with the month calendar, keeps today marked once completed,
  and handles month and year boundaries) and for the records list. All tests pass: 151 passed, 1 skipped. Type
  check is clean.

## Unverified
- **Device performance and the first-use cost of sprite rendering.** In this environment's software GPU, building
  a style's sprites takes about a second the first time. On an iPhone GPU it should be a few tens of
  milliseconds, but that hasn't been measured.
- **The WebGL memory budget in a Capacitor WKWebView on older devices.** One context is reused, and there is a
  fallback to Build 4.
- **The look on a real iPhone display** (colour, brightness, how fine the detail reads at native size).
- **Larger accessibility text sizes.** BLOQ's CSS uses fixed pixel sizes, so iOS Dynamic Type doesn't scale it.
  The landing screen scrolls as a fallback, but true Dynamic Type support would be a separate change.

## After approval
- Apply the chosen style to every material (violet, emerald, amber, crimson, platinum) and tune each one.
- Upgrade the clear and Pulse effects to match: for example, crystal shards for 5C or metal sparks for 5B.
- Bring empty cells, the board frame and the tray platforms in line with the chosen material language.
- Remove the selector and the losing renderer.

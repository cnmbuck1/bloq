# Build 5 working notes (27 Nov 2026, from Chris's two supplemental sheets)

## A. Premium graphics prototype (approval checkpoint)
- Two genuinely different premium renderers, benchmarked against Chris's reference sheet (Options B and C) and an
  iridescent glass cube image. Not new gradients on old blocks: evaluate Three.js ortho / PBR / procedural geometry /
  environment reflections / AO / prerendered 3D sprites / custom shaders / contact shadows.
  - **5B Anodized metal**: magenta metal, precision bevels, controlled reflections, thickness, sophisticated light.
  - **5C Crystal-metal hybrid**: magenta crystal, internal translucency, subtle metal edges, depth, reflections.
- Keep 2D mechanics and fixed overhead view; no perspective distortion.
- Identical comparison shots for each: 1 single block, 2 Pulse, 3 four-block piece, 4 full 8×8 board, 5 tray,
  6 placement preview, 7 line clear, 8 Pulse detonation, 9 home hero, 10 side by side with Build 4.
- Dev graphics selector: Build 4 / 5B / 5C, live, no reset, no gameplay change.
- Quality: depth, vibrant magenta, consistent lighting, bevels, natural reflections, contact shadows, readable at
  game size, Pulse clearly distinct, smooth on mobile. Avoid white borders, glossy-button look, neon outlines,
  diagonal streaks, flat gradients, bloom, plastic look.
- STOP after prototypes + Daily corrections: no remaining materials or other Build 5 enhancements until Chris picks.

## B. Daily Challenge usability corrections (may proceed now)
- Landing screen fits the safe area with no scrolling at standard text sizes; Start button always visible.
- Order: back + heading; date; compact block art; "Today's puzzle awaits" / "30 moves · Same puzzle for everyone ·
  No timer"; champagne-gold primary button (START CHALLENGE / CONTINUE CHALLENGE / PLAY AGAIN, press anim, sound,
  haptic); three compact stats (current streak, completed, best daily); seven-day strip (gold completed, cyan today,
  graphite missed, neutral future, plus symbols); "View Full Calendar" link; "Next challenge in 9h 40m".
- History screen: full month calendar with prev/next, current + longest streak, total completed, this month, best
  daily, today's best, historical records. Scrolling OK. UTC explanation lives here.
- Shrink order when tight: art, spacing, secondary stats, calendar spacing. Never the button. Larger text support.
- Same data everywhere (home, landing, history, results, stats); no data loss; no rule/scoring/generation/leaderboard
  changes.

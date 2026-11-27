# BLOQ Build 6: Premium Design, Graphic Refinement & Game Feel

Build 6 changes how BLOQ looks, sounds and responds. It does not change mechanics, modes, scoring, generation,
difficulty, Overdrive rules, currencies, rewards or saved data. Branch `build-6`, stacked on Build 5 (`build-5`).

Direction: Chris did not pick 5B or 5C explicitly. Build 6 asks for translucent energy-crystal blocks, so this
build takes **the 5C crystal direction**, refined against Chris's visual reference board
(`docs/build6-reference-board.png`).

## Graphics summary

| Area | What changed |
| --- | --- |
| Block material (P0) | New **energy crystal** (`paintCrystal6` in `src/render/blocks.ts`). Light comes from the upper left: the top and left bevels are bright and the lower right is deep. The glass is translucent: the cube's far edges show through, and light trapped inside makes the edges glow, strongest on the lower right. It has an internal core light, a soft rounded reflection (no diagonal streak) and a soft contact shadow. It is drawn procedurally in 2D and cached per size, material and state, so it costs nothing per frame and needs no WebGL. The 3D 5B and 5C renderers remain behind the dev selector for comparison. |
| Pulse Blocks | The same crystal in cyan with a faceted diamond core suspended in the glass, plus the live breathing aura. |
| Block states (P0) | **Available:** under-light on its tray pedestal. **Unavailable:** muted (desaturated and dimmed, never see-through). **Selected/dragged:** lifted, brightened, with light under each crystal. **Valid preview:** a ghost crystal that breathes in its socket. **Invalid preview:** a calm muted red. **Placed:** snap, settle and a placement glow. **Preparing to clear:** the crystal lights up from inside. **Destruction:** it fractures into eight shards. **Overdrive:** a warmer, brighter inner light. |
| Board (P0) | Recessed sockets. Outlines are about 60% dimmer than Build 4, with inner shadows on the top and left and a faint lower-right lip. The perimeter is smoked metal with a glass inner edge, a lit bevel, cyan corner light brackets and a soft magenta ambient halo that separates it from the background. Board size is unchanged (still the maximum the layout allows). |
| Board events | **Placement:** under-glow. **Clears:** directional line sweeps, then a perimeter light pulse that grows with clear size. **Consecutive clears:** raise the ambient energy in the background. **Overdrive:** a gold perimeter with traces and violet energy arcs. |
| Line clear (P0) | Anticipation (the crystals light up), then a staggered shatter that runs out from the placement. Shards fly further on bigger clears and in Overdrive. Particles follow (bounded), then a fading afterglow stays in the cleared sockets. The score appears near the area. Overdrive charge leaves the board as motes that fly into the meter, which fills only when they arrive. Escalation for 1, 2, 3 and 4+ lines comes from shard power, sound layers, shake from 3 lines and a flash from 4. |
| Placement (P0) | Select: lift and brighten over 110 ms with a glassy tone and a light haptic. Snap and settle in 100 ms, glow for 220 ms, with a crystal snap sound and a light haptic. |
| Background (P1) | A layered reactor. Cached base: deep graphite, a violet core behind the board, faint concentric rings and ribs, and a vignette. Live: two very slow light drifts and rare dust motes. It reacts to events (a bloom on each energy release, a combo tint), and Overdrive warms it to gold gradually (about 0.9 s in and out). |
| Overdrive (P1) | Charge travels to the meter as motes, with a small absorb tone and ring on each arrival. Above 80% the meter breathes. Activation keeps the Build 4 sound, haptic and wave, plus the gradual environment change and the frame arcs. |
| Tray (P1) | Pieces sit on dark glass **pedestals** with a lit front lip and a pool of light. New pieces materialise with a short rise and brighten. |
| Daily (P1) | The order now follows the spec: header, date, headline, rules, **today's actual starting board** (the same puzzle Start plays), Start, stats, week strip, link and countdown. The gold button has a thinner bevel and chamfered ends. Calendar cells are refined. Today's mark pops the first time it shows completed. The countdown is a pill that ticks live, and the screen refreshes itself at the reset. **Reset time verified:** midnight UTC (unit test). No scrolling on iPhone SE, mini, 14 and Pro Max. |
| Menu, results, buttons (P2) | **Standard buttons:** gold primary and cyan secondary, with thin bevels, one radius scale and press animations. **Menu:** a gold PLAY CLASSIC card, a cyan Daily card, glass icon tiles and a larger animated crystal centrepiece. **Results:** the score counts up. A record gets a gold score, a landing bounce and crystal sparks. **Banners:** level-up and similar banners now sit on the seam between the HUD and the board instead of over the pieces. |
| Settings | New **Reduced effects**: half the particles, no ambient drift or dust, no screen flash and no frame arcs. Reduced motion still applies as before. |

## Audio and haptics

| Event | Sound (Web Audio, synthesised, slightly varied each time) | Haptic |
| --- | --- | --- |
| Interface button | New soft dry click (shares the select throttle, so a button never double-sounds) | – |
| Select piece | New glassy two-partial tone | selection |
| Snap | Metal snap plus a short crystal ring as it seats | light impact |
| Invalid | Muted low thud (filtered, quieter) | warning |
| Line clear | Energy sweep plus a scatter of glass partials, more for bigger clears | medium |
| Multi clear | Layered ladder tones plus extra shards | medium-strong / strong |
| Overdrive charge arrival | New small rising tick, pitched by meter level | – |
| Overdrive ready / surge / end | Build 4 motif, kept | success patterns |
| Record | Ascending progression, kept | success |

All sounds respect the Sound setting and volume. All haptics respect the Haptics setting and intensity.

## Performance and device testing

- **Not yet tested on a device.** All checks ran in headless Chromium at iPhone sizes. Frame rate, haptics and audio on iPhone still need a device pass.
- **Blocks:** cached bitmaps, one `drawImage` per block. There is no WebGL in the shipped style, which also removes Build 5's sprite render time of about 1 s per style.
- **Particle cap:** 560 alive (220 with Reduced effects). Shards are drawn from the cached sprite (8 clipped draws per breaking block, about 300 ms each). There are 3 to 12 Overdrive motes per clear. Background dust is capped at 10.
- **Per-frame background cost:** one cached image plus at most four radial gradients. Drift and dust are off with Reduced effects or Reduced motion.
- **Audio:** synthesised on demand, with no files to preload. Retriggers are throttled.

## Deliverables

All deliverables are in `/mnt/project-files/bloq/build6/`:
- `screens/`: main menu, gameplay, block, Pulse and piece close-ups, board close-up, Daily (and iPhone SE, history), Overdrive active/ready/triple clear, results (Classic and Daily), line-clear shatter, placement preview, Pulse chain.
- `video/build6-game-feel.mp4`: placement with a real drag, single clear, row + column, triple clear, Overdrive charge, activation and an Overdrive triple clear (31 s).
- `reference-board.png`: Chris's reference.

## Known gaps

- A device pass is needed for 60 fps and haptic feel.
- Main-menu "animated centrepiece" reuses the existing animated crystal cluster in the new material; it is not a new hero animation.
- Screen-to-screen transitions are unchanged from Build 4.

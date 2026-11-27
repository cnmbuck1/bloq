# BLOQ Build 2 report

Visual identity, rotation and gameplay refinement. Date: 26 November 2026. Build 1 behaviour is preserved:
scoring, Pulse rules, combos, the tutorial's original five steps, saves, stats and sharing all work as before.
See `README.md` for how to run it, the architecture and every balancing parameter.

## What changed

**Look (spec sections 3 to 5).** Graphite and titanium with cyan energy, using the spec palette exactly
(`src/render/theme.ts`). Every standard block is the same titanium: bevelled edge, recessed brushed face,
light from the top left, soft contact shadow. Pulse Blocks are cyan with a diamond core, a breathing glow
and an energy line that moves through them, so they read by shape as well as colour. The board is a recessed
platform with a metal frame, lit corner accents and recessed cells. Purple and gold are not used. All 2D
Canvas with cached sprites, no three.js in gameplay.

**Rotation Energy (section 6).** A rotate button under each tray slot turns that piece 90° clockwise in
180 ms with a mechanical click and a haptic tap. Three charges to start, three max, one per turn, one back
per completed line (Pulse-only removals give nothing). A turn that leaves the piece looking identical is
free, and its button shows that. The meter sits between the board and the tray. Restored energy flies from
the cleared line into the meter as cyan sparks. At zero the meter reads NO ENERGY, the buttons dim, and a
tap gives a red shake and a low buzz. No mirroring, and placed pieces never turn. Rotation earns no points
and leaves the combo alone.

**Generation and game over (sections 7 and 13).** The fairness check now counts a piece as playable if it
fits now or after turns the player can afford. The generator never turns pieces for the player and stays
seeded. Game over is decided after every clear and chain, against every orientation the energy can pay for.
When a piece fits only after a turn, its rotate button glows softly.

**Layout (section 8).** Nav bar (pause, BLOQ wordmark, settings), CURRENT SCORE in white with PERSONAL BEST
in gold, a combo row with multiplier, five-segment meter and chain counter, the board, the energy meter,
three permanent recessed tray slots and "PLACE · CLEAR · REACT" at the bottom. On an iPhone 14-size screen
the board takes 48% of the height and tray pieces are drawn about 25% larger than Build 1 (cells of 25px
against 20px). Pieces never re-centre when neighbours are used.

**Drag, clears and Pulses (sections 9 to 11).** The lifted piece casts a shadow; the landing spot shows a
cyan outline, or a muted red one where it can't go. Lines the drop would complete are washed in cyan, and a
Pulse that would fire shows its 3×3 reach with the blocks it would take dashed. Placement settles in
100 ms with a metallic tap. A clear lights the line, sweeps energy along it, brightens, then breaks into
shards. Intensity grows with the line count, intersections flare, and four or more lines run light around
the frame. Pulses charge, build, fire a shockwave limited to their 3×3 and pass energy to the next Pulse.
Messages: PULSE ACTIVATED, DOUBLE PULSE, CHAIN REACTION ×3 / ×4, MASSIVE REACTION, NEW CHAIN RECORD.

**Home, tutorial, audio, results (sections 14 to 17).** Metallic wordmark with an illuminated ring O. The
tutorial adds two steps: turn a piece to fill a column (and see the line pay the energy back), then clear
with no energy left. Seven steps, about 50 seconds, skippable and replayable. New synthesised sounds for
turning, energy restore and denied turns. Results show score, best, lines, largest single clear, highest
combo, biggest chain, rotations used and time. The share card is redrawn in titanium.

**Stats, analytics, saves (sections 18 and 19).** Lifetime rotations, energy earned and spent, average
rotations per game, average session length and most games in one session. New local events:
`rotation_performed`, `rotation_denied`, `rotation_then_placed`, `rotation_then_clear` and `save_reset`.
Saves are now version 2 and are written after every placement and every turn, including orientation and
energy. A Build 1 save in progress migrates (pieces unturned, energy full). Anything that can't be restored
is cleared with a short note, and records are kept.

**Developer menu (section 21).** Rotation mode (energy, unlimited, none), starting and max charges, cost,
energy per line, Pulse chance, clear timing, particle intensity and haptic intensity, plus 16 scenarios and
the board editor. `npm run build:release` compiles all of it out. I checked the release bundle contains none
of the scenario or dev strings. The preview link is a development build, so the tools are there
(Settings, tap the version label five times).

## Configurable parameters

All in `src/engine/config.ts` (`rotation`), and live in the developer menu:

| Parameter | Default |
|---|---|
| Rotation mode | `energy` (also `unlimited`, `none`) |
| Starting charges | 3 |
| Max charges | 3 |
| Cost per 90° turn | 1 |
| Energy per completed line | 1 |
| Turn animation | 180 ms |

Scoring, Pulse chance, repetition control and difficulty tiers are unchanged from Build 1.

## Tests

`npm test`: **77 passed** (4 files), 1 skipped (the balancing simulation, run on demand). `tsc` is clean.

New in Build 2 (31 tests): rotation geometry and the Pulse following its block, four turns returning home,
identity turns being free, cost and energy checks in each mode, energy restore per line and never past the
max, Pulse-only removals giving nothing, rotation not touching score or combo, reachable orientations,
rotation-aware playability and game over, the generator never rotating and staying deterministic, save v2
round trip with orientation and energy, Build 1 save migration, rejected saves, the two new tutorial steps,
the input lock covering rotation, and the 16 scenarios being well formed and doing what their names say.

Play-tested in headless Chromium at iPhone 14 and iPhone SE sizes: the whole seven-step tutorial, a fresh
game, turning then filling a column, energy flowing back, the empty meter, a four-Pulse chain, a triple
clear, the rotation hint, game over and results, settings, stats and the share card. No console errors.

## Screenshots

In the project files under `bloq/build2/`: home, gameplay, a rotation sequence (before, turned, drop
preview, clear, energy restored, no energy), a chain sequence (Pulse preview and three frames), triple
clear, the rotation hint, results, share card, the tutorial's rotation step, iPhone SE gameplay, splash and
settings with the developer menu.

## Balancing simulation

The greedy bot now considers every orientation it can afford and treats each charge as worth a little, so
it turns only when it helps. 300 seeded games per mode (`npm run simulate`):

| | No rotation | Energy (default) | Unlimited |
|---|---|---|---|
| Average score | 2,494 | 5,446 | 8,773 |
| Median (10th–90th pct) | 2,240 (847–4,392) | 4,487 (2,018–10,260) | 7,899 (3,141–15,367) |
| Placements per game | 51 | 94 | 142 |
| Turns per game | 0 | 16.5 | 94.6 |
| Games with a chain of 2+ | 137 | 187 | 226 |

Other energy settings, same bot: max 2 charges gives 94 placements, max 1 gives 89, and cost 2 with max 4
gives 86. The bot almost never runs out of energy (0.1% of moves) because lines refill it so steadily.

## Balancing recommendations

1. **Rotation nearly doubles game length**, and the cap barely matters: even one charge gives 89 placements
   against 51 without rotation. If games feel long in play-testing, the strongest lever is the refill, not
   the cap. Try one charge per clearing *move* rather than per line, or a slower refill above 2 lines.
2. **Difficulty tiers arrive later in real time** because scores climb about twice as fast per game. Consider
   lowering the tier thresholds by about a third (1,000 / 3,500 / 8,000) so chunkier pieces show up at the
   same point in a session.
3. **Keep the default at 3 / 3 / 1 / 1** for the first test group. It reads clearly on the meter, people
   rarely hit zero, and the denied state still teaches that lines pay for turns.
4. **Watch `rotation_denied` and the turns-per-game stat.** A human who turns more freely than the bot will
   hit zero more often; if denials are frequent in the first minute, start with 3 but cap at 4.

The bot doesn't plan chains or save energy for later, so treat these as relative comparisons between modes,
not predictions of human scores.

## Known limitations

- **Orb placement.** The spec suggests an illuminated ring O in the wordmark and makes the Orb optional; the
  studio brand rule asks for the Orb in every build. Both hold: the ring O is in the wordmark, and the Orb
  is on the splash, home footer, share card and app icon.
- **Tray piece size.** The spec asks for 30% to 40% larger pieces where possible. I got about 25% on an
  iPhone 14-size screen without shrinking the board below the spec's 48%, and only about 5% on an iPhone SE,
  where the tray's height is the limit. 4- and 5-long pieces also shrink to fit their slot's width.
- **Not run on a device.** Haptics, the share sheet and audio latency need checking on a real iPhone. The
  web preview has no haptics.
- **Particle intensity** applies to clear shards and Pulse sparks; the energy sparks always use a fixed
  count so the meter refill stays readable.
- Deferred features (section 24) are not built: no new special blocks, modes, power-ups or online features.

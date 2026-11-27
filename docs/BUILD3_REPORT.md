# BLOQ Build 3 report

Level progression, colour evolution and player engagement. Date: 27 November 2026. Built on Build 2 in the
spec's phase order (A levels and saves, B materials and effects, C difficulty, unlocks, career and results,
D developer tools, scenarios, tests and balance). Build 2 behaviour is preserved: scoring, Pulse rules,
Rotation Energy, the tutorial, saves (now migrated), stats and sharing all work as before.

## What changed

**Look.** Standard blocks are now anodized metal rather than plastic: a coloured metal face with a highlight
band, a darker lower bevel and an edge line, in the current material. Level 1 is metallic magenta (#D936AD,
highlight #FF9BEA, shadow #64164F). Pulse Blocks stay cyan at every level, with a brighter perimeter and more
depth while dormant. The level bar, unlock banners and share card follow the current material.

**Levels.** Every game starts at Level 1. Thresholds and titles are exactly the spec table (Initiate 0 to
Quantum Master VI at 59,500). Past Level 15 it is endless: each gap grows by 500 (Level 16 at 67,500, 17 at
76,000, 18 at 85,000) and titles continue Quantum Master VII, VIII and so on. A level-up keeps the score,
board, tray, orientations and combo, earns no points, and refills Rotation Energy to full (dev option: one
charge or none). Several levels in one move award them all, restore energy once and play one celebration
showing the final level. The engine resolves in the spec's order: place, lines, Pulses, score, combo, line
energy, level, level energy, next tray at the new level, then game over. So a level-up can save a game that
line energy alone would have lost (there's a scenario and a test for it).

**Progress indicator.** Under the score: "LEVEL 2 — OPERATOR", "1,850 / 2,500" and "650 points to Level 3".
The bar measures progress within the current level, in the current material, glows gold from 80%, and holds
full until the celebration plays.

**Level-up celebration (about 950 ms, dev-adjustable 700–1200).** It plays after every clear and chain, with
input locked. A gold wave runs round the board frame and a banner shows LEVEL UP (or LEVEL UP ×2), the level
and title, ROTATION ENERGY RESTORED, NEW MATERIAL UNLOCKED when one comes, and the next target. Gold sparks
fly into the energy meter, which flashes and reads ENERGY FULL. There is no dialog and no white flash.

**Materials.** Magenta L1–2, Electric Violet L3–4, Emerald L5–6, Solar Amber L7–8, Crimson L9–10, Quantum
Platinum L11+. On a tier change an energy wave spreads across the board and turns every block (and the tray)
to the new metal in about 560 ms (dev 400–700). Reaching a tier's level unlocks it for good. The new
**Materials** screen (from home) shows each finish with its level range or requirement, lock state and a Use
button. Progressive (the default) follows your level in every game; Fixed uses any unlocked material at every
level. The first time a material arrives you get a one-line tip that colour shows progress and never needs
matching.

**Difficulty by level.** The next tray's small / medium / large mix (1–2, 3–4 and 5+ cells) follows the
spec bands: 40/45/15 at Levels 1–2 up to 15/40/45 from Level 11, which is the cap. A level-up changes only
trays generated afterwards. Generation stays seeded, rotation-aware, fair and repetition-controlled. Pulse
chance stays 12%.

**Career and achievements.** Stored locally under their own key: highest level, highest score, lifetime
points, games, lines, Pulses, biggest chain, largest clear, rotations, time played, unlocked materials and
achievements. Lifetime points are credited per move, keyed on the game's seed and move number, so a restore,
reopen or crash can never count a move twice. All 19 achievements are in, each with progress. Several
earned at once share one toast. Statistics now has a Statistics / Achievements tab pair.

**Results.** It now shows the level reached and title, highest lifetime level, lines, largest clear,
highest combo, biggest chain, rotations and time. Accomplishment chips are NEW PERSONAL BEST, NEW LEVEL
RECORD, a material UNLOCKED chip, NEW ACHIEVEMENT and NEW CHAIN RECORD, with the most significant one
highlighted in gold. It also shows one "next milestone" that isn't done yet. PLAY AGAIN is still one tap.

**Share card.** It now shows the level and title, built in the current material, and picks a message from
what happened: "Can you beat my score?", "I reached Level 7. How far can you go?", "Can you become a
Quantum Master?" or "My biggest chain reaction yet." There's no App Store link yet.

**Effects and messages.** Chain intensity scales up to 5+, and a 4+ chain gets the frame celebration and a
layered sound. New messages: MASSIVE COMBO (at the top multiplier) and PERFECT REACTION (a chain that empties
the board). DOUBLE / TRIPLE / QUAD CLEAR and NEW CHAIN RECORD appear only when true.

**Audio and haptics.** New sounds for level-up (ascending), material sweep, energy recharge, unlock,
achievement and major chains. New haptics: a success pattern on level-up and a subtle tap on unlock. Placement
stays light, clears medium and Pulses strong.

**Screen.** In order: nav, score and best, level and progress, combo, board, energy, tray, rotate buttons,
tagline. Tray pieces are about 12% larger than Build 2 on an iPhone 14-size screen (27.5 px cells against
24.6 px) and about 19% larger on an iPhone SE. The tray now runs slightly wider than the board. The cost is a
board about 7% smaller than Build 2 (37.0 to 34.4 px per cell on iPhone 14), partly because of the new level
row.

**Tutorial.** It is still the Build 2 tutorial, at Level 1 with no levelling. Progression is taught in play,
once each: the level bar after the first line, the level-up at Level 2, materials at Level 3, and permanent
unlocks on the first new material. Tips wait until any showing banner has gone.

**Saves.** Saves are now version 3 and include the level. Build 2 saves migrate by taking the level from
their score, with no level-up replayed and so no duplicate energy or unlocks. The game saves after every
placement and rotation, and immediately when an unlock or achievement is granted (before its animation).

**Analytics.** New events: `level_reached` (time and placements spent in the level), `energy_restored_level_up`,
`material_tier_reached`, `material_unlocked`, `material_selected` and `achievement_unlocked`. `game_ended`
now carries the level and material, `game_started` the game number in the session, and `share_selected` the
level and message. Restart, abandon and session counts were already tracked.

## Developer tools

Settings > tap "BLOQ Build 3" five times, or `?dev=1`. Build 2 controls are kept. New controls:

- Level-up energy, level-up length and material wave length.
- Block brightness, reflectivity, edge highlight, Pulse glow and energy-wave intensity.
- **Advanced JSON**: thresholds, titles, endless formula, difficulty bands and cap, material colours and
  unlock levels, and scoring. It is validated before it applies, and Defaults resets it.
- **35 scenarios**: the 19 Build 3 ones in the spec, plus the 16 from Build 2.
  - The Build 3 ones are: new L1, just below L2 and L3, level-up via a line, via a Pulse chain, multiple
    levels in one move, first material unlock, previously unlocked transition, fixed mode, depleted and full
    energy, game over prevented by level-up energy, Level 9 generation, max difficulty, five-Pulse chain,
    multiple achievements, save/restore during level-up and after an unlock, and beyond Level 15.
  - Each shows a one-line hint when it loads. Scenarios that need a particular career (unlocks,
    achievements) rewrite those fields of the local career, and their hints say so.

## Tests

`npm test`: **103 passed** (1 skipped is the simulation, which runs separately). Build 2 had 77; the new
ones cover:

- **Levels:** thresholds and titles, the endless formula, progress within a level.
- **Level-ups:** by line and by chain; keeping board, tray, orientations and combo; no points for levelling;
  multi-level with one energy restore; full / one / none; full energy not overflowing; game over checked after
  level energy; the tutorial never levelling; beyond Level 15; the five-Pulse chain.
- **Difficulty:** bands, the cap, the measured mix, determinism, new trays only.
- **Materials:** tiers, permanent unlocks granted once, fixed mode with a locked fallback.
- **Career:** lifetime points never counted twice, four achievements from one move and never re-granted, the
  next milestone never one already done.
- **Saves:** v3 restore at a level, v2 migration, an invalid level rejected.
- **Scenarios:** all 35 are well formed.

`npx tsc --noEmit` is clean.

The preview was played in Chromium at iPhone 14 and iPhone SE sizes through every new screen and the key
scenarios with no console errors. Screenshots are in `/mnt/project-files/bloq/build3/`.

## Balancing (greedy bot, 300 seeded games per mode, `npm run simulate`)

| Mode | Avg score | Median | Avg moves | Avg level | Reach L2 | L3 | L5 | L7 | L9+ |
|---|---|---|---|---|---|---|---|---|---|
| Energy (default) | 5,835 | 5,118 | 105 | 3.9 | 98% | 85% | 33% | 4% | 0% |
| No rotation | 2,891 | 2,668 | 60 | 2.6 | 92% | 54% | 4% | 0% | 0% |
| Unlimited | 8,589 | 7,726 | 146 | 4.8 | 99% | 93% | 57% | 16% | 2% |

Build 2's energy mode averaged 5,446 (median 4,487) over 94 moves. Build 3's easier early mix and level-up
energy add about 10% to game length. The bot is greedy with no lookahead, so people who plan will go further.
For the bot, Violet arrives in most games, Emerald in a third, and Amber and beyond are rare. That suits
materials as long-term goals, but if you want most players to see Emerald in their first sessions, lower
Levels 4–5 (for example 4,000 and 6,000) in the dev JSON. In these runs, no game was saved purely by
level-up energy, because level-ups usually come with line clears that already refill it. The rule matters in
edge cases (there's a scenario for it) more than in averages.

## Parameters

All in `src/engine/config.ts` (and the dev JSON):

- `progression`: thresholds, titles, `extraGapStep` 500, beyond title "Quantum Master" numbered from VII,
  `levelUpEnergy` full.
- `difficulty`: six bands, cap Level 11.
- `materials`: six finishes with colour, highlight, shadow and unlock level.
- Celebration timings: 950 ms level-up, 560 ms wave, both in the dev panel.

## Limitations

- Screenshots and play-testing were done in desktop Chromium at phone sizes, not on a device. Haptic and
  audio feel need a check on an iPhone.
- The tray grows on every phone but the board shrinks about 7% to make room. If that feels tight on an SE,
  the next lever is a slimmer header.
- Some Build 3 dev scenarios overwrite parts of the local career by design. Use Reset local data afterwards
  for a clean career.
- Achievements are local only. Game Center is deferred as specified, but the ids are stable strings ready to
  map.
- No App Store link on the share card until there is one.

## Build 4 recommendations

1. Tune Levels 3–6 on real play data (`level_reached` time and placements) so most players see Emerald
   within their first few sessions.
2. Add Game Center achievements and a high-score leaderboard, mapped from the existing ids.
3. Daily challenge with a fixed seed. The engine is already deterministic per seed.
4. A short "how far did I get" career graph in Statistics (level reached per game).
5. Device pass on iPhone SE and Pro Max for haptics, audio levels and the smaller board.

None of the deferred items (modes, multiplayer, currency, IAP, ads, accounts, cloud, 3D) were built.

# BLOQ Build 4: The Experience Update

Built on Build 3 (stacked on the `build-3` branch). Everything from Builds 1–3 is kept. Every new rule is in
`src/engine/config.ts` and can be changed live from the developer panel. Nothing on the deferred list was built
(Mission campaign, multiplayer, new block types, currency, IAP, ads, accounts, push, cloud, perspective 3D).

## What changed

### Strategy (engine)
- **Scoring ruleset 2**: 10 per block placed; lines 150 / 400 / 750 / 1,200, +400 per line past four; Pulse
  activation 100; each extra Pulse-cleared block 25; **Perfect Board Clear** 2,000. Order: placement +
  (lines + Pulse + Pulse blocks + perfect) × combo, then × Overdrive, rounded, then level.
- **New level thresholds**: 0, 1,500, 4,000, 7,500 … 112,000; past Level 15 each gap grows by 1,000.
- **Records by ruleset**: records from Builds 1–3 move into a labelled legacy record (“Best score (Build 1–3
  rules)”). New Classic records start fresh. Daily records never mix with Classic. Unlocks and achievements are kept.
- **Combo Protection**: one non-clearing placement keeps an active combo (the multiplier doesn't rise); a second
  in a row resets it; any clear restores the shield. Shield icon by the combo, COMBO PROTECTED message, restore
  animation. Dev: off / 1 / 2.
- **Overdrive**: a meter charged by clears (one line reward per move: 10 / 25 / 40 / 60, +15 per extra line),
  +10 per Pulse, +10 for a 3+ chain, +30 for a Perfect Clear. At 100% it turns champagne gold and shows
  OVERDRIVE READY. You activate it by hand. For 5 successful placements every point is ×2 and rotations are free.
  It never decays, never recharges while active, and never stacks. Game over considers a charged Overdrive: if
  the only legal move needs its free rotations, the game isn't over and you see OVERDRIVE AVAILABLE.
- **Daily Challenge**: one seeded challenge per UTC day, the same for everyone. It has a generated starting
  board, a fixed piece sequence, a fixed piece-size mix and a 30-placement limit. Every generated day is checked
  to be playable. Your first completed attempt and your best are kept separately. Replays are allowed. Each run
  is recorded once (restoring a save can't double-count it). Daily saves are separate from Classic saves.
- **Saves v4**: Classic and Daily games resume independently; Build 3 saves still load.

### Retention
- **Streaks and calendar**: current streak, longest streak, completed days and this month. An unfinished today
  doesn't break a streak. A Monday-first month calendar shows completed, today, missed and future days.
- **Game Center layer** (see Unverified): leaderboards `bloq.classic.score.r2`, `bloq.classic.level.r2`,
  `bloq.chain.largest` and `bloq.daily.score`. An offline queue keeps the best pending score per board and day,
  and drops Daily scores from a day that has passed instead of sending them late. The Rankings screen shows your
  local bests and Game Center ranks when it can get them. Developer games never submit.
- **13 new achievements** (32 in total): Overdrive Initiate, Energy Master, Maximum Reaction, Critical Overdrive,
  Precision Master, Perfectionist, Combo Guardian, Daily Initiate / Explorer / Specialist / Veteran, Weekly
  Streak, Monthly Streak.
- **Analytics** (local only): first placement, first line and first Pulse; combo protected; Overdrive charged,
  ready, activated and ended; perfect clear; game completed; immediate replay; Daily started, completed and
  replayed; leaderboard viewed; session started.

### Presentation
- **Blocks**: a new procedural metal renderer with a contact shadow, side wall, four chamfers, a face gradient, a
  reflection band and a specular highlight. All six materials use it. Pulse Blocks get a housing. Empty cells are
  dimmer and recessed.
- **Board**: a metallic frame and perimeter that react to combos (cyan), level-ups and Overdrive (gold traces
  and corners). A slow ambient background.
- **Tray**: pieces are about 17% larger on iPhone 14 and 19% larger on iPhone SE, on recessed platforms with
  soft shadows. The board is the same size as in Build 3.
- **Placement feel**: pickup lift and shadow, an 80–120 ms settle compression, a contact edge highlight and
  subtle placement points.
- **Effects**: scaled bursts for chains of 1 to 5+ (a full-screen flash at 5+), intersecting beams on multi-line
  clears, a Perfect Clear gold and cyan wave, an Overdrive activation wave. Particles are capped at 600.
  Simultaneous celebrations are combined.
- **Game screen**: score and best, a more prominent level, the combo with its shield, the board, then one compact
  row with the Overdrive meter and Rotation Energy, then the tray. On narrow screens the labels shorten.
- **Home**: Play Classic and Daily Challenge cards (with personal best, highest level and streak), Continue when
  a save exists, and a six-item nav (Materials, Rankings, Achievements, Statistics, Settings, How to Play).
- **Results**: one highlighted accomplishment, the next milestone, an Overdrive tile and a perfect-clears tile.
  Play Again comes first, then Daily, Share and Home. The Daily results screen and Daily share card are new. The
  Classic share card adds Chain, Overdrive and Material tiles.
- **Audio**: separate sound-effect and music volumes and a music switch. Rapid sounds are throttled with slight
  pitch variation. New sounds for the shield, its restore, Overdrive charge, ready, activation and end, Perfect
  Clear, and combo rising. Generative ambient music at 92 BPM gets more intense during Overdrive.
- **Haptics**: new layered patterns for multi-line clears, major chains, Overdrive, Perfect Clear and the shield.
- **Onboarding**: How to Play is updated, and short first-time tips cover Overdrive, the shield, Perfect Clear
  and the Daily rules. Tips wait until no overlay is open.

### Developer tools (dev builds only)
- Combo protection, Overdrive duration, multiplier and rotation benefit, ruleset, Daily placement limit and date
  override, and visual depth, shadow and light sliders.
- Testing buttons: set score, level, energy or Overdrive; activate Overdrive; set a piece sequence; validate 30
  Dailies; trigger a test achievement.
- New **Build 4** scenarios: Combo Protection, protection already spent, Overdrive ready, nearly charged, holds
  off game over, final placement, Perfect Clear with a Pulse.
- New **Build 4 showcase** scenarios: three-Pulse chain, five-Pulse chain, Overdrive activation, Overdrive triple
  clear, Perfect Clear, major level advancement, full-board material transition.

## Tests

`npx vitest run`: **147 passed, 1 skipped** (148). `npx tsc --noEmit` is clean. New files:
`tests/build4.test.ts` (scoring order, protection, Overdrive charge, duration, rotation and game-over rules,
Daily determinism and validation, saves, showcase scenarios) and `tests/build4-records.test.ts` (Daily records,
streaks, the calendar, the Game Center queue, separated records and the legacy migration, new achievements).

A browser bot played a full Daily (30 placements, 7,468 points) and a Classic game (8,778, Level 4, 2 Overdrives)
end to end with no console errors.

## Balance (greedy bot, 100 games per variant, `src/engine/sim.ts`)

| Variant | Avg score | Notes |
|---|---|---|
| **Default** | **18,031** | 105 placements, avg Level 5.3; L5 70%, L7 19%, L10 4% |
| No Overdrive | 12,673 | |
| Protection off / 2 | 15,040 / 21,271 | |
| Overdrive 3 / 7 moves | 14,156 / 16,956 | |
| Multiplier ×1.5 / ×2.5 | 15,326 / 18,018 | |
| No rotation benefit | 14,950 | |
| Pulse 15% | 17,769 | |

Level 2 arrives around placement 15 (about 1–2 minutes). The first Overdrive is ready around placement 24
(about 2–3 minutes), and there are about 3.9 Overdrives a game. Both are inside the spec's targets.

Daily, 60 generated days: all valid, about 7 ms to generate each, bot average 4,445 (1,785–7,468), 53 of 60
finished all 30 placements, 0.9 Overdrives per run.

Verdict: the bot is a weak player and still reaches Level 5 most of the time, so the defaults are forgiving. I'd
keep them for the first playtest and raise the upper thresholds (L7+) once real players' numbers are in.

## Unverified (could not be tested here)
- **Game Center**: `native/ios/GameCenterPlugin.swift` is written but has not been compiled or run. The four
  leaderboards must be created in App Store Connect with the ids above, and the plugin registered in the iOS
  project (setup notes are in the file). In the browser the layer reports “Game Center unavailable” and keeps
  scores queued.
- **Haptics** on a real iPhone (the patterns are written to the Capacitor Haptics API but haven't been felt).
- **Audio and music feel**: mix, volume balance and how the generative music sounds on device speakers.
- **Performance** on device, especially the 5+ chain and Overdrive effects on older iPhones (SE). It is smooth in
  desktop Chromium with iPhone emulation.
- **Retention metrics**: analytics are local only, so the D1/D7 and streak goals can't be measured yet.
- **Daily day boundary**: it uses UTC midnight for everyone. This is verified in tests, but a player in the
  Americas sees the new challenge in the evening. Worth deciding on before launch.

## Limitations and Build 5 recommendations
- Playtest the balance with people and tune thresholds and Overdrive charge from real numbers.
- Wire analytics to a backend to measure retention.
- Add Game Center achievements to mirror the local ones (not done in Build 4).
- The Mission campaign foundation (`src/engine/mission.ts`) exists but has no UI, as the spec asked.

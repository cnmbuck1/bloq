# Build 4 spec: working notes (condensed from Chris's build sheet "The Experience Update", 27 Nov 2026)

Goal: emotional experience (satisfaction, anticipation, accomplishment, competition). Iterative: preserve all B1–B3
systems. New rules must be configurable. Phases A premium experience → B strategic (scoring, combo protection,
Overdrive) → C daily retention (Daily Challenge, streaks, Game Center) → D presentation (home, results, share,
onboarding, showcase) → E testing. Deferred: Mission Mode campaign, multiplayer, new block types, currency, IAP, ads,
accounts, push, cloud, perspective 3D, mandatory Orb.

## Visuals (3–6)
Dimensional solid metal blocks (bevels, thickness, soft directional contact shadow, controlled reflections, subtle
edge accents), not outlined squares. Approach: best of procedural 2.5D / shaders / prerendered sprites; no perspective 3D.
Same treatment for all 6 materials; transition = substantial upgrade. Empty cells dimmer, recessed, subordinate.
Metallic frame + subtle ambient cyan; perimeter reacts to combos, level-up, Overdrive. Ambient gradient background,
very slow lighting allowed. Avoid excessive letter spacing, technical labels, clutter.
Tray: pieces +15–20% where possible, 3 fixed slots, recessed platforms, soft shadow under pieces, clear empty vs
occupied, disabled states; tray not more prominent than board.

## Placement feel (7)
Lift + shadow + scale to cell size + select sound on pickup. Placement: snap, 80–120 ms compression/settle, contact
edge highlight 100–150 ms, mechanical sound, light haptic, show placement points (subtle). Invalid: clear feedback,
smooth return, subtle sound, no penalty, combo untouched, no energy.

## Scoring ruleset 2 (8)
block 10; lines 150/400/750/1200, +400 per line beyond 4; Pulse activation 100; extra Pulse-cleared block 25;
Perfect Board Clear 2000 (board empty after full resolution; once per placement; career stat; celebration).
Order (14): placement + (lines + pulse + pulse blocks + perfect) × combo, then × Overdrive, round, add, then level.
Score feedback near action; bigger for major; ordinary subtle.

## Levels (9)
Thresholds 0, 1500, 4000, 7500, 12000, 17500, 24000, 31500, 40000, 49500, 60000, 71500, 84000, 97500, 112000;
beyond 15 each gap +1000. Targets: L2 1–3 min, L5 strategy, L10 major. Ruleset version; legacy records kept and
labelled, new records separate; keep unlocks and achievements.

## Combo Protection (10)
With an active combo, one non-clearing placement keeps the combo (multiplier not increased); second in a row resets;
a clear restores protection. Invalid placements, rotations, level-ups don't affect it. Show multiplier, meter,
shield indicator, consumed state; message COMBO PROTECTED; animate shield on restore. Dev: off / 1 (default) / 2.

## Overdrive (11–16)
Meter 0–100%. Charge (one line reward per move, not summed): 1 line 10, 2 25, 3 40, 4 60, +15 per line beyond 4;
+10 per Pulse activated; +10 if chain ≥3; perfect clear +30. No charge from plain placements, rotation, invalid.
Cap 100, no carry, no decay, reset per game, not while active. Target first opportunity 2–4 min.
Ready: champagne gold meter, subtle animation, ready sound, OVERDRIVE READY, manual activation only.
Activate: meter → 0, active placements = 5, visuals, sound, haptic; activation isn't a placement.
Active (5 successful placements): ×2 all points, free rotations, enhanced clears/Pulses, more intense music, gold
board accents. No auto clears, no bigger radius, no rescue pieces, no extra rotation capacity, no timer, no
recharge while active, no stacking. Invalid placements and rotations don't consume. 5th placement fully resolves
then Overdrive ends before the next legal-move check. Rotation Energy preserved; lines and level-ups still restore it.
Meter colours magenta → violet → champagne gold. Activation: gold wave round board, perimeter lights, brief
OVERDRIVE ACTIVE, background intensifies, audio, counter. Active HUD (compact): OVERDRIVE ACTIVE · 2× POINTS ·
FREE ROTATIONS · N MOVES REMAINING. Gold perimeter, traces, stronger effects. Material unchanged, Pulse cyan.
Ending: hint at 1 remaining, finish, fade gold, restore audio, meter back to charging.
Game over: consider normal orientations, affordable rotations, free rotations if active, and a charged Overdrive:
if a legal move exists only via activating it → not over, show OVERDRIVE AVAILABLE. Order: lines, Pulses, score,
combo, energy, level, Overdrive duration, tray, then game over.
Dev balance options: duration 3/5/7 (5), multiplier 1.5/2/2.5 (2), rotation benefit unlimited/limited/reduced/none
(unlimited), combo protection 0/1/2 (1), level-up energy none/one/full (full), Pulse 10/15/20% (keep current 12%).

## Pulse and clears (17–18)
Pulse dormant: dimensional cyan core, subtle internal movement, bright diamond, controlled glow, housing.
Activation: core intensifies, buildup, focused shockwave, neighbours light, fracture, energy transfer, cascade,
score intensity. Chain 1 burst, 2 connected waves, 3 layered + audio, 4 board-wide, 5+ cinematic. Rules unchanged.
Clears: line lights, energy beam sweep, fragments, points; multi: intersecting beams, more particles/audio/haptic.
PERFECT CLEAR: gold+cyan wave, message, particles, sound, big score. Timings: place 80–120, single 200–350,
multi 300–500, major chain 500–900, Overdrive activation 600–900, level 700–1200, perfect 800–1200. Combine
simultaneous celebrations.

## Level-up (19)
As Build 3, plus champagne wave, bar animation, next target. Consolidate with chains/unlocks. Keep energy options.

## Game UI (20)
Order: nav · score + best · level + progress · combo · board · Overdrive meter · Rotation Energy · tray · rotate.
Less letter spacing, level more prominent, readable scores, compact labels, fewer borders, pieces more prominent.
Don't shrink the board for new indicators; consolidate (compact energy-control section).
Colours: material = blocks; cyan = Pulse + Rotation Energy; champagne gold = Overdrive/achievements; cool white
= info; muted red = invalid.

## Audio (21) and haptics (22)
Sounds: select click, placement snap, rotation, single sweep, multi discharge, Pulse burst, chain intensifying,
combo ascending, combo protection tone, Overdrive charging cue, ready signature, activation, ending release,
level-up sequence, perfect clear, material unlock. Variation, no harshness, limit overlaps. Optional ambient
electronic music, looped, more energetic in Overdrive with smooth transitions. Separate music and SFX volume.
Haptics: select very light, place light, rotate light, single medium, multi medium-strong, Pulse distinctive,
major chain layered, Overdrive strong success, level success, perfect premium pattern.

## Daily Challenge (23–26)
Same config for everyone: UTC date id, ruleset, seed, starting board, ordered piece sequence (pre-generated, NOT
board-aware), Pulse positions, starting Rotation and Overdrive energy, 30 successful placements, no timer, score
ranks. Ends at limit or no legal move. Target 3–7 min. Dev validation tool: valid board/pieces, an opening move,
difficulty test, finds viable sequences, rejects broken/trivial. Countdown to next challenge (UTC). Replays
allowed; record first completed attempt separately; submit only best; show daily best. Separate records; career
stats and unlocks may accrue; material/career never affects play. Results: score, daily best, lines, largest combo,
chain, Overdrive activations, placements, leaderboard position when available. Offline playable; queue
submissions; never claim a rank not retrieved. Streaks: current, longest, total, this month, best score.
Calendar: completed / current / missed / future. No guilt, no penalties, no paid protection, no notifications.
Achievements: Daily Initiate (1), Explorer (3), Specialist (7), Veteran (30), Weekly Streak (7 in a row),
Monthly Streak (30 in a row).

## Game Center (27)
Leaderboards: Classic high score (ruleset 2), highest level, largest chain, daily score. Native auth, optional,
offline OK, graceful failure, personal records when unavailable, separate boards per ruleset. Daily: recurring
leaderboard aligned to the challenge day or keep local and report. No custom backend. Reasonable local score
validation; don't claim cheat-proof.

## Home (28)
Graphite, metallic BLOQ wordmark, cinematic magenta blocks + cyan core + particles + gold accents, subtle motion.
Layout: BLOQ, PLACE · CLEAR · REACT., PLAY CLASSIC (Personal Best, Highest Level), DAILY CHALLENGE (Today's
Challenge Awaits, Current Streak). Secondary: Materials, Rankings, Achievements, Statistics, Settings, How to Play.
CONTINUE when a Classic save exists. Separate Classic and Daily saves. No inactive Mission button.

## Results (29–30) and share (31)
Classic: final, best, highest level reached, record badge, largest chain, highest combo, lines, Overdrive
activations, perfect clears; highlight ONE best accomplishment (NEW PERSONAL BEST, LEVEL RECORD, MASSIVE CHAIN
REACTION, PERFECT CLEAR, NEW MATERIAL UNLOCKED, OVERDRIVE MASTER); one next milestone (incl. "Complete today's
Daily Challenge", "Beat your personal best"); PLAY AGAIN one tap; secondary Daily Challenge, Share, Home.
Daily results: date, score, best, first attempt, placements, combo, chain, Overdrive, completion, streak, rank if
available; Play Again, Rankings, Share, Home; countdown; no auto-redirect.
Share cards: Classic (logo, score, highest level, chain, Overdrive activations, material, message, studio) and
Daily (logo, date, score, verified rank, streak, message). Messages: "Can you beat my score?", "I reached Level 8
in BLOQ.", "Can you trigger a bigger chain reaction?", "Today's BLOQ challenge is complete.", "Can you beat my
daily score?". Dev showcase boards: 3-Pulse, 5-Pulse, Overdrive activation, Overdrive triple clear, perfect
clear, major level advancement, full-board material transition. Never in production; never submit scores.

## Career (32)
New stats: Overdrive activations, best single-Overdrive score, free rotations used, perfect clears, largest
Overdrive clearing sequence, daily completed, current/longest streak, best daily. New achievements: Overdrive
Initiate (1), Energy Master (25), Maximum Reaction (3-chain in OD), Critical Overdrive (5-chain in OD), Precision
Master (1 perfect), Perfectionist (10), Combo Guardian (use protection), + 6 daily ones. Once only.

## Onboarding (33)
Tutorial ≤60 s, skippable, replayable: place, line, Pulse, rotate, energy restore. Contextual: Combo Protection on
first protected move; Overdrive meter after first meaningful clear; ready text "Activate Overdrive whenever you're
ready. Your next five placements earn double points and free rotations."; Daily intro after first Classic game.
Don't interrupt major events.

## Mission architecture (34)
Engine data structures only: id, board, piece sequence, energies, placement limit, objective type/target,
difficulty, stars, validated solution; reusable simulation functions for a future solver. No campaign.

## Persistence (35)
Classic save: board, tray, rotations, score, level, combo, protection, Rotation Energy, Overdrive energy/active/
remaining, material, RNG, ruleset, session stats. Daily save separate: id, date, ruleset, config, board, tray,
sequence position, placements used, score, combo, energy, Overdrive, completion, eligibility. Permanent: career,
legacy and current records, achievements, unlocks, daily history, streaks, pending submissions, prefs. Save after
placements, rotations, Overdrive activation, level-up, achievements. No duplicate rewards. Atomic.

## Analytics (36)
game_started, first placement, first line, first Pulse, combo_protected, overdrive_energy_earned, overdrive_ready,
overdrive_activated, overdrive_completed, perfect_clear, level_reached, game completed/abandoned, immediate replay,
daily started/completed/replayed, leaderboard viewed, share. Metrics: time to first line/Pulse/Overdrive, OD per
game, session length, replay rate, daily completion, D1/D7 cohort retention (local only; say so). No ad SDKs.

## Dev menu (39)
Visual: material, brightness, reflectivity, bevel depth, contact shadow, board illumination, particles, Pulse glow,
Overdrive lighting. Gameplay: scoring ruleset, thresholds, generation weights, combo protection, Pulse freq,
Rotation capacity, level-up energy, OD charging, duration, multiplier, rotation benefit, daily placement limit.
Testing: set score, level, Rotation Energy, Overdrive energy, activate Overdrive, load board, load piece sequence,
simulate daily date, test achievement unlocks, export analytics. Dev sessions must not submit scores.

## Tests (40)
Scoring (new values, perfect clear, combo, OD multiplier, no duplicate, legacy separation); Combo Protection
(availability, consumption, restore, reset, invalid, rotation); Overdrive (charge, cap, manual activation, 5-move
duration, free rotations, multiplier, no recharge while active, invalid, final placement, save/restore, game over
charged and active, normal rules after); Daily (deterministic config, identical sequences and Pulses, limit, date
rollover, offline, separate saves, completion, eligible submission, no duplicate rewards, streaks, expired
submissions); all regressions.

## Accessibility/perf (41)
Contrast, Pulse symbol, Overdrive not colour-only, readable text, touch targets, reduced motion (fades instead of
particles/waves), separate music/sound/haptic controls, no rapid flashing, labels. 60 FPS, particle limits,
safe areas, sizes.

## Deliverables (45)
Project, playable build, summary, screenshots: home, Classic gameplay, upgraded magenta, Overdrive ready, active,
activation demo, major chain demo, perfect clear demo, combo protection demo, Daily gameplay, calendar, Daily
results, leaderboard UI, Classic results, Classic share card, Daily share card; tests, device performance (can't
here), balancing, parameters, limitations, Build 5 recommendations; short demo recordings.

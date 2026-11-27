# Build 3 spec: working notes (condensed from Chris's build sheet, 27 Nov 2026)

Phase order: A (magenta, levels, progress bar, advancement, level-up energy, game over, saves) → B (evolving
materials, level-up celebration, material wave, line/Pulse effects, audio/haptics, screen) → C (level difficulty,
unlocks, Materials menu, career stats, achievements, results, share) → D (dev config, scenarios, tests, balance).

## Palette
bg #0C131D, bg2 #141E2B, empty #1C2A38, grid #304556, standard magenta #D936AD, highlight #FF9BEA, shadow #64164F,
Pulse #59DDEB, core #C6FFFF, energy cyan, level gold #E6C47E, text #EAF5FF, dim #8FA8B9, invalid #E56868.
Anodized metal, not plastic. Material applies to board, tray, drag, preview, tutorial, home, results, share card.

## Levels (configurable; per game, start L1)
1 0 Initiate · 2 1000 Operator · 3 2500 Technician · 4 4500 Specialist · 5 7000 Strategist · 6 10000 Architect ·
7 13500 Engineer · 8 17500 Mastermind · 9 22000 Elite · 10 27000 Quantum Master · 11 32500 QM II · 12 38500 QM III ·
13 45000 QM IV · 14 52000 QM V · 15 59500 QM VI. Beyond: gap grows +500/level (16: 67500, 17: 76000, 18: 85000).
Titles beyond 15: continue "Quantum Master VII…" (my choice).
On advance: keep score, board, tray, orientations, combo; restore energy to max (dev: full / one / none);
update difficulty for NEXT tray only; material tier; celebration; career records. No points for leveling.
Multi-level: award all, unlock all, final level's visuals, energy once, ONE celebration.
Resolution order: place → lines → pulses → score → combo → line energy → level → level energy → difficulty/material →
career → new tray → game-over check (must include level-up energy).

## Progress indicator (below score)
"LEVEL 2 — OPERATOR", "1,850 / 2,500", "650 points to Level 3"; bar = (score-start)/(next-start); bar in current
material colour; title gold; animate; glow when near.

## Celebration
700–1200 ms (≤1500 for tier milestones). Gold wave around board perimeter, LEVEL UP, level+title, ROTATION ENERGY
RESTORED, NEW MATERIAL UNLOCKED, next target. No dialog, no white flash. After all clears/pulses. Input locked.

## Materials (tiers)
L1–2 Magenta #D936AD · L3–4 Electric Violet #8855E8 · L5–6 Emerald #19BC91 · L7–8 Solar Amber #E6A32D ·
L9–10 Crimson #E34268 · L11+ Quantum Platinum #C3D5E5. Transition = energy wave across board (400–700 ms).
Pulse always cyan. Unlocks permanent: reach L3/5/7/9/11. Modes: Progressive (default) or Fixed (any unlocked).
MATERIALS menu from home: preview, name, lock status, requirement, select. First unlock → NEW MATERIAL UNLOCKED.

## Difficulty by level (next tray only)
Small (1–2 cells) / Medium (3–4) / Large (5+):
L1–2 40/45/15 · L3–4 30/50/20 · L5–6 25/45/30 · L7–8 20/45/35 · L9–10 15/45/40 · L11+ 15/40/45 (cap).
Keep fairness, repetition control, seeded, rotation-aware. No timers/obstacles. Pulse chance stays 12% (configurable).

## Effects
Pulse dormant: brighter perimeter, more depth. Chain intensity scales 1..5+ (audiovisual only).
Messages: DOUBLE CLEAR, TRIPLE CLEAR, QUAD CLEAR, PERFECT REACTION, MASSIVE COMBO, NEW CHAIN RECORD (only when true).
Timings: place 80–120, single 200–350, multi 300–450, major pulse 500–900, level 700–1200, material 400–700.
Energy meter: more visible, better contrast, gold+cyan restore effect on level-up, "ENERGY FULL" feedback.

## Screen order
nav · score + best · level + progress · combo · board · energy · tray (+10–15% piece size) · rotate · tagline.

## Career (persistent, local)
highest level, highest score, lifetime points (no duplicates on restore/reopen/restart/crash), games, lines,
pulses, biggest chain, largest clear, rotations, total time, unlocked materials, achievements.

## Achievements (19)
First Contact (1st line) · Energy Operator (1st rotation) · Pulse Initiate (1st pulse) · Double Reaction (2-chain) ·
Chain Specialist (3-chain) · Critical Mass (5-chain) · Double Impact (2 lines) · Triple Threat (3) · Quad Force (4) ·
Maximum Output (3.0× combo) · Technician (L3) · Strategist (L5) · Mastermind (L8) · Quantum Master (L10) ·
Quantum Evolution (L11) · Veteran (25 games) · Dedicated (100 games) · Million Point Club (1,000,000 lifetime) ·
Material Collector (all 6). Progress shown; consolidated notification; section in Statistics. No Game Center.

## Home
wordmark, animated blocks (material + occasional pulse), PLAY, CONTINUE, best, highest level;
secondary: Materials, Statistics & Achievements, How to Play, Settings.

## Results
final, best, level this game, highest lifetime level, lines, largest clear, highest combo, biggest chain,
rotations, duration. Accomplishments: NEW PERSONAL BEST / NEW LEVEL RECORD / NEW MATERIAL UNLOCKED /
NEW ACHIEVEMENT / NEW CHAIN RECORD (highlight most significant). One "next milestone" not yet done. PLAY AGAIN one tap.

## Share card
logo, score, level reached, biggest chain, combo, current material, studio branding, message chosen by accomplishment
("Can you beat my score?", "I reached Level 7. How far can you go?", "Can you become a Quantum Master?",
"My biggest chain reaction yet."). App Store link when available (none yet).

## Audio/haptics
level progress tick, level-up ascending, material sweep, recharge, unlock, achievement, major chain layered,
personal record. Haptics: light place, medium clear, strong pulse, success level-up, subtle unlock.

## Tutorial
Keep 45–60 s. Progression explained contextually in play: progress bar after first line, level-up at L2,
material evolution at L3, permanent unlock on first new material.

## Save
v3: level, material mode/tier, career (separate key), achievements; save after placement, rotation, unlock,
level-up. Migrate v2.

## Analytics
game_started, level_reached (time, placements per level), level at game over, material tier, material_unlocked,
material_selected, achievement_unlocked, energy_restored_level_up, largest chain/clear, restart, abandon, session,
consecutive games, share.

## Dev config
thresholds/formula/titles, tier thresholds, material colours, level-up energy mode, level-up/material durations,
achievement reqs (data), piece distribution, max difficulty, pulse freq, rotation params, scoring, combo,
block brightness, reflectivity, edge highlight, pulse glow, particles, wave intensity, haptics, reduced motion.

## Scenarios (19)
New L1 · just below L2 · just below L3 · level-up via line · level-up via pulse chain · multi-level in one move ·
first material unlock · previously unlocked transition · fixed material mode · level-up with depleted energy ·
level-up with full energy · game over prevented by level-up energy · high-level generation · max difficulty ·
5-pulse chain · multiple achievements at once · save/restore during level-up · save/restore after unlock · beyond L15.

## Deliverables
project, playable, summary, screenshots: home, L1 magenta, L3 violet, L5 emerald, Platinum, level-up demo,
full-board material transition, major chain, energy restore, Materials menu, Achievements, results, share card;
test results, balancing results, params, limitations, Build 4 recommendations.
Deferred: dailies, modes, multiplayer, leaderboards, Game Center, new block types, currency, IAP, ads, accounts,
cloud, 3D, mandatory Orb.

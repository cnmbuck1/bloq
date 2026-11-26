# BLOQ Build 1 report

Date: 26 November 2026. See `README.md` for how to run it, the architecture, dependencies and balancing
parameters.

## What's in the build

- **Splash**: the Cnmbuck Orb and "CNMBUCK STUDIOS", then the home screen (tap to skip).
- **Home**: BL(O)Q wordmark with the Orb as its O, the tagline, a small animated block arrangement, PLAY,
  Continue (only when an unfinished game exists), personal best, and Statistics / How to Play / Settings.
- **Classic Mode**: 8×8 board, three-piece tray, drag and drop with a lifted piece, a ghost of the exact
  landing spot, highlighted lines that the drop would complete, and a red outline where a piece can't go.
  Line highlight, energy sweep, clear, score count-up, then Pulse waves with shockwaves, each wave higher in
  pitch. Combo and chain counters, restrained messages (Double/Triple Clear, Pulse Activated, Chain Reaction
  ×N, Great Move on a 3+ combo, Board Clear, New Personal Best).
- **Tutorial**: five guided placements (place a piece, clear a row, clear a row and column together, a
  Pulse, a two-Pulse chain), about 30 seconds, skippable, replayable from How to Play.
- **Results**: score, best, new-record banner, lines, largest combo, biggest chain, time; PLAY AGAIN (one
  tap), Share Result, Home.
- **Share card**: 1080×1350 PNG drawn on the device with logo, score, best combo, biggest chain, "Can you
  beat my score?" and studio branding. Native share sheet in the app.
- **Statistics, settings** (sound, haptics, reduced motion, high contrast), autosave after every move,
  restore after closing, analytics logged locally.

## Automated tests

`npm test`: **46 passed** (2 files), 1 skipped (the balancing simulation, run on demand).

Covered: legal and illegal placements; board edges; overlap; pieces whose gaps sit over blocks; single
clears; simultaneous rows and columns; intersections counted once; Pulses at edges and corners (no
wrapping); several Pulses activating at once; cascades; an 8-Pulse chain with each Pulse activating once;
no block scored twice; dormant Pulses staying dormant; line table and extra lines; combo multipliers,
increase and reset; invalid attempts leaving the combo alone; rounding; an end-to-end scored move; seeded
generation reproducing trays and whole games; Pulse frequency (~12%, max one per piece); no triple
repeats in a tray; the playable-piece guarantee; difficulty tiers; game-over detection including after
clears; tray refill; the tutorial script; the 4-chain dev scenario; config overrides; the input lock
during resolution; tutorial target enforcement; save/restore round trip including the RNG; rejecting
corrupt, unknown-version and finished saves; lifetime stats.

Play-tested in headless Chromium at iPhone 14 and iPhone SE sizes: full tutorial, complete games to game
over, touch drag with the lifted piece, the 4-chain scenario, reload then Continue (restored state was
identical), share card, play again. No console errors.

## Balancing simulation

A greedy bot (prefers clears, keeps the board low) played 300 seeded games through the real engine
(`SIM=1 npx vitest run tools/simulate.spec.ts`):

| | |
|---|---|
| Average score | 2,591 (median 2,350; 10th–90th percentile 968–4,682) |
| Average game length | 52 placements |
| Pulses activated per game | 5 |
| Games with a chain of 2+ | 144 of 300 |
| Chain events | ×1: 1,108 · ×2: 189 · ×3: 20 · ×4: 1 |

The bot doesn't plan chains, so a person who does should see more ×2 and ×3 chains than this.

## Known limitations

- **No Xcode project yet.** `npx cap add ios` needs a Mac; the config, icon and launch art are ready.
  Native haptics and the native share sheet are written against Capacitor but untested on a device.
- **Not profiled on an iPhone.** The renderer caches block sprites and the loop sleeps when nothing moves
  (it keeps running for the Pulse breathing and the play clock during a game), but 60 FPS on older phones
  is unverified.
- **No music.** Sound effects are synthesised with Web Audio, so there are no files to license. There's no
  music toggle because there's no music.
- **App Store link** is a blank constant in `src/platform/share.ts` until the listing exists.
- **VoiceOver** reads menus, buttons, score and messages, but the board itself is a canvas and isn't
  playable with VoiceOver.
- **Web preview**: in the claude.ai preview, sharing and file downloads are blocked by the viewer, so Share
  Result does nothing there. Progress is kept in that browser only.
- **Tutorial** accepts only the highlighted placement; dropping elsewhere bounces the piece back without a
  message.
- Daily Challenge, Puzzle, Rush, Game Center and monetisation aren't built (as the spec asks). The seeded
  RNG, `seedFromString` and the pure engine are in place for them.

## Recommendations for Build 2

1. **Put it on a phone first.** TestFlight it and watch five people play it cold. The open questions
   (tutorial pace, drag lift height, whether Pulses read instantly) need real thumbs.
2. **Tune Pulse frequency from real play.** The bot gets a ×2+ chain in about half its games at 12%. If
   players rarely build chains on purpose, try 15%, or bias Pulses toward pieces with 3+ blocks so they're
   easier to position.
3. **Reward planned chains more clearly.** A ×3 chain currently scores about the same as a triple clear.
   Consider a chain bonus that grows per wave (for example +100 × wave) so chains become the strategy.
4. **Difficulty curve.** Median bot games end around 2,300, so the 5,000 and 12,000 tiers rarely matter
   yet. Move the first jump earlier (around 2,500) or make the late tiers gentler, then compare session
   lengths.
5. **Daily Challenge** is the cheapest next mode: same engine, seed from the date, one attempt, a share
   card with the date.
6. **Music**: a calm loop that brightens during combos would add a lot for little code.
7. **Accessibility**: a VoiceOver-friendly placement mode (pick a piece, then a cell from a list).

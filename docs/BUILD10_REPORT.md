# BLOQ Build 10 · Overdrive, Daily Calendar & Retention

Built on Build 9 (`claude/project-thread-1crnqn`). No changes to scoring, levels, energy or the Daily puzzle itself.

## 1. Overdrive hitch

Measured in a browser at iPhone 14 size (2× pixel density), with the CPU slowed 4× to approximate a phone under load.

| Moment | Before | After | Cause and fix |
|---|---|---|---|
| Every frame while Overdrive is active | about 33 ms per frame (30 fps) | about 16.7 ms (60 fps) | The gold frame, combo frame and energy arcs were drawn with live blur every frame. The glows are now drawn once into a cached image and reused. Background lights use small pre-rendered gradients. |
| Activation | worst frame 38 to 46 ms | 14 to 22 ms | The gold-tinted block and glow images were built on the first Overdrive frame. They are now prepared in idle time before Overdrive starts (when the meter is ready, on layout and on material change). |
| Multi-line clear | worst frame 43 to 61 ms on the first big clear of a session, 15 ms after | 20 to 39 ms on the first, 12 ms after | Two causes, both also present outside Overdrive. Shards were scaled from the full-size gem image every time; they now come from a pre-scaled copy prepared ahead of time. The light that runs through stones about to clear was redrawn through one shared scratch image up to 24 times a frame (and constantly while hovering a multi-line spot); those frames are now rendered once and reused. The remaining first-clear frame is the board image being rebuilt, which a phone's GPU should handle far faster than this test browser. |
| Sounds on clears and expiry | a new noise buffer per sound | one shared buffer | Less memory churn during clears, which removes a source of occasional garbage-collection pauses. |

Kept unchanged: gold board frame, countdown chip, crystal shatter, score bursts. Dragging, rotating and placing were checked during
activation, a triple clear in Overdrive and expiry.

**Needs checking on a phone:** these are browser measurements. On TestFlight, play to Overdrive two or three times and watch for any
stutter at activation, on a 2+ line clear during Overdrive and when it ends. If one remains, note which moment and the phone model.

## 2. Daily week strip and dates

- Each weekday box shows the day number under the weekday letter. Completed days are gold with a checkmark; the current challenge has
  a cyan outline; future days stay readable.
- Dates and the reset time use the phone's time zone. Every player still gets the same challenge, which changes at the same instant
  worldwide (midnight UTC, e.g. 7:00 PM in New York, 11:00 AM in Sydney).
- A challenge is labelled with the local date it started on. Header, week strip, full calendar, history and results all use this.
- If the challenge started yesterday by local time (after local midnight, before the reset), the header says
  "Current challenge · 27 November" instead of "today", and the status reads "Completed" or "Current challenge awaits".
- The same challenge stays selected across local midnight and only changes at the reset. The countdown counts to the real reset.

Checked with simulated clocks: New York at 8 PM, 1 AM, 6:59 PM and 7:00 PM; Sydney in a week that crosses from November into December
(30, 1, 2, 3, 4, 5, 6).

## 3. Affirmations

Rows cleared by one placement: 2 = **Great!**, 3 = **Excellent!**, 4 or more = **Amazing!** Shown for about a second in the middle of
the score area, between the score and personal best, so nothing moves and the board and tray stay clear. A new one replaces any still
showing. Level Up and Overdrive on the same move update their own indicators as before. Column clears keep their existing feedback.

## 4. Next goal on results

- Classic results show the next material, e.g. "Next unlock · Solar Amber at Level 7".
- A material unlocked during the run gets its own card with a swatch.
- New achievements show one card, leading with the most meaningful, plus "+N more in Achievements" (tap opens Achievements; back
  returns to results).
- Play Again stays on screen without scrolling on iPhone SE and iPhone 14.

## 5. Starter achievements

| Achievement | Requirement |
|---|---|
| Row Breaker | Clear two rows in one placement |
| Overdrive Initiate | Activate Overdrive for the first time |
| Solar Ascent | Reach Level 7 in Classic |
| Daily Initiate | Complete your first Daily Challenge |
| Daily Explorer | Complete three different Daily Challenges (replays count once), shown as "2 / 3 Daily Challenges" |

These five lead the Achievements list. On first launch, anything saved stats can prove (highest level, Overdrive count, completed
Dailies) is credited quietly. Row Breaker starts counting from Build 10, because earlier builds did not save rows per placement. Each
unlock is stored once.

## Verified (browser)

- 165 automated tests pass, including new tests for local Daily dates, replays counted once and achievement persistence.
- Affirmation thresholds for 2, 3 and 4 rows, including during Overdrive and on a level-up move.
- Results with and without an unlock on iPhone SE and iPhone 14.

## Check on the TestFlight build

1. Overdrive: activation, a multi-line clear and the end all feel smooth; drag, rotate and place respond throughout.
2. Daily: day numbers inside the boxes, checkmarks on completed days, reset time in your local time.
3. Around local midnight (before the reset): the same challenge stays selected and the header says "Current challenge".
4. Two, three and four rows show Great!, Excellent! and Amazing!
5. Classic results show the next material.
6. Achievements survive closing and reopening the app; replaying a Daily does not add to Daily Explorer.

Screenshots: `/mnt/project-files/bloq/build10/`.

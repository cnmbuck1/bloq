# BLOQ Build 9 · TestFlight Polish

Scope: feedback and layout only. No changes to mechanics, scoring, the crystal shatter or score bursts.
Built on the TestFlight branch (`claude/project-thread-b1fop0`, Builds 5–8 plus the iOS project).

## 1. The board stays clear during play

The banner that sat over the top of the grid is gone. Every notice now has a fixed place in the HUD, so nothing
moves or covers the board or tray.

| Event | Build 9 behavior |
|---|---|
| Combo Protected | The combo indicator lights up cyan for about a second; the multiplier stays visible. |
| Level Up | The level number and rank in the score area update with a short gold highlight; the bar restarts toward the next level. Input is released as soon as the move resolves, so you can drag, place and rotate while the gold frame and material wave finish. |
| Overdrive Active | Gold board frame plus the live chip (`2× POINTS · 5 LEFT`). Ready pings the gold meter; the end shows `OVERDRIVE +points` in the top bar. Free rotations are explained in How to Play and in a first-use tip. |
| Gameplay tips | A short line in the top bar (where the small logo sits). Tap it or its × to dismiss at once; it also fades after about 7 seconds. |
| Line clears, chains, perfect clears, records, unlocks, achievements | A short callout in the same top-bar slot. Everything one move earns shares one line, so there is no backlog of late pop-ups. |

## 2. Home screen

- Less space above the logo and between the crystal orbit and the first action; the orbit shrinks first.
- Saved Classic run: **Continue Classic** is the primary card (saved score and level, personal best). **New Classic Run**
  is a smaller button beneath it and asks before replacing the run. Cancel returns to Home with the run intact.
- No saved run: **Play Classic** is primary with personal best and highest level; Continue is hidden.
- Daily Challenge shows state, the applicable best and the streak, wrapping to a second line instead of an ellipsis.
- All six shortcuts and the studio footer fit above the home indicator on iPhone SE, 13 mini, 14, 15 Pro and Pro Max
  sizes, with and without a saved run.

## Verified (browser, iPhone viewport sizes)

- Overdrive activation, a rotation and a non-clearing placement during Overdrive (Combo Protected): board and tray unchanged.
- Combo Protected and Level Up on the same placement: both HUD indicators update together; a second placement was
  accepted about 0.4 s later, during the level-up glow.
- New Classic Run → Cancel → Continue: board, score, tray (including a rotated piece) and energy match exactly.
- Daily landing on iPhone SE: Start fully visible.

Not yet verified on a device: everything above should be rechecked on the new TestFlight build, at default text size.

Screenshots: `/mnt/project-files/bloq/build9/`.

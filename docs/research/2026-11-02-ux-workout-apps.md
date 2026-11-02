# Workout-logging UX research (for Russian PWA redesign)

Plan mode blocked the requested scratchpad copy, so the report is stored here. Intended path: /tmp/claude-0/-home-user-ios-app/4cdfacc2-45ef-56a2-80f7-20e1db0c5fe2/scratchpad/research-workout-ux.md

Evidence tags: (R) = page read directly (GitHub issue/README/discussion); (S) = search snippet or vendor/help-center text, weaker. No MacroFactor material was consulted. Nothing is copied; these are ideas only.

Limits: liftosaur.com, hevyapp.com, setgraph.app, hotelgyms.com and webkit.org were unreachable (they have to be allowed in the session network settings). Closed-app evidence (Strong, FitNotes, Boostcamp, JEFIT, Alpha Progression, Juggernaut, RepCount) is thin and mostly vendor or aggregator text. Open-source evidence is strong: about 60 issues and discussions read.

## A. Top 12 UX patterns, ranked by impact on logging speed and discoverability

1. **Pre-filled set rows plus a "previous" ghost value.**
   - Who: Hevy has a PREVIOUS column, tap a value to copy it, and a setting for "last time anywhere" vs "same routine" (S). openGym pre-fills weights from the last session (R). wger gym mode copies a past log on tap (R, wger#719). LiftLog added last-session reps in Jul 2026, after ~2 years of worrying about clutter (R, LiftLog#703 / Discussion #801).
   - Why: "same as last time" is the common case, so typing disappears and the user needs no history screen.
   - Preact: set model `{prev, kg, reps, done}`. Initialise kg/reps from prev. Show prev as muted small text; tapping it copies it.

2. **One tap on a checkmark logs the set with whatever is shown.**
   - Who: Hevy (add set = 1 tap, edit weight and reps = 2 taps) (S). LiftLog single-tap set completion (S). StrengthLog tap-on-set-number (S).
   - Why: the 80% case becomes one tap. Unchecking is the undo.
   - Preact: a 44x44 px check at the right edge, in the thumb zone. Write to IndexedDB on each toggle, so a crash loses nothing. Toggling to done starts the rest timer.

3. **Edits propagate to the remaining sets.**
   - Who: LiftLog changed the weight dialog to "apply to uncompleted sets" by default (R, #575). Before that, users could not figure out per-set weights and found the icon plus lock confusing (R, #309).
   - Why: sets 2..N almost always equal set 1.
   - Preact: changing set N overwrites later sets that are not done and not hand-edited (a `dirty` flag). A visible "only this set" switch is the escape hatch.

4. **Auto rest timer: sticky, adjustable, and safe against edits.**
   - Who: Hevy starts it on the check, with a per-exercise default, 15 s steps and skip (S). Boostcamp does the same (S).
   - Why: no extra interaction. Demand in Liftosaur Discussions: no timer after the last set (33 votes, R #156), larger font (10 votes, R #177), and the timer must not cover inputs (R #593).
   - Pitfalls: editing a logged set must not restart the timer (R LiftLog#979, Flexify#204). Placing the bar top vs bottom was reversed more than once (R Flexify#234, #284).
   - Preact: store `endsAt` as a timestamp. Use a 56 px bar above the tab bar, and pad the list so it never hides rows. Start only on the false-to-true change of `done`. Skip it after the final set.

5. **Numeric entry that does not fight the keyboard.**
   - Who/why: iOS European keypads show only a comma, so decimals broke in LiftLog (R #332, #518). Complaints: auto-select the field (#575), keyboard stays open (#704), no hide-keyboard button on iOS (R Liftosaur#579), scrolling opens the input popup (R LiftLog#517). A wheel input was requested but declined (R #640).
   - Preact: `<input inputmode="decimal" enterkeyhint="next">`. Parse "," as ".". Call `select()` on focus, and Enter moves to reps and then to the check. Add ±2.5 / ±1 buttons as an alternative. Show the plate line (per side) under the weight field when focused (Hevy puts a calculator above the keyboard (S); Liftosaur prints plates next to the weight (R)).

6. **Start from a "Today" card. Preview is not start.**
   - Who: openGym starts today's workout on its own (R). Hevy's Workout tab has "+ Start Empty Workout" on top and routines below, and a widget on today's routine (S).
   - Anti-example: opening the next session to look at it marked it "ongoing" and started a notification (R Liftosaur#682).
   - Preact: create the session row only on the "Начать" tap. Tapping the card body shows a read-only preview.

7. **Always show position: exercise x/y, set n/m, and per-exercise progress.**
   - Who: wger gym mode asked for the current set number (R #802) and a progress overview with 2/3-style counts and green done marks (R #958, shipped Dec 2025). Liftosaur users want "x of y exercises" (R #545).
   - Why: when a machine is busy people lose track of what they skipped.
   - Preact: header "Упр. 2/5 · подход 3/4". The active card is expanded with an accent. Done cards collapse to one line, such as "3×8 · 80". Tapping the header opens a jump list.

8. **One ⋯ menu per exercise: replace, superset, reorder, warm-up, notes. Drag handles for reordering.**
   - Who: Hevy (replace keeps the sets and the timer; superset via menu; drag reorder) (S). openGym: one menu per exercise, the set number is its own menu, a backup exercise swaps in with one tap (R).
   - Demand: LiftLog's top-voted discussion is "alternative exercise when equipment is occupied"; Liftosaur's second is "alternatives" (48 votes) (R). Arrow buttons for reorder are "not intuitive on touch" (R LiftLog#231), and a notes icon looked like a move icon (R #673).
   - Preact: one bottom-sheet menu. Drag uses pointer events on the handle with `touch-action:none`. Superset is a shared `groupId`. After the last exercise of a group, loop back to its first (bug in R LiftLog#246).

9. **Exercise picker: recents first, search, muscle and equipment chips, multi-add, "create" inline.**
   - Who: Hevy lists recent exercises first, then custom ones, with equipment and muscle filters and multi-select (S). openGym has a body map and an equipment filter (R).
   - Pitfalls: the sheet scrolls the page behind it when the keyboard is open (R Liftosaur#362). Search results were hard to navigate (wger#1317).
   - Preact: sort by `lastUsedAt`, then name. Search covers Russian synonyms (reuse `ru.json`). Lock body scroll. "+ Создать «запрос»" is the last item when nothing matches.

10. **Set type behind the set number. RPE/RIR is optional and off by default. Warm-ups can be generated.**
    - Who: Hevy (normal / warm-up / drop / failure by tapping the number; RPE enabled in settings; warm-up generator under ⋯, percentage-based and rounded to plates) (S). Boostcamp default 40/60/80% (S). wger chose RIR over RPE because "two reps more" is more intuitive, and said the UI must not overwhelm those who skip it (R #479). Set types are a top LiftLog request (R #468).
    - Preact: the index chip opens a popover. The RIR column renders only if the setting is on. Warm-ups use the rounding already in `domain/calc`.

11. **Swipe actions with Undo, plus a visible fallback.**
    - Who: openGym swipes left to delete (with Undo) and right to copy (R). Hevy swipes left to delete (S). Setgraph advertises swipe-to-log and swipe-to-repeat (S, vendor).
    - Preact: use an 8 px dead zone and lock vertical scroll once the gesture is horizontal (see the LiftLog#517 failure). Show an Undo toast for 5 s. Mirror every swipe action in the ⋯ menu for discoverability.

12. **Finish flow: live PR feedback and a cautious "update template" step.**
    - Who: Hevy checks PRs when you tick a set (heaviest weight, estimated 1RM, set volume, session volume) and shows a banner and a medal (S). Its "Update routine" prompt covers structure changes only, while weight/rep values update silently unless toggled on the save screen. A user complained that all values were overwritten (S).
    - Preact: compute PRs at check time from a per-exercise best record. Show a non-blocking toast. The finish sheet has two explicit checkboxes, "Состав упражнений" and "Рабочие веса", both defaulting to off for values. Recompute records when a past workout is edited (openGym does, R).

### Other checklist findings
- **Body weight:** Flexify's maintainer declined an extra field, noting the button was confusing and that the app stores body weight per set (R #98). LiftLog users asked for a body-weight offset and negative weights for assisted lifts (R #592). openGym logs reps plus added load (R).
- **Unilateral:** users want a rest cue between sides, and each side counted as half a set (R Liftosaur#356, #642). openGym supports per-side reps (R).
- **Cardio and timed:** LiftLog shipped timed exercises (#502) while users still ask for speed, incline and time (R #540). Flexify has cardio (R README).
- **Charts and history:** openGym has a year heatmap, a body-weight chart with a goal line, and editing or moving past workouts (R). Hevy has set records, PR medals and a per-exercise table (S). LiftLog and Flexify list volume-per-exercise as a request or feature (R). I found no teardown comparing e1RM vs best-set vs volume charts.
- **Tabs:** Flexify's maintainer resisted a 5th tab ("already four") and suggested an off-by-default setting (R #200). Users asked to turn off swipe between tabs (R #379). A FAB hid the last list row (R #383). Dark mode was a heavily commented request in wger's Flutter app (R #110). I found no source on one-handed reach. 44 pt targets are general iOS guidance from my own knowledge.

## B. Anti-patterns, with sources
1. Preview starts the session or shows it as "ongoing" (R Liftosaur#682).
2. A timer that starts or restarts when you only edit data, or runs after the final set (R Flexify#204, LiftLog#979, Liftosaur Discussion #156).
3. Timer or FAB covering inputs or the last row (R Liftosaur#593, Flexify#383, #77).
4. Hidden gestures or modes: double-tap that works only after the first logged set (R Flexify#204), per-set weight behind an icon plus a "lock" (R LiftLog#309), a notes icon that looks like a move icon (R #673).
5. Dot-only decimals and a keyboard that stays open or traps the user (R LiftLog#332, #704, Liftosaur#342, #579).
6. A scroll gesture that triggers an input (R LiftLog#517).
7. Silent state carry-over: a gym or unit switch that changes the active workout (R Liftosaur#282, #354), or defaults like 60/70 kg appearing (R Flexify#204).
8. Only showing distinct set combinations, so people re-enter sets (R wger Flutter#785). Not showing the set number (R #802).
9. Previous data hidden in a sub-screen for "clutter" reasons; it took years to land (R LiftLog#703).
10. Overwriting templates without asking (S Hevy user reports).
11. Losing unsaved edits on back navigation (R Flexify#380), or the back button landing on a different tab (R LiftLog#569, declined).
12. Timers that depend on JS ticks in the background: negative countdown, missed alarms (R Flexify#282, wger Flutter#1245).
13. Busy, ad-heavy screens with choice overload (S JEFIT reviews).
14. Moving only the weight into a modal that blocks the rest of the row, forcing a second tap for a common change (R LiftLog#575).

## C. Proposed information architecture for the Workout tab

**Bottom tabs (suggestion, max 5):** Сегодня · Тренировка · Питание · Прогресс · Ещё. A running session adds a sticky "Тренировка идёт · 0:42:10" banner above the tab bar on every tab.

1. **Тренировка (home).** Above the fold: the Today card (plan name, 3 to 4 exercises with last-time numbers, a big "Начать") and a secondary "Пустая тренировка". Below: the week strip, the last 3 workouts, and "Все тренировки". Primary action: Начать (1 tap). Card body tap shows a read-only preview.
2. **Live session (full screen, no tab bar).** Sticky header: elapsed time, exercise x/y, "Завершить". A single scroll of exercise cards. The active card is expanded, with rows `[тип/№] [было] [кг] [повт] [✓]`, an optional RIR column, and "+ подход". Done cards collapse to one line. A ⋯ menu per card. At the bottom: "+ Упражнение" and the docked rest bar. Primary action: ✓ on the next set.
3. **Number entry.** Inline fields first (`inputmode="decimal"`), with ± buttons and a plate-per-side line for barbells. No modal for the common case.
4. **Picker sheet (90% height).** Search, recents, chips for muscle and equipment, multi-select, and an inline "create". Primary action: "Добавить (n)". It can also replace an exercise (swap mode, which keeps the sets).
5. **Finish sheet.** Duration, volume, PRs, an optional note, and the two template-update checkboxes. Primary action: Сохранить.
6. **History.** A list with a calendar or heatmap toggle. Detail view is editable and the date can be moved. Primary action: open and edit.
7. **Exercise detail** (from a card title or the picker). Segments: График (switch e1RM / лучший подход / объём), Рекорды, История, Заметки.
8. **Templates.** A list and an editor that reuses the same set-row component without ✓. One progression hint line per exercise. Primary action: Начать from the list.

**Rules that fall out of the research:** the first screen has exactly one primary button. Every destructive gesture has Undo. State is saved on every change. No mode is entered silently. Rows adapt to exercise type (kg×reps, +kg×reps, time, distance+time).

### iOS and PWA feasibility
- **Impossible in a PWA:** Live Activities (even LiftLog's native app would need server push, R #593; Hevy's is native, S), home-screen widgets, Apple Watch, background timers. Web Push exists only for Home Screen apps and needs a push server (S, WebKit blog), which this local-only app does not have. So there is no lock-screen rest alert.
- **Possible:**
  - A timestamp-based timer with `visibilitychange` catch-up; on return, show "отдых закончился 0:42 назад" (S).
  - A screen wake lock during a session. It was broken in Home Screen apps until iOS 18.4 (S, WebKit bug 254545 / MDN data), so test on the device.
  - A beep after a user gesture. Unlock `AudioContext` on the first ✓ tap.
  - The Badging API (S).
  - Haptics: `navigator.vibrate` is unsupported on iOS. The hidden `<input type=checkbox switch>` trick works from Safari 17.4 (R ios-haptics README), but one secondary source says iOS 26.5 patched it (unverified). Treat haptics as optional.
  - A visual end-of-rest cue: a flashing bar, or a screen flash like openGym's "alert for loud gyms" (R).

## D. Sources
**Read directly (R):**
- LiftLog: https://github.com/LiamMorrow/LiftLog ; issues https://github.com/LiamMorrow/LiftLog/issues/332 , /309 , /540 , /703 , /246 , /575 , /231 , /593 , /592 , /468 , /551 , /673 , /449 , /517 , /640 , /704 , /569 , /979 , /866 ; https://github.com/LiamMorrow/LiftLog/discussions/801 ; list https://github.com/LiamMorrow/LiftLog/discussions?discussions_q=sort%3Atop
- Liftosaur: https://github.com/astashov/liftosaur ; issues https://github.com/astashov/liftosaur/issues/199 , /668 , /545 , /346 , /682 , /356 , /593 , /642 ; discussions https://github.com/astashov/liftosaur/discussions , /156 , /177
- Flexify: https://github.com/brandonp2412/Flexify ; issues https://github.com/brandonp2412/Flexify/issues/204 , /98 , /200 , /282 ; Massive https://github.com/brandonp2412/Massive
- wger: https://github.com/wger-project/wger/issues/479 , /719 , /142 , /1897 ; Flutter https://github.com/wger-project/flutter/issues/46 , /1245 , /958 , /802 , /785
- openGym https://github.com/DuarteSantos8/openGym ; LiftTrace https://github.com/TraceApps/lifttrace ; ios-haptics https://github.com/tijnjh/ios-haptics

**Search snippets / vendor (S):**
- Hevy help: https://help.hevyapp.com/hc/en-us/articles/38387296276375 , /34105442929943 , /34896293707927 , /35650921359639 , /36012016405655 , /38279531346455 , /33703513582871 , /35649846517399 , /35688251991575 ; https://www.hevyapp.com/features/workout-rest-timer/ , /start-empty-workout/ , /weight-plate-calculator/
- https://cellphoneplans.androidauthority.com/CellPhones/Guides/hevy-app-review
- https://www.boostcamp.app/features/rest-timer
- https://strive-workout.com/2026/09/03/simple-workout-log-app/
- https://screensdesign.com/showcase/strengthlog-workout-tracker
- https://setgraph.app/articles/fast-workout-tracking-with-swipe-actions-in-setgraph
- https://apps.apple.com/gb/app/id464254577 (Strong)
- https://apps.apple.com/gh/app/id1059245195 (FitNotes)
- https://apps.apple.com/us/app/gym-workout-alpha-progression/id1462277793
- https://dr-muscle.com/jefit-review-alternative/
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://bugs.webkit.org/show_bug.cgi?id=254545
- https://stackoverflow.com/questions/58244539/best-practice-for-keeping-timer-running-in-pwa

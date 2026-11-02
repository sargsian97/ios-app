# Nutrition-app UX research (for the Preact PWA redesign)

**Evidence quality.** Open-source evidence is first-hand (GitHub issue threads and READMEs). Closed-app evidence comes from search-result summaries of help pages, forums and reviews, because most vendor hosts were not fetchable from this session. No source I found measures tap counts. Counts below are issue-author or blog estimates and are labelled as such. MacroFactor material was not used. Where a claim is unverified, it says so.

## A. Top 12 patterns, ranked by impact on logging speed and discoverability

1. **History-first add screen: one ranked list, no tabs.**
   - Seen in: FoodNoms ("Previously Logged" and time-of-day Smart Suggestions); MyNetDiary (Recent and an auto-built My Foods); FatSecret (recent and most-eaten fill in as you log); OpenNutriTracker (recents on the add screen, with the redesign proposed in issue #458).
   - Why: #458 counts a 6-7 tap repeat log (FAB, meal type, tab, product, units, quantity, Add) because recents sit behind a tab and the search screen is empty. Cronometer users ask for "surface recent foods first" and report re-selecting the sort on every add.
   - Implementation: keep a `foodUse` store {foodId, count, lastAt, lastQty, lastUnit, hourHistogram}. On opening the sheet, render the top 20 by `freq * recency * hourMatch` with zero typing.

2. **One-tap "+" on a row that logs the last-used portion, with Undo.**
   - Seen in: proposed in #458; Fitatu advertises "1CLICK" (vendor claim); FoodNoms favourites carry preset portions.
   - Why: #458 also flags the misleading "+" that merely opens the detail screen. Two separate hit zones fix that: the "+" adds, the row body opens detail.
   - Implementation: the "+" calls `addEntry(food, lastQty, lastUnit)` and shows a toast "Добавлено в Обед · Отменить · Изменить".

3. **Per-meal "repeat last time" button.**
   - Seen in: FoodNoms (quick-add per meal section copies what you last ate for that meal); MyFitnessPal's newer layout (swipe below the meal name to bring forward the foods last logged there, per its support page); MyNetDiary ("Same" copies yesterday); Lose It "Previous meals" (secondary source). Waistline already has a "yesterday's breakfast" shortcut, and users ask to extend it to "last Monday's breakfast" (#914).
   - Why: eating is repetitive, so this is the cheapest path (1 tap).
   - Implementation: when a meal slot is empty, show "Как в прошлый раз · 540 ккал". Query the most recent day that has entries for that meal, and preview before commit.

4. **Select, copy, and save-as-meal in one sheet.**
   - Seen in: NutriTrace rc.47 (a unified copy sheet for one item or a whole meal, with date and meal chosen in one flow); MyFitnessPal (tick items, Copy, pick date); FatSecret Saved Meals; LibreLog (templates, day copy, "familiar meals").
   - Why: Waistline has open requests to copy a day (#914), copy a meal to another day (#545), and move an item between meals (#546).
   - Implementation: a long-press on an entry enters multi-select. The action bar offers "Копировать в…", "Сохранить как блюдо" and "Переместить".

5. **Multi-add tray: search stays open while you add.**
   - Seen in: Cronometer Multi-Add (hidden behind a filter toggle, which is the anti-pattern); MyNetDiary (tick several, then Add); LibreLog (a persistent draft "Add workspace").
   - Why: a meal is usually 2-4 items. Without a tray, each item costs a close-and-reopen cycle.
   - Implementation: a sticky footer reads "3 · 540 ккал · Готово". Keep a draft array in state and commit it in one IndexedDB transaction. Typed or voice text can feed the same draft.

6. **Meal inferred from the time of day, shown as a changeable chip.**
   - Seen in: proposed in #458 ("meal type must be chosen first" is called out as a flaw); NutriTrace slots are configurable.
   - Why: it removes a mandatory step.
   - Implementation: `defaultMeal(now, settings.mealWindows)`. Opening from a meal's own "+" overrides the guess.

7. **Search: local results instantly, remote results debounced, and every state handled.**
   - Seen in: #458 (maintainers answered with local sources instantly and Open Food Facts only after a pause, debounced); FoodNoms (All / Generic / Branded / Library) and NutriTrace (Local / OFF / USDA chips).
   - Rank: history, then own foods and recipes, then generic (USDA), then branded (OFF).
   - Why: OFF's official docs limit search to about 10 requests per minute and ask for a custom User-Agent. OFF is also packaged-food-centric: #125 reports "can only find highly processed foods", and the maintainer's answer was to route whole foods through USDA.
   - Implementation:
     - Index local foods with MiniSearch.
     - Fetch OFF/USDA after a 500-700 ms pause with `AbortController` and an 8 s timeout. Cache responses in IndexedDB.
     - Row = name, brand, "kcal / 100 г" or per serving, and a source badge.
     - Mark rows without kcal as "нет ккал" and let the user type it, instead of blocking (#252 is the counterexample).
     - A no-results state offers "Быстро ккал", "Создать", "Сканировать".
     - Offline shows a one-line banner and local results only.

8. **Portion editor: chips plus one synced quantity.**
   - Seen in: the #458 proposal (chips 0.5 / 1 / 2 servings, last used, 100 g); FoodNoms "Portion Input Improvements" (named in a release post, details not seen).
   - Why: Waistline spent years on serving confusion. The diary forced mental grams-to-servings conversion (#84, fixed by a synced weight field). The "Serving Size" label was ambiguous (#642). Users asked for "Nutrition per 100 g or per serving" labels (#747).
   - Implementation: store the quantity canonically in grams (or ml). Segmented unit control (г / порция / шт). Chips ½ · 1 · 2 · «как в прошлый раз». Use `<input type="text" inputmode="decimal">` and parse both "," and ".". WebKit bug 247242 documents a locale mismatch between `type=number` and `inputmode=decimal`, which matters for ru-RU.

9. **Quick-add kcal with optional macros, reachable from empty states.**
   - Seen in: OpenNutriTracker (title, kcal, optional macros, straight to a meal); Waistline; Lifesum Quick Track (a UserVoice request complains it offers only title and kcal; its help page says fields are limited to 5 characters with no decimals).
   - Why: it is the escape hatch for restaurant food and for bad OFF data.
   - Implementation: a form of kcal / Б / Ж / У with a live check that macro kcal approximates the entered kcal, and a suggestion when they disagree (requested in #458).

10. **Barcode inside the search field, with manual and create-on-miss fallbacks.**
    - Seen in: OpenNutriTracker (scanner in the search field, manual barcode entry, barcode attachable to a custom food); Open Food Facts' own app (continuous scanning, and an "incomplete product" card listing what is missing for Nutri-Score/NOVA); smooth-app #2662 (show the barcode keyboard when there is no camera).
    - Why: scan, review and log is the fastest path for packaged food, but only if a miss still leads somewhere.
    - Implementation: a camera icon in the search bar opens a scan sheet. On a hit, go to the portion step. On a miss, go to "Создать с этим штрихкодом". I did not verify the BarcodeDetector API's availability on iOS Safari. LibreLog uses QuaggaJS as a fallback.

11. **A glanceable day header that is also a doorway, plus a labelled primary action.**
    - Seen in: OpenNutriTracker (a ring with calories left plus macro bars; month calendar for day switching); Cronometer (a staff-documented shortcut: tap the Calories Consumed icon to jump to food search); NutriTrace (tap a nutrient row to see the top contributing foods); Carbon's coaching tab (rings for macros and weigh-ins together, per its release post).
    - Why: the number answers "how much left?" and the tap-through answers "why?".
    - Implementation: a sticky header with "осталось 640 ккал", a thin ring, and three macro bars. Tapping it opens a breakdown sheet. A text-labelled "+ Добавить" button stays above the tab bar. Day switching is chevrons plus swipe, and tapping the date opens a calendar.

12. **Weight: inline weigh-in, a trend line over faint raw dots, and an explained weekly check-in.**
    - Seen in: MacrosFirst (a moving average with toggles for daily, weekly and monthly views); Carbon (trend weight, and a check-in report that says what the coach reviewed, what it decided and why); the Hacker's Diet (an exponential average with factor 0.1, about a 10-day time constant).
    - Why: raw weight bounces, and the trend is what the decision should be based on.
    - Implementation: a weigh-in card (a number field prefilled with the last value, one Save tap) on both Overview and Body. The chart has a bold trend and small raw dots. Show the weekly rate and goal ETA only with 14 or more days of data, computed on residuals (see openScale #1453 below).

## B. Anti-patterns (with sources)

- **Burying the diary behind a dashboard.** MyFitnessPal's 2026 redesign reportedly replaced the Diary tab with a "Today" view and put the diary behind "View All"; reports claim a ratings collapse and a dedicated complaint form (piunikaweb, mwm.ai, MyNetDiary scorecard). The "2 taps become 5" figure is a blog estimate, not measured.
- **Recents hidden in tabs; an empty search screen by default; a "+" that opens detail; meal type forced first** (OpenNutriTracker #458).
- **Useful features behind toggles or staff replies.** Cronometer Multi-Add sits behind a filter-icon toggle (and a separate diary setting), search sort resets to "best match" on each add, and the Calories-Consumed shortcut surfaced only in a staff reply. Users call the dashboard "powerful but overwhelming" (a Fortune review).
- **Ambiguous or duplicated serving fields** (Waistline #642, #747, #84).
- **Endless spinner, no timeout, search only on Enter** (Waistline #779).
- **Search returning only packaged food, or auto-resolving to the wrong item** ("Apple, dried" for "apple", "Milk, human" for "milk": ONT #125, #1164).
- **Blocking a log because kcal is missing** (ONT #252).
- **Units that scale wrong:** an AI-parsed count was treated as grams and logged fiftyfold (ONT #973).
- **Responsive logic that silently drops a macro column below a width threshold.** Waistline #864: under 400 px it dropped one of four goals, and iPhones are 390-430 CSS px wide.
- **Trend analytics that contradict the data.** openScale #1453 labelled a steady 22 kg loss as a "plateau" and "volatile" because it used raw standard deviation; the fix was to test total change and measure spread on residuals.
- **Gating a check-in on a binary compliance question.** Carbon's own help text conflicts: one article says to answer "No" to hold calories steady, while others stress honesty. Compute logged-day coverage automatically instead.
- **Date-boundary bugs:** food logged just after midnight landing on the next day (a Cronometer forum report); future-date entries (ONT #207); duplicated meals when swiping quickly through days (Waistline #714).
- **Icon-only primary controls and gesture-only features** are a direct match for the owner's complaint. Prefer text labels. Apple's tab-bar page says tabs should navigate, not trigger actions, and recommends short titles, so a floating labelled "+ Добавить" is safer than a centre "+" tab.

## C. Proposed information architecture

**Tabs (text labels, 5):** Сегодня · Питание · Тренировки · Тело · Ещё. Settings, My foods, Recipes, Favourites and Export live in Ещё.

1. **Сегодня (overview).**
   - Three tappable tiles: calories left (opens the diary), weigh-in (opens the entry sheet), next workout.
   - A week strip: 7-day average kcal against target, protein days hit, weight-trend change.
   - A banner when the weekly check-in is due.
   - Primary action: the tile that matches the time of day.

2. **Питание (diary).**
   - The sticky header from pattern 11, then meal sections. Each has its own "+ Добавить" and, when empty, "Как в прошлый раз".
   - Entries: swipe to delete, long-press to select and copy.
   - Primary action: "+ Добавить" (meal preselected).

3. **Add sheet (full-height).**
   - Search field, barcode icon, meal chip and day chip.
   - Default body is the history-ranked list. A filter chip row follows (Всё / Мои / Общие / Бренды).
   - A tray at the bottom collects multi-add.
   - Primary action: the row "+".

4. **Food detail (half sheet).**
   - Name, brand, source badge and compact Nutri-Score and NOVA chips (only when OFF has them; otherwise "нет данных").
   - Quantity field, chips and unit switch, then a live kcal and macro preview.
   - A button "Добавить в Обед".

5. **Нутриенты (sheet from the header).**
   - Cronometer-style bars with three states, using text plus icon, not colour alone: below minimum, within range, above maximum. Sort by "most lacking".
   - Tap a bar for top contributing foods. Show the real number, not a rounded value that flips a bar's state (a reported Cronometer bug).
   - Optional food quality: Nutri-Score is a public algorithm, revised in 2023, and needs fibre, so show "нет данных" when OFF is incomplete. NOVA group 4 is shown only for products that carry it. Report "доля калорий с известной группой NOVA" instead of a made-up daily score.

6. **Тело.**
   - Weigh-in card on top, the trend chart (4 нед / 12 нед / всё), then rate and goal ETA.
   - Below that, the weekly check-in as a three-step flow:
     1. Summary: logged days out of 7 (computed), average kcal, trend change.
     2. Decision: the new target with a one-sentence "why" and "Принять" / "Оставить как есть".
     3. Done.
   - Carbon's report ends with start, current and goal weight and the average weekly rate. Do not ask a compliance question.

**Daily versus weekly.** Practitioner guidance (coach guides, Trainerize, Carbon) is to log calories, protein and the weigh-in daily, but judge adherence and weight on weekly averages. Keep micronutrients, the quality score and the workout volume one tap away, not on the Overview.

## D. Sources

Open source
- https://github.com/davidhealey/waistline (README; issues #9, #84, #545, #546, #642, #714, #747, #779, #864, #914)
- https://github.com/simonoppowa/OpenNutriTracker (README; issues #123, #125, #207, #252, #458, #973, #1164)
- https://github.com/longestmt/librelog
- https://github.com/TraceApps/nutritrace and the rc.47 release summary https://piefed.jeena.net/post/390304
- https://github.com/openfoodfacts/smooth-app/issues/7824 and #2662, #2910
- https://github.com/oliexdev/openScale/issues/1453
- Energize (Codeberg; the host was unreachable here, so only listings were read): https://apt.izzysoft.de/fdroid/index/apk/com.flasskamp.energize
- Food You: https://f-droid.org/packages/com.maksimowiczm.foodyou/

Closed apps (public pages, via search summaries)
- Cronometer forum/blog: https://forums.cronometer.com/discussion/comment/21632/ , https://forums.cronometer.com/discussion/6766/multi-add-food , https://cronometer.com/blog/log-food-fast , https://cronometer.com/blog/repeating-food/ , https://forums.cronometer.com/discussion/comment/5275/ , https://support.cronometer.com/hc/en-us/articles/47549391461780-Mobile-Voice-Logging
- FoodNoms: https://foodnoms.com/news/foodnoms-2 , https://foodnoms.com/news/copy-all-library-tab , https://www.macstories.net/reviews/foodnoms-2-refreshes-its-design-and-adds-refinements-to-nutrition-logging-and-goal-tracking-throughout/
- MyFitnessPal: https://support.myfitnesspal.com/hc/en-us/articles/39985611667341 , https://blog.myfitnesspal.com/copy-and-remember-meals/ , https://piunikaweb.com/2026/04/24/myfitnesspal-new-update-complaints/ , https://www.mynetdiary.com/diet-app-scorecard-may-2026.html
- Carbon: https://www.joincarbon.com/blog/release-76 , https://help.joincarbon.com/en/articles/10338862-how-carbon-evaluates-your-progress-at-your-check-in , https://help.joincarbon.com/en/articles/6078877-coach-trend-weight
- MacrosFirst: https://help.macrosfirst.com/en/articles/24-body-weight , https://help.macrosfirst.com/en/articles/9-copy-meals-or-whole-days-to-another-day
- MyNetDiary: https://www.mynetdiary.com/adhelp_foodSuggestions.html
- FatSecret: https://www.fatsecret.com/fatsecret-app-help/getting-started/food-add-options
- Lifesum: https://help.lifesum.com/en/article/quick-track-add-calories-and-macros-quickly-mgdy5l/ , https://lifesum.uservoice.com/forums/274566-feedback-ideas/suggestions/42890076-add-quick-tracking-macros-fat-protein-carbs
- Fitatu: https://www.fitatu.com/pl

Standards, data and method
- OFF API docs (rate limits, User-Agent): https://openfoodfacts.github.io/openfoodfacts-server/api
- Nutri-Score 2023 update: https://www.santepubliquefrance.fr/en/press/nutri-score-calculation-algorithm-evolving-promote-healthier-food-choices
- Hacker's Diet trend: https://en.wikipedia.org/wiki/The_Hacker%27s_Diet
- WebKit bug 247242 (inputmode=decimal and locale): https://auto-bugs.webkit.org/show_bug.cgi?id=247242
- Apple HIG tab bars: https://developer.apple.com/design/human-interface-guidelines/tab-bars
- NN/g bottom sheets: https://www.nngroup.com/articles/bottom-sheet/
- MyFitnessPal portion and database study: https://www.sciencedirect.com/science/article/abs/pii/S0899900718303678

# iOS Home Screen PWA checklist (late 2026): native feel + robustness

Priority: MUST / SHOULD / NICE. Evidence: **V** = page fetched and read; **S** = only a search-result summary (verify on device); **K** = established knowledge, not re-verified. webkit.org, MDN, web.dev, nngroup.com, w3.org, m3.material.io and bugs.webkit.org were not fetchable (hosts not allowed in this session), so items citing them are S or K. Assume iOS 26.2+ as the floor (iOS 27 shipped; its notes were only skimmed). [n] = source list.

## 1. Apple HIG and native feel

1. MUST Tab bar: 3-5 tabs (extras collapse into "More"), always visible, never hidden or disabled (explain empty sections instead), icon plus single-word Russian label, filled glyphs, navigation only (no actions), badge only for critical info. **V** [1]
2. MUST Keep each tab's navigation state when switching tabs. **V** [1]
3. SHOULD Root screens: large title 34/41 bold, collapsing to a 17 semibold inline title on scroll. Pushed screens: Back (leading), title, optional trailing action. Sheets: Cancel leading, Done trailing; never show Back, Cancel and Done together. **V** [7]
4. MUST Type scale at the default size (pt = CSS px): Large Title 34/41, Title1 28/34, Title2 22/28, Title3 20/25, Headline 17/22 semibold, Body 17/22, Callout 16/21, Subhead 15/20, Footnote 13/18, Caption1 12/16, Caption2 11/13. Default 17, minimum 11. Use the system stack `-apple-system, system-ui, sans-serif` (SF covers Cyrillic). **V** [2]
5. SHOULD Dynamic Type on the web: `@supports (font: -apple-system-body) { body { font: -apple-system-body; } }` and the sibling keywords. Never set `font-size` on the same element or the link breaks. Use rem or em and min-heights, not fixed heights. **S** [31]
6. MUST Targets are 44x44 pt by default (HIG minimum 28). Pad about 12pt around bezeled controls and about 24pt around unbezeled ones. WCAG 2.2 AA floor is 24 CSS px. **V** [6]
7. SHOULD Lists use grouped-inset style. Page bg = systemGroupedBackground (light #F2F2F7, dark #000). Cells = secondaryGroupedBackground (light #FFF, dark #1C1C1E). Corner radius about 10-16, hairline separators inset about 16, chevron for drill-down, info button only for "more info". **V**/**K** [5][8]
8. MUST Sheets: bottom sheet with grabber, medium and large detents, swipe-down dismiss, one sheet at a time. Swiping away with unsaved changes opens an action sheet. Long multi-step flows get a full-screen page, not a sheet. **V** [7]
9. MUST Colour tokens with light, dark and increased-contrast variants. HIG iOS values: blue 0,136,255 / dark 0,145,255; red 255,56,60 / 255,66,69; green 52,199,89 / 48,209,88; orange 255,141,40 / 255,146,48. Semantic roles only (label, secondary, separator, bg levels). Never rely on colour alone; add an icon or text. **V** [5]
10. MUST Dark mode: `:root{color-scheme:light dark}`, `prefers-color-scheme`, and an explicit `html` background (also kills white flash at launch). Check contrast in both themes. **V**/**K** [5][6]
11. SHOULD Haptics: complement visuals, consistent meaning, used sparingly, user-mutable. **V** [9] The Vibration API does not exist on iOS **K**. NICE: the hidden `<input type=checkbox switch>` plus programmatic label click fires the Taptic Engine (iOS 17.4+). It is undocumented, one source says it was patched in iOS 26.5, so feature-flag it. **S** [34]
12. Liquid Glass, emulate: SHOULD apply it only to the control or navigation layer (tab bar, nav bar, floating toolbar, sheet header). Recipe: `backdrop-filter: blur(20px) saturate(1.8)` plus the `-webkit-` prefix, semi-opaque fill, 0.5px hairline, capsule or large radii. Let the content background run edge to edge under the bars, and tint only the single primary action's background. **V** [3][4][5]
13. Liquid Glass, do NOT emulate: refraction or lensing (backdrop-filter cannot displace pixels; SVG-filter recipes are Chromium-only), glass on content cards, stacked glass, the clear variant. **V**/**S** [4][39]
14. MUST Legibility never depends on transparency. Reduce Transparency and the iOS 26.1+ glass options are not reliably detectable from Safari CSS. Provide a solid fallback via `@supports not (backdrop-filter: blur(1px))` and `@media (prefers-contrast: more)`. **S** [39]

## 2. iOS Safari and standalone specifics

15. MUST Head: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` (never `maximum-scale` or `user-scalable=no`), `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-title`, `apple-touch-icon` 180x180 opaque PNG, manifest with `"display":"standalone"`. **V**/**K** [13]
16. MUST Since iOS 26 every Home Screen site opens as a web app unless the user turns off "Open as Web App", but the manifest and icons are still yours to supply. **V** [11][19]
17. MUST Use `standalone` or `fullscreen`, not `minimal-ui`. WebKit told a reporter that `minimal-ui` apps behave like Safari tabs, and the lost-data report was closed WONTFIX. **S** [16]
18. SHOULD Status bar: `black-translucent` gives edge-to-edge; pad with `env(safe-area-inset-top)`. iOS 26.1 broke this (solid bar, inset 0; WebKit 301994), fixed in 26.2. Never hard-code 44/47/59. **S** [20]
19. MUST Safe areas: pad the root with `env(safe-area-inset-top|right|bottom|left)`. Tab bar = 49px + `env(safe-area-inset-bottom)`. Check landscape (notch on the side). **V**/**K** [3]
20. MUST Layout: an app root `position:fixed; inset:0; display:flex; flex-direction:column`, a flex child `.scroll{flex:1; overflow-y:auto; overscroll-behavior:contain}`, and the tab bar as a flex sibling, not `position:fixed`. `100dvh` (Safari 15.4+) with a `100vh` fallback. WebKit 254868 reports svh, fill-available and visualViewport.height are too small in standalone with viewport-fit=cover. **S** [21]
21. MUST Inputs, selects and textareas at least 16px computed (watch `clamp()` yielding 15.75). Else iOS zooms on focus. **S** [31]
22. SHOULD `touch-action: manipulation` on controls. `-webkit-tap-highlight-color: transparent` plus your own `:active` state. `user-select:none; -webkit-touch-callout:none` on chrome only, not on inputs or content. **K**
23. MUST Keyboard: iOS does not shrink the layout viewport and ignores `interactive-widget` in standalone. Listen to `visualViewport` resize and scroll, set `--kb = innerHeight - vv.height - vv.offsetTop`, and apply it to sheets and toolbars. iOS 26.0 bug: `offsetTop` not reset after the keyboard closes (WebKit 300523, may recur in 27 beta), so recheck on `focusout` plus rAF and `scrollTo(0,0)`. **S** [22]
24. SHOULD Rubber-banding: `overscroll-behavior` works from Safari 16 but may not stop bounce on a launched Home Screen app. Keep body non-scrolling (see 20). No pull-to-refresh in iOS standalone. Safari 27 enabled scroll anchoring on iOS; set `overflow-anchor:none` where you prepend list rows. **S**/**V** [12][44]
25. SHOULD Navigation: no browser back button, only the edge swipe. Push a history entry per screen or sheet (`history.pushState`) so swipe-back pops it. Always draw a Back button. Keep horizontal row-swipe gestures off the left edge and give a button alternative. Set `history.scrollRestoration='manual'` and store scrollTop per screen yourself. **V**/**S**/**K** [6][43]
26. NICE Splash: iOS builds none from the manifest; `apple-touch-startup-image` needs one media-query PNG per device (no match shows white). Prefer none plus a matching html background colour. **S** [40]
27. NICE Web Push and badging: Home Screen apps only (16.4+), permission only from a user gesture, push server required. Skip; rest timers stay in-app. **S** [18]
28. SHOULD Wake Lock for the workout screen: broken in standalone until iOS 18.4, fine now. Request on a user gesture, re-request on `visibilitychange`, feature-detect. **S** [24]
29. SHOULD Camera (barcode): `getUserMedia` works in standalone, but prompts recurred on hash changes and permission did not persist across relaunch (WebKit 215884, seen on 16.6.1). Use one non-hash route; fall back to `<input type=file accept=image/* capture=environment>`. Assume no `BarcodeDetector`; lazy-load a JS decoder. **S**/**K** [23]
30. MUST Export: `<a download>` on a blob in standalone is flaky (opens a viewer that may not close). Use `navigator.canShare({files})` then `navigator.share({files:[new File([blob],'journal.json',{type:'application/json'})]})` from a tap, with a visible fallback. No `showSaveFilePicker` in Safari. Test on device. **S**/**K** [35]

## 3. Storage durability

31. MUST The 7-day cap on script-writable storage (IndexedDB, localStorage, SW registrations, Cache API) targets Safari browsing. Home Screen apps keep their own days-of-use counter and are not expected to be purged (Wilander). **S** [15][17]
32. MUST Safari and the Home Screen app are separate storage. Data entered in a Safari tab will not appear in the installed app. **K**
33. MUST Quotas (Safari 17+): browser and Home Screen apps get origin up to 60% of disk, overall 80%. Other WKWebView apps 15% and 20%. `persist()` is granted by heuristics such as "is a Home Screen app". **S** [14]
34. MUST Call `navigator.storage.persist()` at boot (and after the first tap if denied), and log `persisted()`. Show `estimate()` usage in Settings. Catch `QuotaExceededError` on every write and surface "Storage full - export now". **S**/**K** [14][17]
35. MUST Assume removing the app, "Clear Website Data", or low-disk pressure destroys data (no Apple doc found; treat as certain). Ship Export JSON via the share sheet (Files/iCloud Drive; no direct iCloud API, and OPFS shares the same eviction domain) plus Import, tested with `tests/fixtures/backup-sample.json`. **S**
36. SHOULD Store `lastBackupAt`; after 7 days or N new entries show a dismissible backup banner; offer export after a finished workout.
37. SHOULD Loss detection at boot: write canaries (installId, createdAt) to IDB and localStorage. If IDB is empty but the localStorage canary exists, show "Data not found - restore from backup". If `navigator.standalone===false`, warn "open the Home Screen app".
38. SHOULD User data only in IndexedDB; the Cache API holds the rebuildable shell. Wrap storage access in try/catch.
39. SHOULD Version the DB (`onupgradeneeded`) and put `schemaVersion` and `appVersion` in every export so old backups import after migrations.

## 4. Performance (no bundler)

40. MUST SW precache: `cache.addAll()` (atomic) of all shell files into `shell-<VERSION>`, delete old caches on `activate`, `clients.claim()`. Shell cache-first with `index.html` navigation fallback; stale-while-revalidate only for non-critical assets (exercise images). **K** [27]
41. MUST Never mix versions: unhashed ES modules from two releases break each other. No auto-`skipWaiting` mid-session. Show "Update available - Reload", send `SKIP_WAITING`, reload on `controllerchange` (or apply at next cold start). **S** [27]
42. MUST GitHub Pages fixes `Cache-Control: max-age=600`. Register with `{updateViaCache:'none'}`, call `reg.update()` on `visibilitychange`, bump `VERSION` every release. **S** [27]
43. SHOULD `<link rel=modulepreload>` for the critical graph (Safari 17+; a failed preload could be cached, WebKit 270357, which the precache avoids). Vendor pinned Preact and htm in the repo via an import map. GitHub Pages serves HTTP/2 **K**. **S** [25]
44. MUST Under-1s start: inline critical CSS and a skeleton shell in `index.html` so first paint needs no JS; read only today's or this week's rows at boot, defer the rest.
45. MUST IndexedDB: one long-lived connection, date index, `getAll(IDBKeyRange, count)` batches, cursor paging for history (especially fast on Safari), one short transaction per user action, no non-IDB `await` inside it, reopen on `onclose`/resume. `{durability:'relaxed'}` for routine writes, strict for imports. Keep denormalised daily totals. **S** [28]
46. SHOULD Long diaries: render by day with "load earlier" via IntersectionObserver; `content-visibility:auto; contain-intrinsic-size:auto 72px` on rows (Safari 18+; SVG text in skipped subtrees once failed to paint). Real virtualization only beyond about 1k DOM rows. **S** [29]
47. SHOULD `contain: layout style paint` on cards; animate only transform and opacity; batch DOM reads before writes; passive touch and scroll listeners. No 300ms tap delay with `width=device-width`. System font stack, no webfonts; `font-variant-numeric: tabular-nums`. **K**
48. MUST Guard `requestIdleCallback` (absent in Safari): `(self.requestIdleCallback||(f=>setTimeout(f,1)))`. **S** [26]
49. SHOULD Preact: stable `key={id}` (never index), `memo()` on rows, `useMemo` for aggregates over many rows, no new inline objects or functions per row. `@preact/signals` for fast-changing values (timers, steppers): pass the signal itself as a child so only the text node updates. **S** [30]

## 5. Fast data entry on a phone

50. MUST Numeric fields: `inputmode="decimal"` (weights, macros) or `"numeric"` (reps, kcal), `enterkeyhint`, `autocomplete="off"`, select-all on focus; avoid `type=number`. Russian keyboards show a comma (WebKit 247242): accept `,` and `.`, normalise, and note the decimal pad has no minus key. Set `<html lang="ru">`. **S** [32]
51. MUST Steppers: +/- at least 44pt (about 58pt suits one-handed serial taps; thumb study 9.2-9.6 mm), press-and-hold auto-repeat (about 400 ms delay, then accelerate), tap the number to open the keypad, per-exercise step (2.5 kg, 0.5 kg). Primary actions in the bottom third, button pinned above the keyboard. **S** [38]
52. MUST Defaults from the last entry: prefill sets with last session's weight x reps, one-tap "repeat previous set", remember the last serving size, recents and favourites first (also WCAG 3.3.7 redundant entry). **K** [41]
53. MUST Undo, not confirm: after delete or complete show "Deleted - Undo" for 5-8 s with one action (pause on touch). Confirm only irreversible actions (wipe, import-overwrite) with verb labels. HIG: allow multiple undos and show the restored result. **V**/**S** [10][37][42]
54. SHOULD Progressive disclosure: common fields (weight, reps) visible, notes, RPE and tempo behind "More"; one filled accent button per screen. **V** [3][5]
55. SHOULD Empty states teach: what appears here plus one CTA ("Add first workout"); separate first-run, no-results and cleared states. HIG: explain why a section is empty. **V**/**S** [1][36]
56. SHOULD Search-as-you-type: debounce about 150 ms on an in-memory or IDB index, `type=search enterkeyhint=search`, recents and favourites on empty query, normalise case and ё/е, results stay above the keyboard.
57. NICE Row swipe actions only with a visible button alternative. **V** [6]

## 6. Accessibility baseline

58. MUST Contrast (WCAG 2.2 AA): 4.5:1 for text up to 17pt, 3:1 for 18pt+ or bold and for UI components (Apple's Accessibility Inspector uses the same). Check both themes. Apple's secondary-label gray (about #8E8E93 on white, 3.3:1 by my calc) fails for small text; use roughly #6C6C70 (about 5:1). **V** [6][41]
59. MUST `prefers-reduced-motion: reduce`: fades instead of slide and zoom, tighter or no springs, no autoplay, no animated blur. **V** [6]
60. MUST Honour `prefers-contrast: more` (solid borders, stronger text) and `prefers-color-scheme`. **S** [39]
61. MUST Every icon-only button gets a Russian `aria-label`. Real `<button>`s, `aria-pressed`/`aria-expanded`, dialogs with `role=dialog aria-modal=true` plus `inert` background and focus return, toasts as `role=status`, steppers as `role=spinbutton` with `aria-valuenow`. **K**
62. SHOULD Focus order = DOM order; `scroll-padding-bottom` so the tab bar never covers a focused field (WCAG 2.4.11); non-drag alternatives for reordering (2.5.7). **K** [41]
63. SHOULD Text enlargeable to at least 200% (HIG): stack adjacent items, min-heights only. **V** [6]

## Things people commonly get wrong in iOS PWAs

- Testing only in a Safari tab (separate storage, no safe areas, different bugs); test the Home Screen app on a real device.
- `100vh`, `position:fixed` bars or inputs near the keyboard, hard-coded safe-area px.
- Inputs under 16px, `user-scalable=no`, `type=number` for decimals in comma locales.
- Expecting Vibration API, pull-to-refresh, `beforeinstallprompt` or `requestIdleCallback`.
- No export/import, no `persist()`, assuming IndexedDB is permanent.
- `skipWaiting` mid-session with unhashed modules, forgetting `VERSION`, trusting the HTTP cache for `sw.js`.
- `minimal-ui` display; a confirm dialog on every delete instead of undo.
- Glass or blur behind small gray text; hash routes that re-prompt for the camera; fixed-height rows that clip at large Dynamic Type.

## Sources

[1] https://developer.apple.com/design/human-interface-guidelines/tab-bars
[2] https://developer.apple.com/design/human-interface-guidelines/typography
[3] https://developer.apple.com/design/human-interface-guidelines/layout
[4] https://developer.apple.com/design/human-interface-guidelines/materials
[5] https://developer.apple.com/design/human-interface-guidelines/color
[6] https://developer.apple.com/design/human-interface-guidelines/accessibility
[7] https://developer.apple.com/design/human-interface-guidelines/sheets
[8] https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
[9] https://developer.apple.com/design/human-interface-guidelines/playing-haptics
[10] https://developer.apple.com/design/human-interface-guidelines/undo-and-redo
[11] https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes
[12] https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes
[13] https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
[14] https://webkit.org/blog/14403/updates-to-storage-policy/
[15] https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ ; https://ionic.io/blog/is-apple-trying-to-kill-pwas
[16] https://bugs.webkit.org/show_bug.cgi?id=232302
[17] https://developer.apple.com/forums/thread/710157
[18] https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ ; https://daringfireball.net/linked/2023/02/16/web-push-web-apps-ios
[19] https://www.macrumors.com/2025/06/18/safari-changes-on-ios-26/ ; https://heise.de/-10749652 ; https://mjtsai.com/blog/?p=49472
[20] https://bugs.webkit.org/show_bug.cgi?id=301994
[21] https://bugs.webkit.org/show_bug.cgi?id=254868
[22] https://bugs.webkit.org/show_bug.cgi?id=300523 ; https://developer.apple.com/forums/thread/800125
[23] https://bugs.webkit.org/show_bug.cgi?id=215884
[24] https://progressier.com/pwa-capabilities/screen-wake-lock
[25] https://web-platform-dx.github.io/web-features-explorer/features/modulepreload ; https://bugs.webkit.org/show_bug.cgi?id=270357
[26] https://web-platform-dx.github.io/web-features-explorer/features/requestidlecallback
[27] https://developer.chrome.com/blog/fresher-sw ; https://developer.chrome.com/docs/workbox/handling-service-worker-updates
[28] https://nolanlawson.com/2021/08/22/speeding-up-indexeddb-reads-and-writes/ ; https://developer.chrome.com/blog/indexeddb-durability-mode-now-defaults-to-relaxed/
[29] https://adactio.com/journal/21498
[30] https://jovidecroock.com/blog/state-vs-signals ; https://blog.logrocket.com/guide-better-state-management-preact-signals/
[31] https://docs.squirrelscan.com/rules/mobile/input-zoom ; https://vispero.com/resources/text-resizing-web-pages-ios-using-dynamic-type/
[32] https://bugs.webkit.org/show_bug.cgi?id=247242 ; https://developer.apple.com/forums/thread/107269
[34] https://azukiazusa.dev/en/blog/ios-safari-web-haptics ; https://npmjs.com/package/ios-haptics
[35] https://developer.apple.com/forums/thread/119017
[36] https://www.nngroup.com/videos/empty-states-in-application-design-guidelines/
[37] https://system.automattic.design/foundations/destructive-actions/
[38] https://dx.doi.org/10.1145/1152215.1152260
[39] https://www.buildmvpfast.com/blog/liquid-glass-css-backdrop-filter-recipes-2026
[40] https://blog.expo.dev/enabling-ios-splash-screens-for-progressive-web-apps-34f06f096e5c ; https://bugs.webkit.org/show_bug.cgi?id=280262
[41] https://www.w3.org/TR/WCAG22/
[42] https://m3.material.io/components/snackbar/overview
[43] https://www.cultofmac.com/news/ios-26-fixes-awkward-iphone-back-gesture
[44] https://developer.chrome.com/blog/overscroll-behavior

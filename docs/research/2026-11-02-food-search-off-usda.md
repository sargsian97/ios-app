# Research: finding Armenian and Russian staple foods (Open Food Facts, USDA, other open databases)

I couldn't run any of the requested live searches. The proxy blocks `world.openfoodfacts.org`, `search.openfoodfacts.org`, `ru.`/`am.`/`static.openfoodfacts.org`, `api.nal.usda.gov` and `fdc.nal.usda.gov` (403 on connect). So there are no counts or result-quality numbers in this report. To run them, those hosts have to be allowed in the session's network settings; the commands are in Appendix B.

What I could check: the Open Food Facts server, documentation and Search-a-licious source on `raw.githubusercontent.com` (main branch, today), and the USDA SR28 data files, which sit inside the npm package `fda-nutrient-database@1.0.2`. I changed no repo files and wrote nothing to the scratchpad.

**Labels used below:**
- **[V-run]** — I ran it.
- **[V-src]** — I read the official source code or docs on GitHub.
- **[V-search]** — official page text, seen only through a web-search index.
- **[U]** — unverified.

---

## 1. Open Food Facts (OFF)

### 1.1 Which search interface can do what

| Interface | (a) Limit or boost by country | (b) Match Russian / Armenian names | Free text |
|---|---|---|---|
| Old search, `GET /cgi/search.pl?search_terms=…&amp;search_simple=1&amp;action=process&amp;json=1` | Filters only, no boost: `tagtype_N=countries&amp;tag_contains_N=contains&amp;tag_N=en:armenia`, or `cc=am`. A second filter on the same field is combined with AND, so "Armenia OR Russia" needs two requests [V-src `cgi/search.pl`] | Only through the product's **main-language** text (see 1.2) | Yes; officially "not recommended for new integrations" [V-src docs] |
| `GET /api/v2/search` | Yes. `countries_tags=en:armenia\|en:russia` means OR (a comma means AND, `-` excludes). Also has nutrient conditions such as `energy-kcal_100g&gt;0` and `sort_by` [V-src `docs/api/ref/api.yaml`] | No text matching | **None** |
| v3 | Has no search endpoint [V-src] | — | — |
| Search-a-licious, `GET https://search.openfoodfacts.org/search?q=…&amp;langs=…&amp;page_size=…&amp;fields=…&amp;sort_by=…` | Yes, through Lucene query syntax. The filter field is called **`countries`** (it is built from `countries_tags` and stores tag ids such as `en:armenia`). `countries_tags:"…"` probably fails with an unknown-field error because only configured field names are accepted. Use `countries:("en:armenia" OR "en:russia")` [V-src `data/config/openfoodfacts.yml`, `app/query_transformers.py`] | **Yes.** Product name and generic name are stored per language; `langs=ru,hy,en` searches those per-language copies. Russian text goes through Elasticsearch's `russian` analyzer (with stemming) and Armenian through the `armenian` analyzer. `boost_phrase=true` favours exact phrases [V-src `app/config.py`, `app/_types.py`] | Yes. Results come back as `hits[]` with a `count`. CORS allows any origin, so the phone app can call it directly [V-src `app/api.py`]. Whether the live service runs this exact configuration is [U] |

### 1.2 Why the current search returns foreign processed products

All of this is [V-src, `lib/ProductOpener/Products.pm` and `cgi/search.pl`].

- **Matching.** The old search requires every query word to appear in the product's keyword list (`_keywords`). That list is built only from `product_name` and `generic_name` **in the product's main language**, plus brands, categories, labels and origins shown in that same language. A product's `product_name_ru` is never indexed.
  - So "мацун" cannot find an Armenian product whose main language is Armenian.
- **No Russian word forms.** The only normalisation strips a trailing "s" (English plurals). "гречка" therefore does not match "Крупа гречневая".
- **Ordering.** The default sort is `unique_scans_n`, which is worldwide scan popularity. Heavily scanned Western products rise to the top.
- **Category names.** The OFF category list does contain these ids: `en:kefir` (ru «Кефир»), `en:doogh` (ru «Тан»), `en:ayran`, Buckwheat groats (ru «Гречневая крупа»), `en:bulgur`, quark (ru «творог»), Smetana, Brined cheeses, Sujuk, Baklava [V-src `taxonomies/food/categories.txt`].
  - There is **no** category for matsun/matsoni, lavash or suluguni [V-src].
  - Exact tag spellings for the category ids are [U].

### 1.3 `ru.` and `am.` subdomains, and the `cc` / `lc` parameters

All [V-src, `Display.pm`; country list in `taxonomies/countries.txt`]:

- `ru.openfoodfacts.org` sets the country to Russia (`cc=ru`) and the language to Russian (`lc=ru`).
- `am.openfoodfacts.org` sets the country to Armenia (`cc=am`) and the language to Armenian (`lc=hy`), because Armenia's official language is listed as `hy`.
- `am-ru.openfoodfacts.org` gives Armenia + Russian.
- The `cc=` and `lc=` query parameters override the subdomain, so `world.openfoodfacts.org/…&amp;cc=am&amp;lc=ru` works.
- Any country other than "world" **adds a hard `countries_tags` filter** to every search (`add_country_and_owner_filters_to_query`).
  - It narrows the result set; it does not rerank.
  - Inside the filtered set, results are still sorted by worldwide scans.
- `lc` changes how the query is normalised and which language is displayed. It does not make other-language names searchable.

### 1.4 Rate limits and User-Agent

[V-src, `docs/api/index.md`]:

- **Product reads:** 15 requests per minute per IP. This corrects the brief's 100/min.
- **Searches** (`/api/v*/search` and `search.pl`): 10 requests per minute per IP, and the docs say *"don't use it for a search-as-you-type feature, you would be blocked very quickly."* So OFF has to be queried on an explicit submit, not on a 600 ms debounce. Over-limit can mean an IP ban; 503 means the global limit.
- **User-Agent:** a custom `AppName/Version (email)` is required.
  - Browsers generally won't let a page override User-Agent [U]. Build scripts can and should set it.
  - The docs also ask integrators to fill in their API-usage form.
- Search-a-licious publishes no limits [U]. Treat it as the same 10/min budget.

### 1.5 Coverage and result quality

**Not measured** because the hosts were blocked. Indirectly: the search index shows OFF product pages for Armenian items (a 500 g «ՄԱԾՈՒՆ» strained yogurt, "Royal Armenia" coffee) and an empty Armenia × Lidl page [V-search]. Appendix B has a script that measures, for each query × {world, am, ru, am+hy} and for the Search-a-licious variant: `count`, how many results have kcal, how many have a Russian name, and the first names. It also counts all Armenian and Russian products, with and without kcal, staying at 9 requests per minute or fewer.

### 1.6 Recommended strategy

**1. While typing:** search only offline — own foods, recipes and the built-in staples (section 2). This alone gives "type → calories per 100 g" without the network.

**2. On submit** ("Найти в интернете" or Enter), at most two OFF requests plus USDA:
- **R1, Search-a-licious:**
  - `q` = the query expanded with synonyms from the staples dictionary, e.g. `(мацун OR мацони OR մածուն OR matsun OR matsoni) AND countries:("en:armenia" OR "en:russia")`
  - `langs=ru,hy,en` (possibly also `main` [U])
  - `page_size=30`
  - `fields=code,product_name,product_name_ru,product_name_hy,product_name_en,brands,countries_tags,nutriments,quantity,serving_size,serving_quantity,completeness`
  - `boost_phrase=true`
- **R2, same without the country clause**, sent only if R1 returns fewer than 8 usable items.
- **If Search-a-licious fails** (network, 4xx, 5xx): `search.pl` with `cc=am` and `cc=ru` in parallel. Never the worldwide old search.
- **If the query matches a staple that has an OFF category id:** one v2 call can replace R2: `/api/v2/search?categories_tags=en:kefir&amp;countries_tags=en:armenia|en:russia&amp;energy-kcal_100g%3E0&amp;fields=…`.
- `offToFood` needs an adapter for Search-a-licious: there `product_name` is probably an object keyed by language [U]. Use `product_name_hy` as a display fallback.

**3. Client-side reranking.** Put the weights in a small config module (they are interface heuristics, not nutrition formulas) and cover them with fixture tests:
- **Bonuses:**
  - +30 if there is a Russian name; +15 if there is an Armenian name.
  - +25 if sold in Armenia; +20 if sold in Russia (order configurable).
  - +20 if every query stem appears in the ru/hy name; +10 if the name starts with the first stem.
  - +10 if protein, fat and carbs are all present.
  - +5 × completeness.
- **Penalties:**
  - −40 if there is no ru, hy or en name.
  - −25 and a «проверьте» flag if |kcal − (4P + 4C + 9F + 7·alcohol)| &gt; max(40, 0.2·kcal).
- **Drop** items with no kcal (the code already does this).
- **Ties** go to `unique_scans_n` when it is returned.

**4. Caching.** Store results in IndexedDB under the key `source:strategyVersion:normalisedQuery`, with a 7-day lifetime and about 200 entries, least-recently-used out. Never resend an identical query within the session. Keep an in-memory counter that refuses to send more than 8 OFF searches per rolling minute.

### 1.7 OFF licence and attribution

- Database: ODbL. Individual contents: DbCL. Images: CC BY-SA [V-src docs].
- In the app, show «Данные: Open Food Facts (openfoodfacts.org), лицензия ODbL» next to OFF results and in About [wording U].
- Caching on the phone is fine. **Do not commit** collected OFF data to the public repo: a publicly distributed derived database must itself be ODbL (share-alike) [U, standard ODbL reading].
- The current fields don't fetch images; if images are added later, they need CC BY-SA credit.

---

## 2. Built-in offline table of staples from USDA

### 2.1 Licence

FoodData Central data is public domain under CC0 1.0. USDA asks users to list FoodData Central as the source [V-search, fdc API guide and download page]. Suggested credit: «USDA FoodData Central, SR Legacy (04/2018), CC0».

### 2.2 Which USDA dataset

- **SR Legacy** (released April 2018, final, frozen): 7,793 generic foods with values per 100 g [V-search]. **Use this as the primary source.** It is reproducible, uses traditional names like "Buckwheat groats, roasted, cooked", and every food has an NDB number.
  - I checked all NDB numbers in Appendix A against SR28, its predecessor (8,789 foods) [V-run].
  - About 1,000 SR28 items were dropped in SR Legacy, mostly branded ones [U], so the build must fail loudly if an NDB is missing.
- **Foundation Foods:** newer lab-analysed data for fewer items. Many report energy only as nutrient 957/958 (Atwater factors) rather than 208 [U]. The current `usda.js` maps only 208/268, so those items would lose kcal. Use later, if at all.
- **FNDDS (survey foods):** the only USDA source of mixed dishes (borscht? baklava? pierogi?). These are US recipes. Mark as approximations; every candidate is "TODO verify".

### 2.3 USDA API and bulk download

- **One food:** `GET /fdc/v1/food/{fdcId}`. **Several:** `GET /fdc/v1/foods?fdcIds=…` or `POST /fdc/v1/foods {"fdcIds":[…]}`. Both exist (seen in a third-party client's code) [V-src, third-party]. Max 20 ids per call [U].
- **Limits:** 1,000 requests per hour per IP with a key; going over blocks the key for an hour [V-search, official guide]. DEMO_KEY: "much lower" officially; third-party figures of about 10–30 per hour [U]. One build of about 300 staples is 15 batch calls, probably fine even on DEMO_KEY [U].
- **No key needed:** the download page offers SR Legacy April 2018 as CSV and JSON [V-search].
  - Likely URL: `https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip` [U].
  - It contains `sr_legacy_food.csv`, which maps `fdc_id` to `NDB_number` [V-search], plus `food.csv`, `food_nutrient.csv` and `nutrient.csv` [U].
- **I could not resolve FDC IDs here.** The mapping file should store the **NDB number**, and the script fills in `fdc_id` from `sr_legacy_food.csv`.

### 2.4 Proposed pipeline (modelled on `scripts/build-exercises.mjs`)

**Mapping file `scripts/foods/ru-hy.json`** (our own data):
```json
{"id":"matsun","ndb":"01116","ru":"Мацун","hy":"մածուն","hyLat":"matsun",
 "syn":["мацони","matsoni","matsoun","madzoon"],"cat":"dairy","unit":"g",
 "portions":[{"ru":"стакан","amount":250,"assumed":true}],
 "approx":"USDA: Yogurt, plain, whole milk — жирность мацуна у производителей разная",
 "off":"en:yogurts"}
{"id":"tan","derive":[["matsun",0.5],["water",0.5]],"ru":"Тан","hy":"թան", "...": "..."}
```

**Script `node scripts/build-foods.mjs &lt;unzipped SR Legacy CSV folder&gt;`:**
1. Look up the FDC id from the NDB number via `sr_legacy_food.csv`.
2. Collect each food's nutrients from `food_nutrient.csv` + `nutrient.csv`.
3. Convert them with the **existing** `usdaNutrients()` in `usda.js` (one place for the nutrient mapping).
4. Compute `derive` entries (mixtures of other entries).
5. Fail if an NDB is missing, a Russian name is missing, an id is duplicated, or an approximate/derived entry has no `approx` note.
6. Warn if calories don't roughly match 4P + 4C + 9F.

The script takes a folder path because Node 22 has no built-in unzip. Optionally it could call the API with `USDA_API_KEY` from the environment, never committed.

**Output `web/data/foods-basic.json`:**
```json
{"source":"USDA FoodData Central — SR Legacy","url":"https://fdc.nal.usda.gov","license":"CC0 1.0","version":1,
 "items":[{"id":"buckwheat-cooked","n":"Гречка варёная","hy":"եփած հնդկաձավար","hyl":"yepats hndkadzavar",
   "s":["гречневая каша","grechka"],"c":"grains","u":"g","p":[{"l":"тарелка","g":200}],
   "ndb":"20010","fdc":0,"en":"Buckwheat groats, roasted, cooked",
   "nu":{"kcal":92,"protein":3.38,"fat":0.62,"carbs":19.94,"fiber":2.7,"sugars":0.9,"saturated_fat":0.13,
         "sodium":4,"potassium":88,"calcium":7,"iron":0.8,"magnesium":51}}]}
```
- `fdc` is filled in by the script; the `nu` values come from the build, and these particular numbers are SR28 figures shown for illustration.
- Each item is about 450–550 bytes. 300 items ≈ 150 KB raw, about 35–45 KB gzipped [estimate]. That is smaller than the 323 KB `exercises.json`. Add it to the offline-cache list (`SHELL`) or load it on the first search.
- Add tests: schema, unique ids, plausible kcal, every approximation has a note.
- Add DECISIONS.md lines for:
  - "USDA SR Legacy is the source of the built-in table"
  - each approximation
  - the 50/50 ratio used for тан
  - the OFF search strategy
  - the attribution text

### 2.5 Offline matching

- **Normalising:** lower-case, `ё→е`, strip punctuation. For Armenian: `toLocaleLowerCase('hy')`, `և→եւ`, remove ՝ ՛ ՞ ։.
- **Russian word forms:** a light suffix stripper on tokens of 4+ characters (а я ы и у ю е о ой ей ий ый ая ое ые ов ев ами ями ах ях ом ем), then prefix matching. "гречки" becomes "гречк" and matches "гречка".
- **Alternations stemming can't handle** go in `syn`: творог/творожный/творожок, гречневая, лаваш/lavash.
- **Latin input:** auto-transliterate Russian names, and add hand-written Latin variants for about 40 regional items (matsun/matsoni/madzoon, tan/than, suluguni/sulguni, khorovats/horovac, tolma/dolma, basturma, sujukh/sudzhuk, lavash).
- **Typos:** Damerau-Levenshtein distance ≤ 1, last resort, tokens of 5+ characters.
- **Ranking:**
  - Order: name starts with the query &gt; word prefix &gt; synonym &gt; substring.
  - Generic built-in staples rank above branded online products unless the query contains a known brand.
  - When a food has dry and cooked forms, show both with the state in the name.

---

## 3. Other open databases (proposals only, nothing connected)

| Database | Licence | Format / size | Adds value for this list? | Recommendation |
|---|---|---|---|---|
| FAO/INFOODS regional tables | FAO default is CC BY-NC-SA 3.0 IGO [U] | Varies | No Armenian table found. Georgian table from 2009 has 139 foods, licence unknown [V-search] | No |
| Скурихин/Тутельян, «Химический состав…» | Copyrighted book; online copies are unlicensed [U] | — | High, but not legally usable | **Do not use** |
| CIQUAL (France) | Licence Ouverte / Etalab, attribution only (2.0 expected [U]) | CSV/XLS, 3,484 foods (2020) [V-search] | **High** for USDA's gaps: kefir, fromage blanc ≈ творог, buckwheat, bulgur. OFF categories already link to CIQUAL codes (en:kefir → 19865; quark/творог → 19501) [V-src] | **Best second source; propose to the owner** |
| CoFID (UK) | Open Government Licence v3 [V-search, secondary sources] | XLSX, about 2,900 foods [U] | Medium (UK cottage cheese, kefir? [U]) | Maybe |
| Frida (Denmark) | "Free access"; CC BY 4.0 **not confirmed** [V-search] | Download available, 1,400+ foods | Low–medium (rye bread, quark) | Only after the licence is confirmed |
| Swiss food composition DB | opendata.swiss: reuse with source reference, commercial use allowed [V-search] | XLS, about 1,100 foods [U] | Medium (quark, cottage cheese) | Maybe |
| Canadian Nutrient File | Open Government Licence – Canada [V-search, secondary sources] | CSV + API | Low (largely derived from USDA SR) | No |
| OFF "generic/raw" products | ODbL | — | OFF holds barcoded products, not reference values | No |
| `tempo-food-db` (npm) | CC BY 4.0; 7,795 foods mixing SR Legacy with values "from packaging labels and public tables" [V-run] | CSV/JSON | Origin of the non-USDA values unclear | No |
| Open Armenian / Russian product databases | None found [V-search] | — | — | — |

---

## 4. Interface note

- **While typing:** «Мои» (own foods and recipes, recent first) and «Базовые» (built-in) appear instantly, offline. On submit, «Open Food Facts» and «USDA» sections are appended: up to 5 rows each plus «ещё», duplicates of saved foods removed.
- **Result row, two lines:**
  - Line 1: **name with state** on the left, **kcal per 100 g** on the right.
  - Line 2, small: `Б 3,4 · Ж 0,6 · У 19,9 на 100 г · [source]`.
  - Source labels: «Мой», «Рецепт», «Базовый · USDA», «≈ Базовый · USDA» (approximation), «OFF · Армения · &lt;бренд&gt;», «OFF · Россия · &lt;бренд&gt;», «USDA · бренд».
  - Add «!» when OFF data is incomplete or the calories don't match P/F/C.
- **Portion sheet, one screen:**
  - Header with the name and source line, e.g. «USDA SR Legacy · Yogurt, plain, whole milk», plus the approximation note («≈ мацун приравнен к йогурту цельному; на упаковке точнее»).
  - Values per 100 g.
  - A large grams field, autofocused, numeric keypad, prefilled with the last amount used for this product. A g/ml toggle for liquids.
  - Chips: the default portion (marked as an assumption) and 50/100/150/200.
  - Live totals: kcal large, P/F/C small.
  - Main button «Записать»; secondary «Изменить по этикетке», which makes an own copy linked to the source.
  - Enter in the grams field logs the entry.

---

## Appendix A — Staple table

- **NDB, description and kcal/protein/fat/carbs per 100 g:** verified against USDA SR28 [V-run]. The build must re-read the values from SR Legacy. **FDC id is TODO for every row** (resolve via `sr_legacy_food.csv`).
- **Armenian spellings and transliterations** are my drafts and need a native speaker's check; "?" marks the ones I'm least sure of.
- **M column:**
  - E = equivalent.
  - A = approximation (the note says how).
  - D = derived or own recipe built from rows in this table.
  - N = no USDA analogue (use the label, an OFF product or an own recipe).
  - T = FNDDS candidate, TODO verify.

| # | Рус. | Հայ. (lat.) | NDB | USDA description (abridged) | kcal/P/F/C | M | Note |
|---|---|---|---|---|---|---|---|
| 1 | Молоко 3,2% | կաթ (kat) | 01077 | Milk, whole, 3.25% milkfat, w/ vit D | 61/3.2/3.3/4.8 | E | |
| 2 | Молоко 2,5% | կաթ 2,5% | 01079 | Milk, reduced fat, 2% milkfat, w/ vit A &amp; D | 50/3.3/2.0/4.8 | A | 2% vs 2.5% fat |
| 3 | Мацун | մածուն (matsun) | 01116 | Yogurt, plain, whole milk, 8 g protein/8 oz | 61/3.5/3.3/4.7 | A | matsun fat 2.5–4% varies |
| 4 | Тан / айран | թան (tan) | — | 50% мацун + 50% вода (+соль) | ≈31/1.7/1.6/2.3 | D | ratio is an assumption → DECISIONS |
| 5 | Кефир 3,2% | կեֆիր (kefir) | 01230 | Milk, buttermilk, fluid, whole | 62/3.2/3.3/4.9 | A | cultured buttermilk ≈ kefir |
| 6 | Кефир 1% | կեֆիր 1% | 01088 | Milk, buttermilk, fluid, cultured, lowfat | 40/3.3/0.9/4.8 | A | alt. 01289 "Kefir, lowfat, plain, LIFEWAY" (branded; may be absent in SR Legacy) |
| 7 | Ряженка | ռյաժենկա (ryazhenka)? | — | — | — | N | label / OFF |
| 8 | Творог 9% | կաթնաշոռ (katnashor) | — | none at 9% | — | N | label / OFF; CIQUAL candidate |
| 9 | Творог 5% | կաթնաշոռ 5% | 01012 | Cheese, cottage, creamed, large or small curd | 98/11.1/4.3/3.4 | A | US cottage cheese is wetter, less protein |
| 10 | Творог 0–2% | կաթնաշոռ 0–2% | 01015 | Cheese, cottage, lowfat, 2% milkfat | 81/10.5/2.3/4.8 | A | |
| 11 | Сметана 20% | թթվասեր (ttvaser) | 01056 | Cream, sour, cultured | 198/2.4/19.4/4.6 | E | |
| 12 | Сметана 10–15% | թթվասեր 15% | 01055 | Cream, sour, reduced fat, cultured | 135/2.9/12.0/4.3 | A | 12% fat |
| 13 | Сливки 10% | սերուցք (seruts'k) | 01049 | Cream, fluid, half and half | 123/3.1/10.4/4.7 | E | |
| 14 | Сливки 20% | սերուցք 20% | 01050 | Cream, fluid, light | 191/3.0/19.1/2.8 | E | |
| 15 | Сгущённое молоко | խտացրած կաթ (khtatsrats kat) | 01095 | Milk, canned, condensed, sweetened | 321/7.9/8.7/54.4 | E | |
| 16 | Масло сливочное | կարագ (karag) | 01145 | Butter, without salt | 717/0.9/81.1/0.1 | E | |
| 17 | Масло топлёное / гхи | հալած յուղ (halats yugh) | 01003 | Butter oil, anhydrous | 876/0.3/99.5/0 | E | |
| 18 | Сыр лори | Լոռի պանիր (Lori panir) | 01019 | Cheese, feta | 264/14.2/21.3/4.1 | A | brined; Lori is cow's-milk semi-hard |
| 19 | Сыр чанах | չանախ (chanakh) | 01019 | Cheese, feta | 264/14.2/21.3/4.1 | A | brined sheep's cheese |
| 20 | Брынза | բրինզա (brinza)? | 01019 | Cheese, feta | 264/14.2/21.3/4.1 | A | |
| 21 | Сулугуни | սուլուգունի (suluguni) | 01027 | Cheese, mozzarella, whole milk, low moisture | 318/21.6/24.6/2.5 | A | stretched-curd, brined |
| 22 | Моцарелла | մոցարելլա (motsarella) | 01026 | Cheese, mozzarella, whole milk | 300/22.2/22.4/2.2 | E | |
| 23 | Сыр твёрдый (Российский/Голландский) | կոշտ պանիր (kosht panir) | 01022 | Cheese, gouda | 356/24.9/27.4/2.2 | A | |
| 24 | Яйцо куриное | ձու (dzu) | 01123 | Egg, whole, raw, fresh | 143/12.6/9.5/0.7 | E | 1 egg ≈ 50–55 g = assumption |
| 25 | Яйцо варёное | խաշած ձու (khashats dzu) | 01129 | Egg, whole, cooked, hard-boiled | 155/12.6/10.6/1.1 | E | |
| 26 | Яичница | ձվածեղ (dzvatsegh) | 01128 | Egg, whole, cooked, fried | 196/13.6/14.8/0.8 | E | |
| 27 | Гречка сухая | հնդկաձավար (hndkadzavar) | 20009 | Buckwheat groats, roasted, dry | 346/11.7/2.7/75.0 | E | |
| 28 | Гречка варёная | եփած հնդկաձավար (yepats hndkadzavar) | 20010 | Buckwheat groats, roasted, cooked | 92/3.4/0.6/19.9 | E | |
| 29 | Рис белый сухой | բրինձ (brindz) | 20444 | Rice, white, long-grain, regular, raw, unenriched | 365/7.1/0.7/80.0 | E | |
| 30 | Рис варёный | եփած բրինձ (yepats brindz) | 20445 | …long-grain, unenriched, cooked without salt | 130/2.7/0.3/28.2 | E | |
| 31 | Булгур сухой | բլղուր (bulghur) | 20012 | Bulgur, dry | 342/12.3/1.3/75.9 | E | |
| 32 | Булгур варёный | եփած բլղուր | 20013 | Bulgur, cooked | 83/3.1/0.2/18.6 | E | |
| 33 | Овсяные хлопья | վարսակի փաթիլներ (varsaki p'atʿilner) | 08120 | Cereals, oats, regular and quick, not fortified, dry | 379/13.2/6.5/67.7 | E | |
| 34 | Овсянка на воде | վարսակի շիլա (varsaki shila) | 08121 | …cooked with water, without salt | 71/2.5/1.5/12.0 | E | |
| 35 | Перловка сухая | գարու ձավար (garu dzavar)? | 20005 | Barley, pearled, raw | 352/9.9/1.2/77.7 | E | |
| 36 | Перловка варёная | եփած գարի | 20006 | Barley, pearled, cooked | 123/2.3/0.4/28.2 | E | |
| 37 | Пшено сухое | կորեկ (korek) | 20031 | Millet, raw | 378/11.0/4.2/72.9 | E | |
| 38 | Пшено варёное | եփած կորեկ | 20032 | Millet, cooked | 119/3.5/1.0/23.7 | E | |
| 39 | Манка | մաննա (manna)? | 20066 | Semolina, enriched | 360/12.7/1.1/72.8 | A | added vitamins affect micros only |
| 40 | Макароны сухие | մակարոն (makaron) | 20420 | Pasta, dry, unenriched | 371/13.0/1.5/74.7 | E | |
| 41 | Макароны варёные | եփած մակարոն | 20421 | Pasta, cooked, unenriched, without added salt | 158/5.8/0.9/30.9 | E | |
| 42 | Мука пшеничная | ալյուր (alyur) | 20081 | Wheat flour, white, all-purpose, enriched, bleached | 364/10.3/1.0/76.3 | A | added vitamins |
| 43 | Мука ржаная | տարեկանի ալյուր (tarekani alyur) | 20064 | Rye flour, medium | 349/10.9/1.5/75.4 | E | |
| 44 | Лаваш тонкий | լավաշ (lavash) | 18413 | Bread, pita, white, unenriched | 275/9.1/1.2/55.7 | A | moisture varies; "1 sheet" portion = assumption |
| 45 | Лаваш сухой | չոր լավաշ (chor lavash) | — | — | — | N | much drier; label |
| 46 | Матнакаш | մատնաքաշ (matnakash) | 18029 | Bread, french or vienna (includes sourdough) | 272/10.8/2.4/51.9 | A | |
| 47 | Хлеб белый / батон | սպիտակ հաց (spitak hats) | 18069 | Bread, white, commercially prepared | 266/8.9/3.3/49.4 | A | US bread has added sugar |
| 48 | Хлеб ржаной | տարեկանի հաց (tarekani hats) | 18060 | Bread, rye | 259/8.5/3.3/48.3 | A | US rye bread is a wheat–rye mix |
| 49 | Хлеб бородинский | բորոդինո հաց? | 18044 | Bread, pumpernickel | 250/8.7/3.1/47.5 | A | |
| 50 | Блины | նրբաբլիթ (nrbablit) | 18293 | Pancakes, plain, prepared from recipe | 227/6.4/9.7/28.3 | A | better: own recipe |
| 51 | Чечевица сухая | ոսպ (vosp) | 16069 | Lentils, raw | 352/24.6/1.1/63.4 | E | |
| 52 | Чечевица варёная | եփած ոսպ (yepats vosp) | 16070 | Lentils, mature seeds, cooked, boiled, w/o salt | 116/9.0/0.4/20.1 | E | |
| 53 | Чечевица красная сухая | կարմիր ոսպ (karmir vosp) | 16144 | Lentils, pink or red, raw | 358/23.9/2.2/63.1 | E | no cooked entry in SR |
| 54 | Нут сухой | սիսեռ (siser) | 16056 | Chickpeas…, mature seeds, raw | 378/20.5/6.0/63.0 | E | |
| 55 | Нут варёный | եփած սիսեռ | 16057 | Chickpeas…, cooked, boiled, w/o salt | 164/8.9/2.6/27.4 | E | |
| 56 | Фасоль красная сухая | կարմիր լոբի (karmir lobi) | 16032 | Beans, kidney, red, mature seeds, raw | 337/22.5/1.1/61.3 | E | |
| 57 | Фасоль красная варёная | եփած լոբի | 16033 | …red, cooked, boiled, w/o salt | 127/8.7/0.5/22.8 | E | |
| 58 | Фасоль белая варёная | սպիտակ լոբի (spitak lobi) | 16050 | Beans, white, mature seeds, cooked, boiled, w/o salt | 139/9.7/0.4/25.1 | E | |
| 59 | Маш варёный | մաշ (mash) | 16081 | Mung beans, mature seeds, cooked, boiled, w/o salt | 105/7.0/0.4/19.2 | E | |
| 60 | Горох колотый варёный | ոլոռ (volor) | 16086 | Peas, split, mature seeds, cooked, boiled, w/o salt | 118/8.3/0.4/21.1 | E | |
| 61 | Хумус | հումուս (humus) | 16158 | Hummus, commercial | 166/7.9/9.6/14.3 | E | |
| 62 | Говядина сырая | տավարի միս (tavari mis) | 13795 | Beef, composite of retail cuts, lean &amp; fat, 1/8" fat, raw | 214/20.0/14.4/0 | A | average of cuts |
| 63 | Говядина варёная / тушёная | եփած տավարի միս | 13796 | …lean &amp; fat, 1/8" fat, cooked | 259/26.1/16.6/0 | A | |
| 64 | Фарш говяжий 15% | աղացած միս (aghatsats mis) | 23567 | Beef, ground, 85% lean/15% fat, raw | 215/18.6/15.0/0 | E | |
| 65 | Фарш говяжий 20% | աղացած միս 20% | 23572 | Beef, ground, 80% lean/20% fat, raw | 254/17.2/20.0/0 | E | |
| 66 | Свинина (лопатка) сырая | խոզի միս (khozi mis) | 10070 | Pork, fresh, shoulder, whole, lean &amp; fat, raw | 236/17.2/18.0/0 | E | |
| 67 | Свиная вырезка | խոզի փափկամիս? | 10060 | Pork, fresh, loin, tenderloin, lean only, raw | 109/21.0/2.2/0 | E | |
| 68 | Хоровац свиной (готовый) | խոզի խորոված (khozi khorovats) | 10071 | Pork, shoulder, lean &amp; fat, cooked, roasted | 292/23.3/21.4/0 | A | coal-grilled; fat loss varies |
| 69 | Баранина сырая | ոչխարի միս (vochkhari mis) | 17001 | Lamb, composite cuts, lean &amp; fat, 1/4" fat, choice, raw | 267/16.9/21.6/0 | A | |
| 70 | Баранина жареная | ոչխարի խորոված | 17002 | …cooked | 294/24.5/20.9/0 | A | |
| 71 | Фарш бараний | ոչխարի աղացած միս | 17224 | Lamb, ground, raw | 282/16.6/23.4/0 | E | |
| 72 | Курица с кожей сырая | հավ (hav) | 05006 | Chicken, broilers or fryers, meat and skin, raw | 215/18.6/15.1/0 | E | |
| 73 | Курица с кожей запечённая | խորոված հավ | 05009 | …meat and skin, cooked, roasted | 239/27.3/13.6/0 | E | |
| 74 | Куриная грудка сырая | հավի կրծքամիս (havi krtskamis) | 05062 | Chicken, breast, skinless, boneless, meat only, raw | 120/22.5/2.6/0 | E | |
| 75 | Куриная грудка запечённая | | 05064 | …breast, meat only, cooked, roasted | 165/31.0/3.6/0 | E | |
| 76 | Куриное бедро без кожи | հավի ազդր (havi azdr) | 05096 | …dark meat, thigh, meat only, raw | 121/19.7/4.1/0 | E | |
| 77 | Индейка сырая | հնդկահավ (hndkahav) | 05167 | Turkey, whole, meat only, raw | 112/22.6/1.9/0.1 | E | |
| 78 | Печень говяжья | տավարի լյարդ (tavari lyard) | 13325 | Beef, variety meats, liver, raw | 135/20.4/3.6/3.9 | E | |
| 79 | Печень куриная | հավի լյարդ (havi lyard) | 05027 | Chicken, liver, all classes, raw | 119/16.9/4.8/0.7 | E | |
| 80 | Сало солёное | խոզի ճարպ (khozi charp) | 10165 | Pork, cured, salt pork, raw | 748/5.1/80.5/0 | A | |
| 81 | Колбаса варёная | եփած երշիկ (yepats yershik) | 07008 | Bologna, beef and pork | 308/15.2/24.6/5.5 | A | |
| 82 | Сосиски | նրբերշիկ (nrbershik) | 07950 | Frankfurter, meat | 290/10.3/25.8/4.2 | A | |
| 83 | Колбаса копчёная | ապխտած երշիկ (apkhtats yershik) | 07916 | Sausage, Polish, pork and beef, smoked | 301/12.1/26.6/2.0 | A | |
| 84 | Ветчина | խոզապուխտ (khozapukht) | 07029 | Ham, sliced, regular (≈11% fat) | 163/16.6/8.6/3.8 | A | |
| 85 | Бастурма | բաստուրմա (basturma) | 13350 | Beef, cured, dried | 153/31.1/1.9/2.8 | A | spice coating (chaman) not included |
| 86 | Суджук | սուջուխ (sujukh) | — | — | — | N | label / OFF (category Sujuk exists) |
| 87 | Форель / ишхан | իշխան, կարմրախայտ (ishkhan, karmrakhayt) | 15240 | Fish, trout, rainbow, farmed, raw | 141/19.9/6.2/0 | A | Sevan trout ≈ rainbow trout |
| 88 | Сиг | սիգ (sig) | 15130 | Fish, whitefish, mixed species, raw | 134/19.1/5.9/0 | A | |
| 89 | Лосось / сёмга | սաղմոն (saghmon) | 15236 | Fish, salmon, Atlantic, farmed, raw | 208/20.4/13.4/0 | E | |
| 90 | Сельдь свежая | ծովատառեխ (tsovatarekh) | 15039 | Fish, herring, Atlantic, raw | 158/18.0/9.0/0 | E | |
| 91 | Сельдь солёная | աղած ծովատառեխ | 15041 | Fish, herring, Atlantic, pickled | 262/14.2/18.0/9.6 | A | US version is a sweet marinade; Russian salted ≈ 0 carbs |
| 92 | Скумбрия | սկումբրիա (skumbria) | 15046 | Fish, mackerel, Atlantic, raw | 205/18.6/13.9/0 | E | |
| 93 | Треска | ձողաձուկ (dzoghadzuk) | 15015 | Fish, cod, Atlantic, raw | 82/17.8/0.7/0 | E | |
| 94 | Карп | ծածան (tsatsan) | 15008 | Fish, carp, raw | 127/17.8/5.6/0 | E | |
| 95 | Судак | սուդակ? | 15064 | Fish, pike, walleye, raw | 93/19.1/1.2/0 | A | walleye ≈ zander |
| 96 | Креветки варёные | ծովախեցգետին (tsovakhetsgetin) | 15271 | Crustaceans, shrimp, cooked | 99/24.0/0.3/0.2 | E | |
| 97 | Икра красная / чёрная | ձկնկիթ (dzknkit) | 15012 | Fish, caviar, black and red, granular | 264/24.6/17.9/4.0 | E | |
| 98 | Помидор | լոլիկ (lolik) | 11529 | Tomatoes, red, ripe, raw, year round average | 18/0.9/0.2/3.9 | E | |
| 99 | Огурец | վարունգ (varung) | 11205 | Cucumber, with peel, raw | 15/0.7/0.1/3.6 | E | |
| 100 | Картофель сырой | կարտոֆիլ (kartofil) | 11352 | Potatoes, flesh and skin, raw | 77/2.1/0.1/17.5 | E | |
| 101 | Картофель варёный | եփած կարտոֆիլ | 11367 | Potatoes, boiled, without skin, w/o salt | 86/1.7/0.1/20.0 | E | |
| 102 | Лук репчатый | սոխ (sokh) | 11282 | Onions, raw | 40/1.1/0.1/9.3 | E | |
| 103 | Морковь | գազար (gazar) | 11124 | Carrots, raw | 41/0.9/0.2/9.6 | E | |
| 104 | Капуста белокочанная | կաղամբ (kaghamb) | 11109 | Cabbage, raw | 25/1.3/0.1/5.8 | E | |
| 105 | Капуста квашеная | թթու կաղամբ (ttu kaghamb) | 11439 | Sauerkraut, canned, solids and liquids | 19/0.9/0.1/4.3 | A | |
| 106 | Свёкла | ճակնդեղ (chakndegh) | 11080 | Beets, raw | 43/1.6/0.2/9.6 | E | |
| 107 | Баклажан | սմբուկ (smbuk) | 11209 | Eggplant, raw | 25/1.0/0.2/5.9 | E | |
| 108 | Перец сладкий | բիբար (bibar) | 11821 | Peppers, sweet, red, raw | 31/1.0/0.3/6.0 | E | green: 11333 |
| 109 | Кабачок | դդմիկ (ddmik) | 11477 | Squash, summer, zucchini, includes skin, raw | 17/1.2/0.3/3.1 | E | |
| 110 | Тыква | դդում (ddum) | 11422 | Pumpkin, raw | 26/1.0/0.1/6.5 | E | |
| 111 | Чеснок | սխտոր (skhtor) | 11215 | Garlic, raw | 149/6.4/0.5/33.1 | E | |
| 112 | Петрушка | մաղադանոս (maghadanos) | 11297 | Parsley, fresh | 36/3.0/0.8/6.3 | E | |
| 113 | Укроп | սամիթ (samit) | 02045 | Dill weed, fresh | 43/3.5/1.1/7.0 | E | |
| 114 | Кинза | համեմ (hamem) | 11165 | Coriander (cilantro) leaves, raw | 23/2.1/0.5/3.7 | E | |
| 115 | Рейхан (базилик) | ռեհան (rehan) | 02044 | Basil, fresh | 23/3.2/0.6/2.7 | A | purple basil |
| 116 | Мята | անանուխ (ananukh) | 02065 | Spearmint, fresh | 44/3.3/0.7/8.4 | E | |
| 117 | Тархун свежий | թարխուն (tarkhun) | — | only 02041 Spices, tarragon, dried | — | N | |
| 118 | Щавель | թրթնջուկ (trtnjuk) | — | — | — | N | |
| 119 | Шпинат | սպանախ (spanakh) | 11457 | Spinach, raw | 23/2.9/0.4/3.6 | E | |
| 120 | Портулак | դանդուռ (dandur) | 11427 | Purslane, raw | 20/2.0/0.4/3.4 | E | |
| 121 | Шампиньоны | սունկ (sunk) | 11260 | Mushrooms, white, raw | 22/3.1/0.3/3.3 | E | |
| 122 | Огурцы солёные | թթու վարունգ (ttu varung) | 11937 | Pickles, cucumber, dill or kosher dill | 12/0.5/0.3/2.4 | E | |
| 123 | Виноградные листья | խաղողի տերև (khaghoghi terev) | 11975 | Grape leaves, canned | 69/4.3/2.0/11.7 | E | raw: 11974 |
| 124 | Томатная паста | տոմատի մածուկ (tomati matsuk) | 11546 | Tomato products, canned, paste, w/o salt | 82/4.3/0.5/18.9 | E | |
| 125 | Абрикос | ծիրան (tsiran) | 09021 | Apricots, raw | 48/1.4/0.4/11.1 | E | |
| 126 | Курага | ծիրանի չիր (tsirani chir) | 09032 | Apricots, dried, sulfured, uncooked | 241/3.4/0.5/62.6 | E | |
| 127 | Гранат | նուռ (nur) | 09286 | Pomegranates, raw | 83/1.7/1.2/18.7 | E | |
| 128 | Инжир | թուզ (tuz) | 09089 | Figs, raw | 74/0.8/0.3/19.2 | E | |
| 129 | Инжир сушёный | թզի չիր (tzi chir) | 09094 | Figs, dried, uncooked | 249/3.3/0.9/63.9 | E | |
| 130 | Хурма | խուրմա (khurma) | 09263 | Persimmons, japanese, raw | 70/0.6/0.2/18.6 | E | |
| 131 | Виноград | խաղող (khaghogh) | 09132 | Grapes, red or green (European type), raw | 69/0.7/0.2/18.1 | E | |
| 132 | Яблоко | խնձոր (khndzor) | 09003 | Apples, raw, with skin | 52/0.3/0.2/13.8 | E | |
| 133 | Груша | տանձ (tandz) | 09252 | Pears, raw | 57/0.4/0.1/15.2 | E | |
| 134 | Персик | դեղձ (deghdz) | 09236 | Peaches, yellow, raw | 39/0.9/0.3/9.5 | E | |
| 135 | Черешня | կեռաս (keras) | 09070 | Cherries, sweet, raw | 63/1.1/0.2/16.0 | E | |
| 136 | Вишня | բալ (bal) | 09063 | Cherries, sour, red, raw | 50/1.0/0.3/12.2 | E | |
| 137 | Слива | սալոր (salor) | 09279 | Plums, raw | 46/0.7/0.3/11.4 | E | |
| 138 | Чернослив | սալորաչիր (salorachir) | 09291 | Plums, dried (prunes), uncooked | 240/2.2/0.4/63.9 | E | |
| 139 | Арбуз | ձմերուկ (dzmeruk) | 09326 | Watermelon, raw | 30/0.6/0.2/7.6 | E | |
| 140 | Дыня | սեխ (sekh) | 09184 | Melons, honeydew, raw | 36/0.5/0.1/9.1 | A | local varieties |
| 141 | Айва | սերկևիլ (serkevil) | 09296 | Quinces, raw | 57/0.4/0.1/15.3 | E | |
| 142 | Тутовник | թութ (tut) | 09190 | Mulberries, raw | 43/1.4/0.4/9.8 | E | |
| 143 | Изюм | չամիչ (chamich) | 09298 | Raisins, seedless | 299/3.1/0.5/79.2 | E | |
| 144 | Мандарин | մանդարին (mandarin) | 09218 | Tangerines (mandarin oranges), raw | 53/0.8/0.3/13.3 | E | |
| 145 | Банан | բանան (banan) | 09040 | Bananas, raw | 89/1.1/0.3/22.8 | E | |
| 146 | Клубника | ելակ (yelak) | 09316 | Strawberries, raw | 32/0.7/0.3/7.7 | E | |
| 147 | Кизил | հոն (hon) | — | — | — | N | |
| 148 | Грецкий орех | ընկույզ (ynkuyz) | 12155 | Nuts, walnuts, english | 654/15.2/65.2/13.7 | E | |
| 149 | Фундук | պնդուկ (pnduk) | 12120 | Nuts, hazelnuts or filberts | 628/15.0/60.8/16.7 | E | |
| 150 | Миндаль | նուշ (nush) | 12061 | Nuts, almonds | 579/21.2/49.9/21.6 | E | |
| 151 | Фисташки | պիստակ (pistak) | 12152 | Nuts, pistachio, dry roasted, w/o salt | 572/21.1/45.8/28.3 | E | |
| 152 | Семечки подсолнечника | արևածաղկի սերմ (arevatsaghki serm) | 12036 | Seeds, sunflower seed kernels, dried | 584/20.8/51.5/20.0 | E | |
| 153 | Масло подсолнечное | արևածաղկի ձեթ (arevatsaghki dzet) | 04506 | Oil, sunflower, linoleic (approx. 65%) | 884/0/100/0 | E | |
| 154 | Масло оливковое | ձիթապտղի ձեթ (dzitaptghi dzet) | 04053 | Oil, olive, salad or cooking | 884/0/100/0 | E | |
| 155 | Майонез | մայոնեզ (mayonez) | 04025 | Salad dressing, mayonnaise, regular | 680/1.0/74.9/0.6 | A | Russian 67% mayo is lower; label |
| 156 | Сахар | շաքար (shakar) | 19335 | Sugars, granulated | 387/0/0/100 | E | |
| 157 | Мёд | մեղր (meghr) | 19296 | Honey | 304/0.3/0/82.4 | E | |
| 158 | Варенье | մուրաբա (muraba) | 19297 | Jams and preserves | 278/0.4/0.1/68.9 | A | homemade varies |
| 159 | Халва | հալվա (halva) | 19117 | Candies, halavah, plain | 469/12.5/21.5/60.5 | A | USDA is sesame; sunflower halva differs |
| 160 | Шоколад горький | դառը շոկոլադ (darë shokolad) | 19904 | Chocolate, dark, 70–85% cacao solids | 598/7.8/42.6/45.9 | E | |
| 161 | Шоколад молочный | կաթնային շոկոլադ | 19120 | Candies, milk chocolate | 535/7.7/29.7/59.4 | E | |
| 162 | Мороженое пломбир | պաղպաղակ (paghpaghak) | 19089 | Ice creams, vanilla, rich | 249/3.5/16.2/22.3 | A | |
| 163 | Кофе чёрный | սուրճ (surch) | 14209 | Beverages, coffee, brewed, tap water | 1/0.1/0/0 | E | |
| 164 | Чай без сахара | թեյ (tey) | 14355 | Beverages, tea, black, brewed | 1/0/0/0.3 | E | |
| 165 | Сок гранатовый | նռան հյութ (nran hyut) | 09442 | Pomegranate juice, bottled | 54/0.2/0.3/13.1 | E | |
| 166 | Пиво | գարեջուր (garejur) | 14003 | Alcoholic beverage, beer, regular, all | 43/0.5/0/3.6 | E | |
| 167 | Вино красное сухое | կարմիր գինի (karmir gini) | 14096 | Alcoholic beverage, wine, table, red | 85/0.1/0/2.6 | E | white: 14106 |
| 168 | Водка / коньяк 40% | օղի, կոնյակ (oghi, konyak) | 14037 | Distilled, all…, 80 proof | 231/0/0/0 | E | |
| 169 | Долма (толма) | տոլմա (tolma) | — | ground meat + rice + grape leaves (rows 64/30/123) | — | D | own recipe |
| 170 | Ариса | հարիսա (harisa) | — | chicken + wheat | — | D | own recipe |
| 171 | Хаш | խաշ (khash) | — | — | — | N | |
| 172 | Ламаджо / жингялов хац / гата | լահմաջո / ժենգյալով հաց / գաթա | — | — | — | N/D | own recipes |
| 173 | Пахлава | փախլավա (pakhlava) | — | FNDDS "Baklava"? | — | T | TODO verify |
| 174 | Борщ / пельмени / плов | բորշչ / պելմենի / փլավ | — | FNDDS candidates | — | T | otherwise own recipe |

## Appendix B — Commands to run once the hosts are allowed

```sh
UA='Journal-PWA-research/1.0 (contact: none)'
F='code,product_name,product_name_ru,product_name_hy,countries_tags,nutriments,completeness'
q(){ curl -sS -A "$UA" "$1" | jq -c '{count,n:(.products|length),kcal:([.products[]|select(.nutriments["energy-kcal_100g"]!=null)]|length),ru:([.products[]|select((.product_name_ru//"")!="")]|length),first:[.products[:3][]|.product_name]}'; sleep 7; }
for t in гречка мацун лаваш творог кефир сулугуни; do e=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$t")
  for v in "cc=world&amp;lc=ru" "cc=am&amp;lc=ru" "cc=ru&amp;lc=ru" "cc=am&amp;lc=hy"; do echo "$t $v"
    q "https://world.openfoodfacts.org/cgi/search.pl?search_terms=$e&amp;search_simple=1&amp;action=process&amp;json=1&amp;page_size=50&amp;$v&amp;fields=$F"; done; done
for c in armenia russia; do for x in "" "&amp;energy-kcal_100g%3E0"; do
  curl -sS -A "$UA" "https://world.openfoodfacts.org/api/v2/search?countries_tags=en:$c$x&amp;fields=code&amp;page_size=1" | jq .count; sleep 7; done; done
curl -sS -A "$UA" --get https://search.openfoodfacts.org/search \
  --data-urlencode 'q=(мацун OR мацони OR մածուն OR matsun OR matsoni) AND countries:("en:armenia" OR "en:russia")' \
  --data-urlencode 'langs=ru,hy,en' --data-urlencode page_size=30 --data-urlencode "fields=$F" | jq '{count, first:[.hits[:5][]|.product_name]}'
```

**Sources** (from web search; the official pages themselves were blocked): [FDC API Guide](https://fdc.nal.usda.gov/api-guide), [FDC Download Datasets](https://fdc.nal.usda.gov/download-datasets), [INFOODS Europe](https://www.fao.org/infoods/infoods/tables-and-databases/europe/en/), [CoFID](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid), [Quadram CoFID FAQ](https://fnnbri.quadram.ac.uk/?p=34), [Ciqual on data.gouv.fr](https://www.data.gouv.fr/datasets/table-de-composition-nutritionnelle-des-aliments-ciqual/), [Swiss FCDB on opendata.swiss](https://ckan.opendata.swiss/dataset/naehrwerte_lebensmittel), [CNF API dataset](https://open.canada.ca/data/en/dataset/90a31d6a-9131-4f31-a156-cd1f3b2717fe), [CNF copyright guidelines](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/nutrient-data/copyright-guidelines-canadian-nutrient-file.html), [DTU Food Data](https://www.food.dtu.dk/english/About-us/Facilities-and-infrastructure/Food-Data-database-on-nutrients-in-food), [FAO entry for Frida](https://www.fao.org/food-composition/tables-and-databases/detail/(denmark--2024)-danish-food-composition-table/en), [OFF API cheatsheet](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/ref-cheatsheet/), [OFF Armenian product](https://world.openfoodfacts.org/product/4850026000449/royal-armenia-3-in-1-classic-instant-coffee-drink).

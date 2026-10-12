# Cost Manager Pro — Product Requirements

**Status:** Approved product direction (M0). Each requirement's scope and
acceptance criteria will be refined in the milestone that implements it
([`ROADMAP.md`](ROADMAP.md)).

> **Legacy IDs:** comments in `src/` and `tests/` that mention
> `docs/REQUIREMENTS.md` with IDs such as `R-052`, `X-004`, or `OQ-002`
> point to the **archived course register**:
> [`archive/course/REQUIREMENTS.md`](archive/course/REQUIREMENTS.md).
> Those IDs are not the product requirements below.

## How to read this document

Each requirement has an ID (`AREA-n`) and one of three statuses:

| Status | Meaning |
|---|---|
| **Exists** | Implemented and checked against the code (baseline `bd28ad0`, plus later milestones as noted). It may still have known limitations, listed next to it. |
| **Approved** | Approved for a future milestone. **Not implemented yet.** |
| **Optional** | An idea that has not been approved or scheduled. |

Nothing marked **Approved** or **Optional** exists in the app today.

## 1. Expense management (EXP)

| ID | Requirement | Status | Notes / milestone |
|---|---|---|---|
| EXP-1 | Add an expense with amount, currency, category, and description | **Exists** | `src/pages/AddCostPage.jsx` |
| EXP-2 | Each expense keeps its original amount and currency; conversion never overwrites them | **Exists** | `src/lib/db.js` |
| EXP-3 | Each expense is stamped with the date and time it was added | **Exists** | Date is always "now" on add |
| EXP-4 | Choose the expense date when adding (default: today) | Approved | M4 |
| EXP-5 | Edit any field of an existing expense, including date and time | **Exists** | `src/pages/ManageCostsPage.jsx` |
| EXP-6 | Delete an expense after confirmation | **Exists** | No undo |
| EXP-7 | Free-text categories with common suggestions; "food", "Food", and "FOOD" group together | **Exists** | `src/utils/category.js` |
| EXP-8 | Manage the category list (rename, merge, set icon or color) | Approved | M4 |
| EXP-9 | Product validation: amount > 0, sensible decimals, length limits, valid dates | **Exists (M2A.3)** | For new and changed input only: amount greater than zero, the currency's decimals, 12 integer and 15 significant digits, category 50 and description 200 characters, real calendar dates (years 1900-2999). Stored data is never rejected on read; unchanged fields of an old record keep their stored values (ADR-048) |
| EXP-10 | Undo after delete | Optional | |
| EXP-11 | Recurring expenses | Optional | |

## 2. Transactions list (TXN)

| ID | Requirement | Status | Notes / milestone |
|---|---|---|---|
| TXN-1 | List all saved expenses | **Exists** | Oldest first; one table |
| TXN-2 | Search, filter (by date range, category, currency), and sort | Approved | M4. Report tables can already be sorted |
| TXN-3 | Paging or virtual scrolling for large lists | Approved | M4 |
| TXN-4 | Mobile-first layout for the list (for example, cards instead of a wide table) | Approved | M4. Today the table needs sideways scrolling on phones |

## 3. Overview dashboard (DASH)

| ID | Requirement | Status | Notes / milestone |
|---|---|---|---|
| DASH-1 | Landing page with links to each section | **Exists** | Shows no data today |
| DASH-2 | This month's total spending, compared with last month | Approved | M5 |
| DASH-3 | Top categories and recent expenses | Approved | M5 |
| DASH-4 | Quick action to add an expense | Approved | M5 |

## 4. Budgets (BUD)

| ID | Requirement | Status | Notes / milestone |
|---|---|---|---|
| BUD-1 | Monthly total budget | Approved | M6 |
| BUD-2 | Per-category monthly budgets | Approved | M6 |
| BUD-3 | Progress against each budget and a warning when over | Approved | M6 |

## 5. Insights and reports (INS)

| ID | Requirement | Status | Notes / milestone |
|---|---|---|---|
| INS-1 | Monthly report: expenses for a chosen month and year, with a total in a chosen currency | **Exists** | Needs a manual "Generate" click |
| INS-2 | Yearly report: all expenses for a year, with a converted total | **Exists** | |
| INS-3 | Sort report rows by date, time, description, category, amount, or currency | **Exists** | |
| INS-4 | Monthly pie chart of totals by category, in a chosen currency | **Exists** | Only 6 colors, so they repeat after 6 categories |
| INS-5 | Yearly bar chart showing all 12 months, with zero for empty months | **Exists** | Axis and value labels show too many decimals |
| INS-6 | Export reports and chart data to Excel (`.xlsx`) and PDF | **Exists** | PDF output of non-Latin text (such as Hebrew) is not verified |
| INS-7 | Reports and charts update as soon as filters change, with no "Generate" step | Approved | M6 |
| INS-8 | Spending insights, such as unusual spend or trends against the average | Approved | M6 |

## 6. Currency handling (CUR)

| ID | Requirement | Status | Notes / milestone |
|---|---|---|---|
| CUR-1 | Supported currencies: USD, ILS, GBP, and EUR (ISO 4217) | **Exists (M2A.3)** | `EURO` was migrated to `EUR` (schema 1 → 2, ADR-048). Old data, old backups, and old rate sources that say `EURO` are still read and upgraded in memory |
| CUR-2 | Convert totals into a chosen currency through one shared function | **Exists** | `src/utils/currency.js` |
| CUR-3 | Exchange rates are fetched and validated before use; the last valid rates are cached | **Exists** | Fixed sample values (`public/exchange-rates.json`), **not real market rates**. Disclosed on screen and in exports (CUR-8) |
| CUR-4 | Choose a custom exchange-rate URL in Settings, tested before it is saved | **Exists** | |
| CUR-5 | Real exchange rates with an "as of" date and a stale-rates warning | In progress (M2B.1 infrastructure done, **not active**) | M2B. Provider: the European Central Bank's reference rates through Frankfurter v2. The client, parser, historical cache, and date selection exist and are tested but **dormant**; the app still converts with demonstration rates (CUR-8) until M2B.2. The source is free and needs no secret key. ECB source attribution and a reference-rate disclaimer are required when it becomes active (ADR-049) |
| CUR-6 | Money shown with correct currency formatting and a defined rounding policy | Implemented (M2A.2) | `big.js` decimal arithmetic, Policy B (exact until one rounding at display/export), half away from zero, `Intl.NumberFormat` formatting; see ADR-047. Computed totals show the currency's minor-unit digits; stored per-cost amounts are shown as stored. The `EURO` → `EUR` migration and input validation are done (M2A.3); the rates are still the demo values (real rates are M2B) |
| CUR-7 | More currencies and a user-chosen base currency | Optional | |
| CUR-8 | Converted outputs say what kind of rates they use: demonstration data (the bundled default) or an unverified custom source. Nothing is ever labeled verified | **Exists (pre-M2 hotfix)** | Shown on the monthly and yearly reports and charts, only when an amount was converted; explained in Settings; included in Excel and PDF exports. The label follows the source configured now, because the rates cache records no source. Calculations are unchanged |

## 7. Data, backup, and restore (DATA)

| ID | Requirement | Status | Notes / milestone |
|---|---|---|---|
| DATA-1 | Data persists across reloads on the same device and browser | **Exists** | `localStorage`, per browser origin. See [`DATA_STORAGE.md`](DATA_STORAGE.md) |
| DATA-2 | Damaged stored data is never silently overwritten or lost | **Exists (M1)** | Unreadable, invalid, or newer-format data pauses saving, is kept unchanged, and can be downloaded. A banner explains the problem (ADR-042) |
| DATA-3 | Stored data has a schema version and tested migrations | **Exists (M1, M2A.3)** | `schemaVersion` 2 (schema 1 → 2 renamed `EURO` to `EUR`); the pre-M1 layout and schema 1 migrate on the next save, with a safety copy (ADR-042, ADR-048) |
| DATA-4 | Back up all data to a file and restore it from that file | **Exists (M1)** | Settings → Your data. Restore is validated, confirmed, and all-or-nothing, and can be undone with previous data (ADR-043) |
| DATA-5 | Storage stays separate from the original course app hosted on the same domain | **Exists (M1)** | `cost-manager-pro:` keys only; earlier data is imported only on request, as a copy |
| DATA-6 | Optional encrypted sync between devices | Optional | Needs a backend; not in the initial scope |

## 8. Privacy (PRIV)

| ID | Requirement | Status | Notes / milestone |
|---|---|---|---|
| PRIV-1 | No accounts, no backend, and no analytics; data stays on the device | **Exists** | The only network request fetches exchange rates |
| PRIV-2 | No financial data in URLs, logs, or third-party requests | Approved | Applies to every milestone |
| PRIV-3 | A short privacy statement in the app and the README | Approved | M8 |

## 9. Accessibility (A11Y)

| ID | Requirement | Status | Notes / milestone |
|---|---|---|---|
| A11Y-1 | Target WCAG 2.2 level AA | Approved | Foundations in M3, testing in M7 |
| A11Y-2 | Every flow works with keyboard only, with visible focus | Approved | Partly exists today (MUI defaults); not tested |
| A11Y-3 | Charts have a text alternative | **Exists** | Each chart has a matching data table |
| A11Y-4 | Respects the reduced-motion preference | **Exists** | `src/index.css` |
| A11Y-5 | Automated accessibility checks (such as axe) and manual screen-reader checks | Approved | M7 |

## 10. Platforms (PLAT)

| ID | Requirement | Status | Notes / milestone |
|---|---|---|---|
| PLAT-1 | Desktop and mobile have equal priority; every flow is fully usable at 360 px wide and up | Approved | M3/M4. Today navigation and the expense list do not work well on phones |
| PLAT-2 | Supported browsers: current Chrome, Edge, Firefox, and Safari, including iOS Safari and Android Chrome | Approved | M7. Only Chrome was checked in the course era |
| PLAT-3 | Shareable URLs for each section; refresh keeps you on the current page | Approved | M3. Today a refresh always returns to the Dashboard |
| PLAT-4 | Public live demo | **Exists** | Deployed on Vercel at https://cost-manager-pro.vercel.app (ADR-044). The product owner completed seven basic production checks. **Not yet verified in production:** restoring a backup, undoing a restore, and deliberate failure scenarios. See [`DEPLOYMENT.md`](DEPLOYMENT.md) §5 |

## 11. Localization and RTL (I18N)

| ID | Requirement | Status | Notes / milestone |
|---|---|---|---|
| I18N-1 | English (`en`) and Hebrew (`he`) in v1 | Approved | M3. Today the UI is English only |
| I18N-2 | Full right-to-left layout for Hebrew | Approved | M3 |
| I18N-3 | Dates, numbers, and money formatted for each language | Approved | M2/M3 |
| I18N-4 | Correct display of mixed-direction text, such as Hebrew with numbers, currency codes, or English | Approved | M3 |
| I18N-5 | Language switch that is easy to find, accessible, and remembered | Approved | M3 |

The full contract is in [`LOCALIZATION.md`](LOCALIZATION.md).

## 12. Appearance (UX)

| ID | Requirement | Status | Notes / milestone |
|---|---|---|---|
| UX-1 | A consistent design system: color, type, spacing, and component tokens | Approved | M3 |
| UX-2 | Light and dark themes | Approved | M3. Light only today |
| UX-3 | Clear empty, loading, success, and error states on every screen | Approved | Partly exists today |

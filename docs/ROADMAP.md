# Cost Manager Pro — Roadmap

**Status:** Proposed plan, approved as a direction. Each milestone's exact
scope and acceptance criteria are confirmed with the product owner before
work starts. **Approving one milestone never approves the next one**
(see [`AGENTS.md`](../AGENTS.md)).

| Milestone | Title | Status |
|---|---|---|
| M0 | Project Independence & Governance | **Done** (PR #1, merged 2026-10-08) |
| M1 | Reliability, Storage & Deployment | **Done** (PR #2, merged 2026-10-09; deployed to Vercel) |
| Pre-M2 hotfix | Disclose demonstration exchange rates | **Done** (PR #3, merged) |
| M2A | Financial Accuracy: money foundation | **Done**: M2A.2 (PR #4) and M2A.3 (PR #5) merged; M2A.3 passed seven production smoke checks |
| M2B | Financial Accuracy: currency engine and live rates | **In progress**: M2B.1 merged (PR #6) and production-tested; M2B.2 (dated ECB conversion) in a draft PR; M2B.3 not started |
| M3 | Design System & App Shell | Not started |
| M4 | Expense Management Experience | Not started |
| M5 | Personal Overview Dashboard | Not started |
| M6 | Budgets & Spending Insights | Not started |
| M7 | Quality, Performance & Accessibility | Not started |
| M8 | Portfolio Launch | Not started |

Requirement IDs (`EXP-*`, `DATA-*`, and so on) are defined in
[`REQUIREMENTS.md`](REQUIREMENTS.md).

---

## M0 — Project Independence & Governance

- **Goal:** Make Cost Manager Pro an independent product with clear
  governance, while keeping the course history.
- **Scope:** documentation only:
  - project identity
  - instructions for AI coding agents
  - product vision, requirements, and roadmap
  - localization contract
  - engineering workflow
  - attribution
  - archiving the course documents
- **Out of scope:** any change to application code, configuration,
  dependencies, CI/CD, or data.
- **Dependencies:** none.
- **Acceptance:**
  - every course rule is classified
  - agent instructions are consistent with each other
  - docs separate what exists from what is planned
  - both original contributors are credited
  - lint, tests, and build give the same results as before
  - a draft PR was opened for review

## M1 — Reliability, Storage & Deployment

- **Goal:** User data can't be lost silently, and there is a working public
  demo.
- **Expected scope:**
  - never overwrite stored data that can't be read; keep a backup copy
    instead (DATA-2)
  - validate each stored record
  - schema version and migrations (DATA-3)
  - back up to a file and restore from it (DATA-4)
  - storage keys separate from the original app on the same domain (DATA-5)
  - clear errors when storage is full
  - CI runs on pushes to `main`, and deploys only after tests pass
  - fix the hard-coded old repository path in the build so this repository
    deploys (PLAT-4)
  - choose a hosting provider
- **Dependencies:** M0; product-owner decision on hosting.
- **Acceptance:**
  - tests cover damaged JSON, bad records, full storage, and migrations
  - backup and restore work in both directions
  - the live demo URL loads and passes a smoke test
  - a failing test blocks deployment
- **Refined scope (approved for M1, 2026-10-09):**
  - Hosting is Vercel. M1 only prepares the configuration; connecting
    Vercel and deploying need separate approval, so the live-demo criterion
    is met after that step, not by M1 alone.
  - Storage stays `localStorage` (ADR-042).
  - Backup and restore replace the whole dataset; there is no merge
    (ADR-043).
  - See [`DATA_STORAGE.md`](DATA_STORAGE.md) and
    [`DEPLOYMENT.md`](DEPLOYMENT.md).
- **Outcome:**
  - PR #2 is merged, and the first Vercel deployment has happened
    (https://cost-manager-pro.vercel.app).
  - The product owner completed seven basic production checks: loading the
    app, adding an expense, persistence after a refresh, editing and
    deleting expenses, reports and charts, downloading a backup, and
    viewing the app on mobile.
  - **Not yet verified in production:** restoring a backup, undoing a
    restore, and deliberate failure scenarios (damaged data, full storage).
    These are covered by automated tests, not by a production check.

## Pre-M2 hotfix — Disclose demonstration exchange rates

- **Why:** the M2 audit found that production converts at the fixed sample
  rates from the original course project (about 10% to 22% away from market
  rates). Nothing told users.
- **Scope (disclosure only):** a visible, accessible note beside converted
  totals on reports and charts, an explanation in Settings, and a statement
  inside Excel and PDF exports. The bundled default is always labeled
  demonstration data; a custom source is labeled "not verified", never
  verified.
- **Not in scope:** real rates, any provider integration, decimal
  arithmetic, rounding, `EURO` → `EUR`, migrations, or changes to
  calculations, storage, backups, or rate refresh and caching.
- **Status:** the hotfix is merged (PR #3).

## M2 — Financial Accuracy & Currency Engine (to be delivered as M2A and M2B)

- **Approved direction (product owner, recorded 2026-10-11; nothing here is
  implemented):**
  - `big.js` is selected for decimal arithmetic.
  - Frankfurter, pinned to the European Central Bank's reference rates, is
    the planned rates provider.
  - M2 is split into **M2A** and **M2B**. The split point is not final. The
    M2 audit proposed M2A as the money foundation (decimal arithmetic,
    rounding, formatting, validation, and the `EURO` → `EUR` migration) and
    M2B as the conversion engine and live rates. Scope is confirmed before
    each starts.
  - Rounding approaches must be compared with tests before the policy is
    approved (ADR-046).

- **M2A.2 — done, merged (PR #4, ADR-047):** `big.js` decimal arithmetic behind
  `src/lib/money/`, Policy B, half away from zero, one canonical calculation
  for reports, charts, and exports, `Intl` formatting, and tests against an
  independent BigInt oracle. Stored data and storage code are unchanged.
- **M2A.3 — done, merged (PR #5, ADR-048):** ISO `EUR` through schema
  migration `1 → 2` (old data, old backups, and old rate sources that say
  `EURO` are still read), backup format version 2, and strict validation of
  new input with stable error codes. Stored history is never rejected or
  rewritten. Passed seven production smoke checks. **M2A is complete.**
- **M2B — in progress (ADR-049, ADR-050).**
  - **M2B.1 — ECB provider and historical cache infrastructure (done, merged as
    PR #6; six production smoke checks passed):** client, parser, versioned
    cache, coverage tracking, and date selection under `src/lib/fx/`.
  - **M2B.2 — historical conversion integration (in progress, draft PR, not
    merged):** reports, charts and exports convert each expense with the ECB
    rate for its own date through one pathway; totals are never partial;
    the demo-rate disclosure is replaced by ECB provenance for converted output;
    the legacy custom source is kept but inactive. Deferred to M2B.3: offline
    and stale-rate UX, refresh controls, pending-revision review UI.
  - **M2B.3 — user-facing states and reliability:** not started.

- **Goal:** Every amount the app shows is correct and clearly formatted.
- **Expected scope:**
  - one money-formatting function based on `Intl` (CUR-6)
  - a written rounding policy, with tests
  - product validation rules (EXP-9)
  - rules for time zones and which calendar day an expense belongs to
  - a real, free exchange-rate source with an "as of" date and a stale-rates
    warning (CUR-5)
  - migration from `EURO` to ISO `EUR` (done in M2A.3)
  - review whether `getReport()` must still be synchronous
- **Dependencies:** M1 (migrations); product-owner decision on the rates
  source.
- **Acceptance:**
  - no amount shows more than its currency's minor-unit decimals
  - conversions match the source rates for the date shown
  - existing data migrates safely

## M3 — Design System & App Shell

- **Goal:** A polished app shell that works in both languages and on every
  screen size.
- **Expected scope:**
  - design tokens and a font that is actually loaded
  - light and dark themes (UX-1, UX-2)
  - responsive navigation that works equally well on mobile and desktop
    (PLAT-1)
  - URL routing (PLAT-3), with its own ADR
  - accessibility foundations (A11Y-1)
  - English and Hebrew with full RTL (I18N-1 to I18N-5), with an ADR for the
    i18n library
- **Dependencies:** M2 (locale-aware formatting).
- **Acceptance:**
  - the app shell works at 360 px and on desktop, in `en` and `he`, in light
    and dark themes
  - both languages have complete string catalogs, with tests
  - browser checks in both directions

## M4 — Expense Management Experience

- **Goal:** Adding and finding expenses is fast and pleasant on any device.
- **Expected scope:**
  - choose the date when adding (EXP-4)
  - category management (EXP-8)
  - search, filter, sort, and paging (TXN-2, TXN-3)
  - mobile list layout (TXN-4)
  - faster editing and deleting
- **Dependencies:** M3.
- **Acceptance:**
  - all expense flows are fully usable at 360 px in both languages
  - stays responsive with at least 1,000 expenses

## M5 — Personal Overview Dashboard

- **Goal:** The first screen shows where the user stands.
- **Expected scope:**
  - this month compared with last month
  - top categories
  - recent expenses
  - quick add
  - (DASH-2 to DASH-4)
- **Dependencies:** M2, M3, M4.
- **Acceptance:** every dashboard figure has a unit test and matches the
  reports.

## M6 — Budgets & Spending Insights

- **Goal:** Help users stay within their plans.
- **Expected scope:**
  - monthly and category budgets (BUD-1 to BUD-3)
  - insights (INS-8)
  - reports and charts that update as filters change (INS-7)
- **Dependencies:** M5.
- **Acceptance:**
  - budget progress is correct across currencies
  - no "Generate" step is left

## M7 — Quality, Performance & Accessibility

- **Goal:** Proven quality, not assumed quality.
- **Expected scope:**
  - end-to-end tests of the main journeys in both languages
  - automated accessibility checks and screen-reader checks (A11Y-5)
  - browser matrix (PLAT-2)
  - code splitting and bundle size budgets
  - verification of exported files, including Hebrew PDF
- **Dependencies:** M3–M6.
- **Acceptance:**
  - end-to-end and accessibility checks run in CI
  - the bundle stays within its agreed size budget
  - every browser in the matrix is checked

## M8 — Portfolio Launch

- **Goal:** Present the product professionally.
- **Expected scope:**
  - final README with screenshots
  - demo data
  - privacy statement (PRIV-3)
  - release notes and a final verification
  - portfolio and LinkedIn material
- **Dependencies:** M1–M7.
- **Acceptance:**
  - a first-time visitor understands the product and can try it in under a
    minute
  - every claim in the README has been checked

---

## Deferred items found during M0

M0 was not allowed to change these. Each is assigned to a milestone, and the status is updated as items are done:

| Item | Target |
|---|---|
| Build path is hard-coded to `/cost-manager-front-end/` (`vite.config.js`), and GitHub Pages is not enabled for this repository, so the Deploy workflow fails on push to `main` | **Done in M1** (root base path; Pages workflow removed) |
| The Deploy workflow does not run lint or tests; CI runs only on pull requests | **Done in M1** (CI runs on pushes to `main`; Vercel's build command runs lint and tests). Branch protection is still a repository setting |
| Storage keys would clash with the original app if both are hosted under `shlomi-hazan.github.io` | **Done in M1** (`cost-manager-pro:` namespace) |
| Decide what happens to `vanilla/db.js`, `vanilla/db-test.html`, and their tests (keep frozen, or archive) | M1 or M7 |
| Rename the package in `package.json` (`cost-manager-front-end`) and the PDF export title ("Cost Manager") to the new product identity | M1 or M3 |
| Update source and test comments that mention course IDs (`R-*`, `X-*`, `OQ-*`) and old document paths, and remove comments added only to meet the course comment-count rule | Whenever each file is next changed |
| Add a GitHub repository description, homepage, and topics | M8, or when the live demo exists |
| Low-severity `dompurify` advisory (pulled in by jsPDF) and routine dependency updates | Deferred again: M1 does not change dependencies. Do it in a separate dependency-maintenance task |

## Deferred items found during M1

| Item | Target |
|---|---|
| ~~Connect Vercel and run the first deployment~~ | **Done.** Seven basic production checks completed by the product owner |
| Production restore, undo-restore, and deliberate failure checks ([`DEPLOYMENT.md`](DEPLOYMENT.md) §5) | Not yet verified in production |
| Branch protection on `main` requiring CI; optionally require GitHub checks in Vercel before production | Repository/provider settings (product owner) |
| Keep more than one previous-data copy; show storage usage before large restores | M7, or when needed |
| Merge-style restore, and automatic or scheduled backup reminders | Not scheduled |
| Translate and localize the storage, backup, and recovery messages | M3 (with i18n) |
| Main bundle grew from 963 kB to 983 kB (minified) with the M1 code; code splitting | M7 |

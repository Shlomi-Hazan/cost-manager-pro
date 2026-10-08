# Cost Manager Pro — Architecture Decisions

> **Purpose:** Record important decisions so that contributors and AI coding agents do not reopen settled choices without a real reason.
>
> **History:** ADR-001 to ADR-036 were written for the original university project, *Cost Manager Front-End*. They are kept unchanged as history. In M0 (2026-10-08), some were marked `SUPERSEDED`, and others got an **M0 review** note where their course-based reason no longer applies. ADR-037 onward are Cost Manager Pro decisions.
>
> Product requirements are in [`REQUIREMENTS.md`](REQUIREMENTS.md). The course requirements cited by older ADRs (`R-*`, `OQ-*`) are in [`archive/course/REQUIREMENTS.md`](archive/course/REQUIREMENTS.md).

---

# 1. Decision Record Format

Each architecture decision uses this structure:

```text
ID
Status
Date
Decision
Context
Alternatives
Reason
Consequences
Revisit when
```

Statuses:

```text
ACCEPTED
PROVISIONAL
SUPERSEDED
REJECTED
```

A decision marked `PROVISIONAL` is intentionally not fully locked because an official clarification or implementation experiment is still required.

An **M0 review** note on an `ACCEPTED` or `PROVISIONAL` decision means: it still describes the current implementation, but its course-based reason was retired by ADR-037. It stays in force until a later decision changes it in the named milestone.

---

# ADR-001 — Use React

**Status:** ACCEPTED  
**Date:** 2026-08-22

## Decision

Use **React** for the main application UI.

## Context

The official project specification permits both:

- React/MUI,
- Vanilla JavaScript.

The application contains multiple interactive views:

- Add Cost,
- Monthly Report,
- Charts,
- Settings.

## Alternatives

1. Vanilla JavaScript UI.
2. React.
3. Larger application framework.

## Reason

React gives us:

- reusable components,
- state-driven UI,
- clean feature separation,
- easy MUI integration,
- good compatibility with AI-assisted development.

It is permitted by the official specification.

## Consequences

- Main application files use `.jsx` where appropriate.
- Core business logic must remain usable outside React.
- Standalone Vanilla `db.js` remains independent from React.

## Revisit when

Only if React itself creates a direct grading/compatibility problem.

---

# ADR-002 — Use Vite

**Status:** ACCEPTED  
**Date:** 2026-08-22

## Decision

Use **Vite** as the development and production build tool.

## Context

A small React application needs:

- development server,
- module support,
- production build.

## Alternatives

1. Manual HTML/JS setup.
2. Create React App.
3. Vite.
4. Full-stack React framework.

## Reason

Vite is lightweight and appropriate for a client-side course project.

It avoids unnecessary framework complexity.

## Consequences

- Development uses Vite scripts.
- Production is a static build.
- The Vanilla grading file must not depend on Vite at runtime.

---

# ADR-003 — Use JavaScript, Not TypeScript

**Status:** ACCEPTED  
**Date:** 2026-08-22

> **M0 review (2026-10-08):** The course reason is retired. TypeScript is still not planned; adopting it requires a new ADR (ADR-037).

## Decision

Use **JavaScript / JSX** rather than TypeScript.

## Context

The official specification is explicitly centered on JavaScript, HTML, and CSS.

The Vanilla `db.js` must also be plain JavaScript.

## Alternatives

1. JavaScript.
2. TypeScript.

## Reason

JavaScript:

- aligns directly with the course terminology,
- reduces tooling complexity,
- simplifies Vanilla compatibility,
- avoids introducing an unnecessary language layer.

## Consequences

- No `.ts` or `.tsx` files by default.
- Validation and tests must compensate for the absence of static typing where useful.

## Revisit when

Only with explicit project-owner approval and a strong course-compatible reason.

---

# ADR-004 — Use MUI for UI Components

**Status:** ACCEPTED  
**Date:** 2026-08-22

## Decision

Use **MUI** as the main UI component library.

## Context

The official specification explicitly permits MUI with React.

The application needs standard desktop UI components:

- forms,
- navigation,
- cards,
- buttons,
- tables,
- alerts.

## Alternatives

1. Custom CSS only.
2. Bootstrap.
3. MUI.
4. Another component library.

## Reason

MUI is allowed by the course document and reduces time spent rebuilding standard controls.

## Consequences

- UI should remain visually consistent.
- Core logic must not depend on MUI.
- Avoid mixing multiple component libraries without need.

---

# ADR-005 — Use Recharts as the Single Chart Library

**Status:** ACCEPTED  
**Date:** 2026-08-22

## Decision

Use **Recharts** for both the Pie Chart and Bar Chart.

## Context

The project requires:

- monthly category Pie Chart,
- yearly Bar Chart.

## Alternatives

1. Chart.js.
2. Recharts.
3. Multiple chart libraries.

## Reason

Recharts integrates naturally with React and supports both required chart types.

Using one chart library avoids unnecessary dependencies.

## Consequences

- Do not install Chart.js in parallel unless this decision is revisited.
- Data aggregation remains outside Recharts components.

## Revisit when

If Recharts cannot satisfy a mandatory requirement or causes deployment/browser incompatibility.

---

# ADR-006 — Use localStorage as the Required Persistence Layer

**Status:** SUPERSEDED by ADR-041 (M0, 2026-10-08)  
**Date:** 2026-08-22

## Decision

All required persisted application data will use **localStorage**.

## Context

This is an explicit official requirement.

## Alternatives

No alternative persistence mechanism may replace localStorage for the required project behavior.

## Reason

Course requirement.

## Consequences

Do not replace required persistence with:

- IndexedDB,
- Firebase,
- backend database,
- SQL,
- another browser database.

Additional temporary in-memory state is allowed, but localStorage remains the persistent source.

---

# ADR-007 — Maintain Two `db.js` Forms

**Status:** SUPERSEDED by ADR-037 (M0, 2026-10-08)  
**Date:** 2026-08-22

## Decision

Maintain:

```text
src/lib/db.js
vanilla/db.js
```

## Context

The course explicitly requires:

1. module-compatible `db.js`,
2. standalone Vanilla `db.js`.

## Reason

Direct requirement.

## Consequences

Both versions must preserve equivalent required behavior.

The standalone file must:

- work through normal `<script src="db.js"></script>`,
- expose global `db`,
- have no unresolved imports.

Logic drift between versions must be prevented through contract tests.

---

# ADR-008 — Protect the Official `db.js` API

**Status:** SUPERSEDED by ADR-037 (M0, 2026-10-08)  
**Date:** 2026-08-22

## Decision

Treat the following as an externally owned compatibility contract:

```javascript
const ob = db.openCostsDB("costsdb", 1);
ob.addCost(cost);
ob.getReport(currency, year, month);
```

## Context

The official course document provides grading-compatible sample code and explicitly corrected the call from `db.getReport(...)` to `ob.getReport(...)`.

## Consequences

Do not redesign this API merely for internal elegance.

Required method ownership and argument ordering remain stable.

---

# ADR-009 — No Global State Library Initially

**Status:** ACCEPTED  
**Date:** 2026-08-22

## Decision

Do not add Redux, Zustand, MobX, or another global state library.

## Context

The application is small.

Most state belongs naturally to individual views.

## Reason

A global state library would add complexity without a demonstrated requirement.

## Consequences

Use:

- local component/page state,
- small services,
- `db.js`,
- localStorage where persistence is required.

## Revisit when

Only if shared state becomes genuinely difficult to manage with ordinary React patterns.

---

# ADR-010 — No React Router Initially

**Status:** ACCEPTED  
**Date:** 2026-08-22

> **M0 review (2026-10-08):** The course reason is retired. URL routing will be reconsidered in M3 under its own ADR (ADR-037).

## Decision

Do not add React Router during initial implementation.

## Context

The application can function as a small SPA with a navigation control and active view.

The official requirements do not require URL routing.

## Reason

Keep the project simple.

## Consequences

Initial navigation may be controlled by React state.

## Revisit when

If URL-based routes materially improve required behavior or deployment without adding unnecessary risk.

---

# ADR-011 — Keep Business Logic Outside React Components

**Status:** ACCEPTED  
**Date:** 2026-08-22

## Decision

Persistence, conversion, reporting, and chart aggregation logic will live outside visual React components.

## Examples

Belongs outside UI:

```text
currency conversion
localStorage access
report calculations
category aggregation
yearly aggregation
exchange-rate validation
```

## Reason

This improves:

- testability,
- Vanilla compatibility,
- maintainability,
- code review.

## Consequences

Pages should call functions/services rather than reproduce algorithms.

---

# ADR-012 — Centralize Supported Currency Identifiers

**Status:** ACCEPTED  
**Date:** 2026-08-22

> **M0 review (2026-10-08):** Keeping one shared list of currency IDs is still accepted. The non-ISO `EURO` ID and the fixed set of four currencies will be reconsidered in M2, with a data migration (ADR-037).

## Decision

Maintain one canonical supported-currency list:

```javascript
[
  "USD",
  "ILS",
  "GBP",
  "EURO"
]
```

## Reason

The official specification uses these exact identifiers.

## Consequences

- Do not use `EUR`.
- UI, validation, services, and calculations should share the same canonical values.

---

# ADR-013 — Use One Reusable Currency Conversion Utility

**Status:** ACCEPTED  
**Date:** 2026-08-22

## Decision

Currency conversion logic should be implemented in one reusable non-UI module.

Conceptual API:

```javascript
convertCurrency(
  amount,
  sourceCurrency,
  targetCurrency,
  rates
)
```

## Reason

Avoid:

- duplicated formulas,
- inconsistent chart/report behavior,
- hard-to-test conversions.

## Consequences

Reports and charts should consume the same conversion behavior.

---

# ADR-014 — Use GitHub Issues + Branches + Pull Requests

**Status:** ACCEPTED  
**Date:** 2026-08-22

## Decision

Meaningful development work will follow:

```text
Requirement
↓
Issue
↓
Branch
↓
Implementation
↓
Tests
↓
Pull Request
↓
Review
↓
Merge
```

## Reason

The project should be documented from the beginning and preserve teamwork/development evidence.

## Consequences

Avoid direct feature development on `main`.

Keep changes scoped.

---

# ADR-015 — Codex Is the Primary Coding Agent

**Status:** SUPERSEDED by ADR-040 (M0, 2026-10-08)  
**Date:** 2026-08-22

## Decision

Use **Codex** as the primary AI implementation agent.

Use **Claude Code** mainly for:

- code review,
- debugging,
- architecture review,
- second opinion,
- selected implementation tasks.

## Reason

This matches the intended development workflow.

## Consequences

Codex reads `AGENTS.md`.

Claude Code reads `CLAUDE.md`.

Both must use the same official requirements and architecture sources.

Do not have both agents independently modify the same branch at the same time.

---

# ADR-016 — Use Vitest for Automated Unit Tests

**Status:** ACCEPTED  
**Date:** 2026-08-22

## Decision

Use **Vitest** for application-level automated unit tests.

## Context

The project uses Vite.

## Reason

Vitest integrates well with Vite and is sufficient for the project's small test suite.

## Consequences

Critical pure logic should be testable without launching the full browser UI.

The official Vanilla HTML test remains separate and mandatory.

---

# ADR-017 — Use ESLint

**Status:** ACCEPTED  
**Date:** 2026-08-22

## Decision

Use ESLint for automated JavaScript/JSX quality checks.

## Reason

Supports maintainability and helps catch common mistakes before merge.

## Consequences

Pull Requests should eventually require lint to pass.

ESLint configuration should remain practical and not become a project unto itself.

---

# ADR-018 — Default Exchange-Rate Source Is Team-Controlled

**Status:** ACCEPTED  
**Date:** 2026-08-22

> **M0 review (2026-10-08):** The course reason (team-hosted rates) is retired. The current rates are fixed sample values; a real rates source is planned for M2 (ADR-037).

## Decision

Provide a default Internet-accessible static exchange-rate JSON source controlled/deployed by the project team.

## Context

The application must work even if the user never supplies a Settings URL.

## Consequences

The default source must be:

- publicly accessible,
- Fetch-compatible,
- stable during grading,
- shaped according to the required JSON model.

The final hosting location will be decided during the exchange-rate/deployment milestone.

---

# ADR-019 — Persist Custom Exchange-Rate URL

**Status:** ACCEPTED  
**Date:** 2026-08-22

> **M0 review (2026-10-08):** Still in force. The custom URL setting may be redesigned when real rates arrive in M2.

## Decision

Persist the user-configured exchange-rate URL in localStorage.

## Context

The project includes a Settings option for the URL.

## Reason

Settings should survive page refresh and browser reopening on the same origin.

## Consequences

Rate-source selection becomes:

```text
custom URL exists
    ↓ yes
use custom URL

custom URL absent
    ↓
use default URL
```

---

# ADR-020 — Cache Last Valid Exchange Rates

**Status:** PROVISIONAL  
**Date:** 2026-08-22

> **M0 review (2026-10-08):** Still in force. The cache exists because `getReport()` must be synchronous, a course rule now retired; it will be reconsidered in M2 (ADR-037).

## Decision

Plan to cache the latest successfully fetched and validated exchange rates in localStorage.

## Context

The project must retrieve exchange rates through Fetch, while the official sample calls `getReport()` synchronously.

A validated cache may allow:

```text
Fetch asynchronously
↓
store latest valid rates
↓
synchronous report calculation consumes cached rates
```

## Alternatives

1. Make `getReport()` asynchronous.
2. Use cached rates.
3. Separate network preparation from report generation.
4. Another approach after lecturer clarification.

## Reason

Changing the official-looking `getReport()` contract to Promise-based behavior could break grading compatibility.

## Consequences

This decision is not fully locked.

Do not implement irreversible behavior until `OQ-003` is resolved or the approach is validated.

## Revisit when

During the `db.js` + exchange-rate design milestone or after course clarification.

---

# ADR-021 — Proposed Internal Cost Date Stores Day, Month, and Year

**Status:** PROVISIONAL  
**Date:** 2026-08-22

> **M0 review (2026-10-08):** Superseded in practice by ADR-031 (hour/minute added). The rules for time zones and which calendar day an expense falls on will be defined in M2.

## Decision

Proposed internal stored date structure:

```javascript
date: {
  day: 22,
  month: 8,
  year: 2026
}
```

## Context

Monthly/yearly filtering requires month and year.

The official report example only visibly shows:

```javascript
date: { day: 12 }
```

## Reason

The storage layer needs enough information to identify the selected month/year.

## Consequences

Internal storage may contain more date information than the report object exposes.

The exact external report date shape remains unresolved under `OQ-002`.

## Revisit when

Before finalizing `getReport()` output.

---

# ADR-022 — Do Not Define a Fixed Category List Yet

**Status:** ACCEPTED  
**Date:** 2026-08-22

> **M0 review (2026-10-08):** The course reason is retired. Category management is planned for M4.

## Decision

Do not make the core `db.js` API depend on a closed predefined category list.

## Context

The official document requires a category string but does not define an official category set.

## Reason

A closed list could incorrectly reject grader input.

## Consequences

The UI may later provide convenient choices, but core required behavior must remain compatible with category strings unless the lecturer clarifies otherwise.

---

# ADR-023 — Keep Validation Conservative

**Status:** ACCEPTED  
**Date:** 2026-08-22

> **M0 review (2026-10-08):** The course reason (never reject the grader's input) is retired. Product validation rules are planned for M2.

## Decision

Add sensible UI validation, but do not impose undocumented restrictions that could break required API compatibility.

## Context

The specification defines basic types but not detailed validation limits.

## Examples

Potentially safe UI validation:

```text
required fields
numeric sum
supported currency
```

Potentially risky without clarification:

```text
description max 30 characters
only predefined categories
minimum/maximum cost values
```

## Consequences

Detailed validation changes should be documented and tested.

---

# ADR-024 — Use GitHub Actions for CI

**Status:** ACCEPTED  
**Date:** 2026-08-22

## Decision

After project scripts exist, GitHub Pull Requests should run:

```bash
npm ci
npm run lint
npm test
npm run build
```

## Reason

Prevent broken changes from entering `main`.

## Consequences

CI is required by our workflow, though not by the course itself.

Manual Vanilla/Chrome tests still remain necessary.

---

# ADR-025 — Deploy as a Static Front-End

**Status:** ACCEPTED  
**Date:** 2026-08-22

> **M0 review (2026-10-08):** Still in force. The hosting provider will be chosen in M1.

## Decision

Deploy the main application as a static front-end build.

## Context

The project does not require a dynamic application backend.

The only server-side requirement can be satisfied by an Internet-hosted static exchange-rate JSON file.

## Consequences

Hosting should support:

- HTTPS,
- stable public URL,
- static assets,
- Fetch to the exchange-rate source.

Exact platform remains open until deployment milestone.

---

# ADR-026 — Do Not Add Secrets for Core Project Operation

**Status:** ACCEPTED  
**Date:** 2026-08-22

## Decision

Core required functionality should not depend on API keys or secrets.

## Reason

The required exchange-rate source can be a static JSON file.

## Consequences

- no secret needed for required exchange-rate retrieval,
- no API key committed,
- `.env` remains ignored if introduced for optional development purposes.

---

# ADR-027 — Documentation Has Separate Sources of Responsibility

**Status:** SUPERSEDED by ADR-040 (M0, 2026-10-08)  
**Date:** 2026-08-22

## Decision

Avoid duplicating the same long instructions across documentation.

Document responsibilities:

```text
intent.txt
→ purpose and priorities

REQUIREMENTS.md
→ official requirements

ARCHITECTURE.md
→ system structure

DECISIONS.md
→ why major choices were made

AGENTS.md
→ Codex operating rules

CLAUDE.md
→ Claude Code operating rules

TEST_PLAN.md
→ verification strategy

SUBMISSION_CHECKLIST.md
→ final submission process

README.md
→ human-facing project overview
```

## Consequences

Update the appropriate source document instead of copying changes everywhere.

---

# ADR-028 — Requirement Compliance Beats Visual Complexity

**Status:** SUPERSEDED by ADR-037 (M0, 2026-10-08)  
**Date:** 2026-08-22

## Decision

Optional visual/UX features must never put mandatory requirements at risk.

## Reason

The project is graded against explicit requirements.

## Consequences

Development order:

```text
correctness
↓
requirements
↓
testing
↓
deployment
↓
UI polish
↓
optional enhancements
```

---

# ADR-029 — Start a Clean Application Cost Schema With Database Version 2

**Status:** ACCEPTED

**Date:** 2026-08-24

> **M0 review (2026-10-08):** Still in force. Existing version 2 data must stay readable; the migration framework is planned for M1.

## Decision

The React application uses `costsdb` version `2` for the cost database namespace.

Version 2 stores new cost records with stable IDs and time metadata. Existing
version 1 application cost records are left untouched in localStorage but are no
longer read by the current application singleton.

## Reason

The earlier schema did not include IDs or hour/minute metadata. A clean versioned
namespace avoids destructive migration risk and preserves Settings and
exchange-rate cache data.

## Consequences

- Do not call `localStorage.clear()` in application code.
- Do not migrate or rewrite version 1 cost records.
- Tests must prove version 1 app costs are not visible through the version 2 app
  database.

---

# ADR-030 — Generate Stable Cost IDs Inside `db.js`

**Status:** ACCEPTED

**Date:** 2026-08-24

## Decision

New stored costs receive an internal generated non-empty string `id`.

Use `crypto.randomUUID()` when available, with a small dependency-free fallback
for browser compatibility.

## Reason

Editing and deleting costs by visible field values is unsafe because two costs
may have identical sums, categories, descriptions, currencies, and dates.

## Consequences

- `addCost()` input remains the official `{ sum, currency, category, description }`
  shape.
- The generated ID is stable after storage.
- Duplicate-looking costs can be updated/deleted independently.

---

# ADR-031 — Store Hour and Minute for New Cost Records

**Status:** ACCEPTED

**Date:** 2026-08-24

## Decision

New stored costs use:

```javascript
date: {
  day,
  month,
  year,
  hour,
  minute
}
```

The required report item shape remains compatible with the official example and
continues to expose only:

```javascript
date: {
  day
}
```

## Reason

Cost maintenance and future detailed reports benefit from a fuller timestamp,
while `OQ-002` means the external report date shape should remain conservative.

## Consequences

- UI report tables must not invent returned month/year/hour/minute fields.
- `getReport()` continues to filter by stored month/year.
- `OQ-002` remains open.

---

# ADR-032 — Add CRUD Methods to the Existing Database Object

**Status:** ACCEPTED

**Date:** 2026-08-24

> **M0 review (2026-10-08):** The CRUD methods are still in force. Two parts have been retired: keeping the module and Vanilla versions in step, and the grader-compatibility reason. New methods do not need to be copied into `vanilla/db.js` (ADR-037).

## Decision

The object returned by `openCostsDB()` keeps `addCost()` and `getReport()` and
also exposes:

```text
getAllCosts()
getCostById(id)
updateCost(id, cost)
deleteCost(id)
```

The module and Vanilla `db.js` implementations must remain behaviorally aligned.

## Reason

Future Manage Costs UI work needs a stable data foundation, but the protected
official API must remain compatible for automatic graders.

## Consequences

- `getReport()` remains synchronous.
- `updateCost()` validates full editable date/time and preserves ID.
- Missing valid IDs return `null`; invalid ID values throw.

---

# ADR-033 — Group Monthly and Yearly Reports Under Reports Navigation

**Status:** ACCEPTED

**Date:** 2026-08-24

## Decision

The top-level application navigation uses:

```text
Dashboard
Add Cost
Reports
Charts
Settings
```

`Reports` contains Monthly and Yearly tabs. Monthly remains functional. Yearly is
a placeholder until the detailed yearly report milestone.

## Reason

The application now has more than one report-oriented feature, so grouping them
improves navigation without starting future reporting logic prematurely.

## Consequences

- Do not implement the detailed yearly report in this foundation milestone.
- App shell tests should verify the Reports navigation behavior.

---

# ADR-034 — Shared Sorting Behavior for Reports

**Status:** ACCEPTED

**Date:** 2026-08-24

## Decision

Monthly and yearly report sorting is implemented through shared report-table
behavior rather than separate one-off sort algorithms in each page.

The implementation uses:

- a pure report sorting utility,
- a shared report sorting hook for sort state and toggle behavior,
- a shared sortable report table component for the common report columns.

Initial report order remains the detailed report service/storage order. The
first click on a sortable column starts ascending. Repeated clicks on the same
column toggle ascending/descending. Clicking a different column starts that
column ascending.

Date/Day sorting is chronological, Time sorting is chronological,
Description/Category/Currency sorting is alphabetical, and Sum sorting is
numeric. Equal primary values preserve source order through stable sorting.

Sorting is display-only: it sorts copies, never mutates report/source arrays,
and never persists cost order. Sort state resets when the report filter context
changes. Pages keep access to the currently sorted rows so future export work can
export the visible row order without reimplementing sorting.

## Reason

Users should get consistent date, time, category, description, sum, and currency
sorting across Monthly and Yearly reports. Keeping sorted rows available at the
page level also supports the future export milestone.

## Consequences

- Monthly and Yearly reports share the same sorting semantics.
- Sorting remains separate from report membership and total calculation.
- The database and detailed report service do not persist or own presentation
  sorting.
- Export libraries and export behavior remain deferred to Milestone 9.5E.

---

# ADR-035 — Export Architecture

**Status:** ACCEPTED

**Date:** 2026-08-24

## Decision

Excel/PDF export consumes already-prepared report/chart data from application
services or page state instead of re-reading localStorage directly.

Exports do not recalculate reports, charts, totals, currency conversion, or sort
order. Monthly and Yearly report exports receive the current visible sorted rows
from the report pages. Pie and Bar chart exports receive the already-generated
chart data from their chart sections.

Excel exports use `write-excel-file` to create real OOXML `.xlsx` workbooks.
SheetJS `xlsx` was rejected because npm reported unfixed high-severity
advisories. ExcelJS was initially implemented, but newly published ExcelJS
security findings made a narrower browser-focused writer a better fit for this
write-only export use case. PDF exports use `jspdf` and `jspdf-autotable` for
human-readable metadata and multi-page tables.

The export libraries are loaded dynamically from the export services so they do
not become part of the initial application bundle. Chart PDFs serialize the
rendered Recharts SVG from a local component ref, draw it to an offscreen canvas
with a white background, and embed the PNG data in the PDF along with supporting
data rows.

Export filenames are deterministic and include the export type, selected period
or year, target currency, and file extension.

## Reason

Exports should match what users see and should not duplicate report, chart, or
currency-conversion logic.

## Consequences

- Export behavior remains separate from database/report/chart calculation.
- The database, Vanilla `db.js`, and synchronous `getReport()` contract are
  unchanged.
- Export tests must verify real workbook/PDF output and visible sorted row order.
- The selected XLSX writer supports the required browser Blob output,
  multi-sheet workbooks, and numeric spreadsheet cells without adding a
  production spreadsheet parser.

---

# ADR-036 — Detailed Reports Compose Rich Rows Outside `db.js`

**Status:** ACCEPTED

**Date:** 2026-08-24

## Decision

Detailed Monthly and Yearly report screens should use a small reporting service
that composes rich row data from `costsDatabase.getAllCosts()` with converted
totals from the existing synchronous `costsDatabase.getReport()` API.

The protected `db.js` `getReport()` contract remains unchanged: report items
continue to expose the current compatibility date shape while richer application
views may use stored cost IDs and full date/time from `getAllCosts()`.

## Reason

The official report contract is externally sensitive, especially for the
standalone Vanilla `db.js`. Rich application reports need IDs and timestamps, but
adding those fields to `getReport()` would blur the current `OQ-002`
compatibility boundary.

## Consequences

- React pages must not read cost localStorage directly.
- Report total conversion remains owned by `getReport()`.
- Detailed report rows can display stored IDs internally and date/time values
  without changing the official report-facing payload.
- `OQ-001`, `OQ-002`, and `OQ-003` remain formally open.

---

# ADR-037 — Cost Manager Pro Is an Independent Product; Course Mandates Are Retired

**Status:** ACCEPTED  
**Date:** 2026-10-08

## Decision

Cost Manager Pro is an independent continuation of the university project
*Cost Manager Front-End*. Course requirements, grader compatibility, and
submission rules no longer govern development.

Every course-derived constraint has been classified as **Retain**,
**Retire**, or **Reevaluate** in
[`archive/course/README.md`](archive/course/README.md#course-constraint-classification-m0).

## Context

The original project was built to satisfy a graded course specification:
synchronous `ob.getReport()`, a standalone Vanilla `db.js` with a global
`db`, the `EURO` identifier, an English-only UI, Chrome-only testing,
comment-density and JSDoc rules, and Moodle packaging. The product now has
its own vision ([`VISION.md`](VISION.md)).

## Consequences

- ADR-007, ADR-008, and ADR-028 are superseded.
- ADRs whose only reason was the course carry an **M0 review** note naming
  the milestone that will reconsider them.
- **Retiring a rule does not change behavior.** The code that satisfies a
  retired rule stays as it is until a milestone changes it on purpose, with
  tests and, if stored data is affected, a migration.
- `vanilla/db.js` and its tests are kept frozen. New features do not need to
  be copied into it.
- Course documents are archived, unchanged apart from banners, under
  `docs/archive/course/`.
- Git history and credit for both original contributors (Shlomi Hazan,
  Eldad Simanian) are kept.

---

# ADR-038 — English and Hebrew Are Both Required in v1

**Status:** ACCEPTED (requirement; not implemented)  
**Date:** 2026-10-08

## Decision

Version 1 supports English (`en`, LTR) and Hebrew (`he`, RTL) at equal
quality. This includes:

- a full right-to-left layout
- correct mixed-direction display of financial values
- dates, numbers, and money formatted for each language
- an easy-to-find, accessible language switch

The detailed contract is [`LOCALIZATION.md`](LOCALIZATION.md).

## Context

This supersedes the course's English-only UI requirement (archived R-011).

## Alternatives

- English only, adding Hebrew later. Rejected: adding RTL late is much more
  expensive than building for it from the start.

## Consequences

- From M3 on, user-facing strings must come from translation catalogs.
- Layout code must use logical CSS properties.
- Meaningful UI changes must be checked in the browser in both directions.
- **No i18n library has been chosen.** The choice needs its own ADR in M3.
- M0 implements none of this.

---

# ADR-039 — Desktop and Mobile Have Equal Priority

**Status:** ACCEPTED (requirement; partly met)  
**Date:** 2026-10-08

## Decision

Every user flow must be fully usable and polished on mobile (360 px wide
and up, touch input) and on desktop. Neither is secondary.

## Context

The course only required compatibility with desktop browsers (archived
R-101). The M0 audit found that main navigation and the expense list don't
work well on phones.

## Consequences

- Designs and acceptance criteria name both form factors.
- UI changes are checked at mobile and desktop widths before they are
  called done.

---

# ADR-040 — AGENTS.md Is the Single Source of Truth for Coding Agents

**Status:** ACCEPTED  
**Date:** 2026-10-08

## Decision

- [`AGENTS.md`](../AGENTS.md) holds the operating rules for every AI coding
  agent (Codex, Claude Code, and others) and for human contributors.
- `CLAUDE.md` imports `AGENTS.md` and adds only Claude-specific notes.
- No agent is "primary". The product owner assigns work.
- The workflow details are in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

The document responsibilities are:

| Document | Responsibility |
|---|---|
| `AGENTS.md` | Agent and contributor rules (normative) |
| `CONTRIBUTING.md` | Workflow, conventions, Definition of Done |
| `docs/VISION.md` | Why the product exists, its principles and boundaries |
| `docs/REQUIREMENTS.md` | What exists, what is approved, what is optional |
| `docs/LOCALIZATION.md` | English/Hebrew and RTL contract |
| `docs/ROADMAP.md` | Milestones and their status |
| `docs/ARCHITECTURE.md` | Current architecture and direction |
| `docs/DECISIONS.md` | Why major choices were made |
| `README.md` | Human-facing overview |
| `docs/archive/course/` | Historical only; not normative |

## Context

This supersedes ADR-015 (Codex is primary) and ADR-027 (the course-era
document map). The old `AGENTS.md` and `CLAUDE.md` repeated about 600 lines
each of course rules, and some of those rules conflicted (for example, on
JSDoc).

## Consequences

- When a rule changes, it is changed in one place.
- Agent-specific files stay short.

---

# ADR-041 — Local-First Initial Scope

**Status:** ACCEPTED  
**Date:** 2026-10-08

## Decision

Cost Manager Pro starts **local-first**: all data stays in the user's
browser. `localStorage` remains the current storage engine. The initial
scope does not include:

- authentication or accounts
- a backend
- cloud sync
- bank integrations

## Context

This supersedes ADR-006, where `localStorage` was mandatory because of a
course requirement. The product principle "Privacy by Design" now drives
the local-first choice.

## Alternatives

- **IndexedDB:** a possible future engine for larger data sets; would need
  its own ADR (M1 or later).
- **Backend with sync:** out of the initial scope.

## Consequences

- Protecting user data is the app's own job:
  - never overwrite unreadable data
  - versioned migrations
  - backup and restore
  - (all planned for M1)
- Changing the storage engine requires an ADR and a tested migration.
- None of these options is permanently ruled out.

---

# ADR-042 — Namespaced, Versioned, Fail-Safe Expense Storage

**Status:** ACCEPTED  
**Date:** 2026-10-09

## Decision

- All Cost Manager Pro keys use the `cost-manager-pro:` prefix. The
  original course app's `cost-manager:` keys are never written. One of them,
  `cost-manager:costsdb:v2:costs`, is read only to offer an explicit,
  confirmed "Import a copy".
- The expense dataset is stored as `{ schemaVersion, costs }`. The pre-M1
  bare-array layout is schema 0. It is upgraded by a pure in-memory
  migration, written only on the next save, and kept as previous data
  before that first save.
- Every record is validated whenever data is read. A dataset with any
  invalid record, a duplicate id, malformed JSON, or the wrong root type is
  `damaged`. A newer `schemaVersion` is `unsupported`. In both cases reads
  throw a `StorageError`, saving is refused, and the stored value is never
  changed.
- Storage read failures (`unavailable`), a full quota (`quota-exceeded`),
  and other write failures (`write-failed`) are separate error codes with
  their own user-facing messages.
- `localStorage` remains the engine (ADR-041).

## Context

Before M1, `readCosts()` turned missing data, invalid JSON, and a non-array
value all into `[]`, and the next `addCost()` overwrote the stored value.
That silently lost data, and a test asserted that behavior. The keys were
also identical to the original app's, so on a shared origin the two apps
read and wrote each other's data.

## Alternatives

- **Drop invalid records and keep the rest.** Rejected: totals would be
  silently wrong, and the next save would lose the dropped records for
  good.
- **Migrate the old key automatically.** Rejected: on a shared origin that
  data may belong to the original app, so a copy is taken only with the
  user's confirmation.
- **IndexedDB.** Not needed for M1. It would need a migration of its own.

## Consequences

- `src/lib/db.js` reads and writes through `src/lib/storage/costStore.js`.
  Its public API is unchanged, but storage failures now throw instead of
  returning an empty list. Pages show specific messages, and a banner
  appears whenever saved data cannot be used.
- `vanilla/db.js` is unchanged and keeps the old behavior and keys (frozen,
  ADR-037).
- Details: [`DATA_STORAGE.md`](DATA_STORAGE.md).

---

# ADR-043 — Versioned Backup Files with Atomic, Confirmed Restore

**Status:** ACCEPTED  
**Date:** 2026-10-09

## Decision

- **Backup:** a JSON file (`format: "cost-manager-pro-backup"`,
  `formatVersion: 1`) with `exportedAt`, `costCount`, and the records
  exactly as stored. Expenses only; no settings or cached rates.
- **Restore always replaces the whole dataset.** v1 has no merge mode.
  Restore runs in this order:
  1. Validate the whole file. Newer format versions, count mismatches,
     invalid records, and duplicate ids are rejected.
  2. Ask the user to confirm.
  3. Keep the current value as the single "previous data" copy.
  4. Write the backup, then read it back to verify.
- If the copy cannot be written, nothing changes. If the write or the check
  fails, the earlier value stays or is put back.
- Previous data can be downloaded or restored. Restoring it is a swap, so
  it can be undone.

## Context

Data that lives only in the browser needs a way out and a way back. A
partial restore, or a restore without a way back, would put user data at
risk.

## Alternatives

- **Merge on restore.** Rejected for v1: id conflicts and duplicate
  expenses make merging ambiguous for money data.
- **Several snapshots.** Deferred: `localStorage` space is limited. An
  empty dataset never replaces an existing snapshot.

## Consequences

- Settings has a "Your data" section with backup, restore, previous data,
  recovery for unreadable data, and the earlier-version import.
- Merge, automatic or scheduled backups, and keeping several snapshots are
  possible future work.

---

# ADR-044 — Vercel as the Hosting Target; GitHub Pages Workflow Retired

**Status:** ACCEPTED (configuration only; not connected or deployed)  
**Date:** 2026-10-09

## Decision

- Build for the domain root (`base: '/'`).
- Add `vercel.json`:
  - Vite framework settings and `npm ci`
  - `buildCommand` runs lint, tests, and the build, so failing checks fail
    the Vercel build
  - an SPA rewrite for paths outside `/assets/`, ready for future
    client-side routing
- CI runs on pull requests and pushes to `main`.
- Remove the GitHub Pages `deploy.yml`.

## Context

The product owner chose Vercel (resolving OD-006). The Pages workflow was
built for the original course URL. It failed on every push here and could
not deploy this repository correctly.

## Alternatives

- **Deploy from GitHub Actions with the Vercel CLI after CI.** This would
  give strict gating, but needs a Vercel token secret. Not authorized in M1.

## Consequences

- Vercel's Git integration deploys on its own and does not wait for GitHub
  Actions. Gating relies on the checks inside Vercel's build command until
  branch protection or Vercel check requirements are configured. Those are
  provider and repository settings outside M1.
- Nothing is deployed until the product owner approves connecting Vercel.
  See [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

# 2. Open Decisions

The following decisions remain intentionally unresolved.

## OD-001 — Exact Deployment Provider

Candidates may include:

```text
Render
Vercel
GitHub Pages
other suitable static hosting
```

Decision criteria:

- stable public URL,
- simple GitHub deployment,
- HTTPS,
- compatible with Vite static output,
- reliable during grading.

---

## OD-002 — Exact Default Exchange-Rate JSON Hosting

Possible choices:

```text
same deployment
GitHub Pages
Vercel/static host
another team-controlled public static URL
```

Must satisfy official Fetch/web-hosting requirements.

---

## OD-003 — Final `getReport()` + Fetch Integration

> **M0 review:** no longer blocked by the course. To be revisited in M2 (ADR-037).

Blocked/provisional because of `OQ-003`.

Do not make the official grading API incompatible before this is resolved.

---

## OD-004 — Exact Report Item Currency Conversion Semantics

> **M0 review:** the external (grader) contract is retired; this is now an internal design choice for M2 (ADR-037).

Blocked by `OQ-001`.

Do not lock tests or UI assumptions until resolved.

---

## OD-005 — Exact External Date Shape

> **M0 review:** the external (grader) contract is retired; this is now an internal design choice for M2 (ADR-037).

Blocked by `OQ-002`.

Internal storage may need day/month/year, but externally returned report shape must remain course-compatible.

---

## Open decisions added in M0

The product owner decides each of these, recorded as an ADR in the named
milestone:

| ID | Decision | Milestone |
|---|---|---|
| OD-006 | Hosting provider for the live demo and how its storage stays separate from the original app | **Resolved in M1:** Vercel (ADR-044) and the `cost-manager-pro:` namespace (ADR-042). Deployment still needs approval |
| OD-007 | What happens to `vanilla/db.js` and its tests (keep frozen or archive) | M1 or M7 |
| OD-008 | Exchange-rate source (free, no secret key) and how stale rates are handled | M2 |
| OD-009 | Migration from `EURO` to ISO `EUR`, and expanding the currency list | M2 |
| OD-010 | Rounding policy and the rule for which calendar day an expense falls on | M2 |
| OD-011 | i18n library (or `Intl` with an in-house catalog) | M3 |
| OD-012 | URL routing approach | M3 |
| OD-013 | Storage engine (`localStorage` or IndexedDB) for larger data sets | `localStorage` kept in M1 (ADR-042); revisit later |
| OD-014 | TypeScript adoption | Not scheduled |

---

# 3. How to Change a Decision

Do not silently replace an accepted architecture choice.

For a meaningful change:

1. Identify the ADR.
2. Explain why the existing choice is insufficient.
3. Compare alternatives.
4. Verify compatibility with existing user data and behavior (plan a migration if needed).
5. Update this file.
6. Mark old decision `SUPERSEDED` if necessary.
7. Update architecture/tests.
8. Make the implementation change in a dedicated Issue/PR.

Example:

```text
ADR-005 — Recharts
Status: SUPERSEDED

ADR-029 — Chart.js
Status: ACCEPTED
```

This creates an auditable history instead of architecture drift.

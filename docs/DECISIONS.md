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

> **M1 pre-merge hardening (2026-10-09):** the first implementation
> overwrote the single snapshot before the data write was confirmed. One
> failed data write during a restore, or a failed write plus a failed
> repair during undo, could destroy the only remaining copy.
>
> All replacements now use a staged copy under `…:previous:pending` (written
> first, promoted only after the data write is verified), so every value
> involved exists in at least one key at every step. Before each write, the
> data is checked to be unchanged since it was read (`conflict`). A failed
> rollback is reported as `recovery-incomplete`.
>
> This guarantees that data can be recovered, not that changes are atomic
> across tabs. See [`DATA_STORAGE.md`](DATA_STORAGE.md) §5 and §8.

---

# ADR-044 — Vercel as the Hosting Target; GitHub Pages Workflow Retired

**Status:** ACCEPTED (implemented: deployed on Vercel after M1 was merged; see `DEPLOYMENT.md` for what is verified)  
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

# ADR-045 — Disclose Demonstration Exchange Rates (Pre-M2 Hotfix)

**Status:** ACCEPTED  
**Date:** 2026-10-11

## Decision

Converted totals state which kind of rates they use:

- the bundled default file, including a custom URL that resolves to it, is
  **demonstration data**
- any other source is **not verified**
- no source is ever labeled verified

The note appears beside converted totals on the monthly and yearly reports
and charts (only when an amount was actually converted), in Settings, and
inside Excel and PDF exports. All wording lives in one service.

## Context

The M2 audit found production still converts with the fixed sample rates
from the course project. Those rates are 10.6% (ILS), 20.6% (GBP), and
21.6% (EURO) away from the market values fetched on 2026-10-09, and nothing
told users.

## Alternatives

- **Record the source in the rates cache** to label cached rates exactly.
  Rejected for the hotfix: it changes the caching design, which belongs to
  M2B.
- **Show the note on every page.** Rejected: totals in a single currency use
  no rates, so a warning there would be noise.

## Consequences

- Calculations, rates, storage, backups, and refresh behavior are unchanged.
- **Known limit:** the label follows the source configured now. Cached rates
  from a different source can be described with the other wording. Both are
  warnings, so a converted total is never shown without one.
- M2B replaces the demo source. Its design must keep a visible source and
  date, and may then retire the "demonstration" wording.

---

# ADR-046 — M2 Direction: `big.js`, Frankfurter (ECB), Split into M2A and M2B

**Status:** ACCEPTED (direction only; nothing is implemented)  
**Date:** 2026-10-11

## Decision

Recorded from the product owner's review of the M2 audit:

- **Decimal arithmetic:** `big.js` is selected. (Installed and used in M2A.2;
  see ADR-047.)
- **Rates provider:** Frankfurter, pinned to the European Central Bank's
  reference rates, is the planned source. Not integrated.
- **Delivery:** M2 is split into M2A and M2B. The exact split is confirmed
  before each starts (the audit proposed M2A = money foundation, M2B =
  conversion engine and live rates).
- **Rounding policy:** decided in ADR-047 (Policy B, half away from zero).

## Consequences

- Open product decisions from the M2 audit that this record does not settle
  (currency list, historical-rate policy, stale threshold, custom sources,
  zero and negative amounts) still need answers before M2A or M2B starts.
- Until then, requirement statuses for CUR-5 and CUR-6 stay **Approved**.

# ADR-047 — Precision-Safe Money: Policy B, Half Away From Zero, `big.js` (M2A.2)

**Status:** ACCEPTED (implemented in M2A.2)  
**Date:** 2026-10-11

## Decision

Approved by the product owner after the M2A.1 policy review:

1. **Policy B.** Exact decimal values are kept through every conversion and
   sum. Rounding happens **once**, where a figure is shown or exported. A cost
   is never rounded before it is added to others, and no leftover cents are
   allocated or hidden.
2. **Rounding mode: half away from zero** (`0.125 → 0.13`, `-0.125 → -0.13`),
   to the currency's minor unit (USD, ILS, GBP, EURO: 2 digits). Percentages
   use ordinary one-decimal rounding and are not forced to total 100.0%.
3. **`big.js` 7.0.1** (exact version) behind application-owned functions in
   `src/lib/money/`. Callers never import it. It uses its own isolated
   constructor (`Big()`), so `big.js`'s global settings are untouched. Strict
   mode is on, so a floating-point `Number` cannot enter the engine except
   through the engine's own `String(n)` conversion.
4. **Amounts are decimal strings** (`"0.999"`), not floating-point Numbers,
   inside the engine and between the canonical calculations and their
   consumers. A Number is produced only at legacy boundaries: the pinned
   `getReport().total.sum`, `convertCurrency()`'s return value, and chart
   geometry. Never feed such a Number back into financial arithmetic.
5. **Stored data is unchanged.** Stored `sum` values stay JSON numbers; no
   schema, migration, backup, restore, or namespace change. Reports, charts,
   and exports never write to storage. Historical amounts with more
   precision than the currency's minor unit are shown as stored, never
   rounded or rewritten.
6. **One canonical calculation** (`src/lib/money/financials.js`): the monthly
   total, category totals, yearly total (the exact sum of the exact monthly
   totals), and the exports all derive from the same exact values.

## Precision limits (stated honestly, not "infinite precision")

- Addition and multiplication are exact for any size.
- **Division is the only inexact step.** It is evaluated to **30 decimal
  places**, half away from zero. A conversion is
  `amount × targetRate ÷ sourceRate`: multiply first, divide **once**, so its
  error is at most `5e-31` in the target currency. Rates are never rounded
  before use. This is tested against an independent BigInt rational oracle.
- A stored JSON `Number` is converted by its shortest decimal form
  (`String(n)`). That is lossless up to 15 significant digits; a stored number
  that already lost precision when it was parsed cannot be restored. Inputs
  must be finite; the engine rejects NaN, Infinity, and non-decimal text.
- Excel numeric cells hold a double (about 15 significant digits). See export
  semantics.

## Presentation and export semantics

- **Screens.** Computed totals (report total, category totals, month totals,
  yearly total) are rounded once to the currency's minor unit and shown with
  `Intl.NumberFormat` (`halfExpand`, grouping, no scientific notation, and a
  negative result that rounds to zero shows as zero). The label `EURO` is
  mapped to ISO `EUR` for formatting only. The "Total" figures on pages show
  a number followed by the currency code, as before. Per-cost amounts in
  tables are the **stored** values: padded to the currency's two digits
  (`25.50`) and never rounded (`0.333` stays `0.333`).
- **Excel.** Computed totals (summary totals, category totals, monthly totals)
  are **real numbers equal to the value rounded once** (for example `1` for
  `0.999`), with a two-decimal number format; the exact value they were
  rounded from is not in the file. Per-cost sums are the stored numbers
  (format shows two to eight decimals). The Share column holds the displayed
  one-decimal share. No decimal string is converted to a Number except after
  rounding to the currency's minor unit, which a double represents to well
  within Excel's 15 digits. Workbook structure and styles are unchanged.
- **Stored amounts are never rounded for display.** The digit count comes from
  the exact decimal, so a stored `1e-21` shows as `0.000000000000000000001`,
  never `0.00`, and there is no scientific notation. `Intl` accepts up to 100
  fraction digits; a value needing more (below 1e-100) uses an exact string
  fallback with grouping, which keeps every digit but uses a plain `-` for
  negatives.
- **Excel stored amounts.** Written as real numbers, never rounded or turned
  into text. The shared format shows at most eight decimals, so a stored
  amount with more decimals gets its own exact-digit number format (up to 30
  decimals, then a scientific format), so `1e-21` shows as
  `0.000000000000000000001` and not `0.00`. Excel keeps and shows only about 15
  significant digits and cannot hold magnitudes below about 2.2e-308, so when
  a stored amount exceeds that (for example `123456789.12345679`) the Summary
  sheet gets one `Precision` note. The exact value stays in Cost Manager Pro
  and in the PDF. Unavoidable limits: Excel may show fewer digits than the
  stored value has, and these formats were checked in the file (cell types and
  format codes), not rendered in Excel itself.
- **PDF.** Uses the same formatters as the screen, so the document text equals
  the on-screen text.
- The demo/unverified exchange-rate disclosure (ADR-045) is unchanged on
  every converted screen and export.

## Consequences (accepted tradeoffs)

- Rounded components may not add up to the rounded total (three costs of 0.333
  show `0.333` each; their total shows `1.00`). Rounded category amounts can
  differ from the rounded total by a minor unit, and category percentages may
  sum to 99.9% or 100.1%. Nothing is adjusted to hide this.
- Reports, charts, and exports agree because every figure is the rounded
  exact value of its own set of costs.
- **Not done here:** moving `EURO` to ISO `EUR` and input validation (M2A.3),
  real dated exchange rates and Frankfurter/ECB (M2B), and per-expense-date
  rates. The default rates are still the fixed demonstration values.

---

# ADR-048 — ISO `EUR`, Schema 2 Migration, and Strict New-Input Validation (M2A.3)

**Status:** ACCEPTED (implemented in M2A.3)  
**Date:** 2026-10-12

## Decision

1. **Canonical currencies are `USD`, `ILS`, `GBP`, `EUR`.** `EURO` (kept from
   the course, ADR-037) is never offered or written again. No currency is
   added to the selectable list.
2. **The euro upgrade is schema migration `1 → 2` in M1's existing chain**
   (`costDocument.js`), not a new mechanism. Only `currency: "EURO"` becomes
   `"EUR"`. Records, order, ids, dates, text, and exact amounts (including
   excess precision) are unchanged. Unknown or malformed currencies are never
   mapped; `EUR` inside a schema 0/1 record is rejected; `EURO` inside a
   schema 2 document is rejected.
3. **Reading never writes.** The migration becomes durable only through the
   next save, via M1's commit sequence, which first keeps the exact schema 1
   value as previous data. No storage API was changed; the M1 recovery
   guarantees (pending snapshot, rollback, conflict and quota handling) are
   untouched and still exercised by their original tests.
4. **Backups are format version 2.** Version 1 backups are accepted and their
   records upgraded in memory by the same migration; the file is never
   modified. New backups never contain `EURO`.
5. **Strict rules apply to NEW input only** (`lib/costInput.js`); stored-data
   integrity stays permissive; optional data-quality notes are non-blocking
   (`lib/dataQuality.js`). Nothing runs the strict rules on read.
6. **Policy B (ADR-047) is unchanged.**

## Blast radius (found by inventory, not search-and-replace)

| Area | What changed |
|---|---|
| Registry | `constants/currencies.js` (`EUR`; `legacyEuroIdentifier` for compatibility) |
| Stored data | schema 2, migration step, `upgradeCostRecords()` |
| Backup, restore, legacy import, previous-data snapshots | all go through the same migration (`parseCostDocument` / `upgradeCostRecords`); format version 2 |
| Rates | `public/exchange-rates.json` uses `EUR`; `validateExchangeRates()` reads `EURO` as the euro rate (below) |
| Money formatting | `EUR` is native; the old `EURO → EUR` mapping was removed |
| Reports, charts, exports, filenames | display the stored code; export filenames now end `-eur` |
| Forms | Add Cost and Manage Costs use the central validator |
| Tests | M1 fixtures give schema 1 and schema 2 documents explicitly |
| **Not changed** | `vanilla/` (frozen; still `EURO`), the storage layer (`costStore`, `browserStorage`), the legacy storage key, the rates cache key/format, settings |

## Rate-source compatibility (minimal, reversible)

A custom source or an old cache that still uses `EURO` is read as the same
euro rate, **in memory only**: nothing is rewritten, `EURO` is never emitted,
and a source that gives `EUR` and `EURO` with different values is rejected.
`EUR` is still required, so a source with neither is rejected and no total is
invented. The demo / unverified disclosure is unchanged; no timestamps are
added.

**Open product decision:** this alias is a transition convenience. The
alternative is to reject `EURO` sources and ask the user to update them. It
can be removed later by deleting one branch of `validateExchangeRates()`; M2B
replaces the rate pipeline anyway.

## New-input rules (error codes, never message text)

- **Amount:** plain decimal digits with an optional `.` and at least one digit
  after it. `,` is not a separator; no sign, exponent, hex/binary, internal
  whitespace, or Infinity (outer whitespace is trimmed). The text is checked
  as exact decimal syntax **before** any `Number` conversion. Greater than
  zero. At most the currency's decimals (2 for all four), 12 integer digits,
  and 15 significant digits, counted as typed with no silent truncation.
  Up to 15 significant digits a `Number` equals the typed decimal exactly.
- **Category and description:** required, trimmed, at most **50** and **200**
  characters (counted in code points), no control characters. *These limits
  and the date years below are proposals for the product owner to confirm.*
- **Date and time (when typed):** a real Gregorian date (leap years
  included), years **1900-2999**, and `HH:mm`. Local calendar fields only: no
  timezone conversion, nothing inferred for old records.
- **Currency:** must be in the canonical registry.
- **Error contract:** `{ code, params }` per field; English wording is in
  `utils/costInputMessages.js` so Hebrew (M3) can replace it.

## Where the rules apply: create, update, preserve, import

| Case | Rule |
|---|---|
| **A. Create** (`addCost`, Add Cost form) | Every rule. `db.addCost()` enforces the same policy as the form (`validateNewCost`), so a programmatic caller cannot create an expense the form rejects. It ignores any supplied date and stamps the current one. |
| **B. Update** (`updateCost`, Manage Costs form) | The database compares the payload with the stored record and validates **only fields whose value changed** (`validateChangedCostFields`): amount by `Object.is`, text by equality, and the date's day/month/year separately from hour/minute. |
| **C. Preserve** | An unchanged field keeps its exact stored value (zero, negative, long-decimal, tiny, huge, old date, long text), including when only the currency changes. |
| **D. Restore / import / migration** | Never call the input rules. They use stored-data validation and the migration chain, so any valid historical dataset or version 1 backup stays restorable and editable. Delete does not validate either. |

Errors from the database are `CostInputError` (a `TypeError`) with stable
`field`, `code` and `params`; existing structural errors and messages
(non-number sum, unknown currency, impossible date) are unchanged. No public
signature, storage format, or schema changed.

**Limit of Number input.** The database receives a JavaScript `Number`, not the
text a user typed, so it judges a Number by its shortest round-trip decimal
form. It therefore cannot see typed trailing or leading zeros (`1.990` arrives
as `1.99` and is accepted; the form rejects the text), while `0.1 + 0.2`,
`1e-7`, `1e21`, and `-0` are judged by their decimal expansion and rejected.
Everything a Number can carry is enforced; exact-text guarantees belong to the
forms. For every Number the database and the form decide identically on the
decimal form (tested). Strict text-level guarantees in the database would need
a new text-based API, which was not introduced.

## Legacy data and editing

An edit validates only what the user changed. A field whose text is unchanged
is not revalidated and keeps its exact stored value: a zero, negative,
long-decimal, tiny or huge amount, an old date, an old category. This holds
even when only the currency changes. A changed amount must pass today's rules.
The edit dialog shows a non-blocking note that such an amount is kept as
stored.

## Consequences and limits

- **Rollback risk:** see DATA_STORAGE.md §3. An older build treats schema 2 as
  an unsupported newer version and pauses saving, and cannot read a version 2
  backup; its "Restore previous data" can restore the pre-upgrade copy
  (verified against the previous code). There is no silent downgrade.
- The input policy is enforced at the database boundary as well as in the
  forms (see "Where the rules apply"); Number input has the documented limit
  above.
- `vanilla/` still uses `EURO`; it is frozen and unaffected.
- A legacy negative amount still shows as a negative chart slice (existing
  behavior for old data, not changed here).
- **Not done:** real dated exchange rates (M2B), localization (M3), a
  user-selectable expense date (M4).

---

# ADR-049 — ECB Historical Exchange-Rate Infrastructure (M2B.1, dormant)

**Status:** ACCEPTED (infrastructure implemented in M2B.1; **not active** in the app)  
**Date:** 2026-10-12

## Decision

Approved by the product owner after the M2B pre-implementation review:

1. **Source:** Frankfurter v2, the **ECB-specific** endpoint family
   `https://api.frankfurter.dev/v2/providers/ecb/...`. The blended default feed
   (`/v2/rates`) is never used; the client refuses any response that did not
   come from the provider path.
2. **EUR-base observations** (`1 EUR = rate QUOTE`) for `USD`, `GBP`, `ILS`.
   `EUR` is 1 by definition and has no observations. Conversion is a ratio, so
   the existing exact engine works unchanged with this base.
3. **Historical conversion by the expense's local calendar date.** The latest
   observation set dated on or before that date applies; both currencies of
   one conversion come from the same observation date. Dates are the stored
   `day/month/year` as `YYYY-MM-DD`; nothing goes through UTC.
4. **Policy B is unchanged** (no per-expense rounding, exact decimals).
5. **Versioned observation cache with explicit revision.** Accepted
   observations are never silently changed.
6. **`getReport()` stays synchronous.** Rates are prepared asynchronously first;
   selection reads the local cache synchronously.
7. **M2B.1 is infrastructure only and is DORMANT.** Nothing in the application
   imports it; no request is made; no key is written; no converted amount, UI
   text, or disclosure changes. The demonstration rates and their disclosures
   remain in force until M2B.2 activates this and replaces them.

## Provider facts (checked against the live API and official pages on 2026-10-12)

- Response: a flat list `[{ "date", "base", "quote", "rate" }]`, rates as JSON
  numbers. Provider metadata (`/v2/providers/ecb`) gives `start_date` (1999-01-04),
  `end_date` (newest observation), `pivot_currency` (EUR), `publish_cadence`.
- A date request answers with the **latest observation on or before** it: a
  Saturday returns Friday, 25 December returns 24 December. A range starting on
  a holiday also returned the preceding observation (the client accepts at most
  10 days before `from`).
- **HTTP 200 does not prove data:** future dates and dates before the series
  return `[]`. ILS was absent on the first ECB date (1999-01-04) and present
  from at least 2000-06-01 (the exact first ILS date was not determined).
- `base=USD` makes the server compute **rounded** cross rates (`0.89238` versus
  the exact `0.892379…`); the client therefore only requests the EUR base and
  crosses locally.
- CORS is open (`access-control-allow-origin: *`); responses are cacheable
  (`max-age` 14-24 h, `stale-if-error` 24 h). A year of three currencies is
  about 48 KB (about 4.5 KB compressed).
- ECB: published about 16:00 CET on working days, "for information purposes
  only", transaction use "strongly discouraged"; reuse requires citing the ECB
  as the source and saying when data was modified. **Not verified:** numeric
  rate limits, the behaviour of HTTP 429/503 and `Retry-After` (not provoked),
  and whether the provider ever revises published history.

## What was built (`src/lib/fx/`)

| Module | Role |
|---|---|
| `ecbParser.js` | Validates responses; typed errors; exact decimal-string rates |
| `ecbClient.js` | Bounded fetch client (10 s timeout, 2 retries, backoff, `Retry-After`, cancellation, shared in-flight requests) |
| `rateTable.js` | The versioned table: schema, validation, checksum, union merge, revisions, size bound |
| `observationSelection.js` | Pure selection by date with proof against coverage |
| `fxCache.js` | Storage-bound cache: one key, failure injection, in-memory fallback, reconcile |

## Precision rules

Rates are exact decimal **strings**. Primary mode: `JSON.parse`'s reviver
receives each number's source text (`context.source`), so every token is kept
exactly, with no dependency and no regular expression over the serialized JSON.
Fallback (engines without `context.source`): the parsed Number is accepted only
if it has at most 15 significant digits and no exponent. **Limit of the
fallback:** a token with more digits than a double holds cannot be detected,
because the digits are gone once the Number exists; the result reports which
mode was used. Both modes reject more than 15 significant digits, exponents,
zero and negative rates, and unsupported formats. All 768 rates in a real year
have at most 5 significant digits and round-trip exactly. Browser support for
`context.source` was **not verified** in this milestone.

## Observation model and coverage

An observation is `{ provider: ECB, base: EUR, quote, date (observation date),
rate, fetch }`; the fetch record holds the fetch time and what was requested.
The **expense date**, the **observation date**, and the **fetch time** are
never mixed. A missing rate is absent: never stored or returned as 0 or 1.

Coverage is recorded **per currency and per date range**:

| Status | Meaning | Counts when proving a selection |
|---|---|---|
| (no entry) | never fetched | no |
| `valid` | observations in the range were received | yes |
| `confirmed-empty` | the provider answered validly with none for this currency | yes |
| `partial` | the answer failed validation | no |
| `failed` | the request failed | no |

## Selection and finality

A selection is `available` only when each needed currency has counted coverage
over `[observation date, expense date]`; otherwise `needs-fetch` with the
missing ranges, each marked `not-fetched`, `failed` or `partial`. It is
`unavailable` for a future date (relative to a caller-supplied today), a date
before the series, a currency with confirmed absence, or currencies that never
share a day. **Final** means the observation is dated the expense date, or a
later observation common to all needed currencies exists. Otherwise
**provisional** (a newer observation may still be published): today before the
publication, or a weekend or holiday at the end of the data. Finality is derived
from fetched data, not from the clock.

## Cache

One key, `cost-manager-pro:fx:ecb:v1` (schema version 1), written with a single
`setItem`. It is independent of the expense keys, the backup, and the live demo
cache (`…:exchange-rates-cache`), and it is **not** part of backups. Every read
validates everything including a checksum; a corrupt cache is never trusted, a
newer schema is never overwritten, a write that cannot be read back is not
trusted. A failed write (quota or blocked storage) keeps results in memory for
the session and reports `persisted: false`. The cache is bounded (default 1 MB;
the whole 1999-2026 history for three currencies is about 0.3 MB) by dropping
the oldest dates and their coverage. Before writing, the table is validated as
it will be read back; observations are validated on entry.

**Concurrent tabs (honest limits).** localStorage has no transactions. A write
re-reads the key just before writing and, if it changed, rebuilds from the fresh
value (a union) up to three times. A short window remains in which another
tab's write can be overwritten; `reconcile()` (meant for the `storage` event)
merges what a tab last wrote back in. Observations are idempotent, so repeating
the merge is safe.

## Revisions

A later fetch that disagrees with an accepted observation becomes a **pending
revision**; the accepted value stays. `applyPendingRevision()` replaces it only
on explicit request and keeps the replaced value in a revision log;
`discardPendingRevision()` keeps the accepted value. Nothing recalculates
automatically, and no UI exists yet (M2B.3).

## Consequences

- Reports are unchanged by this milestone. The demonstration rates, their
  disclosures, `Settings`, custom sources, and `getReport()` are untouched.
- Proven by tests: no application module imports `src/lib/fx`, importing it
  makes no request and no storage call, the production bundle is byte-identical
  to before (and contains no `frankfurter` string), and expense, demo-cache and
  settings storage are byte-identical after FX activity, including a real quota
  failure.
- **Still to do:** M2B.2 (use it in conversion, make ECB the default, replace
  the demonstration disclosure with ECB attribution and the reference-rate
  disclaimer, treat custom sources as saved but unused, never show a partial
  total as complete) and M2B.3 (offline and stale states, refresh, revision UI,
  cleanup of the old demo cache). Not started.

---

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
| OD-008 | Exchange-rate source (free, no secret key) and how stale rates are handled | **Direction approved** (ADR-046): Frankfurter with ECB rates. Provider client, parser, and historical cache built but **dormant** (ADR-049, M2B.1). Stale-rate handling and the privacy window for historical requests remain open (M2B) |
| OD-009 | Migration from `EURO` to ISO `EUR`, and expanding the currency list | `EUR` migration **decided and done** (ADR-048, M2A.3). Expanding the list remains open |
| OD-010 | Rounding policy and the rule for which calendar day an expense falls on | Rounding **decided** (ADR-047, M2A.2). The calendar-day rule remains open |
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

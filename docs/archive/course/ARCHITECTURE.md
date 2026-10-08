# Cost Manager Front-End — Architecture

> **Document purpose:** Define how the project should be structured and how its major parts interact.
>
> **Official requirement source:** the course project specification, represented in this repository by `docs/REQUIREMENTS.md`.
>
> **Important:** This document describes **project architecture decisions**. It must never override an official course requirement. If a conflict is discovered, the official requirement wins and this document must be updated.

---

# 1. Architecture Goals

The architecture should optimize for the following priorities:

1. Exact compliance with the official course requirements.
2. Compatibility with the required standalone Vanilla `db.js` API.
3. Correctness of cost storage, reporting, and currency conversion.
4. Clear separation between UI, persistence, exchange-rate logic, and calculations.
5. Small, testable modules.
6. Easy development with Codex and review with Claude Code.
7. Clear Git/GitHub traceability.
8. Reliable deployment to a static web host.
9. Simple maintenance and debugging.
10. Minimal unnecessary complexity.

This is a front-end course project. The architecture should remain intentionally small and understandable.

---

# 2. Chosen Technology Direction

The planned stack is:

```text
JavaScript / JSX
React
Vite
MUI
Recharts
localStorage
Fetch API
Vitest
ESLint
Git / GitHub
```

## Why this stack

### React

The official specification explicitly permits React.

React gives us:

- reusable UI components,
- predictable state-driven rendering,
- clean separation between screens and business logic,
- convenient integration with MUI and chart components.

### Vite

Vite is used as the development/build environment.

It provides:

- a simple React setup,
- fast development server,
- straightforward production build,
- no unnecessary application framework.

### JavaScript / JSX

The project will use JavaScript rather than TypeScript.

Reasons:

- the official specification is written around JavaScript,
- less tooling complexity,
- easier compatibility with the Vanilla `db.js`,
- easier review against the course requirements.

### MUI

MUI will be the main UI component library.

It will be used for:

- layout,
- forms,
- buttons,
- navigation,
- cards,
- dialogs/alerts,
- tables.

### Recharts

Recharts is the planned single charting library.

It will provide:

- Pie Chart,
- Bar Chart.

Do not install a second chart library unless this architecture decision is explicitly changed.

### Vitest

Vitest will be used for unit tests for pure JavaScript logic and application modules.

### ESLint

ESLint will provide automated code-quality checks.

---

# 3. High-Level Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                       React UI                           │
│                                                          │
│  Dashboard   Add Cost   Reports   Charts   Settings      │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│                Application / Service Layer               │
│                                                          │
│  Cost operations     Report preparation                  │
│  Exchange rates      Settings management                 │
│  Chart aggregation   Validation                          │
└───────────────┬───────────────────────┬──────────────────┘
                │                       │
                ▼                       ▼
┌────────────────────────────┐   ┌──────────────────────────┐
│        db.js Layer         │   │ Exchange Rate Service    │
│                            │   │                          │
│ openCostsDB()              │   │ Fetch API                │
│ addCost()                  │   │ Default URL              │
│ getReport()                │   │ Custom Settings URL      │
└──────────────┬─────────────┘   └────────────┬─────────────┘
               │                              │
               ▼                              ▼
┌────────────────────────────┐   ┌──────────────────────────┐
│        localStorage        │   │ Web-hosted rates JSON    │
│                            │   │                          │
│ Costs                      │   │ USD / ILS / GBP / EURO  │
│ Settings                   │   └──────────────────────────┘
│ Validated rate cache*      │
└────────────────────────────┘

* A local validated rate cache is a planned implementation mechanism.
  See the unresolved synchronous getReport()/Fetch issue below.
```

---

# 4. Core Architectural Rule: UI Does Not Own Business Logic

React components should focus on:

- collecting input,
- displaying information,
- displaying loading/errors,
- triggering application operations.

React components should **not** directly implement:

- localStorage persistence rules,
- currency conversion formulas,
- report calculation rules,
- category aggregation,
- yearly aggregation.

Bad:

```javascript
function MonthlyReportPage() {
  const costs = JSON.parse(localStorage.getItem("costs"));
  // calculate everything here...
}
```

Preferred:

```javascript
function MonthlyReportPage() {
  const report = dbObject.getReport(currency, year, month);
  // display report...
}
```

Business/data logic belongs outside the visual components.

---

# 5. Proposed Repository Structure

```text
cost-manager/
│
├── README.md
├── intent.txt
├── AGENTS.md
├── CLAUDE.md
├── CONTRIBUTING.md
│
├── docs/
│   ├── REQUIREMENTS.md
│   ├── ARCHITECTURE.md
│   ├── PROJECT_ROADMAP_EN.md
│   ├── PROJECT_ROADMAP_HE.md
│   ├── TEST_PLAN.md
│   ├── DECISIONS.md
│   └── SUBMISSION_CHECKLIST.md
│
├── .github/
│   ├── workflows/
│   │   └── ci.yml
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
│
├── public/
│   └── exchange-rates.json
│
├── src/
│   ├── components/
│   │   ├── layout/
│   │   ├── forms/
│   │   ├── reports/
│   │   └── charts/
│   │
│   ├── pages/
│   │   ├── DashboardPage.jsx
│   │   ├── AddCostPage.jsx
│   │   ├── MonthlyReportPage.jsx
│   │   ├── ChartsPage.jsx
│   │   └── SettingsPage.jsx
│   │
│   ├── lib/
│   │   └── db.js
│   │
│   ├── services/
│   │   ├── exchangeRatesService.js
│   │   └── settingsService.js
│   │
│   ├── utils/
│   │   ├── currency.js
│   │   ├── chartAggregation.js
│   │   └── validation.js
│   │
│   ├── constants/
│   │   └── currencies.js
│   │
│   ├── App.jsx
│   ├── main.jsx
│   └── theme.js
│
├── vanilla/
│   ├── db.js
│   └── db-test.html
│
├── tests/
│   ├── db/
│   ├── currency/
│   ├── reports/
│   └── charts/
│
├── eslint.config.js
├── vite.config.js
├── package.json
└── .gitignore
```

This is the target structure, not a requirement to create every directory immediately.

Directories should be introduced when their milestone needs them.

---

# 6. Navigation Architecture

The project is a small single-page application.

Initial architecture should avoid adding routing complexity unless it becomes useful.

Preferred approach:

```text
App
 ├── Navigation
 └── Active View
      ├── Dashboard
      ├── Add Cost
      ├── Monthly Report
      ├── Charts
      └── Settings
```

Navigation may be implemented using MUI navigation components and application state.

React Router should **not** be added by default.

If later there is a clear benefit to URL-based routes, the decision should be documented before introducing it.

---

# 7. Required Currency Constants

There must be one canonical definition of supported currencies:

```javascript
const SUPPORTED_CURRENCIES = [
  "USD",
  "ILS",
  "GBP",
  "EURO"
];
```

Do not duplicate different currency lists across components.

Do not substitute:

```text
EUR
```

for:

```text
EURO
```

because the official specification explicitly uses `EURO`.

---

# 8. `db.js` Architecture

`db.js` is a protected part of the project because it has an externally tested public contract.

The required structure is:

```text
db
 └── openCostsDB(databaseName, databaseVersion)
      └── database object
           ├── addCost(cost)
           └── getReport(currency, year, month)
```

## Required usage

```javascript
const ob = db.openCostsDB("costsdb", 1);

const cost = ob.addCost({
  sum: 200,
  currency: "USD",
  category: "FOOD",
  description: "pizza"
});

const report = ob.getReport("USD");
```

This usage pattern must remain valid.

---

# 9. Two `db.js` Versions

The project requires two forms of the library.

## Module version

Location:

```text
src/lib/db.js
```

Purpose:

- application use,
- import/export support,
- React/Vite compatibility.

Conceptually:

```javascript
export const db = {
  openCostsDB
};
```

The exact export syntax may be adjusted during implementation.

---

## Vanilla version

Location:

```text
vanilla/db.js
```

Purpose:

- standalone grading,
- direct `<script>` loading,
- no Vite,
- no React,
- no module import requirement.

It must support:

```html
<script src="db.js"></script>
```

and then:

```javascript
db.openCostsDB(...);
```

---

# 10. Avoiding Logic Drift Between the Two `db.js` Versions

The two `db.js` versions must behave consistently.

We should avoid manually implementing the same complex logic twice when possible.

Preferred design principle:

```text
Shared behavior/specification
        ↓
Module implementation
        ↓
Vanilla-compatible implementation
        ↓
Contract tests against both
```

However, the Vanilla submission must remain a genuinely standalone JavaScript file.

Build tooling must not become a runtime dependency for the submitted Vanilla file.

If a build-generation approach is later considered for producing the Vanilla file, it must be verified that the final submitted output:

- is standalone,
- exposes global `db`,
- contains no unresolved imports,
- works by direct `<script src="db.js"></script>`.

---

# 11. localStorage Architecture

The official requirement is localStorage.

The project must not replace it with:

- IndexedDB,
- Firebase,
- SQL,
- server database,
- another persistence technology.

## Storage namespaces

The actual key format will be finalized during the db milestone.

A proposed approach is:

```text
cost-manager:<databaseName>:v<version>:costs
cost-manager:settings
cost-manager:exchange-rates-cache
```

The `databaseName` and `databaseVersion` arguments should have meaningful use in the storage wrapper rather than being ignored without reason.

Exact key names are an implementation detail and may change.

---

# 12. Proposed Cost Data Model

The required input model is:

```javascript
{
  sum: Number,
  currency: String,
  category: String,
  description: String
}
```

The internally stored representation also needs enough date information to filter by month and year.

Proposed internal shape:

```javascript
{
  sum: 200,
  currency: "USD",
  category: "FOOD",
  description: "pizza",
  date: {
    day: 22,
    month: 8,
    year: 2026
  }
}
```

## Important

The official example displays:

```javascript
date: { day: 12 }
```

in a returned monthly report.

Therefore:

- the internal stored format above is a project design proposal,
- the externally returned report shape must remain compatible with the official specification,
- final report-date behavior should be verified during the `db.js` milestone.

This is related to `OQ-002` in `docs/REQUIREMENTS.md`.

---

# 13. Exchange-Rate Architecture

The exchange-rate subsystem should be isolated from React components.

```text
Settings
    │
    ▼
settingsService
    │
    ▼
Selected URL
    │
    ├────────── user configured URL
    │
    └────────── default URL
                 │
                 ▼
        exchangeRatesService
                 │
                 ▼
               fetch()
                 │
                 ▼
       validate JSON response
                 │
                 ▼
        validated rates object
```

Expected shape:

```javascript
{
  USD: 1,
  GBP: 0.6,
  EURO: 0.7,
  ILS: 3.4
}
```

---

# 14. Currency Conversion

Currency conversion should exist in one reusable utility.

Conceptual function:

```javascript
convertCurrency(amount, sourceCurrency, targetCurrency, rates)
```

Given the official rate model:

```text
USD 1 = ILS 3.4
USD 1 = GBP 0.6
USD 1 = EURO 0.7
```

the expected conversion formula is:

```javascript
amount / rates[sourceCurrency] * rates[targetCurrency]
```

Example:

```text
100 ILS
÷ 3.4
= USD value
× 0.6
= GBP value
```

The formula must be covered by automated tests.

---

# 15. Important Open Architecture Issue: Fetch vs Synchronous `getReport`

The official requirements create a design tension:

Exchange rates must be retrieved using:

```javascript
fetch(...)
```

which is asynchronous.

But the official Vanilla test uses:

```javascript
const data = ob.getReport("USD");
console.log(data.total.sum);
```

which treats `getReport()` as synchronous.

We must not casually change it into:

```javascript
await ob.getReport(...)
```

because that could break grading compatibility.

## Proposed architecture direction

The application layer will:

```text
Application startup / refresh
        ↓
Fetch exchange rates
        ↓
Validate rates
        ↓
Cache current validated rates
        ↓
Synchronous report/calculation code can consume cached rates
```

This allows the React application to use network-fetched data without forcing the required `getReport()` call pattern to become asynchronous.

## Status

This design is **provisional** until the ambiguity tracked as `OQ-003` is resolved or validated against the course's expected behavior.

Do not hard-code a final incompatible solution before that point.

---

# 16. Settings Architecture

Settings should own user configuration only.

Initial required setting:

```text
Exchange Rates URL
```

Proposed settings flow:

```text
Settings Page
      ↓
settingsService
      ↓
localStorage
```

When retrieving exchange rates:

```text
Is custom URL configured?
       │
       ├── Yes → use custom URL
       │
       └── No  → use default project URL
```

The existence of a custom setting must never be required for the application to work.

---

# 17. Monthly Report Flow

```text
User selects:
month + year + currency
        ↓
MonthlyReportPage
        ↓
database object
        ↓
getReport(currency, year, month)
        ↓
Filter relevant stored costs
        ↓
Calculate required total
        ↓
Return report object
        ↓
Render report
```

The UI should display the returned report rather than independently reconstructing it from localStorage.

---

# 18. Pie Chart Flow

```text
Selected month/year/currency
          ↓
Retrieve relevant costs/report data
          ↓
Convert values as required
          ↓
Group by category
          ↓
Sum category totals
          ↓
Recharts Pie Chart
```

Chart aggregation belongs in:

```text
src/utils/chartAggregation.js
```

or another non-visual module.

The chart component should receive already prepared chart data.

---

# 19. Yearly Bar Chart Flow

```text
Selected year/currency
        ↓
Load costs for selected year
        ↓
Convert values
        ↓
Aggregate totals by month
        ↓
Guarantee 12 month entries
        ↓
Recharts Bar Chart
```

A month without costs should still have a value of:

```text
0
```

The aggregation output should conceptually resemble:

```javascript
[
  { month: "Jan", total: 0 },
  { month: "Feb", total: 250 },
  ...
  { month: "Dec", total: 90 }
]
```

---

# 20. React State Ownership

State should live at the lowest sensible level.

Examples:

## Add Cost form

Local state:

```text
sum
currency
category
description
form errors
submission status
```

## Monthly report

Local page state:

```text
month
year
currency
report
error
```

## Settings

Local page state plus persisted service state:

```text
exchangeRatesUrl
test status
save status
```

Avoid putting all state globally simply because React allows it.

No global state-management library is planned.

Do not introduce Redux, Zustand, or similar libraries unless a real need emerges.

---

# 21. Error Handling Architecture

Errors should be handled at the appropriate boundary.

Examples:

## Form validation error

Handled by:

```text
AddCostPage / validation utility
```

## localStorage parsing/storage error

Handled by:

```text
db.js
```

## Fetch/network error

Handled by:

```text
exchangeRatesService
```

and surfaced to the UI in a user-friendly form.

## Invalid rates JSON

Handled before the data is accepted as current exchange-rate data.

Do not silently accept malformed rate responses.

---

# 22. Validation Architecture

Validation should be reusable and must not conflict with the grader's required API.

Possible utility:

```text
src/utils/validation.js
```

Responsibilities may include:

```text
isSupportedCurrency()
validateCost()
validateRatesResponse()
```

## Important

Detailed validation rules not specified by the course are project decisions.

Do not accidentally reject valid grader input because of an unnecessary UI-specific rule.

---

# 23. Dependency Boundaries

The desired dependency direction is:

```text
UI
 ↓
services / db / utilities
 ↓
browser APIs
```

Avoid:

```text
db.js → React
currency.js → MUI
chartAggregation.js → React component
```

Core logic should remain usable without React.

This makes it easier to:

- test,
- reuse,
- inspect,
- create the Vanilla library,
- debug grader compatibility.

---

# 24. Testing Architecture

Testing is divided into four layers.

## Layer 1 — Pure Unit Tests

Examples:

```text
currency conversion
cost validation
rates validation
category aggregation
yearly month aggregation
```

---

## Layer 2 — `db.js` Contract Tests

Test:

```text
openCostsDB()
addCost()
getReport()
localStorage persistence
current month/year defaults
multiple costs
multiple currencies where behavior is defined
```

The public contract is more important than internal implementation details.

---

## Layer 3 — Official Vanilla HTML Compatibility Test

Maintain:

```text
vanilla/db-test.html
```

using the official example provided by the course.

This must be tested directly in Chrome.

---

## Layer 4 — Manual / Production QA

Test the complete application:

```text
Add cost
Refresh
Monthly report
Pie chart
Bar chart
Settings
Default exchange-rate URL
Custom exchange-rate URL
Deployment
Latest Chrome
```

---

# 25. CI Architecture

GitHub Actions should eventually run:

```text
npm ci
npm run lint
npm test
npm run build
```

for Pull Requests.

CI does **not** replace the official Vanilla HTML test or manual Chrome QA.

---

# 26. Deployment Architecture

The application should be deployable as a static production build.

```text
GitHub main
    ↓
Build
    ↓
Static hosting
    ↓
Production URL
```

Possible hosting services include Render or another suitable platform.

The exchange-rate JSON must also be available from an Internet-connected server.

Deployment choice should preserve:

- Fetch support,
- HTTPS,
- Chrome compatibility,
- stable public URL.

---

# 27. Security / Repository Hygiene

This application should not require secrets for its normal course functionality.

Rules:

- Do not commit API keys.
- Do not commit passwords.
- Do not commit access tokens.
- Do not put private credentials in source files.
- Keep `.env` files ignored if they are ever introduced.
- Do not make the application depend on a secret merely to fetch the required static exchange-rate JSON.

---

# 28. Documentation Architecture

Each file has one job.

```text
intent.txt
→ Why the project exists and the project's priorities.

docs/REQUIREMENTS.md
→ What the course requires.

docs/ARCHITECTURE.md
→ How the system is designed.

docs/DECISIONS.md
→ Important architectural decisions and changes over time.

AGENTS.md
→ How Codex should operate in this repository.

CLAUDE.md
→ How Claude Code should operate in this repository.

docs/TEST_PLAN.md
→ How correctness is verified.

docs/SUBMISSION_CHECKLIST.md
→ How the final submission is prepared.

README.md
→ Human-facing project overview and usage instructions.
```

Avoid copying the same large instruction block into multiple documents.

---

# 29. Architecture Decision Logging

Important design choices should be recorded in `docs/DECISIONS.md`.

Examples:

```text
ADR-001 — React + Vite chosen
ADR-002 — JavaScript instead of TypeScript
ADR-003 — MUI chosen for UI
ADR-004 — Recharts chosen as single chart library
ADR-005 — No React Router initially
ADR-006 — No global state library
ADR-007 — Exchange-rate cache strategy
```

An architecture decision should record:

```text
Decision
Context
Alternatives considered
Reason
Consequences
Date
```

This prevents Codex or Claude Code from casually reversing project decisions later.

---

# 30. Rules for Future Architecture Changes

An architecture change is acceptable when:

- it solves a real project problem,
- it does not violate official requirements,
- it does not break the required Vanilla API,
- it does not create unnecessary complexity,
- it is documented,
- related tests are updated.

Examples of changes that require explicit approval/documentation:

```text
Adding React Router
Adding TypeScript
Changing chart library
Adding a global state library
Changing the localStorage data model
Changing exchange-rate caching strategy
Generating Vanilla db.js from module source
Changing public db.js behavior
```

---

# 31. Target Development Flow

```text
Official Requirement
       ↓
REQUIREMENTS.md
       ↓
Architecture / Decision
       ↓
GitHub Issue
       ↓
Feature Branch
       ↓
Codex Implementation
       ↓
Tests
       ↓
Claude Code / Human Review
       ↓
Pull Request
       ↓
CI
       ↓
Merge
       ↓
Production / Requirement Audit
```

---

# 32. Architecture Definition of Done

The architecture phase is considered ready for implementation when:

- [ ] Official requirements are represented in `REQUIREMENTS.md`.
- [ ] Application boundaries are defined.
- [ ] `db.js` public contract is protected.
- [ ] Module/Vanilla split is documented.
- [ ] Storage ownership is defined.
- [ ] Exchange-rate boundary is defined.
- [ ] Report flow is defined.
- [ ] Chart flows are defined.
- [ ] Settings flow is defined.
- [ ] Testing layers are defined.
- [ ] Deployment direction is defined.
- [ ] Known ambiguities remain explicitly marked rather than guessed.
- [ ] Codex and Claude instructions can reference this architecture document.

---

# 33. Current Known Architecture Blockers / Clarifications

The following open questions from `docs/REQUIREMENTS.md` must remain visible during implementation:

```text
OQ-001 — Whether individual cost values in reports are converted
         or preserved in their original currency.

OQ-002 — Exact externally returned date shape.

OQ-003 — Required interaction between asynchronous Fetch and the
         synchronous-looking getReport() grading contract.

OQ-004 — No official fixed category list is currently defined.

OQ-005 — Detailed input validation rules are not officially defined.
```

Do not allow an AI agent to silently resolve these as if they were official facts.

---

# 34. Final Architecture Principle

Keep the system simple:

```text
React UI
   ↓
Small services / utilities
   ↓
Required db.js contract
   ↓
localStorage

Exchange-rate service
   ↓
Fetch
   ↓
Web-hosted JSON
```

The project does not need a complex framework, backend application, global state
library, or database server.

The best architecture for this project is the smallest architecture that:

```text
satisfies every official requirement
+
protects grader compatibility
+
is easy to test
+
is easy to understand
+
is easy to audit before submission
```

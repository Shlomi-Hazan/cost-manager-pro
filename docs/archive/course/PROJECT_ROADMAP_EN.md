# Cost Manager Front-End — Complete Milestone Plan

> Working roadmap for the **Front-End Development Final Project**.  
> This document defines the project lifecycle from initial setup to final submission, including Git/GitHub workflow, Codex and Claude Code usage, testing, documentation, deployment, auditing, and submission preparation.

---

## 1. Project Goal

Develop a client-side **Cost Manager** application according to the official course specification.

The application will support:

- Adding new cost items.
- Persisting data in `localStorage`.
- Generating a detailed report for a selected month and year.
- Selecting the target currency for reports and charts.
- Displaying a monthly Pie Chart grouped by category.
- Displaying a yearly Bar Chart for all twelve months.
- Retrieving exchange rates using the `Fetch API`.
- Using a default exchange-rates URL.
- Allowing a custom exchange-rates URL through Settings.
- Supporting exactly:
  - `USD`
  - `ILS`
  - `GBP`
  - `EURO`
- Maintaining two versions of `db.js`:
  - A module-compatible version for the application.
  - A standalone Vanilla JavaScript version for grading/testing.
- Deploying the project to a web server.
- Supporting the latest version of Google Chrome.

---

# 2. Project-Wide Development Principles

## Git / GitHub

The GitHub repository will serve as the project's source of truth.

Every meaningful change should follow this workflow:

```text
Requirement
    ↓
GitHub Issue
    ↓
Feature Branch
    ↓
Implementation
    ↓
Tests / Lint / Build
    ↓
Pull Request
    ↓
Review
    ↓
Merge to main
```

Development should not be performed directly on `main`.

Suggested branch names:

```text
docs/project-foundation
feature/db-library
feature/add-cost
feature/exchange-rates
feature/monthly-report
feature/pie-chart
feature/yearly-bar-chart
feature/settings
test/db-library
chore/deployment
```

---

## Working With Codex

Codex will be the primary implementation tool.

Before working on a task, it should read at least:

```text
AGENTS.md
intent.txt
docs/REQUIREMENTS.md
docs/ARCHITECTURE.md
docs/TEST_PLAN.md
```

Codex should receive small, well-scoped tasks.

Avoid:

```text
Build the entire project.
```

Prefer:

```text
Implement GitHub Issue #12 only.
Follow AGENTS.md.
Do not modify unrelated files.
Run tests, lint and the production build before finishing.
```

---

## Working With Claude Code

Claude Code will mainly be used for:

- Code review.
- Architecture review.
- Debugging.
- Second opinions.
- Edge-case discovery.
- Pull Request review.
- Requirement-compliance review.

Codex and Claude Code should not modify the same branch at the same time.

Recommended workflow:

```text
Codex implements
      ↓
Commit
      ↓
Claude reviews
      ↓
Fixes
      ↓
Tests
      ↓
Pull Request
```

---

# 3. Planned Documentation Structure

```text
/
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
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/
│
├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── lib/
│   ├── utils/
│   ├── App.jsx
│   └── main.jsx
│
├── vanilla/
│   ├── db.js
│   └── db-test.html
│
├── tests/
├── public/
├── package.json
└── .gitignore
```

The final structure may evolve during development, but official requirements and required public APIs must not be changed.

---

# 4. Milestone 0 — Project Foundation

## Goal

Establish the complete project foundation before implementing features.

## Tasks

- [ ] Review the complete official specification.
- [ ] Create `docs/REQUIREMENTS.md`.
- [ ] Assign an ID to each requirement, such as `R-001`.
- [ ] Create `intent.txt`.
- [ ] Create `AGENTS.md` for Codex.
- [ ] Create `CLAUDE.md`.
- [ ] Create `docs/ARCHITECTURE.md`.
- [ ] Create `docs/PROJECT_ROADMAP_EN.md` and `docs/PROJECT_ROADMAP_HE.md`.
- [ ] Create `docs/TEST_PLAN.md`.
- [ ] Create `docs/SUBMISSION_CHECKLIST.md`.
- [ ] Create `.gitignore`.
- [ ] Create the GitHub repository.
- [ ] Add the teammate.
- [ ] Configure `main`.
- [ ] Create initial GitHub Issues.
- [ ] Create a Pull Request template.
- [ ] Define commit and branch naming conventions.
- [ ] Verify that the working tree is clean.

## Definition of Done

- [ ] All official requirements are documented.
- [ ] The repository exists on GitHub.
- [ ] Team members have access.
- [ ] Codex and Claude instructions exist.
- [ ] No uncontrolled feature work has started.
- [ ] A clean initial commit exists.

Suggested commit:

```text
chore: initialize Cost Manager project
```

---

# 5. Milestone 1 — Application Skeleton

## Goal

Create the application shell and development environment.

## Recommended Stack

```text
React
Vite
JavaScript / JSX
MUI
Chart.js
Vitest
ESLint
```

> React/MUI is an architectural choice. The official requirements also allow a Vanilla JavaScript implementation.

## Tasks

- [ ] Create the Vite project.
- [ ] Install React.
- [ ] Install MUI.
- [ ] Install the chart library.
- [ ] Configure ESLint.
- [ ] Configure the test runner.
- [ ] Create the base layout.
- [ ] Create navigation.
- [ ] Create empty pages:
  - [ ] Dashboard
  - [ ] Add Cost
  - [ ] Monthly Report
  - [ ] Charts
  - [ ] Settings
- [ ] Keep the UI in English.
- [ ] Verify the application in Chrome.
- [ ] Run the initial production build.

## Definition of Done

```text
npm install       ✅
npm run dev       ✅
npm run lint      ✅
npm test          ✅
npm run build     ✅
```

---

# 6. Milestone 2 — Core `db.js` Library

## Goal

Implement the application's core persistence layer.

This is one of the most important milestones in the entire project.

## Required API

```javascript
db.openCostsDB(databaseName, databaseVersion)
```

The method returns an object representing the database.

That object must expose:

```javascript
ob.addCost(cost)
ob.getReport(currency, year, month)
```

## `openCostsDB`

- [ ] Accepts `databaseName` as a string.
- [ ] Accepts `databaseVersion` as a number.
- [ ] Returns a database object.
- [ ] Uses `localStorage`.

## `addCost`

Input:

```javascript
{
  sum,
  currency,
  category,
  description
}
```

Persist:

- [ ] sum.
- [ ] currency.
- [ ] category.
- [ ] description.
- [ ] date of creation.
- [ ] original currency.

Adding a new item must not overwrite existing items.

## `getReport`

Supports:

```javascript
ob.getReport("USD", 2026, 8)
```

and:

```javascript
ob.getReport("USD")
```

If year and month are omitted, the current month and year must be used.

## Definition of Done

- [ ] Data is stored in `localStorage`.
- [ ] Refresh does not erase data.
- [ ] `addCost()` works.
- [ ] `getReport()` works.
- [ ] Current month/year defaults work.
- [ ] The implementation is independent from the UI.

---

# 7. Milestone 3 — Vanilla `db.js`

## Goal

Create the standalone library version used by the grader.

## Critical Requirement

Loading:

```html
<script src="db.js"></script>
```

must expose:

```javascript
db
```

on the global object.

The following must work:

```javascript
const ob = db.openCostsDB("costsdb", 1);
ob.addCost(...);
ob.getReport("USD");
```

## Tasks

- [ ] Create `vanilla/db.js`.
- [ ] No imports.
- [ ] No React dependency.
- [ ] No bundler dependency.
- [ ] Expose `db` globally.
- [ ] Create `vanilla/db-test.html`.
- [ ] Copy the official sample test into the project.
- [ ] Test in Chrome.
- [ ] Verify Console output.

## Contract That Must Not Be Broken

```text
db
 └── openCostsDB()
      └── database object
           ├── addCost()
           └── getReport()
```

Do not move `getReport()` to `db.getReport()` if that breaks the required contract.

---

# 8. Milestone 4 — Add Cost Feature

## Goal

Allow users to add a new expense.

## Fields

- [ ] Sum.
- [ ] Currency.
- [ ] Category.
- [ ] Description.

Supported currencies:

```text
USD
ILS
GBP
EURO
```

## Date

The user does not manually enter the date.

The application assigns the date when the cost is added.

## Recommended Validation

- [ ] sum is numeric.
- [ ] sum is greater than zero.
- [ ] currency is supported.
- [ ] category is not empty.
- [ ] description is not empty.
- [ ] clear success feedback.
- [ ] clear error feedback.

## Definition of Done

- [ ] A cost can be added.
- [ ] The cost appears in `localStorage`.
- [ ] Original currency is preserved.
- [ ] Date is preserved.
- [ ] Refresh preserves the cost.

---

# 9. Milestone 5 — Exchange Rates Infrastructure

## Goal

Support exchange rates through the `Fetch API`.

## Required JSON Shape

The application must support data shaped like:

```json
{
  "USD": 1,
  "GBP": 0.6,
  "EURO": 0.7,
  "ILS": 3.4
}
```

## Tasks

- [ ] Create an exchange-rate JSON file.
- [ ] Deploy it to an Internet-accessible server.
- [ ] Define a default exchange-rates URL.
- [ ] Implement `fetch`.
- [ ] Validate the response.
- [ ] Handle network failures.
- [ ] Preserve relevant rate information if needed.
- [ ] Ensure the app works even when the user has not configured a custom URL.

## Conversion Formula

When rates represent currency values relative to USD:

```javascript
convertedAmount =
  amount / rates[sourceCurrency] * rates[targetCurrency];
```

## Tests

- [ ] USD → ILS.
- [ ] ILS → USD.
- [ ] GBP → EURO.
- [ ] USD → USD.
- [ ] unsupported currency.
- [ ] malformed rate response.

---

# 10. Milestone 6 — Monthly Report

## Goal

Generate a detailed report for a selected month and year.

## Input

- [ ] Month.
- [ ] Year.
- [ ] Currency.

## Output

- [ ] Year.
- [ ] Month.
- [ ] List of costs.
- [ ] Total.
- [ ] Total currency.

The report structure should follow the required contract.

## Architectural Rule

The UI should not reimplement report business logic.

```text
UI
 ↓
db.js
 ↓
localStorage
```

`db.js` remains the source of truth.

## Tests

- [ ] Month containing costs.
- [ ] Month with no costs.
- [ ] Multiple original currencies.
- [ ] Current month/year.
- [ ] Explicit month/year.
- [ ] Total conversion.

---

# 11. Milestone 7 — Pie Chart

## Goal

Display monthly costs grouped by category.

## Selection

- [ ] Month.
- [ ] Year.
- [ ] Currency.

## Logic

```text
Costs for month
      ↓
Convert to selected currency
      ↓
Group by category
      ↓
Sum
      ↓
Pie Chart
```

## Tests

- [ ] One category.
- [ ] Multiple categories.
- [ ] Mixed currencies.
- [ ] No costs.
- [ ] Changing the selected currency updates the chart.

---

# 12. Milestone 8 — Yearly Bar Chart

## Goal

Display total costs for each of the twelve months in a selected year.

## Selection

- [ ] Year.
- [ ] Currency.

## Output

Always include:

```text
Jan
Feb
Mar
Apr
May
Jun
Jul
Aug
Sep
Oct
Nov
Dec
```

A month with no costs must still appear with:

```text
0
```

## Tests

- [ ] Exactly twelve months.
- [ ] Month with no costs.
- [ ] Year with no costs.
- [ ] Mixed currencies.
- [ ] Currency conversion.
- [ ] Changing year updates the chart.

---

# 13. Milestone 9 — Settings

## Goal

Allow the user to configure the exchange-rates URL.

## Features

- [ ] Exchange Rates URL.
- [ ] Save.
- [ ] Load saved value.
- [ ] Reset to default.
- [ ] Test URL.
- [ ] Handle invalid URLs.
- [ ] Fall back to the default URL.

## Requirement

The application must be able to retrieve exchange rates from a default URL even if the user has never configured anything in Settings.

---

# 13.5. Milestone 9.5 — Cost Maintenance and Reporting Extensions

## Goal

Add team-approved extensions after the official core features are functional,
without changing the protected course `db.js` contract.

## 9.5A — Cost Data & CRUD Foundation

- GitHub Issue: [#24](https://github.com/Shlomi-Hazan/cost-manager-front-end/issues/24)
- Add generated stable cost IDs.
- Store cost day/month/year/hour/minute for new application costs.
- Add module and Vanilla CRUD methods:
  - `getAllCosts()`
  - `getCostById(id)`
  - `updateCost(id, cost)`
  - `deleteCost(id)`
- Move the React application cost namespace to database version 2.
- Add Reports navigation with Monthly and Yearly tabs.
- Keep Yearly Report as a placeholder.

## 9.5B — Manage Costs UI

- GitHub Issue: [#25](https://github.com/Shlomi-Hazan/cost-manager-front-end/issues/25)
- Add a Manage Costs section for saved cost maintenance.
- Allow full editing of:
  - sum,
  - currency,
  - category,
  - description,
  - date,
  - time.
- Support cost deletion by stable ID.
- Show a confirmation step before destructive deletion.
- Preserve the existing category autocomplete/free-text behavior for editing.

## 9.5C — Detailed Yearly Report

- GitHub Issue: [#26](https://github.com/Shlomi-Hazan/cost-manager-front-end/issues/26)
- Implement a detailed Yearly Report.
- Let the user select year and currency.
- Display full yearly rows.
- Display the yearly converted total in the selected currency.
- Add Time display to Monthly Report rows.
- Add Date + Time display to Yearly Report rows.

## 9.5D — Sortable Reports

- GitHub Issue: [#27](https://github.com/Shlomi-Hazan/cost-manager-front-end/issues/27)
- Add clickable table headers to Monthly and Yearly reports.
- Support ascending and descending order.
- Show an arrow indicator for the active sort.
- Sort Date/Time chronologically.
- Sort Description, Category, and Currency alphabetically.
- Sort Sum numerically.
- Use a shared sorting implementation across report tables.

## 9.5E — Excel/PDF Export

- GitHub Issue: [#28](https://github.com/Shlomi-Hazan/cost-manager-front-end/issues/28)
- Export Monthly Report to XLSX.
- Export Monthly Report to PDF.
- Export Yearly Report to XLSX.
- Export Yearly Report to PDF.
- Export Pie Chart data to Excel.
- Export Pie Chart visualization/data to PDF.
- Export Bar Chart data to Excel.
- Export Bar Chart visualization/data to PDF.

---

# 14. Milestone 10 — UI/UX Polish

## Goal

Polish the interface only after functional requirements are working.

## Tasks

- [ ] typography.
- [ ] spacing.
- [ ] consistent MUI components.
- [ ] forms.
- [ ] loading states.
- [ ] error states.
- [ ] empty states.
- [ ] chart labels.
- [ ] desktop layout.
- [ ] Chrome compatibility.
- [ ] basic keyboard usability.
- [ ] consistency across pages.

Do not add unnecessary “wow” features that could put course requirements at risk.

---

# 15. Milestone 11 — Automated Testing & QA

## Goal

Perform full system verification before deployment.

## Unit Tests

- [ ] currency conversion.
- [ ] addCost.
- [ ] getReport.
- [ ] date defaults.
- [ ] category aggregation.
- [ ] yearly aggregation.

## Vanilla DB Test

- [ ] Open `db-test.html`.
- [ ] Test using the official sample.
- [ ] Run in Chrome.
- [ ] No exception.
- [ ] `total` exists.
- [ ] `addCost()` returns a result.

## Manual QA Matrix

| Scenario | Expected |
|---|---|
| Add USD cost | Saved |
| Add GBP cost | Saved with GBP |
| Refresh | Data remains |
| Monthly report | Correct costs |
| Month without costs | Empty/zero result |
| Pie chart | Correct categories |
| Bar chart | 12 months |
| Change currency | Converted values |
| Custom rates URL | Used |
| No custom URL | Default URL used |
| Invalid URL | Graceful error/fallback |
| Latest Chrome | Works |
| Production build | Works |

---

# 16. Milestone 12 — GitHub Actions / CI

## Goal

Automatically validate every Pull Request.

Recommended pipeline:

```text
Pull Request
    ↓
npm ci
    ↓
npm run lint
    ↓
npm test
    ↓
npm run build
```

## Definition of Done

Do not merge when:

```text
lint ❌
tests ❌
build ❌
```

Ready to merge when:

```text
lint ✅
tests ✅
build ✅
review ✅
```

---

# 17. Milestone 13 — Deployment

## Goal

Deploy the application to an Internet-connected web server.

A service such as Render or another suitable web-hosting platform may be used.

## Tasks

- [ ] Create the production build.
- [ ] Connect deployment to GitHub.
- [ ] Deploy.
- [ ] Record the Production URL.
- [ ] Test page refresh.
- [ ] Test routes.
- [ ] Test `localStorage`.
- [ ] Test `Fetch`.
- [ ] Test the exchange-rates server.
- [ ] Run a Chrome smoke test.

## Production Checklist

```text
Application loads              ✅
Add cost works                 ✅
localStorage works             ✅
Monthly report works           ✅
Pie chart works                ✅
Bar chart works                ✅
Settings URL works             ✅
Default exchange URL works     ✅
No console-blocking errors     ✅
```

---

# 18. Milestone 14 — Documentation & Teamwork Evidence

## Goal

Preserve clear evidence of the development and collaboration process.

## GitHub Evidence

Maintain:

- [ ] Issues.
- [ ] Branches.
- [ ] Commits.
- [ ] Pull Requests.
- [ ] Reviews.
- [ ] Comments.
- [ ] Assignments.
- [ ] Project board, if used.

## Collaborative Tools

The final submission requires a short summary describing the use of at least two collaborative tools.

Track during the project:

```text
Tool
Who used it
What it was used for
Examples
```

Do not wait until the final day to reconstruct collaboration history.

---

# 19. Milestone 15 — Final Requirement Audit

## Goal

Verify each official requirement against the actual implementation.

Suggested matrix:

| Requirement | Implementation | Test | Status |
|---|---|---|---|
| R-001 | ... | ... | ✅ |
| R-002 | ... | ... | ✅ |
| R-003 | ... | ... | ✅ |

## Audit Sources

```text
Official specification
        ↓
REQUIREMENTS.md
        ↓
Repository
        ↓
Tests
        ↓
Production
```

A requirement is not complete just because code appears to implement it.

It must be verified.

---

# 20. Milestone 16 — Submission Package

## Goal

Prepare exactly the files required for Moodle submission.

## Moodle Submission

Submit **exactly three files**:

```text
1. project.zip
2. firstname_lastname.pdf
3. db.js
```

The separately submitted `db.js` must be:

```text
Vanilla Version
```

## ZIP Preparation

Before creating the ZIP:

- [ ] Remove `node_modules`.
- [ ] Verify that all source code is included.
- [ ] Verify that `package.json` is included.
- [ ] Verify that no secrets are included.
- [ ] Verify that a fresh install is possible.

---

# 21. Milestone 17 — Submission PDF

## Goal

Create the source-code PDF according to the course instructions.

At the beginning of the PDF:

- [ ] Team manager's first and last name.
- [ ] For every team member:
  - [ ] First Name.
  - [ ] Last Name.
  - [ ] ID.
  - [ ] Mobile Number.
  - [ ] Email Address.
- [ ] Clickable video link.
- [ ] Additional relevant comments, if needed.
- [ ] A summary of no more than 100 words describing the use of at least two collaborative tools.

Then include:

- [ ] The name of every code file.
- [ ] The code of that file.
- [ ] No problematic line wrapping.
- [ ] Clear organization for code review.

Filename format:

```text
firstname_lastname.pdf
```

lowercase, using `_` between first and last name.

---

# 22. Milestone 18 — Demo Video

## Goal

Create a short video demonstrating that the project works.

## Requirements

- [ ] Approximately 60 seconds or less.
- [ ] Upload to YouTube.
- [ ] Visibility: Unlisted.
- [ ] Verify that the link works.
- [ ] Include the link in the PDF.

## Suggested Demo Flow

```text
Open application
      ↓
Add cost
      ↓
Show monthly report
      ↓
Show pie chart
      ↓
Show yearly chart
      ↓
Show settings / currency conversion
```

---

# 23. Milestone 19 — Final Submission Audit

## Goal

Perform the final verification before Moodle submission.

### Repository

- [ ] `main` is clean.
- [ ] All relevant PRs are merged.
- [ ] No uncommitted changes.
- [ ] Tests pass.
- [ ] Lint passes.
- [ ] Build passes.

### Vanilla `db.js`

- [ ] Standalone.
- [ ] Global `db`.
- [ ] Official sample test passes.
- [ ] `ob.addCost()`.
- [ ] `ob.getReport()`.

### Production

- [ ] URL works.
- [ ] Chrome works.
- [ ] Fetch works.
- [ ] Default rates work.
- [ ] Custom rates URL works.

### Submission

- [ ] ZIP.
- [ ] PDF.
- [ ] Vanilla `db.js`.
- [ ] Exactly three files.
- [ ] YouTube link inside PDF.
- [ ] No `node_modules`.
- [ ] Correct filenames.

---

# 24. Milestone 20 — Submit

## Before Pressing Submit

- [ ] Download the three final files again and open them.
- [ ] Open the ZIP and verify integrity.
- [ ] Open the PDF and verify links.
- [ ] Open `db.js`.
- [ ] Confirm it is the Vanilla version.
- [ ] Recheck the Production URL.
- [ ] Recheck the YouTube link.
- [ ] Submit only from the team manager's account.

According to the course instructions, treat the Moodle deadline as if it were approximately 30 minutes earlier than displayed.

---

# 25. Project-Wide Definition of Done

The project is complete only when all of the following are satisfied:

```text
Official requirements satisfied            ✅
Requirement audit complete                  ✅
Vanilla db.js contract verified             ✅
localStorage verified                       ✅
Exchange-rate fetch verified                ✅
Monthly report verified                     ✅
Pie chart verified                          ✅
12-month bar chart verified                 ✅
Settings URL verified                       ✅
Default exchange-rate URL verified          ✅
Tests pass                                  ✅
Lint passes                                 ✅
Production build passes                     ✅
Chrome production smoke test passes         ✅
Git/GitHub history documented               ✅
Teamwork evidence documented                ✅
Deployment live                             ✅
Video ready                                 ✅
Submission PDF ready                        ✅
ZIP ready without node_modules              ✅
Exactly three Moodle files ready            ✅
```

---

# 26. Core Development Rule

At every stage:

```text
Requirement
     ↓
Plan
     ↓
Issue
     ↓
Implementation
     ↓
Test
     ↓
Review
     ↓
Merge
     ↓
Audit
```

The objective is not only to create a website that works.

The project should also be:

- compliant with the official requirements,
- testable,
- documented,
- maintainable,
- organized,
- supported by a clear Git/GitHub history,
- and ready for submission without last-minute reconstruction.

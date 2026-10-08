# Cost Manager Front-End — Official Requirements Register

> **Purpose:** This file converts the official course specification into a traceable requirements register for development, testing, GitHub Issues, Pull Requests, and the final audit.
>
> **Source of truth:** `fed_hit_final_project_202607.pdf`
>
> **Important:** In the official document, **“should” means “must.”** Requirements in this file marked **Mandatory** therefore must be treated as compulsory.
>
> **Status convention:** All requirements start as `NOT STARTED`. A requirement may be changed to `IN PROGRESS`, `IMPLEMENTED`, and finally `VERIFIED` only after it has been tested against the official requirement.

---

# 1. Requirement Status Legend

| Status | Meaning |
|---|---|
| `NOT STARTED` | No implementation has started |
| `IN PROGRESS` | Work is currently being performed |
| `IMPLEMENTED` | Code exists, but final verification is still required |
| `VERIFIED` | Requirement was implemented and explicitly tested |
| `BLOCKED` | Cannot be completed until a clarification/dependency is resolved |

---

# 2. Document Governance

## R-001 — “Should” Means “Must”

- **Type:** Mandatory
- **Status:** `VERIFIED`
- Every use of the word **should** in the official project document must be interpreted as **must**.
- Requirements described using “should” are not recommendations.

### Verification

- [x] All requirements in this register have been reviewed using this interpretation.

---

## R-002 — Monitor Official Clarifications

- **Type:** Mandatory process requirement
- **Status:** `BLOCKED`
- **Readiness: PENDING EXTERNAL VERIFICATION — does not block beginning
  Stage B, but must be completed before final submission.** The updated
  official course PDF supplied by the team has been reviewed, confirming
  two relevant changes: (1) August 18 — `db.getReport("USD")` corrected to
  `ob.getReport("USD")`, already reflected in R-066; (2) August 26 — the
  source-code PDF scope narrowed from "all code files that you coded" to
  "all code files (JavaScript only) that you coded" (see §18.2, the
  PDF-scope inventory). What remains open is the requirement's own
  ongoing/final clause: a last course-forum/newest-clarification check
  immediately before submission has not yet happened, since submission has
  not happened yet.
- **Update (2026-09-02):** a newer official course PDF was supplied and
  reviewed, confirming two further changes: (3) August 31 — the Google Form
  URL (`https://forms.gle/peUFmhqbiRi2ND4s6`) for submitting the final
  project URL was added to the document; (4) September 2, 16:34 — "Make
  sure the comments are in English." was added to the document's Style
  Guide section. The same document also confirms that the Style Guide
  section names and directly links a specific book, **"The Professional
  JavaScript Style Guide" by Haim Michael** — this is not merely a
  course-referenced style, it is the literal mandatory source; see R-120.
- The official specification may receive clarifications before the deadline.
- Changes are expected to be listed at the bottom of the official document.
- The course forum should be followed to verify interpretations and clarifications.

### Verification

- [x] Updated/current supplied specification reviewed (2026-08-29) — August 18 and August 26 changes confirmed.
- [x] Newest supplied specification reviewed (2026-09-02) — August 31 and September 2 changes confirmed; official Style Guide book identified and read in full (see R-120).
- [ ] Final relevant course-forum / newest-clarification re-check performed immediately before submission.
- [ ] Relevant course-forum clarifications reviewed before submission.

---

# 3. General Application Requirements

## R-010 — Application Type

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The project must implement the **front end of a Cost Manager website/application**.

### Verification

- [x] Application functions as a client-side Cost Manager.

---

## R-011 — UI Language

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The user interface must be in **English**.

### Verification

- [x] All user-facing application UI is in English.

---

## R-012 — Main Currency

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The application's main currency must be **USD**.

### Verification

- [x] USD is treated as the main/base currency where required by the specification.

---

## R-013 — Required Web Technologies

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The application must be developed using:
  - JavaScript
  - HTML
  - CSS

### Notes

React is explicitly permitted by the specification, but it does not replace the requirement that the application is ultimately implemented using JavaScript/HTML/CSS technologies.

### Verification

- [x] Project uses JavaScript.
- [x] Project produces HTML.
- [x] Project uses CSS/styling.

---

# 4. Storage Requirements

## R-020 — Local Storage

- **Type:** Mandatory
- **Status:** `VERIFIED`
- Application data must be stored in **localStorage**.

### Verification

- [x] Added costs are persisted in localStorage.
- [x] Data survives a page refresh in the same browser/origin.

---

## R-021 — `db.js` Storage Wrapper

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The project must include a separate `db.js` library that wraps the use of localStorage.

### Verification

- [x] Data access is exposed through the required `db.js` library.
- [x] Required `db.js` public API works independently from the UI.

---

# 5. Cost Item Requirements

## R-030 — Add New Cost

- **Type:** Mandatory
- **Status:** `VERIFIED`
- Users must be able to add new cost items.

### Verification

- [x] Add Cost flow exists and works.

---

## R-031 — Cost Sum

- **Type:** Mandatory
- **Status:** `VERIFIED`
- Every new cost item must include a `sum`.
- `sum` is specified as a **number** in the `db.js` API.

### Verification

- [x] Cost object contains numeric `sum`.

---

## R-032 — Cost Currency

- **Type:** Mandatory
- **Status:** `VERIFIED`
- Every new cost item must include a `currency`.
- `currency` is specified as a **string** in the `db.js` API.

### Verification

- [x] Cost object contains `currency`.

---

## R-033 — Cost Category

- **Type:** Mandatory
- **Status:** `VERIFIED`
- Every new cost item must include a `category`.
- `category` is specified as a **string** in the `db.js` API.

### Verification

- [x] Cost object contains `category`.

---

## R-034 — Cost Description

- **Type:** Mandatory
- **Status:** `VERIFIED`
- Every new cost item must include a `description`.
- `description` is specified as a **string** in the `db.js` API.

### Verification

- [x] Cost object contains `description`.

---

## R-035 — Automatic Cost Date

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The date attached to a cost item must be the date on which that cost item was added.

### Verification

- [x] Added cost receives its date automatically.
- [x] Date corresponds to the date the cost was added.

---

## R-036 — Preserve Original Currency

- **Type:** Mandatory
- **Status:** `VERIFIED`
- Each stored cost item must preserve the currency in which it was originally added.
- Currency conversion for reports/charts must not overwrite the stored original currency.

### Verification

- [x] Original currency remains unchanged in localStorage after conversions/reports/charts.

---

# 6. Supported Currencies

## R-040 — Exact Supported Currency Identifiers

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The supported currencies are exactly:

```text
USD
ILS
GBP
EURO
```

- The specification explicitly says these four values should also be the symbols/identifiers used by the code.

### Verification

- [x] USD supported.
- [x] ILS supported.
- [x] GBP supported.
- [x] EURO supported.
- [x] Required code paths use these identifiers.

---

# 7. Detailed Monthly Report

## R-050 — Detailed Report

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The user must be able to request a detailed report for a specific month and year.

### Verification

- [x] User can select/request a month.
- [x] User can select/request a year.
- [x] Detailed report is returned/displayed.

---

## R-051 — Report Currency Selection

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The user must be able to request the report in a selected currency.

### Verification

- [x] Report accepts a target currency.
- [x] Report total is represented in the selected currency.

---

## R-052 — Report Defaults to Current Month and Year

- **Type:** Mandatory
- **Status:** `VERIFIED`
- When `getReport` is called without year and month, the report must be generated for the **current month and current year**.

### Required compatibility example

```javascript
const data = ob.getReport("USD");
```

### Verification

- [x] Omitting year/month selects the current year/month.

---

## R-053 — Required Report Object Shape

- **Type:** Mandatory
- **Status:** `VERIFIED`
- `getReport(currency, year, month)` must return an object representing the report.
- The official example contains:

```javascript
{
  year: 2025,
  month: 9,
  costs: [
    {
      sum: 200,
      currency: "USD",
      category: "Food",
      description: "Milk 3%",
      date: { day: 12 }
    },
    {
      sum: 120,
      currency: "GBP",
      category: "Education",
      description: "Zooom License",
      date: { day: 18 }
    }
  ],
  total: {
    currency: "USD",
    sum: 440
  }
}
```

### Verification

- [x] Returned object contains `year`.
- [x] Returned object contains `month`.
- [x] Returned object contains `costs`.
- [x] Returned object contains `total`.
- [x] `total` contains `currency`.
- [x] `total` contains `sum`.

### Important

The example is preserved here as given by the course specification. Ambiguities around whether individual report-item sums must be converted are tracked separately under **Open Clarifications** instead of being silently interpreted.

---

# 8. `db.js` Library Requirements

## R-060 — Two Versions of `db.js`

- **Type:** Mandatory
- **Status:** `VERIFIED`
- Two versions of `db.js` must be developed:
  1. A version compatible with modules/React.
  2. A simple Vanilla JavaScript version for automatic testing.

### Verification

- [x] Module-compatible version exists.
- [x] Vanilla version exists.
- [x] Both expose equivalent required behavior.

---

## R-061 — Submitted Standalone `db.js` Must Be Vanilla

- **Type:** Mandatory
- **Status:** `BLOCKED`
- **Readiness: PENDING FINAL ARTIFACT.** The source candidate (`vanilla/db.js`
  on `main`, post PR #41 comments) is fully verified — see R-062 to R-066 and
  the official Vanilla sample test. The exact file copy that will be
  uploaded to Moodle does not exist yet and must be re-tested once produced,
  per §15 of `docs/SUBMISSION_CHECKLIST.md`.
- The `db.js` file submitted **separately from the ZIP** must be the **Vanilla JavaScript version**.

### Verification

- [ ] Final separately submitted `db.js` is the Vanilla version.

---

## R-062 — Vanilla `db` Must Be Global

- **Type:** Mandatory
- **Status:** `VERIFIED`
- When the Vanilla library is loaded with:

```html
<script src="db.js"></script>
```

a property named:

```javascript
db
```

must be added to the global object.

### Verification

- [x] `db` is accessible after loading `db.js` via a normal script element.

---

## R-063 — `openCostsDB(databaseName, databaseVersion)`

- **Type:** Mandatory
- **Status:** `VERIFIED`

Required signature:

```javascript
db.openCostsDB(databaseName, databaseVersion)
```

Requirements:

- `databaseName` is a string.
- `databaseVersion` is a number.
- The method returns a reference to an object representing the database.

### Verification

- [x] Required signature exists.
- [x] Returns a database object/reference.
- [x] Official sample call succeeds.

---

## R-064 — `addCost(cost)`

- **Type:** Mandatory
- **Status:** `VERIFIED`

The database object returned by `openCostsDB` must provide:

```javascript
ob.addCost(cost)
```

Input object properties:

```javascript
{
  sum: Number,
  currency: String,
  category: String,
  description: String
}
```

The method must return an object representing the newly added cost item.

The official specification explicitly names the returned object's properties as:

- `sum`
- `currency`
- `category`
- `description`

### Verification

- [x] Method exists on the database object.
- [x] Official sample cost can be added.
- [x] Returned value is truthy/object-like as required by the official sample.
- [x] Returned object contains the specified properties.

---

## R-065 — `getReport(currency, year, month)`

- **Type:** Mandatory
- **Status:** `VERIFIED`

The database object returned by `openCostsDB` must provide:

```javascript
ob.getReport(currency, year, month)
```

Arguments described by the specification:

- `currency` — string.
- `year` — number.
- `month` — number.

If `year` and `month` are omitted, current year/month must be used.

### Verification

- [x] Method exists on the database object.
- [x] `ob.getReport("USD")` works.
- [x] Explicit year/month call works.

---

## R-066 — Required Method Ownership

- **Type:** Mandatory / clarified by document update
- **Status:** `VERIFIED`

The official document was corrected on August 18 from:

```javascript
db.getReport("USD")
```

to:

```javascript
ob.getReport("USD")
```

Therefore `getReport()` is required on the object returned by `openCostsDB()`.

### Verification

- [x] `const ob = db.openCostsDB(...); ob.getReport("USD")` works.

---

## R-067 — Additional `db.js` Functions Are Allowed

- **Type:** Explicitly allowed
- **Status:** `VERIFIED`
- The course Q&A explicitly permits additional functions in `db.js`.
- The required functions must still remain compatible with the documented API.

### Verification

- [x] Any added functions do not break `openCostsDB`, `addCost`, or `getReport`.

---

# 9. Pie Chart Requirements

## R-070 — Monthly Pie Chart

- **Type:** Mandatory
- **Status:** `VERIFIED`
- Users must be able to display a Pie Chart showing total costs for a selected month and year, grouped according to categories.

### Verification

- [x] Month selectable.
- [x] Year selectable.
- [x] Totals grouped by category.
- [x] Pie Chart displayed.

---

## R-071 — Pie Chart Currency Selection

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The user must be able to select the currency in which the Pie Chart is displayed.

### Verification

- [x] Pie Chart supports target currency selection.

---

# 10. Bar Chart Requirements

## R-080 — Yearly Twelve-Month Bar Chart

- **Type:** Mandatory
- **Status:** `VERIFIED`
- Users must be able to display a Bar Chart showing the total costs in each of the twelve months of a selected year.

### Verification

- [x] User can select year.
- [x] Chart represents all twelve months.
- [x] Each month represents total costs for that month.

---

## R-081 — Bar Chart Currency Selection

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The user must be able to select the currency in which the Bar Chart is displayed.

### Verification

- [x] Bar Chart supports target currency selection.

---

# 11. Exchange-Rate Requirements

## R-090 — Retrieve Exchange Rates Using Fetch API

- **Type:** Mandatory
- **Status:** `VERIFIED`
- Exchange rates must be retrieved from a server using the **Fetch API**.

### Verification

- [x] Application performs exchange-rate retrieval via `fetch`.

---

## R-091 — Team-Provided Web-Hosted Rate Source

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The server-side/source for exchange rates must be something developed/provided and deployed by the team on the web.
- The specification states that a simple static JSON file placed on an Internet-connected server is sufficient.

### Verification

- [x] Team-controlled rate source exists on the web.
- [x] Application can fetch it.

---

## R-092 — Default Exchange-Rate Source

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The Cost Manager must be able to retrieve exchange rates from a server using Fetch even when the user does **not** provide a URL through Settings.

### Verification

- [x] Fresh application works without a user-supplied rate URL.
- [x] A default web-hosted rate source is used.

---

## R-093 — Custom Exchange-Rate URL Setting

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The application must include a Settings option allowing the user to specify a URL for retrieving exchange rates.

### Verification

- [x] Settings exposes an exchange-rate URL option.
- [x] Configured URL can be used by the application.

---

## R-094 — Expected Custom Rate JSON Shape

- **Type:** Mandatory compatibility requirement
- **Status:** `VERIFIED`
- The application must support a response shaped as:

```json
{
  "USD": 1,
  "GBP": 0.6,
  "EURO": 0.7,
  "ILS": 3.4
}
```

The official interpretation is:

```text
ILS 3.4 = USD 1
EURO 0.7 = USD 1
GBP 0.6 = USD 1
USD 1 = USD 1
```

### Verification

- [x] Application correctly interprets this data model.

---

## R-095 — CORS Assumption for User-Supplied URL

- **Type:** Allowed assumption
- **Status:** `NOT STARTED`
- The implementation may assume the user-supplied URL returns:

```text
Access-Control-Allow-Origin: *
```

### Verification

- [ ] No non-required workaround is necessary for missing CORS according to the official assumption.

---

# 12. User Interface Requirements

## R-100 — React and MUI Are Permitted

- **Type:** Optional / explicitly allowed
- **Status:** `NOT STARTED`
- The UI **may** be built with React and MUI.
- A Vanilla JavaScript UI is also allowed.

### Project decision

The project architecture may choose React/MUI, but this is a **project decision**, not a mandatory course requirement.

---

## R-101 — Desktop Browser Compatibility

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The UI must be compatible with desktop web browsers.

### Verification

- [x] Desktop layout works correctly.

---

# 13. Deployment Requirements

## R-110 — Web Deployment

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The final project must be deployed on a server connected to the web.
- The document provides Render as an example, not as the only allowed host.

### Verification

- [x] Publicly reachable project URL exists.

---

## R-111 — Latest Google Chrome Compatibility

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The project must work correctly in the latest Google Chrome.
- The official grading will use the latest Google Chrome browser.

### Verification

- [x] Final production smoke test passes in latest Chrome.

---

# 14. JavaScript Code Style Requirements

## R-120 — Professional JavaScript Style Guide

- **Type:** Mandatory
- **Status:** `VERIFIED`
- JavaScript code must follow the guidelines listed in the course-referenced **Professional JavaScript Guide**.
- **Update (2026-09-02):** the actual book — *"The Professional JavaScript
  Style Guide"* by Haim Michael, directly linked from the official course
  PDF (see R-002) — was supplied and read in full (32 pages). The codebase
  was reviewed clause-by-clause against it and against a separate
  course-supplied "common student rejects" reference sheet (COMMENTS,
  CONSTLET, SHAVESHAVE, FUNCTIONNAME/VARIABLENAME, CLASSNAME, FILENAME, and
  others), with the reject sheet taking precedence on any point of conflict
  per team instruction. Concrete changes made:
  - `no-var`, `eqeqeq` (`===`/`!==`), `prefer-const`, `quotes: single`
    (JSX attributes stay double-quoted, the universal convention this book
    also follows), and `semi` were added as enforced ESLint rules
    (`eslint.config.js`) and applied project-wide via `eslint --fix`.
  - `var` (27 occurrences) and `==`/`!=` (3 occurrences) in `vanilla/db.js`
    and `src/utils/chartAggregation.js` were converted by hand first, since
    ESLint's autofix could not safely restructure every declare-then-assign
    pattern.
  - Explanatory `//`/`{/* */}` comments were added throughout the codebase
    so no meaningful stretch of code runs much longer than the book's
    "at least one comment every 7 lines" guidance, without padding
    self-explanatory code purely to hit a count (the book explicitly warns
    against exactly that).
  - JSDoc (`/** @param @returns */`) was added to the required db.js
    contract methods (`openCostsDB`/`addCost`/`getReport`) and its CRUD
    extensions in both `src/lib/db.js` and `vanilla/db.js`, plus the core
    utility/service functions (`currency.js`, `category.js`,
    `amountFormat.js`, `chartPresentation.js`, `chartAggregation.js`,
    `dateTime.js`, `yearlyAggregation.js`, `reportSorting.js`,
    `detailedReportsService.js`, `exchangeRatesService.js`) — see R-122 for
    why this reverses that entry's earlier "no JSDoc" conclusion. JSDoc was
    **not** added to simple React presentational components or trivial
    one-line getters, as a proportionality decision, not an oversight.
  - Comments were confirmed to already be entirely in English project-wide
    (verified by scanning for non-ASCII/Hebrew characters in every
    `src`/`vanilla` source file — none found).
- `npm run lint`, `npm test` (28 files / 334 tests), and `npm run build`
  all pass after these changes; the official Vanilla compatibility sample
  was re-run and still returns `600`.

### Verification

- [x] Code review performed against the applicable course style guidelines, using the actual book content.
- [x] Mechanically-checkable rules (var, equality, const preference, quotes, semicolons) are now enforced by ESLint, not just manually followed.
- [x] Comment density, JSDoc coverage (scoped to db.js + core utilities/services), and English-only comments verified.

---

## R-121 — Code Comments Required

- **Type:** Mandatory
- **Status:** `VERIFIED`
- Comments must be added to the code where appropriate.
- The team additionally reports a verbal lecturer clarification from the last
  lesson: comments are a major grading consideration, and the lecturer
  expects to understand substantial parts of the implementation from the
  comments themselves.
- **Remediation history:** an earlier pass of this audit marked this
  requirement VERIFIED prematurely, before a comprehensive comment pass had
  actually been done — most source files had little or no explanatory
  commenting at that time. This was corrected: [PR #41](https://github.com/Shlomi-Hazan/cost-manager-front-end/pull/41)
  ("docs: add comprehensive explanatory code comments" + a follow-up
  "docs: correct explanatory comment claims") added file-level and
  function-level explanatory comments across all 73 team-authored
  JS/JSX/HTML files, explicitly distinguishing official course requirements
  from TEAM EXTENSIONS, with the highest priority given to `src/lib/db.js`
  and `vanilla/db.js`. It changed zero executable code (verified
  programmatically — every diff line was blank or a comment) and passed
  lint/tests/build and the official Vanilla 600 USD sample. Merged into
  `main` at commit `cd49db6b293f96ce7a93b27e75299ccac6229969`.

### Verification

- [x] Required explanatory comments exist, verified present on current `main` after PR #41.
- [x] **Update (2026-09-02):** comment density reviewed against the official
  Style Guide book's explicit "at least one `//` comment every 7 lines"
  guidance (see R-120) and against a course-supplied common-rejects
  reference sheet's matching COMMENTS rule; gaps closed throughout the
  codebase without padding self-explanatory code with filler comments.
- [x] Comments confirmed to be entirely in English (see R-120; the official
  document added this as an explicit requirement on 2026-09-02).

---

## R-122 — JSDoc for Classes, Constructors, and Functions

- **Type:** Mandatory (superseding an earlier "no JSDoc" conclusion below)
- **Status:** `VERIFIED`
- **Superseded finding (2026-08-29, kept for history):** the team's course
  Q&A was reported to say comments should use `//` or `/* ... */`, and PR #41
  used only those styles, with no JSDoc.
- **Correction (2026-09-02):** the actual official Style Guide book
  ("The Professional JavaScript Style Guide" by Haim Michael — see R-120),
  directly linked from the official course PDF, explicitly states:
  *"Use the JSDoc library for documenting classes, constructors, and
  functions you define,"* with a full worked example. This is now confirmed
  as the literal, mandatory, official source — a stronger authority than
  the earlier team-reported Q&A summary. Per team instruction, a separate
  course-supplied common-rejects reference sheet takes precedence over this
  book on any point where the two conflict — but that sheet's COMMENTS rule
  only describes `//`/`/* */` usage and never mentions JSDoc at all, so
  there is no actual conflict: JSDoc comments are themselves `/** ... */`
  block comments, satisfying the reject sheet's rule while also satisfying
  the book's stricter documentation requirement.
- **What changed:** JSDoc (`@param`/`@returns`/`@throws`) was added to the
  required db.js contract methods and their CRUD extensions in both
  `src/lib/db.js` and `vanilla/db.js`, and to the core utility/service
  functions listed in R-120. It was deliberately **not** added to simple
  React presentational components or trivial one-line getters/helpers —
  the book's own example documents a substantive constructor function with
  real parameters, not every function in a codebase, and its own
  "Discipline of Commenting" chapter explicitly warns against comments that
  "compensate for poor readability" rather than explain genuine intent.
  This scoping is a project decision, recorded here rather than applied
  silently.

### Verification

- [x] JSDoc added to the required db.js contract (`openCostsDB`/`addCost`/`getReport`) and its extensions, in both db.js versions.
- [x] JSDoc added to the core utility/service functions listed in R-120.
- [x] Comments continue to use only `//`, `/* ... */`, and `/** ... */` (JSDoc) — no other comment style was introduced.
- [x] `npm run lint`/`npm test`/`npm run build` and the official Vanilla sample all still pass after this change.

---

# 15. Official Vanilla `db.js` Compatibility Test

## R-130 — Official Sample Must Run Successfully

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The Vanilla `db.js` must work successfully with the official sample test.

Core calls from the sample:

```javascript
const ob = db.openCostsDB("costsdb", 1);

const result1 = ob.addCost({
  sum: 200,
  currency: "USD",
  category: "FOOD",
  description: "pizza"
});

const result2 = ob.addCost({
  sum: 400,
  currency: "USD",
  category: "CAR",
  description: "fuel"
});

const data = ob.getReport("USD");
console.log(data.total.sum);
```

### Verification

- [x] `ob` created.
- [x] First cost added.
- [x] Second cost added.
- [x] `ob.getReport("USD")` returns an object.
- [x] `data.total.sum` is accessible.
- [x] No exception is thrown.

---

## R-131 — Grader May Use Different Test Code

- **Type:** Mandatory compatibility consideration
- **Status:** `VERIFIED`
- The official sample is only an example.
- The grading process may use different test code.
- Implementation must therefore follow the documented API contract rather than only hard-code behavior for the sample.

### Verification

- [x] Unit/contract tests cover behavior beyond the exact sample values.

---

# 16. Submission Requirements

## R-140 — Demo Video

- **Type:** Mandatory
- **Status:** `BLOCKED`
- **Readiness: PENDING FINAL ARTIFACT** — not a defect; the video is
  intentionally not created at this audit stage.
- Create a short video showing how the project runs.
- The document says to try to keep it up to approximately **60 seconds**.
- Upload it to YouTube as **Unlisted**.

### Verification

- [ ] Video created.
- [ ] Video uploaded as Unlisted.
- [ ] Link works.

---

## R-141 — Exactly Three Moodle Files

- **Type:** Mandatory
- **Status:** `BLOCKED`
- **Readiness: PENDING FINAL ARTIFACT** — none of the three files exist yet;
  this is expected at this stage, not a defect.
- The submission must consist of **three files**:

```text
1. Project ZIP
2. Source-code PDF
3. Vanilla db.js
```

- Uploading one ZIP containing everything does not satisfy the requirement.

### Verification

- [ ] Exactly three required files prepared separately.

---

## R-142 — Remove `node_modules` Before ZIP

- **Type:** Mandatory
- **Status:** `BLOCKED`
- **Readiness: PENDING FINAL ARTIFACT** — the ZIP does not exist yet; the
  exclusion plan is already confirmed against `.gitignore` (`node_modules`,
  `dist`, caches, OS/IDE files are all excluded from version control).
- `node_modules` must be deleted/excluded before creating the project ZIP.

### Verification

- [ ] ZIP does not contain `node_modules`.

---

## R-143 — Source-Code PDF

- **Type:** Mandatory
- **Status:** `BLOCKED`
- **Readiness: PENDING FINAL ARTIFACT** — not created yet in this audit, as
  instructed. Preconditions are now in place: comprehensive comments exist
  (R-121, PR #41) and must be preserved verbatim in the PDF (not
  stripped/minified/regenerated); see the PDF-scope inventory in §18.2.
- **Official written rule (updated PDF, August 26):** "all code files
  (**JavaScript only**) that you coded." `.jsx` counts as JavaScript.
- **Separate team-reported lecturer/submission clarification:** the PDF's
  code section should contain the JavaScript/JSX implementing
  **course-required** functionality — not JavaScript that exists solely to
  implement optional team extensions. This narrower practical scope is
  recorded as team-reported, not as literal PDF wording, and does not
  replace or contradict the official "JavaScript only" rule above — see
  §18.2 for the full Include/Exclude/Mixed inventory built from both.
- Create a PDF containing the applicable code files coded by the team.
- The name of each file must appear next to its code.
- Code lines must not be broken in a way that harms review.
- The PDF must be properly organized for code review.

### Verification

- [ ] All required code files included.
- [ ] Each file clearly named.
- [ ] Layout checked for broken/wrapped code lines.

---

## R-144 — PDF Filename

- **Type:** Mandatory
- **Status:** `BLOCKED`
- **Readiness: PENDING FINAL ARTIFACT.** Required metadata input has been
  supplied by the team (see R-145/R-146) — the filename itself is only
  finalized when the PDF is actually generated.
- PDF filename must contain the team manager's first and last name:
  - lowercase only
  - `_` between names

Example:

```text
haim_michael.pdf
```

### Verification

- [ ] Final PDF filename follows required convention.

---

## R-145 — PDF Team Manager Identity

- **Type:** Mandatory
- **Status:** `BLOCKED`
- **Readiness: PENDING FINAL ARTIFACT — metadata input available.** The team
  has supplied the required team-manager name to the team directly. Per
  privacy practice, the actual value is not published in this public
  repository/audit documentation; it belongs only in the final PDF front
  matter, produced in a later artifact-generation stage.
- At the beginning of the PDF, include the first and last name of the development team manager.

---

## R-146 — PDF Team Member Details

- **Type:** Mandatory
- **Status:** `BLOCKED`
- **Readiness: PENDING FINAL ARTIFACT — metadata input available.** The team
  has supplied first/last name, ID, mobile number, and email address for
  both team members. Per privacy practice, none of these values are
  published in this public repository/audit documentation; they belong only
  in the final PDF front matter, produced in a later artifact-generation
  stage.
- For every team member include:
  - First Name
  - Last Name
  - ID
  - Mobile Number
  - Email Address

---

## R-147 — PDF Clickable Video Link

- **Type:** Mandatory
- **Status:** `BLOCKED`
- **Readiness: PENDING FINAL ARTIFACT** — depends on R-140 (video not yet
  created) and R-143 (PDF not yet created).
- The PDF must include a clickable link to the demo video.

---

## R-148 — PDF May Include Additional Notes

- **Type:** Optional / explicitly allowed
- **Status:** `NOT STARTED`
- Additional comments/guidelines may be placed at the beginning of the PDF, similar to traditional `readme.txt` notes.

---

## R-149 — Collaborative Tools Summary

- **Type:** Mandatory
- **Status:** `BLOCKED`
- **Readiness: PENDING FINAL ARTIFACT — content PREPARED, not yet inserted
  into a PDF (which does not exist yet).** The two lecturer-approved
  collaborative tools are GitHub and Discord (Discord team-reported as
  verbally approved in place of Slack — see §18.1). The team supplied
  factual usage details for both, and the following 74-word draft paragraph
  has been prepared from that input:

  > We collaborated as equal partners using GitHub and Discord throughout
  > the project. GitHub was used for feature branches, commits, pull
  > requests, code reviews, approvals, merges, issue tracking, and CI
  > validation. Discord supported our day-to-day coordination through voice
  > calls and messages for task planning and division, feature design,
  > technical decisions, progress updates, debugging, bug discussions,
  > sharing code snippets, screenshots and links, and coordinating
  > pull-request reviews and merges. Both team members contributed
  > throughout development and decision-making.

  Word count verified: 74 words (≤ 100). This paragraph is ready to paste
  into the final PDF once that artifact is produced; it is not itself the
  PDF.
- The PDF must include a summary of the use of **at least two collaborative tools**.
- The summary must be **no more than 100 words**.

### Verification

- [x] At least two collaborative tools covered. (GitHub + Discord.)
- [x] Summary ≤ 100 words. (74 words.)
- [ ] Summary actually inserted into the final PDF. (PDF does not exist yet.)

---

## R-150 — Team Manager Submits

- **Type:** Mandatory
- **Status:** `BLOCKED`
- **Readiness: PENDING FINAL ARTIFACT / future action** — this is a
  submission-time action (Shlomi, as team manager, submits), not something
  verifiable before the final files exist.
- Only the team manager should submit the project to the Moodle assignment box.

---

## R-151 — Treat Moodle Deadline as 30 Minutes Earlier

- **Type:** Mandatory submission precaution stated by course
- **Status:** `BLOCKED`
- **Readiness: PENDING EXTERNAL VERIFICATION.** Official deadline **date**
  confirmed by the team: **05.09.2026**. Official deadline **clock time on
  that date is not yet known** — do not treat this as invented (no time such
  as 23:59/00:00 has been assumed). Team's internal planned submission
  target: **02.09.2026, ~21:00**, several days ahead of the official date.
  The required 30-minute safety buffer cannot be numerically calculated
  until the exact Moodle clock time is supplied; this is a final
  submission-timing input, not a code/audit blocker.
- Because of possible server-time differences, the deadline should be treated as if it were **30 minutes earlier** than the time shown in Moodle.

---

# 17. Team Requirements

## R-160 — Team of Two Students

- **Type:** Mandatory
- **Status:** `VERIFIED`
- The project is intended to be carried out by a team of **two students**.

---

## R-161 — Same Course Group — **NO LONGER A CURRENT MANDATORY REQUIREMENT**

- **Type:** Historical — previous document version only (excluded from the
  current mandatory-requirement denominator)
- **Status:** `VERIFIED` (satisfied regardless, see below)
- Team members must be students from the same group.
- **History (2026-08-29):** the previous official course PDF stated "Teams
  must include students from the same group." The updated official PDF
  supplied by the team no longer contains this sentence in its current
  team/submission section. No reason for its removal is invented here — it
  is simply not present in the current document, so it is not carried
  forward as an active mandatory requirement.
- **Regardless of current-document status:** the team confirms Eldad
  Simanian and Shlomi Hazan are in fact in the same course group, so the
  condition is satisfied either way.

---

## R-162 — Teamwork Assessment

- **Type:** Mandatory grading requirement
- **Status:** `BLOCKED`
- **Readiness: PENDING FINAL ARTIFACT.** The project was developed jointly
  by Eldad Simanian and Shlomi Hazan as **equal contributors/co-developers**
  — not as a main/secondary or senior/subordinate relationship. GitHub
  administrative roles (repository ownership, who requests/approves/merges
  PRs) and the formal "team manager" submission role (R-150) are
  administrative/course-submission mechanics only and must not be read as
  reflecting unequal contribution. Collaboration evidence (GitHub + Discord,
  see §18.1) is preserved and the ≤100-word summary is drafted (R-149); only
  its insertion into the not-yet-created final PDF remains.
- The project includes a **10% teamwork assessment** using collaborative tools presented during the course.

### Verification

- [x] Collaboration evidence preserved during development.
- [x] Required collaborative-tool summary prepared for final PDF. (Drafted, 74 words — see R-149.)
- [ ] Summary actually inserted into the final PDF.

---

# 18. Open Clarifications / Do Not Guess

The following points are **not resolved explicitly enough by the uploaded official document**. They must not be silently converted into “official requirements.”

## OQ-001 — Are Individual Report Cost Sums Converted?

The specification says the report is requested “in a specific currency,” but its example keeps:

```javascript
{
  sum: 120,
  currency: "GBP"
}
```

inside a report whose total is:

```javascript
{
  currency: "USD",
  sum: 440
}
```

### Current safe interpretation

The example appears to preserve original item currency/value while converting the report total, but this is an **interpretation**, not a statement that should be treated as confirmed course policy.

### Action

- [ ] Check course forum / ask instructor before finalizing report semantics.

---

## OQ-002 — Exact Stored/Returned Date Shape — **RESOLVED**

**Status (2026-08-29): RESOLVED — lecturer confirmation reported directly by
the team.** The team reports that the lecturer has confirmed the public
`getReport()` report-item date shape `date: { day: ... }` is correct. This is
recorded as a team-reported lecturer confirmation (not a written
forum/document citation supplied to this audit). The implementation is
unchanged — it already returns exactly `{ day }` from `getReport()` (see
`toReportCost()` in `src/lib/db.js` and `vanilla/db.js`) — so no code change
was required or made.

The specification requires every cost item to receive the date on which it was added.

The report example shows:

```javascript
date: { day: 12 }
```

Internally, the stored date carries additional fields (day/month/year/hour/
minute) to support month/year filtering and the team's own detailed reports;
only `{ day }` is exposed through the required `getReport()` report-item
shape, which the lecturer has now confirmed is correct.

### Action

- [x] Decide an internal representation that supports required month/year filtering.
- [x] Preserve compatibility with the official report shape.
- [x] Ask for clarification if exact returned date structure matters. (Lecturer confirmed `{ day }` is correct — team-reported, 2026-08-29.)

---

## OQ-003 — Fetch Is Asynchronous but Official `getReport` Example Is Synchronous

Exchange rates must be retrieved using Fetch, but the official sample uses:

```javascript
const data = ob.getReport("USD");
```

rather than an awaited Promise.

### Action

- [ ] Design architecture without breaking the synchronous official test contract.
- [ ] Ask instructor/course forum if needed before locking the final implementation.

---

## OQ-004 — Category List

The specification requires a `category` string but does not provide an official fixed list of categories.

### Action

- [ ] Do not claim a fixed category list is required by the specification.
- [ ] Any chosen UI category strategy must remain compatible with arbitrary category strings accepted by the required API unless clarified otherwise.

---

## OQ-005 — Input Validation Rules

The official specification gives input types but does not define detailed UI validation rules such as minimum sum, maximum description length, or permitted category names.

### Action

- [ ] Sensible validation may be added as a project decision.
- [ ] Validation must not make the required API incompatible with the grader.

---

## 18.1 Final Audit Status (Issue #13, Stage A)

### Update — 2026-09-02 (fourth pass — Style Guide book supplied, R-122 corrected)

This section supersedes the third-pass notes below where they conflict.

- A newer official course PDF was supplied, directly naming and linking the
  official Style Guide book ("The Professional JavaScript Style Guide" by
  Haim Michael). See the corrected R-002 and R-120 entries above.
- **R-122 is reclassified from "Clarified by official Q&A" to `Mandatory`**
  — the book's explicit JSDoc requirement is a stronger, directly-supplied
  official source than the earlier team-reported Q&A summary it superseded.
  This **does** change the mandatory-requirement denominator: it now counts
  toward the total (previously excluded as a non-mandatory clarification).
  The denominator is therefore **57**, not 56 (see the third-pass note
  below for the prior count and R-161's separate, still-excluded status).
- Also per this pass: `no-var`, `eqeqeq`, `prefer-const`, `quotes`, and
  `semi` were added as enforced ESLint rules and applied project-wide;
  comment density was reviewed and improved throughout; and comments were
  confirmed to already be entirely in English. See R-120's entry for the
  full list of changes and their justification.

### Update — 2026-08-29 (third pass — corrections after independent review)

This section supersedes the second-pass and first-pass notes below where
they conflict.

- **R-002** is `BLOCKED`, not `VERIFIED` — the updated PDF's content has now
  been confirmed, but the requirement's own final pre-submission
  course-forum/newest-clarification check has not happened yet (submission
  itself hasn't happened). See the corrected R-002 entry above.
- **R-122** is now `VERIFIED` (its type is "Clarified by official Q&A," not
  "Mandatory," so this does not change the mandatory-requirement
  denominator). See its entry.
- **R-161** (same course group) is reclassified as
  **NO LONGER CURRENT REQUIREMENT** and excluded from the current mandatory
  denominator — see its entry for the historical-vs-current explanation.
- The mandatory-requirement denominator is therefore **56**, not 57 — see
  the recalculated counts in this audit's Pull Request description.
- The GitHub collaboration-evidence claim that "Shlomi reviewed and approved
  every PR opened by Eldad, including #40/#41" was corrected — PR #40 (this
  audit) has not yet received a human review; only the merged PRs, including
  #41, were actually reviewed/approved. See `docs/SUBMISSION_CHECKLIST.md`
  §11.
- The stale deadline text in `docs/SUBMISSION_CHECKLIST.md` §18 (claiming
  the deadline was entirely unknown) was corrected to match R-151 below.

### Update — 2026-08-29 (second pass, after PR #41 merged)

This section supersedes the first-pass notes below where they conflict.

**Authoritative source:** the updated official course PDF supplied by the
team has been independently reviewed, confirming two changes: (1)
**August 18** — `db.getReport("USD")` corrected to `ob.getReport("USD")`,
already reflected in R-066; (2) **August 26** — the source-code PDF scope
narrowed from "all code files that you coded" to **"all code files
(JavaScript only) that you coded."** The prior "PDF unavailable" blocker on
R-002 no longer applies (see the third-pass update above for R-002's current,
corrected status).

**OQ-002 is now RESOLVED.** The team reports the lecturer has confirmed the
public `getReport()` date shape `date: { day: ... }` is correct
(**lecturer confirmation reported directly by the team**, not a written
citation). See the dedicated OQ-002 entry above. The implementation was not
changed — it already returned exactly this shape.

**OQ-001, OQ-003, OQ-004, OQ-005 remain formally OPEN.** No official answer
has been received for any of these, nor for the separate question of whether
`addCost()` may return extra generated properties (id/date) beyond the four
documented ones (see the `addCost()` comment in `src/lib/db.js`/`vanilla/db.js`
after PR #41's corrections). Do not treat any of these as resolved.

**Team contribution:** the project was developed jointly by Eldad Simanian
and Shlomi Hazan as **equal contributors/co-developers**. GitHub repository
ownership, the "team manager" Moodle-submission role (R-150), and who
reviews/merges PRs are administrative/course-submission mechanics only and
must not be read as reflecting a main/secondary or senior/subordinate
development relationship.

**Team metadata:** required final-submission personal metadata (names, ID,
mobile number, email) has been **supplied by the team for both students**.
Per privacy practice, no actual values are recorded in this public
repository/audit documentation — they belong only in the final PDF front
matter (R-145/R-146), produced in a later artifact-generation stage.

**Same course group (R-161):** the team confirms Eldad Simanian and Shlomi
Hazan are in the same course group; now `VERIFIED`.

**Submission deadline:** official date confirmed as **05.09.2026**; the exact
clock time on that date has not been supplied (not invented, not assumed as
23:59/00:00/etc.). Internal team target: **02.09.2026, ~21:00**. See R-151.

### First-pass notes (2026-08-29, superseded above where noted)

**Collaborative Tools — RESOLVED.** The team has confirmed the two
collaborative tools for the R-149 submission summary are **GitHub** and
**Discord**, with Discord explicitly lecturer-approved as a substitute for
Slack. This approval is **team-reported as verbal**; no written
lecturer/forum confirmation of it has been supplied to this audit. This is
resolved and should not be reopened as "which second tool?" The team has since
supplied concrete Discord usage examples and a drafted ≤100-word paragraph —
see R-149.

**AI coding-assistant disclosure** remains a separate, still-open question
(see clarification question 8 in the team's draft forum-questions document).
No official course requirement for AI-tool disclosure has been found in
`docs/REQUIREMENTS.md`'s source material available to this audit. Do not
conflate it with the (resolved) collaborative-tools requirement.

## 18.2 Source-Code PDF Scope Inventory (JavaScript/JSX, required-course code only)

Per the August 26 official change ("all code files (JavaScript only) that you
coded") plus the team-reported clarification narrowing this to JavaScript/JSX
implementing **required course functionality** (see
`docs/SUBMISSION_CHECKLIST.md` §12). Test — would this file, or this code
path, need to exist to satisfy the official course requirements? Production
code is not modified for packaging purposes; MIXED files are reproduced whole
in the future PDF, not split.

| File | Requirement relevance | Status | Comment-ready? |
|---|---|---|---|
| `src/lib/db.js` | Required contract (`openCostsDB`/`addCost`/`getReport`) + CRUD extension methods in one file | MIXED | Yes (PR #41) |
| `vanilla/db.js` | Same as above, standalone version | MIXED | Yes |
| `src/lib/costsDatabase.js` | Wires the required db.js instance for the app | INCLUDE | Yes |
| `src/lib/exchangeRatesCache.js` | R-090–094 Fetch/sync bridge | INCLUDE | Yes |
| `src/services/exchangeRatesService.js` | R-090–094 | INCLUDE | Yes |
| `src/services/settingsService.js` | R-092/093 default/custom source | INCLUDE | Yes |
| `src/utils/currency.js` | R-040/090/094 conversion + validation | INCLUDE | Yes |
| `src/constants/currencies.js` | R-040 identifiers | INCLUDE | Yes |
| `src/utils/category.js` | Supports required Pie Chart category grouping (R-070) | INCLUDE | Yes |
| `src/constants/categories.js` | UI suggestion list only; free text already satisfies R-033 without it | EXCLUDE | Yes |
| `src/utils/amountFormat.js` | Formats required report/chart totals for display | INCLUDE | Yes |
| `src/utils/chartPresentation.js` | Presentation for required Pie/Bar charts | INCLUDE | Yes |
| `src/utils/chartAggregation.js` | R-070/071 Pie aggregation | INCLUDE | Yes |
| `src/utils/yearlyAggregation.js` | R-080/081 Bar aggregation | INCLUDE | Yes |
| `src/utils/dateTime.js` | Formats required Monthly Report date/time display + heavily used by extension edit forms | MIXED | Yes |
| `src/pages/AddCostPage.jsx` | R-030–036 | INCLUDE | Yes |
| `src/pages/MonthlyReportPage.jsx` | R-050–053 required report + export-button/sorting extensions in the same file | MIXED | Yes |
| `src/pages/ChartsPage.jsx` | R-070/071 required Pie Chart + export-button extension in the same file | MIXED | Yes |
| `src/components/charts/YearlyBarChartSection.jsx` | R-080/081 required Bar Chart + export-button extension in the same file | MIXED | Yes |
| `src/components/reports/SortableReportTable.jsx` | Renders required Monthly Report rows + sorting extension (X-006) in the same file | MIXED | Yes |
| `src/pages/SettingsPage.jsx` | R-092/093 | INCLUDE | Yes |
| `src/pages/ReportsPage.jsx` | Hosts required Monthly tab + extension Yearly tab | MIXED | Yes |
| `src/App.jsx` | Core navigation reaching required features + wires extension pages | MIXED | Yes |
| `src/main.jsx` | App bootstrap, required for anything to render | INCLUDE | Yes |
| `src/components/layout/AppLayout.jsx` | Navigation shell reaching required features | INCLUDE | Yes |
| `src/components/common/PageHeader.jsx` / `SectionCard.jsx` / `LoadingButtonLabel.jsx` | Shared UI used by required-feature pages | INCLUDE | Yes |
| `src/theme.js` | Global theme needed for the app (incl. required pages) to render | INCLUDE | Yes |
| `src/pages/DashboardPage.jsx` | Convenience landing page; required features are already reachable via `AppLayout`'s nav without it | EXCLUDE | Yes |
| `src/services/detailedReportsService.js` | `buildDetailedMonthlyReport` augments required-report display with extension date/time detail; `buildDetailedYearlyReport` is pure extension | MIXED | Yes |
| `src/pages/ManageCostsPage.jsx` | Entirely X-002/X-003 — editing/deleting is not required | EXCLUDE | Yes |
| `src/pages/YearlyReportPage.jsx` | Entirely X-005 — not required | EXCLUDE | Yes |
| `src/hooks/useReportSorting.js`, `src/utils/reportSorting.js` | Entirely X-006 sorting extension | EXCLUDE | Yes |
| `src/utils/chartCapture.js`, `src/utils/exportFilenames.js` | Entirely export extension (X-007/X-008) | EXCLUDE | Yes |
| `src/services/export/downloadService.js`, `excelExportService.js`, `exportModels.js`, `pdfExportService.js` | Entirely export extension — team explicitly named PDF/Excel export as not belonging in the final PDF | EXCLUDE | Yes |
| `eslint.config.js`, `vite.config.js` | Tooling/config, not "code you coded" in the R-143 sense; PDF-scope status **NEEDS REVIEW** pending explicit confirmation | NEEDS REVIEW | Yes |
| `tests/db/db.test.js`, `tests/db/vanilla-db.test.js` | Directly validate the required db.js contract | INCLUDE candidate | Yes |
| `tests/currency/`, `tests/charts/chartAggregation.test.js`, `tests/charts/yearlyAggregation.test.js`, `tests/categories/`, `tests/dateTime/`, `tests/services/exchangeRatesService.test.js`, `tests/services/settingsService.test.js` | Directly validate required behavior | INCLUDE candidate | Yes |
| `tests/exports/*`, `tests/reports/reportSorting.test.js`, `tests/reports/detailedReportsService.test.js` (Yearly-report portion) | Validate extension-only behavior | EXCLUDE candidate | Yes |
| `src/pages/*.test.jsx`, component `.test.jsx` files | Split the same way as their subject file above (Add Cost/Monthly/Charts/Bar-chart INCLUDE-leaning or MIXED; Manage Costs/Yearly Report/sorting EXCLUDE) | Mirrors subject file | Yes |

**Whether tests enter the PDF at all** is itself covered by the August 26
"JavaScript only" wording (tests are `.js`/`.jsx`) but was not addressed by
the team's narrower course-requirement clarification, which was framed
around application code. This is flagged **NEEDS REVIEW** rather than
resolved unilaterally.

No production file is modified for PDF packaging. MIXED files must be
reproduced as complete, real files in the eventual PDF, not split into
fragments.

---

# 19. Team Extension Requirements — Not Official Requirements

The following requirements are team-approved extensions for Milestone 9.5. They
support cost maintenance, richer reporting, and exports, but they are not
official course requirements unless the lecturer later confirms them.

## X-001 — Stable Cost Identity

- **Type:** Team extension
- **Status:** `VERIFIED`
- New application cost records must include a generated stable string `id`.
- IDs are generated internally; callers of `addCost()` must not provide IDs.
- IDs must distinguish otherwise identical costs.

### Verification

- [x] Adding two identical costs creates two different IDs.
- [x] The same ID is returned by CRUD reads after storage/reload.
- [x] Existing official `addCost()` input remains compatible.

---

## X-002 — Cost Editing

- **Type:** Team extension
- **Status:** `VERIFIED`
- The database object returned by `openCostsDB()` should support `updateCost(id, cost)`.
- `updateCost()` uses a full editable payload containing `sum`, `currency`,
  `category`, `description`, and full date/time.
- Updating a cost must preserve its original `id`.
- Manage Costs UI is the user-facing implementation of this requirement.

### Verification

- [x] Existing cost can be updated by ID.
- [x] Missing valid ID returns `null`.
- [x] Invalid ID throws a validation error.
- [x] Invalid editable payload is rejected.
- [x] Manage Costs UI can edit sum/currency/category/description/date/time.

---

## X-003 — Cost Deletion

- **Type:** Team extension
- **Status:** `VERIFIED`
- The database object returned by `openCostsDB()` should support `deleteCost(id)`.
- Deletion is ID-based so duplicate-looking costs remain distinguishable.
- Manage Costs UI is the user-facing implementation of this requirement.

### Verification

- [x] Existing cost can be deleted by ID.
- [x] Deleting one duplicate-looking cost does not delete the other.
- [x] Missing valid ID returns `null`.
- [x] Invalid ID throws a validation error.
- [x] Manage Costs UI deletes costs only after confirmation.

---

## X-004 — Cost Time

- **Type:** Team extension
- **Status:** `VERIFIED`
- New application cost records should store:

```javascript
date: {
  day,
  month,
  year,
  hour,
  minute
}
```

- The current official report-facing compatibility shape remains:

```javascript
date: {
  day
}
```

### Verification

- [x] Newly added costs store day/month/year/hour/minute.
- [x] Monthly filtering continues to use month/year.
- [x] Official report item compatibility remains day-only; `OQ-002` is now
      RESOLVED — the lecturer has confirmed this shape is correct.
- [x] Manage Costs UI can edit full date/time values.
- [x] Monthly Report displays stored cost time.
- [x] Yearly Report displays stored cost date and time.

---

## X-005 — Detailed Yearly Report

- **Type:** Team extension
- **Status:** `VERIFIED`
- Users can generate a detailed yearly report from the Reports navigation group.
- The report supports selected year and selected currency.
- It displays yearly detail rows for costs stored in the selected year.
- Detail rows display full date, time, description, category, original sum, and
  original currency.
- The yearly total uses the selected target currency and reuses the existing
  synchronous monthly `getReport()` conversion behavior.
- Official `getReport()` report-item date shape remains unchanged; `OQ-002`
  is now RESOLVED — the lecturer has confirmed this shape is correct.

### Verification

- [x] User can select year and currency.
- [x] Yearly rows are visible for all matching stored costs.
- [x] Costs from another year are excluded.
- [x] Yearly total uses the selected currency.
- [x] Detail rows preserve original sum/currency.
- [x] Detail rows display full date and time.
- [x] Empty years show a zero total and a clear empty state.
- [x] Report logic is implemented outside visual React components.
- [x] Protected `db.js` `getReport()` output remains unchanged.

---

## X-006 — Sortable Reports

- **Type:** Team extension
- **Status:** `VERIFIED`
- Monthly and yearly report tables should support consistent sorting controls.
- Sorting should cover Date/Time, Description, Category, Sum, and Currency.

### Verification

- [x] Monthly Report can be sorted.
- [x] Yearly Report can be sorted.
- [x] Ascending/descending state is visible.
- [x] Date/Day sorting is chronological.
- [x] Time sorting is chronological.
- [x] Description sorting is alphabetical.
- [x] Category sorting is alphabetical.
- [x] Sum sorting is numeric.
- [x] Currency sorting is alphabetical.
- [x] Monthly and Yearly reports share sorting behavior.
- [x] Equal values preserve source order.
- [x] Sorting does not mutate source arrays or stored cost order.

---

## X-007 — Excel Export

- **Type:** Team extension
- **Status:** `VERIFIED`
- Users should be able to export structured spreadsheet files for:
  - Monthly Report,
  - Yearly Report,
  - Pie Chart data,
  - Bar Chart data.
- Real XLSX/spreadsheet output is intended; CSV renamed to `.xlsx` is not
  sufficient.

### Verification

- [x] Monthly Report exports to real XLSX.
- [x] Yearly Report exports to real XLSX.
- [x] Pie Chart data exports to XLSX.
- [x] Bar Chart data exports to XLSX.
- [x] Meaningful deterministic filenames are used.
- [x] Selected filters and currency are represented.
- [x] Report exports preserve visible sorted order.
- [x] Numeric spreadsheet values remain numeric.
- [x] Exports consume prepared application data without direct storage re-read.

---

## X-008 — PDF Export

- **Type:** Team extension
- **Status:** `VERIFIED`
- Users should be able to export human-readable PDF files for:
  - Monthly Report,
  - Yearly Report,
  - Pie Chart visualization and relevant data,
  - Bar Chart visualization and relevant data.

### Verification

- [x] Monthly Report exports to PDF.
- [x] Yearly Report exports to PDF.
- [x] Pie Chart exports visualization/data to PDF.
- [x] Bar Chart exports visualization/data to PDF.
- [x] Meaningful deterministic filenames are used.
- [x] Selected filters and currency are represented.
- [x] Report PDFs preserve visible sorted order.
- [x] Multi-page report data is supported by PDF table rendering.
- [x] Empty-state export is handled.

---

## X-009 — Reports Navigation Group

- **Type:** Team extension
- **Status:** `VERIFIED`
- The application navigation should expose a top-level `Reports` section with
  Monthly and Yearly report tabs.
- Monthly and Yearly report views remain available under the Reports section.

### Verification

- [x] Top-level navigation shows `Reports`.
- [x] Monthly Report remains usable under `Reports`.
- [x] Yearly Report is available under `Reports`.

---

# 20. Project Decisions — Not Official Requirements

These decisions belong in `docs/ARCHITECTURE.md` / `docs/DECISIONS.md` and must remain clearly separate from the official course requirements.

Planned decisions currently include:

```text
React
Vite
JavaScript / JSX
MUI
One charting library
Vitest
ESLint
GitHub Issues + feature branches + Pull Requests
Codex as primary coding agent
Claude Code as reviewer / secondary coding agent
```

None of these should be described as a course requirement unless the official specification explicitly says so.

---

# 21. Final Traceability Template

As development progresses, every mandatory requirement should be traceable:

| Requirement | GitHub Issue | Implementation | Test | Status |
|---|---|---|---|---|
| R-010 | TBD | TBD | TBD | `NOT STARTED` |
| R-020 | TBD | TBD | TBD | `NOT STARTED` |
| R-030 | TBD | TBD | TBD | `NOT STARTED` |
| R-050 | TBD | TBD | TBD | `NOT STARTED` |
| R-060 | TBD | TBD | TBD | `NOT STARTED` |
| R-070 | TBD | TBD | TBD | `NOT STARTED` |
| R-080 | TBD | TBD | TBD | `NOT STARTED` |
| R-090 | TBD | TBD | TBD | `NOT STARTED` |
| R-110 | TBD | TBD | TBD | `NOT STARTED` |
| R-130 | TBD | TBD | TBD | `NOT STARTED` |
| R-140 | TBD | TBD | TBD | `NOT STARTED` |
| R-160 | TBD | TBD | TBD | `NOT STARTED` |

---

# 21. Rule for AI Agents

Codex, Claude Code, or any other coding agent must **not reinterpret or weaken a mandatory requirement**.

When an ambiguity exists:

```text
Do not guess
    ↓
Record the ambiguity
    ↓
Use the official course forum / instructor clarification
    ↓
Update REQUIREMENTS.md
    ↓
Then implement
```

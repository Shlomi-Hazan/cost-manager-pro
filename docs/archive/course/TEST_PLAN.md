# Cost Manager Front-End — Test Plan

> **Purpose:** Define how the Cost Manager project will be verified throughout development and before final submission.
>
> **Primary sources:** `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, and the official course specification.
>
> **Rule:** A feature is not considered complete merely because it works once manually. Critical behavior must be verified at the appropriate test layer.

---

# 1. Testing Goals

The test strategy must protect:

1. Official course requirement compliance.
2. The required Vanilla `db.js` public API.
3. Correct localStorage persistence.
4. Correct monthly report behavior.
5. Correct currency conversion.
6. Correct Pie Chart aggregation.
7. Correct yearly 12-month Bar Chart aggregation.
8. Correct default/custom exchange-rate behavior.
9. Chrome compatibility.
10. Production/deployment behavior.
11. Submission readiness.

The project does not need unnecessary enterprise-scale testing infrastructure.

The goal is:

```text
small testable modules
+
contract tests
+
official compatibility test
+
manual browser QA
+
production smoke testing
```

---

# 2. Test Layers

The project will use four main test layers.

```text
Layer 1 — Unit Tests
Layer 2 — db.js Contract / Integration Tests
Layer 3 — Official Vanilla HTML Compatibility Test
Layer 4 — Manual + Production QA
```

Each layer has a different purpose.

---

# 3. Layer 1 — Unit Tests

Unit tests verify isolated pure logic.

Planned test locations:

```text
tests/
├── currency/
├── reports/
├── charts/
├── validation/
└── services/
```

Vitest is the planned test runner.

---

# 4. Currency Conversion Tests

Related requirements:

```text
R-040
R-051
R-071
R-081
R-090
R-094
```

Expected official rate model:

```json
{
  "USD": 1,
  "GBP": 0.6,
  "EURO": 0.7,
  "ILS": 3.4
}
```

Conceptual conversion formula:

```javascript
amount / rates[sourceCurrency] * rates[targetCurrency]
```

## Required test cases

- [ ] USD → USD returns the same amount.
- [ ] USD → ILS.
- [ ] ILS → USD.
- [ ] USD → GBP.
- [ ] GBP → USD.
- [ ] GBP → EURO.
- [ ] EURO → ILS.
- [ ] Decimal values.
- [ ] Zero amount where allowed by the calculation utility.
- [ ] Unsupported source currency rejected.
- [ ] Unsupported target currency rejected.
- [ ] Missing rate rejected.
- [ ] Malformed rates object rejected.

## Important

Do not round intermediate values too early.

Presentation rounding and business calculation should remain separate concerns unless the official requirements clarify otherwise.

---

# 5. Exchange-Rate Response Validation Tests

Related requirements:

```text
R-090
R-092
R-093
R-094
```

Valid input example:

```json
{
  "USD": 1,
  "GBP": 0.6,
  "EURO": 0.7,
  "ILS": 3.4
}
```

## Test cases

- [ ] Valid response accepted.
- [ ] Missing `USD` rejected.
- [ ] Missing `ILS` rejected.
- [ ] Missing `GBP` rejected.
- [ ] Missing `EURO` rejected.
- [ ] Non-numeric rate rejected.
- [ ] Negative rate rejected if validation strategy disallows it.
- [ ] Zero rate rejected because it would invalidate conversion.
- [ ] `EUR` does not silently replace required `EURO`.
- [ ] Extra unrelated fields do not break required fields, if implementation allows them.

---

# 6. Cost Validation Tests

Related requirements:

```text
R-031
R-032
R-033
R-034
R-040
OQ-005
```

Only validation rules established by the project may be tested as mandatory behavior.

Do not accidentally make UI-only validation restrictions part of the externally tested `db.js` contract unless intentionally approved.

## Core cases

- [ ] Valid cost accepted.
- [ ] Numeric `sum` preserved.
- [ ] Supported currency accepted.
- [ ] Category string preserved.
- [ ] Description string preserved.
- [ ] Original currency preserved.

Additional validation tests should be added only after the exact validation policy is recorded in `docs/DECISIONS.md`.

---

# 7. Chart Aggregation Tests

## Pie Chart

Related requirements:

```text
R-070
R-071
```

Test:

- [ ] One category.
- [ ] Multiple categories.
- [ ] Repeated category values are summed.
- [ ] No costs produces an empty/valid no-data state.
- [ ] Costs outside selected month are excluded.
- [ ] Costs outside selected year are excluded.
- [ ] Mixed currencies are converted according to established behavior.
- [ ] Result is independent of input order.

Conceptual expected result:

```javascript
[
  { category: "FOOD", total: 250 },
  { category: "CAR", total: 400 }
]
```

The exact UI/chart-library shape may differ, but the aggregation must be testable separately from React.

---

## Yearly Bar Chart

Related requirements:

```text
R-080
R-081
```

Test:

- [ ] Output always represents 12 months.
- [ ] January through December order is stable.
- [ ] Months without costs have zero total.
- [ ] Multiple costs in the same month are summed.
- [ ] Costs from another year are excluded.
- [ ] Mixed currencies are converted according to established behavior.
- [ ] Entire year with no costs returns twelve zero-value months.

Conceptual result:

```javascript
[
  { month: "Jan", total: 0 },
  { month: "Feb", total: 150 },
  ...
  { month: "Dec", total: 0 }
]
```

---

# 8. Layer 2 — `db.js` Contract Tests

This is one of the highest-priority test areas because `db.js` is externally graded.

Related requirements:

```text
R-020
R-021
R-030
R-035
R-036
R-050
R-052
R-053
R-060
R-062
R-063
R-064
R-065
R-066
R-130
R-131
```

---

# 9. `openCostsDB()` Contract Tests

Required call:

```javascript
const ob = db.openCostsDB("costsdb", 1);
```

Test:

- [ ] Function exists.
- [ ] Accepts database name.
- [ ] Accepts database version.
- [ ] Returns a truthy object.
- [ ] Returned object exposes `addCost`.
- [ ] Returned object exposes `getReport`.
- [ ] Multiple calls behave consistently.
- [ ] Database name/version behavior matches the implementation decision.
- [ ] Does not require React/Vite.

---

# 10. `addCost()` Contract Tests

Required example:

```javascript
const result = ob.addCost({
  sum: 200,
  currency: "USD",
  category: "FOOD",
  description: "pizza"
});
```

Test:

- [ ] Method exists.
- [ ] Required input object can be added.
- [ ] Returns a result object.
- [ ] Returned object contains `sum`.
- [ ] Returned object contains `currency`.
- [ ] Returned object contains `category`.
- [ ] Returned object contains `description`.
- [ ] Cost is persisted.
- [ ] Existing costs are not overwritten.
- [ ] Addition date is generated automatically.
- [ ] Original currency is preserved.

---

# 11. localStorage Persistence Tests

Related requirements:

```text
R-020
R-021
```

Test:

- [ ] Add one cost, recreate DB object, cost remains.
- [ ] Add multiple costs, all remain.
- [ ] Report can read persisted costs.
- [ ] unrelated localStorage keys are not accidentally erased.
- [ ] malformed stored data is handled according to the decided strategy.

Where unit test environments mock localStorage, a real Chrome persistence check is still required later.

---

# 12. `getReport()` Contract Tests

Required usage:

```javascript
const data = ob.getReport("USD");
```

and:

```javascript
const data = ob.getReport("USD", 2026, 8);
```

Test:

- [ ] Method exists on `ob`.
- [ ] Does not require calling `db.getReport()`.
- [ ] Currency argument works.
- [ ] Explicit month/year filters correctly.
- [ ] Missing month/year uses current month/year.
- [ ] Returned object contains `year`.
- [ ] Returned object contains `month`.
- [ ] Returned object contains `costs`.
- [ ] Returned object contains `total`.
- [ ] `total.currency` exists.
- [ ] `total.sum` exists.
- [ ] Month with no costs returns a valid report.
- [ ] Multiple costs are included.
- [ ] Costs outside selected month/year are excluded.

Behavior affected by `OQ-001`, `OQ-002`, and `OQ-003` should not be finalized in tests until the implementation decision/clarification is documented.

---

# 13. Current-Date Tests

Related requirements:

```text
R-035
R-052
```

Tests involving the current date must be deterministic.

Prefer fake/system time in automated tests rather than relying on the real date.

Example:

```text
Fake current date:
2026-08-22
```

Then verify:

- [ ] Added cost receives expected date.
- [ ] `getReport("USD")` resolves to August 2026.

Do not create flaky tests that change behavior at midnight or month boundaries.

---

# 14. Database Isolation

Automated tests should not contaminate each other.

Before each storage-related test:

```text
clear only the test namespace
```

or reset the test storage environment.

Tests must not rely on execution order.

---

# 15. Module and Vanilla Parity Tests

Related requirement:

```text
R-060
```

The module and Vanilla implementations should satisfy the same required behavioral contract.

At minimum, verify both against equivalent cases for:

- [ ] `openCostsDB`.
- [ ] `addCost`.
- [ ] `getReport`.
- [ ] persistence behavior.
- [ ] current date defaults.
- [ ] report shape.

The Vanilla file must remain standalone even if implementation code is shared/generated internally.

---

# 16. Layer 3 — Official Vanilla HTML Compatibility Test

The repository must contain:

```text
vanilla/db-test.html
```

The test should preserve the official sample structure supplied in the course specification.

Core required flow:

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

## Manual verification

Open the HTML file in latest Chrome and verify:

- [ ] no JavaScript exception,
- [ ] `db` exists globally,
- [ ] `ob` is created,
- [ ] first add succeeds,
- [ ] second add succeeds,
- [ ] report returns,
- [ ] `data.total.sum` is accessible.

## Critical rule

Do not modify the implementation merely to recognize these exact values.

The grader may use different test data.

---

# 17. Layer 4 — Manual Application QA

Automated tests do not replace browser testing.

Manual QA should be performed against the complete application.

---

# 18. Add Cost Manual QA

Related requirements:

```text
R-030 to R-036
R-040
```

Test:

- [ ] Open Add Cost screen.
- [ ] Add USD cost.
- [ ] Add ILS cost.
- [ ] Add GBP cost.
- [ ] Add EURO cost.
- [ ] Success state displayed.
- [ ] Cost persists after refresh.
- [ ] Original currency remains preserved.
- [ ] Date is generated automatically.
- [ ] Invalid form behavior matches project validation policy.

---

# 19. Monthly Report Manual QA

Related requirements:

```text
R-050 to R-053
```

Test:

- [ ] Select month.
- [ ] Select year.
- [ ] Select report currency.
- [ ] Correct costs displayed.
- [ ] Correct total displayed.
- [ ] No-data month handled cleanly.
- [ ] Current month/year defaults verified where applicable.
- [ ] Mixed-currency behavior matches documented decision/clarification.

---

# 20. Pie Chart Manual QA

Related requirements:

```text
R-070
R-071
```

Test:

- [ ] Select month.
- [ ] Select year.
- [ ] Select currency.
- [ ] Categories match expected costs.
- [ ] Totals match manually calculated values.
- [ ] Changing currency updates values.
- [ ] Empty month has a clean no-data state.

---

# 21. Bar Chart Manual QA

Related requirements:

```text
R-080
R-081
```

Test:

- [ ] Select year.
- [ ] Select currency.
- [ ] Exactly 12 months represented.
- [ ] Months with no data appear as zero.
- [ ] Months with costs match expected totals.
- [ ] Changing currency updates totals.
- [ ] Changing year updates chart.

---

# 22. Settings Manual QA

Related requirements:

```text
R-092
R-093
R-094
```

Test:

- [ ] Fresh app works without custom URL.
- [ ] Default exchange-rate source is used.
- [ ] Custom URL can be entered.
- [ ] Custom URL can be saved.
- [ ] Saved URL persists after refresh.
- [ ] Valid custom rate source is used.
- [ ] Invalid/unavailable URL produces controlled behavior.
- [ ] Reset-to-default works if this project feature is implemented.

---

# 23. Fetch / Network QA

Related requirements:

```text
R-090 to R-095
```

Test in Chrome DevTools Network tab:

- [ ] Fetch request occurs.
- [ ] Correct default/custom URL used.
- [ ] Response JSON has expected fields.
- [ ] Successful request is handled.
- [ ] Network failure is handled.
- [ ] Malformed JSON is handled.
- [ ] CORS behavior works with deployed rate source.

---

# 24. Chrome Compatibility QA

Related requirements:

```text
R-101
R-111
```

Final grading target is latest Google Chrome.

Before final submission:

- [ ] Test application in latest Chrome.
- [ ] Test Vanilla `db.js` HTML page in latest Chrome.
- [ ] Check DevTools Console.
- [ ] Check DevTools Network.
- [ ] Verify desktop layout.
- [ ] Verify forms.
- [ ] Verify charts.
- [ ] Verify page refresh.
- [ ] Verify localStorage.

---

# 25. Production Smoke Test

Related requirements:

```text
R-110
R-111
```

Run after deployment from the actual production URL.

Test:

```text
Load app
↓
Add cost
↓
Refresh
↓
Generate monthly report
↓
Open Pie Chart
↓
Open Bar Chart
↓
Change currency
↓
Test Settings
↓
Fetch exchange rates
```

Verify:

- [ ] production URL loads.
- [ ] no blocking console errors.
- [ ] assets load.
- [ ] localStorage works under production origin.
- [ ] Fetch works from deployed environment.
- [ ] charts render.
- [ ] refresh does not break the application.

---

# 26. CI Validation

Once scripts exist, Pull Requests should run:

```bash
npm ci
npm run lint
npm test
npm run build
```

A normal feature PR should not be considered merge-ready when one of these required checks fails.

CI does not replace:

- official Vanilla browser test,
- manual Chrome QA,
- production smoke testing.

---

# 27. Regression Testing

When fixing a bug:

1. Reproduce the bug.
2. Add a test when practical.
3. Implement the smallest correct fix.
4. Verify the new test passes.
5. Run relevant existing tests.
6. Check for related regressions.

Example:

```text
Bug:
EURO incorrectly treated as EUR

Regression test:
required identifier EURO is accepted and retained
```

---

# 28. Requirement Traceability

Each important test should reference requirement IDs where practical.

Example:

```javascript
// R-052: getReport defaults to current month/year
```

or in test naming:

```text
R-052 getReport uses current month and year when omitted
```

Final audit matrix:

| Requirement | Automated Test | Manual Test | Production | Status |
|---|---|---|---|---|
| R-020 | TBD | TBD | TBD | NOT STARTED |
| R-040 | TBD | TBD | TBD | NOT STARTED |
| R-050 | TBD | TBD | TBD | NOT STARTED |
| R-070 | TBD | TBD | TBD | NOT STARTED |
| R-080 | TBD | TBD | TBD | NOT STARTED |
| R-090 | TBD | TBD | TBD | NOT STARTED |
| R-130 | N/A | Official HTML | N/A | NOT STARTED |

---

# 29. Test Data Strategy

Use small, readable data sets.

Example:

```javascript
[
  {
    sum: 100,
    currency: "USD",
    category: "FOOD",
    description: "Groceries"
  },
  {
    sum: 340,
    currency: "ILS",
    category: "CAR",
    description: "Fuel"
  }
]
```

Avoid giant fixtures when a few records prove the behavior.

Use explicit dates in tests through fake time.

---

# 30. What Must Not Be Tested as an Official Requirement Yet

Do not encode unresolved assumptions as permanent mandatory tests.

Until clarified/documented, be careful with:

```text
OQ-001 — exact conversion behavior of individual report items
OQ-002 — exact externally returned date shape
OQ-003 — Fetch/getReport synchronous integration
OQ-004 — fixed category list
OQ-005 — detailed validation rules
```

Once an official clarification or approved architecture decision resolves one, update:

```text
docs/REQUIREMENTS.md
docs/DECISIONS.md
tests
```

as appropriate.

---

# 31. Definition of Done — Feature Testing

A functional feature is test-complete when, where applicable:

- [ ] relevant unit tests exist,
- [ ] relevant contract tests exist,
- [ ] tests pass,
- [ ] lint passes,
- [ ] production build passes,
- [ ] manual Chrome scenario passes,
- [ ] no unexpected console errors,
- [ ] related requirement IDs are known,
- [ ] unresolved assumptions are documented.

---

# 32. Definition of Done — Final QA

Before submission, all of the following must pass:

```text
Automated unit tests                    ✅
db.js contract tests                    ✅
Official Vanilla HTML test              ✅
npm run lint                            ✅
npm test                                ✅
npm run build                           ✅
Latest Chrome manual QA                 ✅
Production smoke test                   ✅
Default exchange-rate source            ✅
Custom exchange-rate source             ✅
Monthly report                          ✅
Pie Chart                               ✅
12-month Bar Chart                      ✅
localStorage persistence                ✅
Requirement audit                       ✅
Submission package manual verification  ✅
```

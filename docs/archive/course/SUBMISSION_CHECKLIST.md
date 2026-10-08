# Cost Manager Front-End — Submission Checklist

> **Purpose:** Final packaging and submission checklist based on the official course specification.
>
> **Source of truth:** `docs/REQUIREMENTS.md` and the latest official course document.
>
> **Important:** Before submission, re-check the latest version of the course document and relevant course-forum clarifications.

---

# 1. Submission Principle

The project is not considered ready for submission merely because the application works.

Submission readiness requires all of the following:

```text
Requirements verified
        ↓
Tests passing
        ↓
Production verified
        ↓
Video ready
        ↓
PDF ready
        ↓
ZIP ready
        ↓
Vanilla db.js ready
        ↓
Exactly 3 Moodle files
        ↓
Final manual verification
```

---

# 2. Final Requirement Audit

Before packaging anything:

- [x] Review the latest official project specification. — The updated official course PDF supplied by the team was independently reviewed; the August 18 and August 26 changes were confirmed (see `docs/REQUIREMENTS.md` §18.1).
- [x] Review relevant lecturer/course-forum clarifications. — Collaborative Tools (GitHub+Discord), OQ-002 (`{ day }` shape), and same-course-group status are resolved. OQ-001/003/004/005 and the addCost() extra-return-property question remain unanswered. A final pre-submission course-forum/newest-clarification re-check is still outstanding — see R-002.
- [x] Update `docs/REQUIREMENTS.md` if needed.
- [x] Verify every mandatory requirement. — 41/56 mandatory requirements VERIFIED, 15 BLOCKED (0 of those are `NOT SATISFIED` compliance defects — see `docs/REQUIREMENTS.md`; each BLOCKED entry's Readiness note distinguishes PENDING FINAL ARTIFACT from PENDING EXTERNAL VERIFICATION). R-161 (same course group) is no longer part of the current mandatory denominator — see its entry.
- [ ] Complete the requirement traceability table.
- [x] Resolve or explicitly document remaining ambiguities.
- [x] Confirm no required behavior was replaced by a project preference.

---

# 3. Repository Readiness

Before creating submission artifacts:

- [ ] `main` contains the final reviewed version. — **Not yet**: this very audit (PR #40) is still open on `docs/final-requirements-audit` and has not merged into `main`.
- [ ] All required Pull Requests are merged. — PR #41 (comment hardening) is merged; **PR #40 (this audit) is still open** and is itself a required PR before this box can be checked.
- [x] No required work remains only on feature branches, other than PR #40 itself (in review).
- [x] `git status` is clean.
- [x] No uncommitted code changes remain.
- [x] No secrets are present. (Repository-wide grep audit, 2026-08-29 — none found.)
- [x] No personal tokens/keys are committed.
- [x] Documentation reflects the final implementation.
- [ ] Final tag/release may be created if the team chooses to use one.

Recommended final repository checkpoint:

```text
final/submission-ready
```

or an equivalent Git tag such as:

```text
v1.0.0
```

This is a project workflow choice, not a course requirement.

---

# 4. Automated Validation

Run from a clean checkout/install:

```bash
npm install
npm run lint
npm test
npm run build
```

Verify:

- [x] installation succeeds.
- [x] lint succeeds.
- [x] automated tests succeed. (28 test files, 334 tests, 2026-08-29.)
- [x] production build succeeds.

If the project uses:

```bash
npm ci
```

for CI, verify it also works from the committed lockfile.

- [x] `npm ci` verified from the committed lockfile (2026-08-29): 339 packages, 0 vulnerabilities.

---

# 5. Vanilla `db.js` Verification

This is one of the most important final checks.

The separately submitted file must be the **Vanilla** version.

Verify:

- [x] file is standalone. (`vanilla/db.js` is a single IIFE, no imports.)
- [x] no `import` statements remain.
- [x] no React dependency.
- [x] no Vite runtime dependency.
- [x] normal script loading works:

```html
<script src="db.js"></script>
```

- [x] global `db` exists.
- [x] required call works:

```javascript
const ob = db.openCostsDB("costsdb", 1);
```

- [x] `ob.addCost(...)` works.
- [x] `ob.getReport(...)` works.
- [x] `ob.getReport("USD")` works with default current month/year behavior.
- [x] `data.total.sum` is accessible.
- [x] no JavaScript exception is thrown.

Verified 2026-08-29 against the current `vanilla/db.js` source candidate (served
over local HTTP so `localStorage` behaves as it would in production) — this is
the **source candidate**, not yet the exact file copy that will be uploaded to
Moodle. Re-run this check in Stage B against that exact copy per §15 below.

---

# 6. Official Vanilla HTML Test

Open the final official compatibility test in the latest Google Chrome.

Verify:

- [x] `db.js` loads.
- [x] database object is created.
- [x] first cost item is added.
- [x] second cost item is added.
- [x] report is generated.
- [x] total sum is accessible. (`data.total.sum === 600`, matching 200+400.)
- [x] Console contains no blocking errors.

Verified 2026-08-29 against `vanilla/db-test.html` + the current `vanilla/db.js`
source candidate. Same caveat as §5: re-run against the exact Moodle copy.

Do not submit immediately after copying/rebuilding `db.js`.

Always re-run this test against the exact file that will be uploaded to Moodle.

---

# 7. Production Application Verification

Open the actual production URL.

Test:

```text
Open application
↓
Add cost
↓
Refresh page
↓
Generate monthly report
↓
Open Pie Chart
↓
Open Bar Chart
↓
Change currency
↓
Open Settings
↓
Test exchange-rate retrieval
```

Verify:

- [x] production URL is public and reachable. (https://shlomi-hazan.github.io/cost-manager-front-end/)
- [x] application loads in latest Google Chrome. (Human QA by team member Shlomi, reported complete; supplemented by Chromium-engine evidence in Issue #12.)
- [x] user-facing UI is in English.
- [x] cost can be added.
- [x] localStorage persists after refresh.
- [x] USD works.
- [x] ILS works.
- [x] GBP works.
- [x] EURO works.
- [x] original cost currencies remain preserved.
- [x] monthly report works.
- [x] Pie Chart works.
- [x] Bar Chart works for all 12 months.
- [x] Settings works.
- [x] default exchange-rate URL works.
- [x] custom exchange-rate URL works.
- [x] Fetch succeeds in production.
- [x] no blocking Console errors.
- [x] no failed required assets.
- [x] no broken layout in desktop Chrome. (1440×900 and 1280×800 checked.)

Full Stage-B evidence recorded in [Issue #12](https://github.com/Shlomi-Hazan/cost-manager-front-end/issues/12).

---

# 8. Exchange-Rate Source Verification

Before submission:

- [x] default rate URL is still online. (Re-checked 2026-08-29.)
- [x] URL is accessible without authentication.
- [x] Fetch works from the production origin.
- [x] CORS behavior is compatible. (`access-control-allow-origin: *`.)
- [x] JSON is valid.
- [x] required fields exist:

```json
{
  "USD": 1,
  "GBP": 0.6,
  "EURO": 0.7,
  "ILS": 3.4
}
```

- [x] no accidental `EUR` substitution. (`{"USD":1,"GBP":0.6,"EURO":0.7,"ILS":3.4}`.)
- [x] values are valid numbers.
- [x] source is expected to remain online during grading. (Served as a static asset from the same GitHub Pages deployment as the app.)

---

# 9. Demo Video

Official requirement:

- short video demonstrating how the application runs,
- try to keep it around/up to 60 seconds,
- uploaded to YouTube,
- visibility set to **Unlisted**.

Checklist:

- [ ] record final production version.
- [ ] keep video concise.
- [ ] demonstrate core functionality.
- [ ] upload to YouTube.
- [ ] set visibility to `Unlisted`.
- [ ] verify link while signed out/incognito if practical.
- [ ] save final link.
- [ ] include clickable link in the submission PDF.

Suggested demo flow:

```text
0–5s   Open Cost Manager
5–15s  Add a cost
15–25s Monthly report
25–35s Pie Chart
35–45s Bar Chart
45–55s Settings / currency behavior
55–60s Final application overview
```

The exact timing is a recommendation, not an official requirement.

---

# 10. Source-Code PDF — Required Front Matter

At the beginning of the PDF include:

**Metadata input status (2026-08-29): all required personal/team metadata has
been supplied by the team for both students.** Actual values (names, ID,
mobile number, email) are intentionally NOT recorded in this repository
document for privacy — they go directly into the PDF front matter when that
artifact is produced. The checkboxes below track the PDF artifact itself,
not whether the input data exists.

## Team Manager

- [ ] first name. (Input available; not yet placed in a PDF.)
- [ ] last name. (Input available; not yet placed in a PDF.)

## Every Team Member

- [ ] first name. (Input available for both members.)
- [ ] last name. (Input available for both members.)
- [ ] ID. (Input available for both members.)
- [ ] mobile number. (Input available for both members.)
- [ ] email address. (Input available for both members.)

## Video

- [ ] clickable link to YouTube demo. (Video not yet created — see §9.)

## Collaborative Tools

- [x] summary describes at least two collaborative tools. (GitHub + Discord — drafted, see §11.)
- [x] summary is no more than 100 words. (74 words.)
- [ ] summary inserted into the actual PDF. (PDF does not exist yet.)

## Optional

- [ ] additional relevant notes/guidelines if useful.

---

# 11. Collaborative Tools Summary

The project should preserve evidence throughout development.

Before writing the ≤100-word final summary, collect examples from:

- [x] GitHub Issues. (19 issues, opened by Shlomi to scope and coordinate project work.)
- [x] Pull Requests. (21 PRs total: 15 by Shlomi (#14–#35 range), 6 by Eldad (#36–#41).)
- [x] reviews. (Shlomi reviewed/approved the merged PRs opened by Eldad, including PR #41. PR #40 — this audit — is still open and has not yet received a human review.)
- [ ] comments. (Not separately inventoried this session.)
- [x] branches. (Feature/task branch workflow used throughout — confirmed via PR head branches.)
- [x] commits. (Both team members contributed real, verifiable commit history.)
- [ ] assignments/project board if used. (No project board evidence found.)
- [x] second collaborative tool approved/presented in the course. (Discord, team-reported lecturer approval — see `docs/REQUIREMENTS.md` §18.1.)

Do not fabricate collaboration history at submission time.

**Team-supplied factual usage (2026-08-29):**

- GitHub: Issues, feature branches, commits, Pull Requests, reviewer
  requests, reviews, approvals, merges, CI validation, repository
  collaboration.
- Discord: voice calls, task planning and division, feature planning,
  technical decisions, progress updates, bug discussions, collaborative
  debugging, sharing code snippets/screenshots/links, and coordinating PR
  review/approval/merge.

**Drafted ≤100-word paragraph (74 words) — content PREPARED, not yet
inserted into a PDF:**

> We collaborated as equal partners using GitHub and Discord throughout the
> project. GitHub was used for feature branches, commits, pull requests,
> code reviews, approvals, merges, issue tracking, and CI validation. Discord
> supported our day-to-day coordination through voice calls and messages for
> task planning and division, feature design, technical decisions, progress
> updates, debugging, bug discussions, sharing code snippets, screenshots and
> links, and coordinating pull-request reviews and merges. Both team members
> contributed throughout development and decision-making.

---

# 12. Source-Code PDF — Code Section

**Scope:** the updated official PDF states the code section must contain
**"all code files (JavaScript only) that you coded."** `.jsx` is JavaScript
source and counts. This EXCLUDES from the code section: HTML, CSS, Markdown,
YAML, JSON, `package-lock.json`, generated files, `node_modules`, `dist`, and
third-party/dependency code.

**Further team-reported submission clarification:** the code section should
contain the JavaScript/JSX implementing the **course-required** functionality
— not JavaScript whose purpose exists only to implement team extensions
beyond the official requirements (e.g. Excel export, PDF export, chart-image
capture, optional Manage Costs CRUD, optional sorting, optional detailed
Yearly Report). This is recorded as a team-reported clarification of practical
submission scope; it does not contradict or rewrite the literal PDF wording
above, which the team says still applies to files that support required
functionality.

A full per-file requirement-driven inventory (Include / Exclude / Mixed /
Needs Review, with comment-readiness) was produced during the Stage-A audit
— see the audit's Pull Request and `docs/REQUIREMENTS.md` for the current
state; it is not duplicated here to avoid drift between two copies.

For every included code file:

- [ ] show the file name.
- [ ] show the code.
- [ ] keep formatting readable.
- [ ] avoid damaging line wrapping.
- [ ] preserve indentation.
- [ ] make it easy for the grader to identify where one file ends and the next begins.

Suggested organization:

```text
src/
  App.jsx
  main.jsx
  ...

src/lib/
  db.js

src/services/
  ...

src/utils/
  ...

vanilla/
  db.js

other coded/config files as appropriate
```

Before export:

- [ ] inspect multiple pages manually.
- [ ] verify long code lines are readable.
- [ ] verify no file is accidentally omitted.
- [ ] verify no generated dependency code is included unnecessarily.

---

# 13. PDF Filename

The official naming convention requires:

```text
firstname_lastname.pdf
```

Rules:

- [ ] team manager's first name.
- [ ] `_` between first and last name.
- [ ] lowercase only.

Example:

```text
haim_michael.pdf
```

Final filename:

```text
____________________________.pdf
```

---

# 14. Project ZIP

The entire project must be packed into a ZIP.

Before creating it:

- [ ] delete/exclude `node_modules`.
- [ ] include project source code.
- [ ] include `package.json`.
- [ ] include lockfile if used.
- [ ] include public assets.
- [ ] include required configuration files.
- [ ] include project documentation if intended.
- [ ] exclude unnecessary local build/cache files.
- [ ] exclude secrets.
- [ ] exclude IDE/user-specific files where appropriate.

Then:

- [ ] create ZIP.
- [ ] extract ZIP into a temporary folder.
- [ ] confirm extraction succeeds.
- [ ] run a fresh install from extracted project if practical.
- [ ] run build from extracted project.
- [ ] verify `node_modules` is not inside ZIP.

---

# 15. Separately Submitted `db.js`

The third Moodle file is the Vanilla version.

Checklist:

- [ ] copy/export the final Vanilla file.
- [ ] filename is exactly `db.js`.
- [ ] confirm this is not `src/lib/db.js` by mistake.
- [ ] open the exact file.
- [ ] inspect top/bottom for unresolved imports/export syntax.
- [ ] run official HTML test using this exact file.
- [ ] keep it outside the ZIP as a separate Moodle upload.

---

# 16. Exactly Three Moodle Files

The final Moodle submission must contain three files:

```text
1. <project>.zip
2. firstname_lastname.pdf
3. db.js
```

Verify:

- [ ] ZIP present.
- [ ] PDF present.
- [ ] Vanilla `db.js` present.
- [ ] no fourth unnecessary file.
- [ ] no single combined ZIP used as a replacement for the three-file requirement.

---

# 17. Team Manager Submission

Only the team manager should submit the project.

Before submission:

- [ ] confirm who is the team manager.
- [ ] confirm Moodle account.
- [ ] confirm all final files are available on the team manager's computer/account.
- [ ] confirm teammate does not independently submit a duplicate project.

---

# 18. Deadline Safety

The official document instructs students to treat the Moodle deadline as if it were **30 minutes earlier** because of possible server-time differences.

Checklist:

- [x] record official deadline **date**. (05.09.2026 — team-confirmed.)
- [ ] record official deadline **clock time**. (Not yet supplied — do not invent 23:59/00:00/or any other time.)
- [ ] subtract at least 30 minutes for internal deadline. (Cannot be numerically calculated until the exact clock time is known.)
- [x] target completion earlier than the minimum buffer. (Internal target is several days ahead of the official date — see below.)
- [ ] do not leave video upload/PDF generation/ZIP creation to the final minutes.

Internal submission target:

```text
Official Moodle deadline date:  05.09.2026
Official Moodle deadline time:  PENDING (not yet supplied)
Internal latest submission time: cannot be computed until the exact clock time is known
Team internal planned target:   02.09.2026, approximately 21:00
```

**Remaining input needed:** only the exact Moodle deadline **clock time** on
05.09.2026. This is a final submission-timing input, not a code/audit
blocker — the team's internal target already provides a multi-day safety
margin ahead of the official date regardless.

---

# 19. Final Three-File Manual Inspection

Immediately before uploading:

## ZIP

- [ ] opens.
- [ ] contains expected project.
- [ ] does not contain `node_modules`.
- [ ] does not contain secrets.

## PDF

- [ ] opens.
- [ ] filename correct.
- [ ] team details correct.
- [ ] clickable video link works.
- [ ] collaboration summary ≤100 words.
- [ ] all code readable.

## `db.js`

- [ ] opens.
- [ ] Vanilla version.
- [ ] global `db`.
- [ ] official HTML test already rerun.

---

# 20. After Uploading to Moodle

Do not assume upload success.

Verify:

- [ ] exactly three files are visible in the submission.
- [ ] filenames are correct.
- [ ] uploaded file sizes look reasonable.
- [ ] submission status is confirmed.
- [ ] submission timestamp is before the safe deadline.
- [ ] confirmation/receipt page is saved or captured if available.

---

# 21. Final Submission Gate

Do not submit until every critical item below is true:

```text
Requirements audit complete               ✅
Tests pass                                ✅
Lint passes                               ✅
Build passes                              ✅
Vanilla db.js official test passes        ✅
Production Chrome QA passes               ✅
Default rates URL works                   ✅
Custom rates URL works                    ✅
Video uploaded Unlisted                   ✅
Video link verified                       ✅
PDF complete                              ✅
PDF filename correct                      ✅
ZIP excludes node_modules                 ✅
Vanilla db.js separated                   ✅
Exactly 3 Moodle files                    ✅
Team manager ready to submit              ✅
30-minute deadline buffer respected       ✅
```

# Course Archive — Cost Manager Front-End

This folder keeps the documentation from the original university project,
**Cost Manager Front-End**. Shlomi Hazan and Eldad Simanian built it together
as equal contributors for a Front-End Development course in August–September 2026.

Cost Manager Pro is an independent continuation of that project. The files
here are kept for history and attribution. **They do not set rules for
Cost Manager Pro.** The rules that apply now are in [`AGENTS.md`](../../../AGENTS.md)
and the documents it links to.

The files were moved here without content changes in Milestone 0 (M0). The
only edits since then are a short "archived" banner at the top of each file
and a guard at the top of the bootstrap script that stops it from running.

## Contents

| File | What it was |
|---|---|
| [`intent.txt`](intent.txt) | Course project purpose and priorities |
| [`REQUIREMENTS.md`](REQUIREMENTS.md) | Official course requirements register (`R-*`), team extensions (`X-*`), open questions (`OQ-*`) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Course-era planned architecture |
| [`TEST_PLAN.md`](TEST_PLAN.md) | Course-era test strategy |
| [`SUBMISSION_CHECKLIST.md`](SUBMISSION_CHECKLIST.md) | Moodle submission packaging checklist |
| [`PROJECT_ROADMAP_EN.md`](PROJECT_ROADMAP_EN.md), [`PROJECT_ROADMAP_HE.md`](PROJECT_ROADMAP_HE.md) | Course milestone plan (English and Hebrew) |
| [`START_HERE.md`](START_HERE.md) | Instructions for creating the original GitHub repository |
| [`scripts/bootstrap-github.sh`](scripts/bootstrap-github.sh) | Script that created the **original** repository. Guarded with `exit 1`; **do not run it** |

The architecture decisions from the course (ADR-001 to ADR-036) were not
moved. They are still in [`docs/DECISIONS.md`](../../DECISIONS.md), and M0
added new decisions there that replace some of them.

## Legacy references in source code

Some comments in `src/` and `tests/` still point to course documents by
their old paths, for example:

- `docs/REQUIREMENTS.md` with IDs such as `R-052`, `X-004`, `OQ-002`
- `docs/ARCHITECTURE.md §6`
- `docs/TEST_PLAN.md §15`

Those references mean the archived copies in this folder. M0 was not
allowed to edit source or test files. Updating these comments is listed as
a deferred task in [`docs/ROADMAP.md`](../../ROADMAP.md).

## Course constraint classification (M0)

Every rule that came from the course was reviewed and given one class:

- **A — Retain:** still useful for the working application.
- **B — Retire as an active requirement:** a course-only rule that no longer governs development.
- **C — Reevaluate in a future milestone:** may change, but only through its own decision, migration, or compatibility review.

**Retiring a rule does not remove the code that implements it.** M0 changed
no application behavior. Every behavior listed below still works as before,
until a later milestone changes it on purpose.

| # | Course constraint | Where it was stated | Class | What it means now |
|---|---|---|---|---|
| 1 | `getReport()` must return synchronously (the official sample calls it with no `await`) | R-052/R-065, OQ-003, ADR-008, OD-003, old AGENTS §4 | **C** | The grader no longer needs this. The rates cache in `src/lib/exchangeRatesCache.js` exists only because of it. Redesign belongs in M2. |
| 2 | Protected `db.openCostsDB / ob.addCost / ob.getReport` API, with fixed method names and argument order | R-063–R-066, ADR-008, old CLAUDE §5 | **C** | No longer an outside contract. The app still uses it, so changing it needs a planned refactor and tests. |
| 3 | Two `db.js` versions: one module, one standalone Vanilla with a global `db` | R-060–R-062, ADR-007 | **B** (keeping them in sync) / **C** (what to do with the file) | New features do **not** need to be copied into `vanilla/db.js`. The file and its tests stay, unchanged, until a later decision (M1 or M7). |
| 4 | Official Vanilla HTML sample test and grader compatibility | R-130, R-131, `vanilla/db-test.html` | **B** | Kept as a historical artifact. Not a release gate. |
| 5 | Currency ID `EURO` instead of ISO 4217 `EUR` | R-040, ADR-012, old AGENTS §3/§10 | **C** | Moving to `EUR` changes stored data and the rates format, so it needs a data migration (M2). |
| 6 | Exactly four currencies: USD, ILS, GBP, EURO | R-040 | **C** | Expanding the list belongs in M2. |
| 7 | USD is the main/base currency | R-012 | **C** | Unchanged for now. A user-chosen display currency is an M2 question. |
| 8 | English-only UI | R-011, old AGENTS §12 | **B** | Replaced: v1 must support English and Hebrew with RTL (ADR-038). |
| 9 | `localStorage` is the required storage; IndexedDB and others are forbidden | R-020, ADR-006, old AGENTS §5/§11 | **C** | Local-first stays. `localStorage` is the current engine. A different engine needs a decision (M1). |
| 10 | Exchange rates from a team-hosted static JSON, a default URL, and a custom URL in Settings | R-090–R-095, ADR-018/019/020 | **C** | The current fixed sample rates are not real market data. A real rates source belongs in M2. The Settings URL feature is kept until then. |
| 11 | Course style guide: at least one comment every 7 lines | R-120, R-121 | **B** | Comments should explain *why*, not meet a count. |
| 12 | JSDoc required on db/service functions (R-122); old CLAUDE.md said "no JSDoc unless requested" | R-122, old CLAUDE §15, old AGENTS §9 | **B** | The two rules conflicted. JSDoc is now optional and useful for public module APIs. |
| 13 | ESLint rules from the style guide: `no-var`, `eqeqeq`, `prefer-const`, single quotes, semicolons | R-120, `eslint.config.js` | **A** | Good general practice. The config is unchanged. |
| 14 | No React Router | ADR-010 | **C** | URL routing is being considered for M3 and needs its own decision. |
| 15 | No TypeScript | ADR-003 | **C** | Not planned. Adopting it needs a decision. |
| 16 | No global state library | ADR-009 | **A** | Still a good default. |
| 17 | Business logic stays outside React components | ADR-011 | **A** | Kept as a core engineering rule. |
| 18 | One list of supported currencies; one conversion function | ADR-012, ADR-013 | **A** | Kept. |
| 19 | Original cost amount and currency are never overwritten by conversion | R-036 | **A** | Kept as a financial-correctness rule. |
| 20 | Report shape `{ year, month, costs, total }` with item date `{ day }` | R-053, OQ-002 | **C** | Internal now. Can change through a planned refactor. |
| 21 | A cost's date is always the date it was added | R-035 | **C** | Users can already edit the date in Manage Costs. Choosing a date when adding belongs in M4. |
| 22 | Input validation kept loose so the grader's input is never rejected | ADR-023, OQ-005 | **C** | Product validation rules belong in M2. |
| 23 | No fixed category list | ADR-022, OQ-004 | **C** | Category management belongs in M4. |
| 24 | Target browser is the latest Google Chrome only | R-111 | **B** | Replaced: current evergreen desktop and mobile browsers, including iOS Safari (M7). |
| 25 | Desktop browser compatibility only | R-101 | **B** | Replaced: desktop and mobile have equal priority (ADR-039). |
| 26 | Moodle submission: ZIP, source PDF, demo video, deadline buffer, team manager submits | R-140–R-151 | **B** | Historical only. |
| 27 | Two-person team, teamwork grading, collaboration evidence | R-160–R-162, old CONTRIBUTING §12 | **B** (as process) / **A** (attribution) | Git history and credit for both original contributors are kept. |
| 28 | Every PR, test and comment references a requirement ID (`R-*`) | old TEST_PLAN §28, old PR template | **B** | New product requirement IDs are defined in [`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md). |
| 29 | Codex is the primary coding agent; Claude Code is mainly a reviewer | ADR-015, old AGENTS/CLAUDE | **B** | Replaced by agent-neutral rules in `AGENTS.md` (ADR-040). |
| 30 | "Requirement compliance beats visual complexity" | ADR-028 | **B** | Replaced by the product principles in [`docs/VISION.md`](../../VISION.md). Correctness still comes first. |
| 31 | Static front-end deployment; no secrets needed to run | ADR-025, ADR-026 | **A** | Kept. The hosting provider is still undecided. |
| 32 | Issue → branch → PR → review → merge; GitHub Actions CI | ADR-014, ADR-024 | **A** | Kept and refined in [`CONTRIBUTING.md`](../../../CONTRIBUTING.md). |
| 33 | `openCostsDB(name, version)` storage key; cost schema version 2 | ADR-029 | **A** | Existing stored data must stay readable. Schema changes need a migration (M1). |
| 34 | MUI for UI; Recharts as the only chart library | ADR-004, ADR-005 | **A** | Current stack. A change needs a decision. |

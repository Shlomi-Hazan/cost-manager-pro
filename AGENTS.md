# AGENTS.md — Operating Rules for Cost Manager Pro

These are the rules for **every** AI coding agent (Codex, Claude Code, or any
other) and every human contributor. This file is the single source of truth
for how work is done here ([ADR-040](docs/DECISIONS.md#adr-040--agentsmd-is-the-single-source-of-truth-for-coding-agents)).
Other agent files, such as `CLAUDE.md`, only point here and add
tool-specific notes.

## 1. The project

Cost Manager Pro is a local-first personal expense app (React, Vite, MUI,
Recharts). Data stays in the browser. It is an independent continuation of
the university project *Cost Manager Front-End*, which Shlomi Hazan and Eldad
Simanian built together. Course rules no longer apply
([ADR-037](docs/DECISIONS.md#adr-037--cost-manager-pro-is-an-independent-product-course-mandates-are-retired)).

## 2. Sources of truth

When two sources conflict, follow the one higher in this list:

1. The product owner's explicit instructions for the **currently authorized**
   task or milestone.
2. This file.
3. [`docs/VISION.md`](docs/VISION.md), [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md), [`docs/LOCALIZATION.md`](docs/LOCALIZATION.md).
4. Accepted decisions in [`docs/DECISIONS.md`](docs/DECISIONS.md).
5. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
6. Existing verified tests.
7. Existing implementation.

[`docs/archive/course/`](docs/archive/course/README.md) is **history only**.
It is not normative. Comments in the code that cite `R-*`, `X-*`, or `OQ-*`
IDs refer to that archive.

If sources conflict in a way that matters, stop and report the conflict.
Don't silently pick one.

## 3. Before changing anything

1. Read this file. Also read the documents above that relate to the task,
   plus [`CONTRIBUTING.md`](CONTRIBUTING.md).
2. Check `git status`, the current branch, and the remote. Never overwrite
   uncommitted work you didn't make.
3. Read the code **and its tests** that the change touches.
4. If the task refers to an Issue or PR, read all of it.

## 4. Milestones and scope

- Work only inside the authorized task or milestone ([`docs/ROADMAP.md`](docs/ROADMAP.md)).
- **Starting another milestone needs explicit authorization.** Finishing
  one is not permission to begin the next.
- If you find something out of scope, report it or record it as a future
  task. Don't fix it on the side.
- No unrelated refactors, renames, or formatting sweeps.

## 5. Git and infrastructure safety

- Use a feature branch for every change ([naming](CONTRIBUTING.md#branches)).
  Never commit directly to `main`.
- Never force-push, rewrite published history, or merge your own PR unless
  explicitly told to.
- Never change these without explicit instruction:
  - repository settings, visibility, collaborators, or secrets
  - CI/CD workflows or deployment configuration
  - production data or infrastructure
- **Never modify the original repository** `Shlomi-Hazan/cost-manager-front-end`.
  Never run anything in `docs/archive/course/scripts/`.
- Never commit secrets, tokens, credentials, `.env` files, `node_modules/`,
  or `dist/`.

## 6. Engineering principles

- Inspect first. Base recommendations on evidence (file and line, command
  output) rather than assumption.
- Choose the simplest design that solves the problem. No speculative
  abstractions or premature infrastructure.
- **Dependencies:** add one only when the benefit is clear and stated in the
  PR. Major technology changes need an ADR. These are possible future
  choices but are **not** adopted:
  - React Router
  - IndexedDB
  - TypeScript
  - an i18n library
  - a new hosting provider
- Keep business logic (money, currency, dates, aggregation, storage,
  validation) in plain modules outside React components, so it can be
  tested on its own.
- Remove duplication when it reduces risk or keeps behavior consistent; not
  for its own sake.
- Keep working behavior unless a change to it is authorized.
- **Comments explain *why*.** Don't add comments just to raise a count.
  JSDoc is optional; use it for public module APIs where it helps.
- Record important decisions in `docs/DECISIONS.md`. Update the relevant
  document whenever behavior or architecture changes.

## 7. Financial correctness (high-risk areas)

Treat money, currencies, exchange rates, dates, and stored data as
high-risk:

- **Never invent amounts or exchange rates.** The current default rates
  (`public/exchange-rates.json`) are fixed sample values, not market data.
  Never present them as real.
- Never overwrite a stored expense's original amount or currency during
  conversion.
- Rounding is defined and tested. Round only at the display edge, unless a
  documented policy says otherwise.
- Be explicit about time zones and which calendar day an expense falls on.
- **Protect user data.** Before changing a storage schema or key, plan the
  migration, test it, and make sure existing data stays readable. Never
  reset, overwrite, or delete stored data silently.
- Never claim the app is production-ready, secure, or accurate without
  evidence.

## 8. Product quality

- **Desktop and mobile have equal priority.** Check UI changes at mobile
  (360 px and up) and desktop widths.
- **English and Hebrew are required in v1**, with full RTL. Follow
  [`docs/LOCALIZATION.md`](docs/LOCALIZATION.md) once localization exists.
  Until then, don't add patterns that will block it, such as new
  `left`/`right`-only styling or string concatenation for sentences.
- **Accessibility is a core requirement** (target: WCAG 2.2 AA). This means:
  - semantic markup
  - labels
  - keyboard access
  - visible focus
  - sufficient contrast
- Keep visual language consistent with the theme. Don't scatter one-off
  colors and sizes.
- **Meaningful UI changes need a real browser check.** Unit tests alone
  aren't enough. Say what you checked and at which widths.

## 9. Legacy course code

- `vanilla/db.js`, `vanilla/db-test.html`, and their tests are frozen
  historical artifacts. Don't change them unless that is the authorized
  task. New features do not need to be copied into them.
- The synchronous `getReport()`, the `EURO` identifier, and the
  `localStorage` key format still exist in the code. Change them only in
  their planned milestone, with tests and data migration
  ([classification](docs/archive/course/README.md#course-constraint-classification-m0)).

## 10. Verification and honest reporting

- Before calling work done, run:
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - plus targeted tests for what changed
- Add regression tests for behavior changes and bug fixes. Never delete,
  weaken, or skip tests to make a change pass. If a test seems wrong, report
  it.
- Never install dependencies or create build artifacts outside a change
  that needs them. When you only need to verify, prefer an isolated clone.
- **Never claim a check passed unless you ran it.** Keep what you ran
  separate from what you assumed, and report known limitations.

Finish every task with:

- **Changed:** what was done.
- **Files:** what changed.
- **Requirements:** the IDs from `docs/REQUIREMENTS.md` it affects.
- **Validation:** the exact commands you ran and their results; manual and
  browser checks; anything not verified.
- **Notes:** assumptions, risks, deferred items, open decisions.

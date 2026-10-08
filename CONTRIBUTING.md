# Contributing to Cost Manager Pro

This is the engineering workflow for people and AI coding agents. The rules
that come first (scope, safety, financial correctness) are in
[`AGENTS.md`](AGENTS.md).

## Workflow

```text
Approved milestone / task  →  Issue (optional for small docs fixes)
  →  branch  →  focused commits  →  lint + tests + build (+ browser check for UI)
  →  pull request (draft until verified)  →  review  →  merge by the product owner
```

- Work happens on a branch, never directly on `main`.
- One milestone or task per branch. Don't mix unrelated changes.
- Never force-push shared branches or rewrite `main` history.

## Branches

Use lowercase kebab-case with a type prefix:

```text
feat/<topic>       new behavior          feat/expense-search
fix/<topic>        bug fix               fix/corrupted-storage-recovery
refactor/<topic>   no behavior change    refactor/shared-period-filter
test/<topic>       tests only            test/rtl-formatting
docs/<topic>       documentation only    docs/localization-contract
chore/<topic>      tooling, governance   chore/m0-project-governance
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes:
`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `style:`, `perf:`,
`ci:`, `build:`.

- One understandable change per commit. Say *what* in the title and *why*
  in the body when it isn't obvious.
- Avoid messages such as `update`, `changes`, or `final`.
- Keep commits that only move files separate from commits that edit them,
  so Git can track renames.

## Pull requests

A PR should be small enough to review in one sitting. The description
covers:

- **Summary:** what changed and why.
- **Scope:** the milestone or task; what was deliberately left out.
- **Requirements:** the IDs from [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) it affects.
- **Data impact:** schema or storage changes, and the migration plan.
- **Validation:** exact commands and results; browser checks (widths, and
  later languages and directions); screenshots for UI.
- **Risks, limitations, and deferred items.**

Open the PR as a **draft** until verification is complete.

## Code review

Reviews check these, in this order:

1. data safety and financial correctness
2. behavior regressions
3. scope
4. tests
5. accessibility, mobile, and RTL readiness
6. architecture boundaries
7. maintainability
8. visual polish

Group findings as Blocking, Important, or Optional. Blocking findings must
be fixed before merge. The product owner merges.

## Testing

- `npm run lint`, `npm test`, and `npm run build` must pass.
- Behavior changes and bug fixes need tests: unit tests for logic,
  component tests for UI. A bug fix starts with a test that reproduces the
  bug.
- Changes to storage need tests for existing data, damaged data, and
  migrations.
- UI changes need a manual browser check at mobile and desktop widths. Once
  localization exists, check in both `en` (LTR) and `he` (RTL).
- Never delete, weaken, or skip a test to get a change through.
- End-to-end and accessibility tests will be added in M7. Until then, say
  what was checked by hand.

## Documentation

Update the document that owns the topic (see the table in
[ADR-040](docs/DECISIONS.md#adr-040--agentsmd-is-the-single-source-of-truth-for-coding-agents)):

- requirement status → `docs/REQUIREMENTS.md`
- milestone status → `docs/ROADMAP.md`
- decisions → `docs/DECISIONS.md`
- structure → `docs/ARCHITECTURE.md`

Don't copy the same rules into several files.

## Definition of Done

A task is done only when:

- [ ] The authorized scope is implemented, and nothing else.
- [ ] Existing behavior is kept unless the change was authorized.
- [ ] Stored user data is safe, with a migration if the schema changed.
- [ ] Tests were added or updated, and lint, tests, and build pass.
- [ ] UI changes were checked in a browser at mobile and desktop widths
      (and both directions once localization exists).
- [ ] Accessibility was considered: labels, keyboard, focus, contrast.
- [ ] Documentation and requirement statuses are updated.
- [ ] The PR states what was verified and what wasn't.

## Milestone boundaries

Milestones are listed in [`docs/ROADMAP.md`](docs/ROADMAP.md). A milestone
starts only with the product owner's explicit authorization. Its scope and
acceptance criteria are confirmed before work begins. Work found along the
way that belongs to a later milestone is recorded there, not done early.

## Attribution

Cost Manager Pro began as *Cost Manager Front-End*, a university project
built together by Shlomi Hazan and Eldad Simanian. Their Git history and
authorship are kept. Never rewrite history or remove credit.

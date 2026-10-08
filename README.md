# Cost Manager Pro

> **Know your money. Feel in control.**

Cost Manager Pro is a local-first personal expense manager. It records
expenses in several currencies, shows where the money goes, and keeps your
data in your own browser.

> **Status: early independent development.** The app below works. Its
> known limitations are listed openly, and the planned improvements are in
> the [roadmap](docs/ROADMAP.md). It is **not** production-ready yet, and
> this repository has **no public live demo** yet. A Vercel deployment is
> prepared and waiting for approval.

## What it does today

- **Add expenses:** amount, currency, category (free text with
  suggestions), and description. The date and time are recorded
  automatically.
- **Manage expenses:** list, edit (including the date and time), and delete
  with confirmation.
- **Reports:** monthly and yearly reports, with sortable rows and a total
  converted into a chosen currency.
- **Charts:** a monthly pie chart by category and a yearly 12-month bar
  chart.
- **Currencies:** USD, ILS, GBP, and EURO. The original amount and currency
  of each expense are always kept.
- **Exchange rates:** fetched from a configurable URL, validated, and
  cached. The default rates are **fixed sample values, not live market
  rates**.
- **Export:** reports and chart data to Excel (`.xlsx`) and PDF.
- **Your data:** download a versioned backup file, restore it after a
  confirmation, and undo a restore. If saved data can't be read, it is
  never overwritten: saving pauses, and Settings offers recovery options.
  See [`docs/DATA_STORAGE.md`](docs/DATA_STORAGE.md).
- **Privacy:** no account, no backend, no analytics. Data is stored in your
  browser's `localStorage`.

### Known limitations

These are the main ones; details are in
[`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md):

- English only, left-to-right only. English and Hebrew (RTL) are planned
  for v1.
- Mobile layout is limited: navigation and the expense list don't fit
  small screens well.
- Amounts can show up to 6 decimal places. Money formatting and a rounding
  policy are planned.
- Data lives only in this browser on this device. Use **Settings → Your
  data → Download backup** regularly.
- The Dashboard links to the other sections but shows no data yet.
- Reports and charts need a manual "Generate" click.

## Tech stack

React 19 · Vite 8 · MUI 9 · Recharts 3 · Vitest 4 with Testing Library ·
ESLint 10 · GitHub Actions.

There is no backend. Data is stored in `localStorage`, and exchange rates
are loaded with the Fetch API. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run locally

You need Node.js 22 (the version used in CI) and npm.

```bash
npm ci
```

```bash
npm run dev
```

Then open the local URL Vite prints (usually `http://localhost:5173/`).

Other scripts:

| Command | Purpose |
|---|---|
| `npm test` | Run the unit and component tests (Vitest, jsdom) |
| `npm run lint` | Run ESLint |
| `npm run build` | Build for production into `dist/` |
| `npm run preview` | Serve the production build |

The production build is served from the domain root (for Vercel). See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for CI and deployment
preparation.

## Direction

Cost Manager Pro is growing into a polished, bilingual (English and Hebrew)
personal finance app. Desktop and mobile get equal priority. The focus is on
correctness, privacy, and accessibility. Planned milestones:

1. M1 — reliability, backup, and a live demo
2. M2 — accurate money handling and real exchange rates
3. M3 — design system, mobile and desktop shell, Hebrew RTL
4. M4 — a better expense-management experience
5. M5 — dashboard
6. M6 — budgets and insights
7. M7 — quality and accessibility
8. M8 — launch

## Documentation

| Document | Purpose |
|---|---|
| [`docs/VISION.md`](docs/VISION.md) | Product vision, users, principles, boundaries |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | What exists today, what is approved, what is optional |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestones M0–M8 and their status |
| [`docs/LOCALIZATION.md`](docs/LOCALIZATION.md) | English and Hebrew / RTL requirements |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Current architecture and direction |
| [`docs/DATA_STORAGE.md`](docs/DATA_STORAGE.md) | Storage keys, format, migrations, backup and restore, safeguards |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | CI, Vercel preparation, deployment prerequisites |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Architecture decision records |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Workflow, conventions, Definition of Done |
| [`AGENTS.md`](AGENTS.md) | Rules for AI coding agents and contributors |
| [`docs/archive/course/`](docs/archive/course/README.md) | Original university project documentation (historical) |

## Origin and credits

Cost Manager Pro is an independent continuation of **Cost Manager
Front-End**. That project was built as a collaborative university project
(Front-End Development course, 2026) by:

- **Shlomi Hazan** ([@Shlomi-Hazan](https://github.com/Shlomi-Hazan)), co-developer
- **Eldad Simanian** ([@eldadsimanian](https://github.com/eldadsimanian)), co-developer

Both are credited as co-developers of the original project. Its full Git
history and authorship are kept in this repository. The original repository,
[`Shlomi-Hazan/cost-manager-front-end`](https://github.com/Shlomi-Hazan/cost-manager-front-end),
remains unchanged as the record of the course submission.

Shlomi Hazan leads the independent development of Cost Manager Pro that
followed.

# Cost Manager Pro — CI/CD and Deployment

**Status (M1):** the repository is prepared for Vercel, but **no Vercel
project exists and nothing has been deployed** from this repository.
Connecting Vercel and the first deployment need separate approval
(ADR-044).

## 1. Continuous integration (GitHub Actions)

`.github/workflows/ci.yml` runs on every pull request to `main` and every
push to `main`:

```text
npm ci  →  npm run lint  →  npm test  →  npm run build
```

- It uses Node.js 22, has read-only repository permissions, needs no
  secrets, and has a 15-minute timeout.
- The GitHub Pages workflow (`deploy.yml`) was removed in M1. It was built
  for the original course deployment, failed on every push to this
  repository (Pages is not enabled here), and would have published under
  the wrong path. The original repository's own GitHub Pages site is not
  affected.

**Not configured (repository settings, outside M1):** branch protection
that requires the CI check before merging to `main`. Recommended; see §4.

## 2. Vercel configuration (`vercel.json`)

```json
{
  "framework": "vite",
  "installCommand": "npm ci",
  "buildCommand": "npm run lint && npm test && npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/((?!assets/).*)", "destination": "/index.html" }]
}
```

- **Root path:**
  - Vite builds with `base: '/'`. The built `index.html` loads
    `/assets/...`, and the default exchange-rate file is
    `/exchange-rates.json`. This was checked in a local production build in
    M1.
  - The old `/cost-manager-front-end/` path is gone.
- **Checks gate the deployment build:**
  - Vercel runs `buildCommand`, so a lint error or a failing test fails the
    Vercel build. A failed build produces no deployment, and the previous
    production deployment stays live.
  - Settings in `vercel.json` take precedence over project settings in the
    dashboard.
  - **This is configured but not yet verified**, because no Vercel build
    has run.
- **Future client-side routing:**
  - Any path that isn't a real file and isn't under `/assets/` is served
    `index.html`.
  - Vercel serves existing files (such as `/exchange-rates.json` and
    `/assets/...`) before applying rewrites.
  - A missing `/assets/...` file returns 404 instead of HTML.
  - No router is implemented (that is M3).
- **No secrets** are needed: no environment variables, and no tokens in the
  repository.

## 3. What gates a deployment, honestly

| Mechanism | Enforced today? |
|---|---|
| GitHub Actions CI on PRs and pushes to `main` | **Yes**, it runs on both. It reports results but cannot stop a Vercel deployment, because Vercel's Git integration deploys on its own |
| Lint and tests in Vercel's `buildCommand` | **Configured**, effective once Vercel is connected. A failing check fails that Vercel build, so nothing is deployed |
| Branch protection requiring CI before merge to `main` | **No**. It's a repository setting, left for the product owner |
| Vercel waiting for GitHub checks before promoting to production | **No**. It's a Vercel project setting, left for the product owner |

## 4. Manual deployment prerequisites (for the approved deployment step)

1. Product-owner approval to connect Vercel and deploy.
2. Create a Vercel project from `Shlomi-Hazan/cost-manager-pro`. Vercel
   should detect Vite and use `vercel.json`. Keep the root directory as `/`.
3. Production branch: `main`. Pull requests get preview deployments.
4. Don't add environment variables; none are needed.
5. Optional, recommended:
   - GitHub branch protection on `main` requiring the `CI / validate` check.
   - In Vercel, require GitHub checks before promoting to production, if
     that feature is available on the plan.
6. Confirm the Node.js version in Vercel matches CI (22.x).
7. After the first deployment, run the smoke test in §5 on the production
   URL. Only then record the URL in the README.

## 5. Production smoke test (after the first deployment)

- [ ] The site loads at the root URL with no console errors; all assets
      load.
- [ ] `/exchange-rates.json` loads, and Settings shows the default source.
- [ ] Add an expense, reload, and it is still there.
- [ ] Monthly and yearly reports and both charts generate, including a
      cross-currency total.
- [ ] Settings → Your data: download a backup, restore it, restore previous
      data.
- [ ] Checked at mobile (360–390 px) and desktop widths.
- [ ] A failing test on a branch makes its Vercel preview build fail.
- [ ] The original app (`shlomi-hazan.github.io/cost-manager-front-end/`)
      is unaffected.

## 6. Storage note for hosting

`localStorage` is per origin. A Vercel domain is a different origin from
`shlomi-hazan.github.io`, so the two apps cannot see each other's data in
production. M1 still namespaces every key (`cost-manager-pro:`) so they also
stay apart on shared origins such as `localhost`. See
[`DATA_STORAGE.md`](DATA_STORAGE.md).

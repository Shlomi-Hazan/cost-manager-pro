#!/usr/bin/env bash
set -euo pipefail

OWNER="Shlomi-Hazan"
REPO_NAME="cost-manager-front-end"
REPO="$OWNER/$REPO_NAME"
COLLABORATOR="eldadsimanian"

echo "== Cost Manager GitHub bootstrap =="
echo "Repository: $REPO"
echo "Collaborator: $COLLABORATOR"
echo

command -v git >/dev/null 2>&1 || { echo "ERROR: git is not installed."; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "ERROR: GitHub CLI (gh) is not installed."; exit 1; }

echo "[1/8] Checking GitHub authentication..."
gh auth status

LOGIN="$(gh api user --jq .login)"
if [[ "$LOGIN" != "$OWNER" ]]; then
  echo "ERROR: gh is authenticated as '$LOGIN', expected '$OWNER'."
  echo "Run: gh auth switch --user $OWNER"
  exit 1
fi

echo "[2/8] Initializing local Git repository..."
if [[ ! -d .git ]]; then
  git init
fi
git branch -M main

echo "[3/8] Creating initial foundation commit..."
git add .
if git diff --cached --quiet; then
  echo "No new files to commit."
else
  git commit -m "chore: initialize Cost Manager project"
fi

echo "[4/8] Creating / connecting public GitHub repository..."
if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "Repository already exists: $REPO"
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "https://github.com/$REPO.git"
  fi
  git push -u origin main
else
  gh repo create "$REPO" \
    --public \
    --description "Front-End Development final project — Cost Manager" \
    --source=. \
    --remote=origin \
    --push
fi

echo "[5/8] Inviting collaborator..."
if gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/$REPO/collaborators/$COLLABORATOR" \
  -f permission=push >/dev/null; then
  echo "Collaborator invitation/access configured for @$COLLABORATOR."
else
  echo "WARNING: Could not invite @$COLLABORATOR automatically."
  echo "You can add them manually in GitHub -> Settings -> Collaborators."
fi

echo "[6/8] Creating initial GitHub issues..."
create_issue_if_missing() {
  local title="$1"
  local body="$2"

  local count
  count="$(gh issue list --repo "$REPO" --state all --search "\"$title\" in:title" --json title --jq \
    "[.[] | select(.title == \"$title\")] | length")"

  if [[ "$count" == "0" ]]; then
    gh issue create --repo "$REPO" --title "$title" --body "$body" >/dev/null
    echo "Created: $title"
  else
    echo "Exists:  $title"
  fi
}

create_issue_if_missing \
  "feat: initialize React and Vite application skeleton" \
  "## Goal
Initialize the application skeleton for Milestone 1.

## Scope
- Create Vite + React app
- Configure JavaScript / JSX
- Add MUI
- Add Recharts
- Add Vitest
- Add ESLint
- Create initial page/layout skeleton only
- No business feature implementation yet

## Relevant documents
- intent.txt
- docs/REQUIREMENTS.md
- docs/ARCHITECTURE.md
- docs/TEST_PLAN.md
- AGENTS.md

## Acceptance Criteria
- [ ] App runs locally
- [ ] UI is English
- [ ] Base layout/navigation exists
- [ ] Empty views exist for Add Cost, Monthly Report, Charts, Settings
- [ ] npm run lint passes
- [ ] npm test passes
- [ ] npm run build passes"

create_issue_if_missing \
  "feat: implement core module-compatible db.js" \
  "## Goal
Implement the module-compatible data library.

## Requirement IDs
R-020, R-021, R-030 to R-036, R-050 to R-053, R-060, R-063 to R-066

## Protected API
db.openCostsDB(...) -> database object -> addCost(...) / getReport(...)

## Acceptance Criteria
- [ ] localStorage persistence works
- [ ] addCost preserves required fields
- [ ] automatic date is recorded
- [ ] getReport supports explicit month/year
- [ ] getReport defaults to current month/year
- [ ] relevant contract tests pass
- [ ] unresolved OQ items are not silently guessed"

create_issue_if_missing \
  "feat: implement standalone Vanilla db.js" \
  "## Goal
Create the standalone grader-compatible Vanilla db.js.

## Requirement IDs
R-060 to R-066, R-130, R-131

## Acceptance Criteria
- [ ] no imports
- [ ] no React/Vite runtime dependency
- [ ] global db exists
- [ ] official db-test.html works in Chrome
- [ ] ob.addCost(...) works
- [ ] ob.getReport(...) works
- [ ] behavior is covered beyond exact lecturer sample values"

create_issue_if_missing \
  "feat: implement Add Cost feature" \
  "## Requirement IDs
R-030 to R-036, R-040

## Acceptance Criteria
- [ ] sum input
- [ ] currency input using USD/ILS/GBP/EURO
- [ ] category input
- [ ] description input
- [ ] automatic date
- [ ] localStorage persistence
- [ ] original currency preserved
- [ ] clear success/error feedback"

create_issue_if_missing \
  "feat: implement exchange-rate infrastructure" \
  "## Requirement IDs
R-040, R-090 to R-095

## Acceptance Criteria
- [ ] team-controlled default web-hosted JSON source
- [ ] Fetch API used
- [ ] required JSON shape validated
- [ ] currency conversion utility tested
- [ ] app works without custom URL
- [ ] OQ-003 is handled without breaking grader API"

create_issue_if_missing \
  "feat: implement detailed monthly report" \
  "## Requirement IDs
R-050 to R-053, R-065

## Acceptance Criteria
- [ ] selected month
- [ ] selected year
- [ ] selected currency
- [ ] detailed cost list
- [ ] correct total
- [ ] empty month supported
- [ ] current month/year defaults supported
- [ ] OQ-001/OQ-002 decisions are documented before locking ambiguous behavior"

create_issue_if_missing \
  "feat: implement monthly category Pie Chart" \
  "## Requirement IDs
R-070, R-071

## Acceptance Criteria
- [ ] selected month/year
- [ ] selected currency
- [ ] category totals correct
- [ ] mixed-currency conversion uses shared utility
- [ ] no-data state handled
- [ ] aggregation tested independently from chart component"

create_issue_if_missing \
  "feat: implement yearly 12-month Bar Chart" \
  "## Requirement IDs
R-080, R-081

## Acceptance Criteria
- [ ] selected year
- [ ] selected currency
- [ ] exactly 12 months
- [ ] no-data months have zero totals
- [ ] aggregation tested independently from chart component"

create_issue_if_missing \
  "feat: implement exchange-rate Settings" \
  "## Requirement IDs
R-092, R-093, R-094

## Acceptance Criteria
- [ ] custom exchange-rate URL can be entered
- [ ] setting is persisted
- [ ] default URL remains available
- [ ] valid custom source works
- [ ] invalid/unavailable source handled cleanly"

create_issue_if_missing \
  "test: complete project QA and db.js compatibility coverage" \
  "## Goal
Complete automated and manual QA defined by docs/TEST_PLAN.md.

## Acceptance Criteria
- [ ] unit tests pass
- [ ] db contract tests pass
- [ ] official Vanilla HTML test passes in latest Chrome
- [ ] lint passes
- [ ] production build passes
- [ ] manual feature QA passes"

create_issue_if_missing \
  "chore: configure GitHub Actions CI" \
  "## Goal
Run automated validation on Pull Requests.

## Pipeline
- npm ci
- npm run lint
- npm test
- npm run build

## Acceptance Criteria
- [ ] workflow runs on Pull Requests
- [ ] failing checks are visible
- [ ] successful pipeline is documented"

create_issue_if_missing \
  "chore: deploy production application" \
  "## Requirement IDs
R-110, R-111

## Acceptance Criteria
- [ ] public production URL
- [ ] latest Chrome smoke test
- [ ] localStorage works on production origin
- [ ] Fetch works in production
- [ ] charts and reports work
- [ ] default exchange-rate source remains public"

create_issue_if_missing \
  "docs: complete final requirements audit and submission package" \
  "## Requirement IDs
R-140 to R-162 and all remaining mandatory requirements

## Acceptance Criteria
- [ ] requirement-by-requirement audit complete
- [ ] demo video uploaded Unlisted
- [ ] source-code PDF complete
- [ ] collaborative-tools summary <=100 words
- [ ] ZIP excludes node_modules
- [ ] standalone Vanilla db.js verified
- [ ] exactly three Moodle files prepared
- [ ] final production and Chrome checks pass"

echo "[7/8] Applying basic main branch protection..."
if gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/$REPO/branches/main/protection" \
  --input - >/dev/null 2>&1 <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
then
  echo "main protection enabled: PR + 1 approval, force-push/delete disabled."
else
  echo "WARNING: Branch protection could not be configured automatically."
  echo "Configure it manually later if needed."
fi

echo "[8/8] Final verification..."
git status
git remote -v
gh repo view "$REPO" --web=false

echo
echo "Bootstrap complete."
echo "Repository: https://github.com/$REPO"
echo "Next: wait for @$COLLABORATOR to accept the invitation, then begin Milestone 1 through a feature branch / Pull Request."

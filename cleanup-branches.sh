#!/usr/bin/env bash
set -euo pipefail
REPO="churchillkaron/churchill-control-new"

command -v gh >/dev/null 2>&1 || { echo "gh CLI required"; exit 1; }
gh auth status >/dev/null 2>&1 || gh auth login

echo "=== Open PRs (their branches will be SKIPPED, not deleted) ==="
OPEN_PR_BRANCHES=$(gh pr list --repo "$REPO" --state open --json headRefName --jq '.[].headRefName')
echo "$OPEN_PR_BRANCHES"
echo ""

echo "=== Deleting remote branches (except main and open-PR branches) ==="
git fetch origin --prune
for b in $(git branch -r --format='%(refname:short)' | grep '^origin/' | sed 's#^origin/##' | grep -v '^HEAD$' | grep -v '^main$'); do
  if echo "$OPEN_PR_BRANCHES" | grep -qx "$b"; then
    echo "SKIP (open PR): $b"
    continue
  fi
  echo "DELETE: $b"
  git push origin --delete "$b" || echo "  (failed, continuing)"
done

echo ""
echo "=== Locking branch creation to admins only (main stays exempt) ==="
gh api "repos/${REPO}/rulesets" -X POST \
  -f name="block-new-branches" \
  -f target="branch" \
  -f enforcement="active" \
  -F 'conditions[ref_name][include][]=~ALL' \
  -F 'conditions[ref_name][exclude][]=refs/heads/main' \
  -F 'rules[][type]=creation' \
  && echo "Ruleset created: only main can exist; new branch creation is now blocked for everyone without bypass rights." \
  || echo "Ruleset creation failed -- you may need to create it manually at https://github.com/${REPO}/settings/rules/new (target: branch creation, pattern: exclude main, block all others)"

echo ""
echo "Done. Verify at: https://github.com/${REPO}/branches and https://github.com/${REPO}/settings/rules"

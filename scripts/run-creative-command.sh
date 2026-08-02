#!/bin/sh
set -eu

NORMALIZED_INTENT=$(node scripts/creative-command-normalize-intent.mjs "$@")

node --loader ./scripts/next-alias-loader.mjs scripts/creative-command-preflight.mjs "$NORMALIZED_INTENT"
node --loader ./scripts/next-alias-loader.mjs scripts/creative-direction-sanitized-recovery-remediation.mjs "$NORMALIZED_INTENT"
node --loader ./scripts/next-alias-loader.mjs scripts/creative-direction-expired-approval-renewal.mjs "$NORMALIZED_INTENT"
node --loader ./scripts/next-alias-loader.mjs scripts/creative-direction-completed-budget-preflight.mjs "$NORMALIZED_INTENT"
node --loader ./scripts/next-alias-loader.mjs scripts/creative-direction-continuation-approval.mjs "$NORMALIZED_INTENT"
node --loader ./scripts/next-alias-loader.mjs scripts/creative-direction-approval.mjs "$NORMALIZED_INTENT"
exec node \
  --loader ./scripts/next-alias-loader.mjs \
  --import ./scripts/creative-runtime-bootstrap.mjs \
  scripts/creative-command.mjs "$NORMALIZED_INTENT"

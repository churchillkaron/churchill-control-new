#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

REPORT_DIR="${CREATIVE_SMOKE_REPORT_DIR:-$ROOT_DIR/audit-reports/runtime}"
mkdir -p "$REPORT_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
export CREATIVE_SMOKE_OUTPUT="${CREATIVE_SMOKE_OUTPUT:-$REPORT_DIR/creative-studio-release-smoke-$STAMP.json}"

printf '%s\n' "============================================================"
printf '%s\n' "AVANTIQO CREATIVE STUDIO RELEASE SMOKE"
printf '%s\n' "============================================================"
printf 'Project: %s\n' "$ROOT_DIR"
printf 'Target:  %s\n' "${CREATIVE_SMOKE_BASE_URL:-NOT_SET}"
printf 'Org:     %s\n' "${CREATIVE_SMOKE_ORGANIZATION_ID:-NOT_SET}"
printf 'Report:  %s\n' "$CREATIVE_SMOKE_OUTPUT"
printf '\n'

npm run smoke:creative-release
STATUS=$?

printf '\n'
printf 'SMOKE_EXIT=%s\n' "$STATUS"
printf 'REPORT=%s\n' "$CREATIVE_SMOKE_OUTPUT"
printf '\n'
printf '%s' "Terminal will stay open. Press Enter to finish..."
IFS= read -r _

exit "$STATUS"

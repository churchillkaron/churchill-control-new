#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
SOURCE_SCRIPT="$PROJECT_ROOT/scripts/run-finance-localhost-smoke.sh"
TEMP_SCRIPT="/tmp/avantiqo-finance-localhost-smoke-v2-$$.sh"

cleanup() {
  rm -f "$TEMP_SCRIPT"
}
trap cleanup EXIT

cd "$PROJECT_ROOT" || exit 1

if [ ! -f "$SOURCE_SCRIPT" ]; then
  echo "Finance localhost smoke runner is missing: $SOURCE_SCRIPT"
  exit 1
fi

node - "$SOURCE_SCRIPT" "$TEMP_SCRIPT" <<'NODE'
const fs = require("fs");
const sourcePath = process.argv[2];
const targetPath = process.argv[3];
let source = fs.readFileSync(sourcePath, "utf8");

const original = "const organizationId = clean(staff.organization_id);";
const corrected = "const organizationId = clean(staff.active_organization_id || staff.organization_id);";

if (!source.includes(corrected)) {
  if (!source.includes(original)) {
    throw new Error("Unable to locate the organization context resolver in the smoke runner");
  }
  source = source.replace(original, corrected);
}

source = source.replace(
  'console.error("The matching staff account has no organization_id");',
  'console.error("The matching staff account has no active_organization_id or organization_id");'
);

fs.writeFileSync(targetPath, source, { mode: 0o700 });
NODE

bash "$TEMP_SCRIPT"

#!/usr/bin/env bash
set -e
set -o pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d_%H%M%S)"
EXPECTED_PROJECT_REF="${CREATIVE_SUPABASE_PROJECT_REF:-vfsjqabpkcbiuerhzugk}"
TARGET_VERSION="20260722054500"
TARGET_FILE="supabase/migrations/20260722054500_creative_projects_canonical_storage.sql"
WORK_ROOT="$ROOT/.avantiqo-backups/creative-project-storage-$STAMP"
WORK_MIGRATIONS="$WORK_ROOT/supabase/migrations"
REPORT="$ROOT/creative-project-storage-$STAMP.txt"

exec > >(tee "$REPORT") 2>&1

printf '============================================================\n'
printf 'AVANTIQO CREATIVE PROJECT STORAGE DEPLOY\n'
printf '============================================================\n'
printf 'Repository: %s\n' "$ROOT"
printf 'Workspace: %s\n' "$WORK_ROOT"
printf 'Report: %s\n' "$REPORT"

for command in git supabase awk; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'FAIL: %s is required\n' "$command"
    exit 1
  }
done

[ -f "$TARGET_FILE" ] || {
  printf 'FAIL: target migration missing: %s\n' "$TARGET_FILE"
  exit 1
}

[ -f supabase/.temp/project-ref ] || {
  printf 'FAIL: linked Supabase project reference is unavailable\n'
  exit 1
}

ACTUAL_PROJECT_REF="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
[ "$ACTUAL_PROJECT_REF" = "$EXPECTED_PROJECT_REF" ] || {
  printf 'FAIL: linked project %s does not match expected %s\n' "$ACTUAL_PROJECT_REF" "$EXPECTED_PROJECT_REF"
  exit 1
}
printf 'PASS: linked project identity verified\n'

rm -rf "$WORK_ROOT"
mkdir -p "$WORK_ROOT/supabase"
cp supabase/config.toml "$WORK_ROOT/supabase/config.toml"
cp -R supabase/.temp "$WORK_ROOT/supabase/.temp"
mkdir -p "$WORK_MIGRATIONS"

MIGRATION_LIST="$WORK_ROOT/migration-list-before.txt"
supabase migration list --linked > "$MIGRATION_LIST"
cat "$MIGRATION_LIST"

printf '\nStaging remote migration history:\n'
awk -F'|' '
  {
    remote=$2;
    gsub(/[^0-9]/, "", remote);
    if (length(remote) == 14) print remote;
  }
' "$MIGRATION_LIST" | sort -u | while IFS= read -r version; do
  [ -n "$version" ] || continue
  source_file="$(find supabase/migrations -type f -name "${version}_*.sql" -print | head -n 1 || true)"
  [ -n "$source_file" ] || {
    printf 'FAIL: local SQL missing for remote migration %s\n' "$version"
    exit 1
  }
  cp "$source_file" "$WORK_MIGRATIONS/$(basename "$source_file")"
  printf '  REMOTE: %s\n' "$(basename "$source_file")"
done

cp "$TARGET_FILE" "$WORK_MIGRATIONS/$(basename "$TARGET_FILE")"
printf '  PENDING: %s\n' "$(basename "$TARGET_FILE")"

printf '\n============================================================\n'
printf 'DRY RUN\n'
printf '============================================================\n'
(
  cd "$WORK_ROOT"
  supabase db push --linked --dry-run
)
printf 'PASS: isolated dry run\n'

if [ "${APPLY_CREATIVE_PROJECT_STORAGE:-0}" != "1" ]; then
  printf 'WARN: dry-run only; set APPLY_CREATIVE_PROJECT_STORAGE=1 to apply\n'
  printf 'CREATIVE_PROJECT_STORAGE=DRY_RUN_PASS\n'
  exit 0
fi

printf '\n============================================================\n'
printf 'APPLY\n'
printf '============================================================\n'
(
  cd "$WORK_ROOT"
  supabase db push --linked --yes
)

FINAL_LIST="$WORK_ROOT/migration-list-after.txt"
supabase migration list --linked > "$FINAL_LIST"
cat "$FINAL_LIST"

if ! awk -F'|' -v wanted="$TARGET_VERSION" '
  {
    local_version=$1; remote_version=$2;
    gsub(/[^0-9]/, "", local_version);
    gsub(/[^0-9]/, "", remote_version);
    if (local_version == wanted && remote_version == wanted) found=1;
  }
  END { exit found ? 0 : 1 }
' "$FINAL_LIST"; then
  printf 'FAIL: target migration is not aligned remotely\n'
  exit 1
fi

printf 'PASS: Creative project storage migration applied and aligned\n'
printf 'CREATIVE_PROJECT_STORAGE=PASS\n'

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_ROOT="${CREATIVE_MIGRATION_BACKUP_DIR:-$ROOT/.avantiqo-backups/creative-migration-recovery-$STAMP}"
REPORT="${CREATIVE_MIGRATION_REPORT:-$ROOT/creative-migration-recovery-$STAMP.txt}"
EXPECTED_PROJECT_REF="${CREATIVE_SUPABASE_PROJECT_REF:-vfsjqabpkcbiuerhzugk}"

mkdir -p "$BACKUP_ROOT"
exec > >(tee "$REPORT") 2>&1

section() {
  printf '\n============================================================\n'
  printf '%s\n' "$1"
  printf '============================================================\n'
}

extract_versions() {
  local mode="$1"
  node - "$mode" <<'NODE'
const fs = require('fs');
const mode = process.argv[2];
const text = fs.readFileSync(0, 'utf8');
const rows = [];
for (const line of text.split(/\r?\n/)) {
  const match = line.match(/^\s*([0-9]{14})?\s*[│|]\s*([0-9]{14})?/u);
  if (!match) continue;
  const local = match[1] || null;
  const remote = match[2] || null;
  if (mode === 'remote-only' && !local && remote) rows.push(remote);
  if (mode === 'local-only' && local && !remote) rows.push(local);
  if (mode === 'matched' && local && remote && local === remote) rows.push(local);
}
process.stdout.write([...new Set(rows)].join('\n'));
NODE
}

migration_fetch() {
  if supabase migration fetch --help 2>&1 | grep -q -- '--linked'; then
    supabase migration fetch --linked
  else
    supabase migration fetch
  fi
}

section "AVANTIQO CREATIVE MIGRATION RECOVERY"
printf 'Repository: %s\n' "$ROOT"
printf 'Backup: %s\n' "$BACKUP_ROOT"
printf 'Report: %s\n' "$REPORT"
printf 'Expected Supabase ref: %s\n' "$EXPECTED_PROJECT_REF"
printf 'Started: %s\n' "$(date -Iseconds)"

for command in git node supabase; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'FAIL: %s is required\n' "$command"
    exit 1
  fi
  printf 'PASS: %s available\n' "$command"
done

section "PROJECT IDENTITY"
if [ -f supabase/.temp/project-ref ]; then
  ACTUAL_PROJECT_REF="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
  printf 'Linked Supabase ref: %s\n' "$ACTUAL_PROJECT_REF"
  if [ "$ACTUAL_PROJECT_REF" != "$EXPECTED_PROJECT_REF" ]; then
    printf 'FAIL: linked project is not the expected application project\n'
    exit 1
  fi
  printf 'PASS: linked project identity verified\n'
else
  printf 'WARN: supabase/.temp/project-ref unavailable; verify the linked project before continuing\n'
fi

section "BACKUP"
cp -R supabase/migrations "$BACKUP_ROOT/migrations-before"
printf 'PASS: local migration directory backed up\n'

SCHEMA_BACKUP_STATUS="SKIPPED"
if [ -n "${CREATIVE_REMOTE_DATABASE_URL:-}" ] && command -v pg_dump >/dev/null 2>&1; then
  if pg_dump --schema-only --no-owner --no-privileges \
    "$CREATIVE_REMOTE_DATABASE_URL" \
    > "$BACKUP_ROOT/remote-public-schema.sql"; then
    SCHEMA_BACKUP_STATUS="DIRECT_PG_DUMP"
    printf 'PASS: remote schema backed up with pg_dump\n'
  else
    printf 'WARN: direct pg_dump failed; migration recovery will remain non-destructive\n'
  fi
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if supabase db dump --linked --schema public \
    > "$BACKUP_ROOT/remote-public-schema.sql"; then
    SCHEMA_BACKUP_STATUS="SUPABASE_DOCKER_DUMP"
    printf 'PASS: remote public schema backed up with Supabase CLI\n'
  else
    printf 'WARN: Supabase schema dump failed; migration recovery will remain non-destructive\n'
  fi
else
  printf 'WARN: Docker is not running and no CREATIVE_REMOTE_DATABASE_URL was supplied.\n'
  printf 'WARN: remote schema dump skipped; only non-destructive migration fetch and dry-run are allowed.\n'
fi
printf '%s\n' "$SCHEMA_BACKUP_STATUS" > "$BACKUP_ROOT/schema-backup-status.txt"

if supabase migration list --linked > "$BACKUP_ROOT/migration-list-before.txt"; then
  cat "$BACKUP_ROOT/migration-list-before.txt"
else
  printf 'FAIL: unable to read migration history\n'
  exit 1
fi

REMOTE_ONLY_BEFORE="$(extract_versions remote-only < "$BACKUP_ROOT/migration-list-before.txt")"
LOCAL_ONLY_BEFORE="$(extract_versions local-only < "$BACKUP_ROOT/migration-list-before.txt")"

printf '\nRemote-only versions before recovery:\n%s\n' "${REMOTE_ONLY_BEFORE:-none}"
printf '\nLocal-only versions before recovery:\n%s\n' "${LOCAL_ONLY_BEFORE:-none}"

if [ -z "$REMOTE_ONLY_BEFORE" ]; then
  printf 'PASS: no remote-only migration history exists\n'
else
  section "NON-DESTRUCTIVE REMOTE MIGRATION FETCH"
  printf 'Fetching recorded migration statements from the linked Supabase project.\n'
  if migration_fetch; then
    printf 'PASS: migration fetch command completed\n'
  else
    printf 'FAIL: migration fetch failed\n'
    printf 'No migration history was modified by this script.\n'
    exit 1
  fi
fi

section "VERIFY RECOVERY"
if supabase migration list --linked > "$BACKUP_ROOT/migration-list-after-fetch.txt"; then
  cat "$BACKUP_ROOT/migration-list-after-fetch.txt"
else
  printf 'FAIL: unable to re-read migration history\n'
  exit 1
fi

REMOTE_ONLY_AFTER="$(extract_versions remote-only < "$BACKUP_ROOT/migration-list-after-fetch.txt")"
LOCAL_ONLY_AFTER="$(extract_versions local-only < "$BACKUP_ROOT/migration-list-after-fetch.txt")"

if [ -n "$REMOTE_ONLY_AFTER" ]; then
  printf '\nFAIL: remote-only migrations remain after non-destructive fetch:\n%s\n' "$REMOTE_ONLY_AFTER"
  printf '\nDo not run migration repair --status reverted.\n'
  printf 'The local migration backup and history reports are preserved at:\n%s\n' "$BACKUP_ROOT"
  printf 'A controlled migration-history recovery must be reviewed before changing production tracking records.\n'
  exit 2
fi

printf 'PASS: every remote migration now has a local migration file\n'
printf '\nPending local versions:\n%s\n' "${LOCAL_ONLY_AFTER:-none}"

section "DRY RUN"
if supabase db push --linked --dry-run; then
  printf 'PASS: Supabase db push dry-run\n'
else
  printf 'FAIL: dry-run rejected the recovered migration chain\n'
  exit 1
fi

if [ "${APPLY_CREATIVE_MIGRATIONS:-0}" = "1" ]; then
  section "APPLY PENDING MIGRATIONS"
  if supabase db push --linked; then
    printf 'PASS: pending migrations applied\n'
  else
    printf 'FAIL: Supabase db push failed\n'
    exit 1
  fi
else
  printf '\nWARN: dry-run only. Set APPLY_CREATIVE_MIGRATIONS=1 to apply after reviewing this report.\n'
fi

section "FINAL"
supabase migration list --linked
printf 'Schema backup status: %s\n' "$SCHEMA_BACKUP_STATUS"
printf 'Recovery report: %s\n' "$REPORT"
printf 'Backup directory: %s\n' "$BACKUP_ROOT"
printf 'CREATIVE_MIGRATION_RECOVERY=PASS\n'

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_ROOT="${CREATIVE_MIGRATION_BACKUP_DIR:-$ROOT/.avantiqo-backups/creative-migration-recovery-$STAMP}"
REPORT="${CREATIVE_MIGRATION_REPORT:-$ROOT/creative-migration-recovery-$STAMP.txt}"
EXPECTED_PROJECT_REF="${CREATIVE_SUPABASE_PROJECT_REF:-vfsjqabpkcbiuerhzugk}"
MIGRATION_DIR="$ROOT/supabase/migrations"

mkdir -p "$BACKUP_ROOT"
exec > >(tee "$REPORT") 2>&1

section() {
  printf '\n============================================================\n'
  printf '%s\n' "$1"
  printf '============================================================\n'
}

extract_versions() {
  local mode="$1"
  local file="$2"
  awk -F'|' -v mode="$mode" '
    {
      local=$1; remote=$2;
      gsub(/[^0-9]/, "", local);
      gsub(/[^0-9]/, "", remote);
      if (length(local) != 14) local="";
      if (length(remote) != 14) remote="";
      if (mode == "remote-only" && local == "" && remote != "") print remote;
      if (mode == "local-only" && local != "" && remote == "") print local;
      if (mode == "matched" && local != "" && local == remote) print local;
    }
  ' "$file" | sort -u
}

find_local_file() {
  local version="$1"
  find "$MIGRATION_DIR" -maxdepth 1 -type f -name "${version}_*.sql" -print -quit
}

restore_from_git() {
  local version="$1"
  local path commit
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    commit="$(git rev-list --all -- "$path" | head -n 1 || true)"
    [ -n "$commit" ] || continue
    if git cat-file -e "$commit:$path" 2>/dev/null; then
      git show "$commit:$path" > "$MIGRATION_DIR/$(basename "$path")"
      printf 'RESTORED_FROM_GIT: %s from %s\n' "$(basename "$path")" "$commit"
      return 0
    fi
  done < <(git log --all --name-only --pretty=format: -- "supabase/migrations/${version}_*.sql" | sed '/^$/d' | sort -u)
  return 1
}

restore_from_backups() {
  local version="$1"
  local source
  source="$(find "$ROOT/.avantiqo-backups" "$HOME/Downloads" -type f -name "${version}_*.sql" 2>/dev/null | head -n 1 || true)"
  [ -n "$source" ] || return 1
  cp "$source" "$MIGRATION_DIR/$(basename "$source")"
  printf 'RESTORED_FROM_BACKUP: %s\n' "$source"
}

run_fetch() {
  if supabase migration fetch --help 2>&1 | grep -q -- '--linked'; then
    supabase migration fetch --linked
  else
    supabase migration fetch
  fi
}

run_latest_fetch() {
  command -v npx >/dev/null 2>&1 || return 1
  npx --yes supabase@latest migration fetch
}

section "AVANTIQO CREATIVE MIGRATION RECOVERY"
printf 'Repository: %s\n' "$ROOT"
printf 'Backup: %s\n' "$BACKUP_ROOT"
printf 'Report: %s\n' "$REPORT"
printf 'Expected Supabase ref: %s\n' "$EXPECTED_PROJECT_REF"
printf 'Started: %s\n' "$(date -Iseconds)"

for command in git awk supabase; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'FAIL: %s is required\n' "$command"
    exit 1
  }
  printf 'PASS: %s available\n' "$command"
done

section "PROJECT IDENTITY"
if [ -f supabase/.temp/project-ref ]; then
  ACTUAL_PROJECT_REF="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
  printf 'Linked Supabase ref: %s\n' "$ACTUAL_PROJECT_REF"
  [ "$ACTUAL_PROJECT_REF" = "$EXPECTED_PROJECT_REF" ] || {
    printf 'FAIL: linked project is not the expected application project\n'
    exit 1
  }
  printf 'PASS: linked project identity verified\n'
else
  printf 'FAIL: linked Supabase project reference is unavailable\n'
  exit 1
fi

section "BACKUP"
cp -R "$MIGRATION_DIR" "$BACKUP_ROOT/migrations-before"
printf 'PASS: local migration directory backed up\n'

if supabase migration list --linked > "$BACKUP_ROOT/migration-list-before.txt"; then
  cat "$BACKUP_ROOT/migration-list-before.txt"
else
  printf 'FAIL: unable to read migration history\n'
  exit 1
fi

mapfile -t REMOTE_ONLY < <(extract_versions remote-only "$BACKUP_ROOT/migration-list-before.txt")
mapfile -t LOCAL_ONLY < <(extract_versions local-only "$BACKUP_ROOT/migration-list-before.txt")

printf '\nRemote-only versions before recovery:\n'
printf '%s\n' "${REMOTE_ONLY[@]:-none}"
printf '\nLocal-only versions before recovery:\n'
printf '%s\n' "${LOCAL_ONLY[@]:-none}"

section "RESTORE EXACT LOCAL MIGRATIONS"
for version in "${REMOTE_ONLY[@]}"; do
  [ -n "$version" ] || continue
  if [ -n "$(find_local_file "$version")" ]; then
    printf 'PASS: %s already exists locally\n' "$version"
    continue
  fi
  if restore_from_git "$version"; then
    continue
  fi
  if restore_from_backups "$version"; then
    continue
  fi
  printf 'UNRESOLVED_BEFORE_FETCH: %s\n' "$version"
done

if [ "${#REMOTE_ONLY[@]}" -gt 0 ]; then
  section "SUPABASE MIGRATION FETCH"
  if run_fetch; then
    printf 'PASS: installed Supabase CLI fetch completed\n'
  else
    printf 'WARN: installed Supabase CLI fetch failed\n'
  fi

  MISSING_AFTER_INSTALLED=0
  for version in "${REMOTE_ONLY[@]}"; do
    [ -n "$(find_local_file "$version")" ] || MISSING_AFTER_INSTALLED=$((MISSING_AFTER_INSTALLED + 1))
  done

  if [ "$MISSING_AFTER_INSTALLED" -gt 0 ]; then
    printf 'WARN: retrying migration fetch with latest Supabase CLI\n'
    if run_latest_fetch; then
      printf 'PASS: latest Supabase CLI fetch completed\n'
    else
      printf 'WARN: latest Supabase CLI fetch failed\n'
    fi
  fi
fi

section "STRICT FILE VERIFICATION"
UNRESOLVED=()
for version in "${REMOTE_ONLY[@]}"; do
  [ -n "$version" ] || continue
  file="$(find_local_file "$version")"
  if [ -n "$file" ]; then
    printf 'PASS: %s -> %s\n' "$version" "$(basename "$file")"
  else
    UNRESOLVED+=("$version")
    printf 'FAIL: no local SQL file for remote migration %s\n' "$version"
  fi
done

if [ "${#UNRESOLVED[@]}" -gt 0 ]; then
  printf '\nUnresolved remote migrations:\n'
  printf '%s\n' "${UNRESOLVED[@]}"
  printf '\nNo production migration history was modified.\n'
  printf 'Do not run migration repair --status reverted.\n'
  printf 'Recovery backup: %s\n' "$BACKUP_ROOT"
  printf 'CREATIVE_MIGRATION_RECOVERY=BLOCKED\n'
  exit 2
fi

section "VERIFY MIGRATION HISTORY"
supabase migration list --linked > "$BACKUP_ROOT/migration-list-after.txt"
cat "$BACKUP_ROOT/migration-list-after.txt"

mapfile -t REMOTE_ONLY_AFTER < <(extract_versions remote-only "$BACKUP_ROOT/migration-list-after.txt")
mapfile -t LOCAL_ONLY_AFTER < <(extract_versions local-only "$BACKUP_ROOT/migration-list-after.txt")

if [ "${#REMOTE_ONLY_AFTER[@]}" -gt 0 ]; then
  printf 'FAIL: remote-only migration rows remain:\n'
  printf '%s\n' "${REMOTE_ONLY_AFTER[@]}"
  exit 2
fi

printf 'PASS: local migration files cover every remote migration version\n'
printf '\nPending local versions:\n'
printf '%s\n' "${LOCAL_ONLY_AFTER[@]:-none}"

section "DRY RUN"
if supabase db push --linked --dry-run; then
  printf 'PASS: Supabase db push dry-run\n'
else
  printf 'FAIL: dry-run rejected the recovered migration chain\n'
  exit 1
fi

if [ "${APPLY_CREATIVE_MIGRATIONS:-0}" = "1" ]; then
  section "APPLY PENDING MIGRATIONS"
  supabase db push --linked
  printf 'PASS: pending migrations applied\n'
else
  printf '\nWARN: dry-run only. Set APPLY_CREATIVE_MIGRATIONS=1 after reviewing this report.\n'
fi

section "FINAL"
supabase migration list --linked
printf 'Recovery report: %s\n' "$REPORT"
printf 'Backup directory: %s\n' "$BACKUP_ROOT"
printf 'CREATIVE_MIGRATION_RECOVERY=PASS\n'

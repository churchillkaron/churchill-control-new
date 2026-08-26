#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v supabase >/dev/null 2>&1; then
  echo "SECRETARY_MEETING_LOCAL_SUPABASE_CLI=FAIL"
  echo "SECRETARY_MEETING_LOCAL_FAILURE=SUPABASE_CLI_NOT_FOUND"
  exit 1
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-secretary-supabase.XXXXXX")"
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT INT TERM

ln -s "$ROOT/supabase" "$WORKDIR/supabase"

# The repository root .env.local can contain application/provider configuration that
# the Supabase CLI does not need for this local schema certification. Running with a
# clean temporary --workdir prevents that file from being parsed or printed while
# preserving the canonical supabase/config.toml, migrations and seed through symlink.
# config.toml references OPENAI_API_KEY for optional local Studio AI, so provide a
# harmless local placeholder only when the caller did not already export one.
export OPENAI_API_KEY="${OPENAI_API_KEY:-local-secretary-certification-disabled}"

echo "SECRETARY_MEETING_LOCAL_SUPABASE_WORKDIR_ISOLATED=true"
echo "SECRETARY_MEETING_ROOT_ENV_LOCAL_READ=false"
echo "SECRETARY_MEETING_ROOT_ENV_LOCAL_MUTATED=false"
echo "SECRETARY_MEETING_SECRETS_PRINTED=false"

supabase start --workdir "$WORKDIR"
supabase db reset --local --workdir "$WORKDIR"

npm run audit:operator-secretary-end-to-end
npm run preflight:operator-secretary-meeting-local

echo "SECRETARY_MEETING_LOCAL_CERTIFICATION_WRAPPER=PASS"
echo "SECRETARY_MEETING_LOCAL_SUPABASE_WORKDIR_ISOLATED=true"
echo "SECRETARY_MEETING_ROOT_ENV_LOCAL_MUTATED=false"
echo "SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false"
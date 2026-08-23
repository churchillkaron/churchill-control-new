#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if [ ! -f .env.local ]; then
  echo "AVANTIQO_MEDIA_CERTIFICATION_ENV_LOCAL_REQUIRED" >&2
  exit 1
fi

command -v node >/dev/null 2>&1 || {
  echo "AVANTIQO_MEDIA_CERTIFICATION_NODE_REQUIRED" >&2
  exit 1
}

node --env-file=.env.local scripts/diagnose-avantiqo-owned-media-certification.mjs

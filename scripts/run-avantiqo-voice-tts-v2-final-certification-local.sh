#!/usr/bin/env bash

set -euo pipefail

ROOT="${AVANTIQO_PROJECT_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
cd "$ROOT"

fail() {
  echo "AVANTIQO_VOICE_TTS_V2_FINAL_CERTIFICATION=FAIL"
  echo "AVANTIQO_VOICE_TTS_V2_FINAL_CERTIFICATION_REASON=$1"
  exit 1
}

command -v node >/dev/null 2>&1 || fail "NODE_REQUIRED"
[ -f ".env.local" ] || fail "ENV_LOCAL_REQUIRED"
[ -f "scripts/audit-avantiqo-voice-tts-v2-contract-local.mjs" ] || fail "V2_CONTRACT_AUDIT_REQUIRED"
[ -f "scripts/repair-avantiqo-voice-tts-runtime-binding-local.mjs" ] || fail "RUNTIME_BINDING_REPAIR_REQUIRED"
[ -f "scripts/run-avantiqo-voice-tts-v3-one-proof-safe-lease-v2-local.mjs" ] || fail "SAFE_LEASE_PROOF_REQUIRED"

export AVANTIQO_VOICE_TTS_RUNTIME_BINDING_REPAIR_APPROVED=YES
export AVANTIQO_VOICE_TTS_V3_ONE_PROOF_APPROVED=YES
export AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES

node scripts/audit-avantiqo-voice-tts-v2-contract-local.mjs
node scripts/repair-avantiqo-voice-tts-runtime-binding-local.mjs --apply
node scripts/run-avantiqo-voice-tts-v3-one-proof-safe-lease-v2-local.mjs

cat <<'EOF'
AVANTIQO_VOICE_TTS_V2_FINAL_CERTIFICATION=PASS
AVANTIQO_VOICE_TTS_V2_FINAL_CERTIFICATION_GENERATION_LIMIT=1
AVANTIQO_VOICE_TTS_V2_FINAL_CERTIFICATION_PROFILE=avantiqo-secretary-v1
AVANTIQO_VOICE_TTS_V2_FINAL_CERTIFICATION_PERMANENT_REST_STATE=VOICE_TTS_0_0
AVANTIQO_VOICE_TTS_V2_FINAL_CERTIFICATION_STT_SUBMITTED=false
AVANTIQO_VOICE_TTS_V2_FINAL_CERTIFICATION_PRODUCTION_DEPLOY=false
AVANTIQO_VOICE_TTS_V2_FINAL_CERTIFICATION_PRICING_ACTIVATION=false
AVANTIQO_VOICE_TTS_V2_FINAL_CERTIFICATION_SECRETS_PRINTED=false
EOF

#!/usr/bin/env bash

set -euo pipefail

ROOT="${AVANTIQO_PROJECT_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
ENV_LOCAL="$ROOT/.env.local"
WORKFLOW="avantiqo-local-runpod-secret-sync.yml"
TMP_ROOT=""

fail() {
  echo "AVANTIQO_LOCAL_RUNPOD_SECRET_SYNC=FAIL"
  echo "AVANTIQO_LOCAL_RUNPOD_SECRET_SYNC_REASON=$1"
  exit 1
}

cleanup() {
  if [ -n "$TMP_ROOT" ] && [ -d "$TMP_ROOT" ]; then
    rm -rf "$TMP_ROOT" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

command -v git >/dev/null 2>&1 || fail "GIT_REQUIRED"
command -v node >/dev/null 2>&1 || fail "NODE_REQUIRED"
command -v gh >/dev/null 2>&1 || fail "GITHUB_CLI_REQUIRED"
[ -d "$ROOT/.git" ] || [ -f "$ROOT/.git" ] || fail "PROJECT_GIT_WORKTREE_REQUIRED"
[ -f "$ENV_LOCAL" ] || fail "ENV_LOCAL_REQUIRED"

gh auth status >/dev/null 2>&1 || fail "GITHUB_CLI_AUTH_REQUIRED"

REMOTE_URL="$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)"
case "$REMOTE_URL" in
  *github.com/churchillkaron/churchill-control-new* ) ;;
  * ) fail "UNEXPECTED_GITHUB_REPOSITORY" ;;
esac

SOURCE_ENV_HASH_BEFORE="$(git hash-object "$ENV_LOCAL" 2>/dev/null || true)"
[ -n "$SOURCE_ENV_HASH_BEFORE" ] || fail "ENV_LOCAL_HASH_FAILED"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-runpod-secret-sync.XXXXXX")" || fail "TEMP_DIRECTORY_CREATE_FAILED"
PRIVATE_KEY="$TMP_ROOT/private.pem"
PUBLIC_KEY_B64_FILE="$TMP_ROOT/public-key.b64"
ARTIFACT_DIR="$TMP_ROOT/artifact"
mkdir -p "$ARTIFACT_DIR"
chmod 700 "$TMP_ROOT"

NONCE="$(node --input-type=module - <<'NODE'
import { randomBytes } from "node:crypto";
process.stdout.write(`${Date.now().toString(36)}-${randomBytes(12).toString("hex")}`);
NODE
)"

node --input-type=module - "$PRIVATE_KEY" "$PUBLIC_KEY_B64_FILE" <<'NODE'
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";

const privatePath = process.argv[2];
const publicB64Path = process.argv[3];
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 3072,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(publicB64Path, Buffer.from(publicKey, "utf8").toString("base64"), { mode: 0o600 });
NODE

PUBLIC_KEY_B64="$(cat "$PUBLIC_KEY_B64_FILE")"
[ -n "$PUBLIC_KEY_B64" ] || fail "EPHEMERAL_PUBLIC_KEY_CREATE_FAILED"

echo "AVANTIQO_LOCAL_RUNPOD_SECRET_SYNC_SOURCE=GITHUB_ACTIONS_ENCRYPTED"
echo "AVANTIQO_LOCAL_RUNPOD_SECRET_SYNC_REQUEST=$NONCE"
echo "AVANTIQO_LOCAL_RUNPOD_SECRET_SYNC_SECRET_VALUES_PRINTED=false"
echo "AVANTIQO_LOCAL_RUNPOD_SECRET_SYNC_PLAINTEXT_ARTIFACT=false"

gh workflow run "$WORKFLOW" \
  --repo churchillkaron/churchill-control-new \
  --ref main \
  -f "public_key_b64=$PUBLIC_KEY_B64" \
  -f "request_nonce=$NONCE" >/dev/null \
  || fail "GITHUB_WORKFLOW_DISPATCH_FAILED"

RUN_ID=""
for _ in $(seq 1 30); do
  RUN_ID="$(
    gh run list \
      --repo churchillkaron/churchill-control-new \
      --workflow "$WORKFLOW" \
      --event workflow_dispatch \
      --limit 30 \
      --json databaseId,displayTitle \
      --jq ".[] | select(.displayTitle == \"Avantiqo local RunPod secret sync $NONCE\") | .databaseId" \
      2>/dev/null | head -n 1
  )"
  [ -n "$RUN_ID" ] && break
  sleep 2
done
[ -n "$RUN_ID" ] || fail "GITHUB_WORKFLOW_RUN_NOT_FOUND"

echo "AVANTIQO_LOCAL_RUNPOD_SECRET_SYNC_GITHUB_RUN_ID=$RUN_ID"

gh run watch "$RUN_ID" \
  --repo churchillkaron/churchill-control-new \
  --exit-status >/dev/null \
  || fail "GITHUB_SECRET_EXPORT_WORKFLOW_FAILED"

gh run download "$RUN_ID" \
  --repo churchillkaron/churchill-control-new \
  --name "avantiqo-local-runpod-secrets-$NONCE" \
  --dir "$ARTIFACT_DIR" >/dev/null \
  || fail "GITHUB_ENCRYPTED_SECRET_ARTIFACT_DOWNLOAD_FAILED"

ENVELOPE="$(find "$ARTIFACT_DIR" -type f -name "$NONCE.json" -print -quit)"
[ -n "$ENVELOPE" ] && [ -f "$ENVELOPE" ] || fail "GITHUB_ENCRYPTED_SECRET_ENVELOPE_MISSING"

SYNC_RESULT="$(
  node --input-type=module - "$PRIVATE_KEY" "$ENVELOPE" "$ENV_LOCAL" "$NONCE" <<'NODE'
import {
  constants,
  createDecipheriv,
  privateDecrypt,
} from "node:crypto";
import {
  chmodSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const privateKeyPath = process.argv[2];
const envelopePath = process.argv[3];
const envPath = process.argv[4];
const expectedNonce = process.argv[5];
const envelope = JSON.parse(readFileSync(envelopePath, "utf8"));
if (envelope?.contract !== "AVANTIQO_LOCAL_RUNPOD_SECRET_ENVELOPE_V1") {
  throw new Error("ENCRYPTED_SECRET_ENVELOPE_CONTRACT_INVALID");
}
if (String(envelope?.request_nonce ?? "") !== expectedNonce) {
  throw new Error("ENCRYPTED_SECRET_ENVELOPE_NONCE_MISMATCH");
}

const privateKey = readFileSync(privateKeyPath, "utf8");
const aesKey = privateDecrypt(
  {
    key: privateKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  },
  Buffer.from(String(envelope.encrypted_key_b64 ?? ""), "base64"),
);
const decipher = createDecipheriv(
  "aes-256-gcm",
  aesKey,
  Buffer.from(String(envelope.iv_b64 ?? ""), "base64"),
);
decipher.setAuthTag(Buffer.from(String(envelope.auth_tag_b64 ?? ""), "base64"));
const plaintext = Buffer.concat([
  decipher.update(Buffer.from(String(envelope.ciphertext_b64 ?? ""), "base64")),
  decipher.final(),
]);
const bundle = JSON.parse(plaintext.toString("utf8"));
if (bundle?.contract !== "AVANTIQO_LOCAL_RUNPOD_SECRET_VALUES_V1") {
  throw new Error("DECRYPTED_SECRET_BUNDLE_CONTRACT_INVALID");
}
if (String(bundle?.request_nonce ?? "") !== expectedNonce) {
  throw new Error("DECRYPTED_SECRET_BUNDLE_NONCE_MISMATCH");
}

const allowed = new Set([
  "RUNPOD_API_KEY",
  "RUNPOD_MANAGEMENT_API_KEY",
  "RUNPOD_AVANTIQO_IMAGE_API_KEY",
  "RUNPOD_AVANTIQO_VIDEO_API_KEY",
  "RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_CODE_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID",
  "RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID",
]);
const values = Object.fromEntries(
  Object.entries(bundle?.values || {})
    .filter(([key, value]) => allowed.has(key) && String(value ?? "").trim())
    .map(([key, value]) => [key, String(value)]),
);
if (!values.RUNPOD_API_KEY) throw new Error("RUNPOD_API_KEY_NOT_EXPORTED");
if (!values.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID) {
  throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID_NOT_EXPORTED");
}

let source = readFileSync(envPath, "utf8");
let changed = 0;
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const [key, value] of Object.entries(values)) {
  const nextLine = `${key}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^(?:export\\s+)?${escaped(key)}=.*$`, "m");
  if (pattern.test(source)) {
    const current = source.match(pattern)?.[0] || "";
    if (current !== nextLine) {
      source = source.replace(pattern, nextLine);
      changed += 1;
    }
  } else {
    if (source.length && !source.endsWith("\n")) source += "\n";
    source += `${nextLine}\n`;
    changed += 1;
  }
}

if (changed) {
  const tempPath = join(dirname(envPath), `.env.local.avantiqo-runpod-${process.pid}-${Date.now()}.tmp`);
  writeFileSync(tempPath, source, { mode: 0o600 });
  renameSync(tempPath, envPath);
}
chmodSync(envPath, 0o600);

const present = (key) => Boolean(String(values[key] ?? "").trim());
const lines = [
  `UPDATED_COUNT=${changed}`,
  `CONFIGURED_COUNT=${Object.keys(values).length}`,
  `RUNPOD_API_KEY=${present("RUNPOD_API_KEY") ? "YES" : "NO"}`,
  `RUNPOD_MANAGEMENT_API_KEY=${present("RUNPOD_MANAGEMENT_API_KEY") ? "YES" : "NO"}`,
  `IMAGE_ENDPOINT=${present("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID") ? "YES" : "NO"}`,
  `VIDEO_ENDPOINT=${present("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID") ? "YES" : "NO"}`,
  `INTELLIGENCE_ENDPOINT=${present("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID") ? "YES" : "NO"}`,
  `INTELLIGENCE_TRAINER_ENDPOINT=${present("RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID") ? "YES" : "NO"}`,
  `INTELLIGENCE_CANDIDATE_ENDPOINT=${present("RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID") ? "YES" : "NO"}`,
  `CODE_ENDPOINT=${present("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID") ? "YES" : "NO"}`,
  `VOICE_STT_ENDPOINT=${present("RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID") ? "YES" : "NO"}`,
  `VOICE_TTS_ENDPOINT=${present("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID") ? "YES" : "NO"}`,
  `AUDIO_ENDPOINT=${present("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID") ? "YES" : "NO"}`,
  `LIPSYNC_ENDPOINT=${present("RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID") ? "YES" : "NO"}`,
];
process.stdout.write(lines.join("\n"));
NODE
)" || fail "LOCAL_SECRET_DECRYPT_OR_ENV_MERGE_FAILED"

echo "AVANTIQO_LOCAL_RUNPOD_SECRET_SYNC_UPDATED_COUNT=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="UPDATED_COUNT" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_SECRET_SYNC_CONFIGURED_COUNT=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="CONFIGURED_COUNT" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_API_KEY_CONFIGURED=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="RUNPOD_API_KEY" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_MANAGEMENT_KEY_CONFIGURED=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="RUNPOD_MANAGEMENT_API_KEY" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_IMAGE_ENDPOINT_CONFIGURED=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="IMAGE_ENDPOINT" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_VIDEO_ENDPOINT_CONFIGURED=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="VIDEO_ENDPOINT" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_INTELLIGENCE_ENDPOINT_CONFIGURED=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="INTELLIGENCE_ENDPOINT" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_INTELLIGENCE_TRAINER_ENDPOINT_CONFIGURED=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="INTELLIGENCE_TRAINER_ENDPOINT" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_INTELLIGENCE_CANDIDATE_ENDPOINT_CONFIGURED=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="INTELLIGENCE_CANDIDATE_ENDPOINT" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_CODE_ENDPOINT_CONFIGURED=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="CODE_ENDPOINT" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_VOICE_STT_ENDPOINT_CONFIGURED=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="VOICE_STT_ENDPOINT" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_VOICE_TTS_ENDPOINT_CONFIGURED=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="VOICE_TTS_ENDPOINT" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_AUDIO_ENDPOINT_CONFIGURED=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="AUDIO_ENDPOINT" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_LIPSYNC_ENDPOINT_CONFIGURED=$(printf '%s\n' "$SYNC_RESULT" | awk -F= '$1=="LIPSYNC_ENDPOINT" {print $2; exit}')"
echo "AVANTIQO_LOCAL_RUNPOD_SECRET_SYNC_ENV_LOCAL_MODE=0600"
echo "AVANTIQO_LOCAL_RUNPOD_SECRET_SYNC_SECRET_VALUES_PRINTED=false"
echo "AVANTIQO_LOCAL_RUNPOD_SECRET_SYNC_PLAINTEXT_ARTIFACT=false"
echo "AVANTIQO_LOCAL_RUNPOD_SECRET_SYNC=PASS"

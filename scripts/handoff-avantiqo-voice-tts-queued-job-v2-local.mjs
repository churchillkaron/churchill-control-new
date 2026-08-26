import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_TTS_QUEUED_JOB_IMAGE_HANDOFF_SOURCE_RESOLVER_V2";
const EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const REQUEST_PATH = "audits/avantiqo-voice-tts-worker-image-refresh-request.json";

function text(value) { return String(value ?? "").trim(); }
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function runGit(args, optional = false) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    if (optional) return null;
    throw new Error(`GIT_${text(args[0]).toUpperCase()}_FAILED:${text(result.stderr).slice(0, 500)}`);
  }
  return result.stdout;
}
function readJsonAt(ref, path, optional = false) {
  const raw = runGit(["show", `${ref}:${path}`], optional);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch {
    if (optional) return null;
    throw new Error(`AVANTIQO_VOICE_TTS_HANDOFF_JSON_INVALID:${path}`);
  }
}

const requestedSourceSha = required("AVANTIQO_VOICE_TTS_EXPECTED_REFRESH_SOURCE_SHA");
if (!/^[a-f0-9]{40}$/i.test(requestedSourceSha)) {
  throw new Error("AVANTIQO_VOICE_TTS_EXPECTED_REFRESH_SOURCE_SHA_INVALID");
}

runGit(["fetch", "origin", "main", "--quiet"]);
const evidence = readJsonAt("origin/main", EVIDENCE_PATH);
const evidenceSourceSha = text(evidence?.tts?.source_sha);
let resolvedTriggerSha = null;
let matchedBy = null;

if (requestedSourceSha === evidenceSourceSha) {
  resolvedTriggerSha = evidenceSourceSha;
  matchedBy = "CERTIFIED_EVIDENCE_TRIGGER_SHA";
}

if (!resolvedTriggerSha) {
  const request = readJsonAt("origin/main", REQUEST_PATH, true);
  const requestSourceCommit = text(request?.source_commit);
  if (requestSourceCommit === requestedSourceSha) {
    const latestRequestCommit = text(runGit([
      "log",
      "-1",
      "--format=%H",
      "origin/main",
      "--",
      REQUEST_PATH,
    ]));
    if (!/^[a-f0-9]{40}$/i.test(latestRequestCommit)) {
      throw new Error("AVANTIQO_VOICE_TTS_HANDOFF_REFRESH_REQUEST_TRIGGER_SHA_REQUIRED");
    }
    resolvedTriggerSha = latestRequestCommit;
    matchedBy = "CURRENT_REFRESH_REQUEST_SOURCE_COMMIT";
  }
}

if (!resolvedTriggerSha && /^[a-f0-9]{40}$/i.test(evidenceSourceSha)) {
  const evidenceRequest = readJsonAt(evidenceSourceSha, REQUEST_PATH, true);
  if (text(evidenceRequest?.source_commit) === requestedSourceSha) {
    resolvedTriggerSha = evidenceSourceSha;
    matchedBy = "CERTIFIED_REFRESH_REQUEST_SOURCE_COMMIT";
  }
}

if (!resolvedTriggerSha) {
  const request = readJsonAt("origin/main", REQUEST_PATH, true);
  throw new Error(
    "AVANTIQO_VOICE_TTS_HANDOFF_SOURCE_SHA_NOT_RESOLVABLE:" +
    `requested=${requestedSourceSha}:` +
    `certified_trigger=${evidenceSourceSha || "NONE"}:` +
    `current_request_source=${text(request?.source_commit) || "NONE"}`,
  );
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  requested_source_sha: requestedSourceSha,
  resolved_refresh_trigger_sha: resolvedTriggerSha,
  matched_by: matchedBy,
  generation_submitted: false,
  job_cancel_requested: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}));

process.env.AVANTIQO_VOICE_TTS_EXPECTED_REFRESH_SOURCE_SHA = resolvedTriggerSha;
await import("./handoff-avantiqo-voice-tts-queued-job-to-certified-image-local.mjs");

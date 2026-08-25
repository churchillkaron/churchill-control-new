import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_SCALE_TO_ZERO_EXISTING_JOB_V1";
const RESIDENT_CONTRACT = "AVANTIQO_VOICE_TTS_RESIDENT_IMAGE_RECOVERY_V1";
const ENDPOINT_ID = "d7zzs3609cn5un";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const REQUIRED_TRIGGER = "0658362e9c8857cbf7d62d13e132d2beb9b1f147";
const FOUNDATION = "resemble-ai/chatterbox:multilingual-v3";
const EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const STATE_PATH = process.env.AVANTIQO_VOICE_TTS_RESIDENT_STATE || "/tmp/avantiqo-voice-tts-resident-recovery-state.json";
const REPORT_PATH = process.env.AVANTIQO_VOICE_TTS_SCALE_ZERO_REPORT || "/tmp/avantiqo-voice-tts-scale-zero-existing-job-report.json";
const AUDIO_PATH = process.env.AVANTIQO_VOICE_TTS_RESIDENT_AUDIO || path.join(os.homedir(), "Downloads", "avantiqo-voice-tts-blackwell.wav");
const BUILD_WAIT_MS = 45 * 60_000;
const JOB_WAIT_MS = 20 * 60_000;
const POLL_MS = 3000;
const TERMINAL = new Set(["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}

async function parseJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function rest(pathname, key, options = {}) {
  return parseJson(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_SCALE_ZERO_REST");
}

async function queueRaw(pathname, key) {
  const response = await fetch(`${QUEUE}/${encodeURIComponent(ENDPOINT_ID)}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  return { response, body: body || {} };
}

async function queueRead(pathname, credentials) {
  const candidates = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let last = null;
  for (const key of candidates) {
    const { response, body } = await queueRaw(pathname, key);
    if (response.ok) return body;
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_VOICE_TTS_SCALE_ZERO_QUEUE_HTTP_${response.status}:${text(body?.error || body?.message)}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_SCALE_ZERO_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_SCALE_ZERO_QUEUE_CREDENTIAL_REQUIRED");
}

async function endpoint(key) {
  const value = await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, key);
  if (text(value?.id) !== ENDPOINT_ID || text(value?.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_ENDPOINT_MISMATCH");
  }
  if (Number(value?.workersMax) !== 1) {
    throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_WORKERS_MAX_UNSAFE:${value?.workersMax}`);
  }
  return value;
}

async function workersMinZero(key) {
  let value = await endpoint(key);
  if (Number(value?.workersMin) !== 0) {
    await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, key, {
      method: "PATCH",
      body: { workersMin: 0 },
    });
    value = await endpoint(key);
  }
  if (Number(value?.workersMin) !== 0 || Number(value?.workersMax) !== 1) {
    throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_VERIFY_FAILED:min=${value?.workersMin}:max=${value?.workersMax}`);
  }
  return value;
}

async function endpointBoundTemplates(key) {
  const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key);
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_TEMPLATE_LIST_INVALID");
  return templates;
}

function templateUpdateBody(template, imageName) {
  const authId = text(template?.containerRegistryAuthId);
  if (!authId) throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_GHCR_AUTH_REQUIRED");
  return {
    containerDiskInGb: Math.max(1, Number(template?.containerDiskInGb) || 30),
    containerRegistryAuthId: authId,
    dockerEntrypoint: list(template?.dockerEntrypoint),
    dockerStartCmd: list(template?.dockerStartCmd),
    env: Object.fromEntries(Object.entries(object(template?.env)).map(([key, value]) => [key, String(value ?? "")])),
    imageName,
    isPublic: template?.isPublic === true,
    name: text(template?.name),
    ports: list(template?.ports),
    readme: text(template?.readme),
    volumeInGb: Math.max(0, Number(template?.volumeInGb) || 0),
    volumeMountPath: text(template?.volumeMountPath) || "/workspace",
  };
}

async function bindImage(image, key) {
  const currentEndpoint = await endpoint(key);
  const templateId = text(currentEndpoint?.templateId || currentEndpoint?.template?.id);
  const templates = await endpointBoundTemplates(key);
  const template = templates.find((item) => text(item?.id) === templateId);
  if (!template) throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_BOUND_TEMPLATE_NOT_FOUND");
  if (text(template?.imageName) !== image) {
    await rest(`/templates/${encodeURIComponent(templateId)}/update`, key, {
      method: "POST",
      body: templateUpdateBody(template, image),
    });
  }
  const verified = (await endpointBoundTemplates(key)).find((item) => text(item?.id) === templateId);
  if (text(verified?.imageName) !== image) {
    throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_IMAGE_BIND_VERIFY_FAILED");
  }
  return templateId;
}

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`GIT_${args[0].toUpperCase()}_FAILED:${text(result.stderr).slice(0, 500)}`);
  return result.stdout;
}

function evidenceFromOrigin() {
  runGit(["fetch", "origin", "main", "--quiet"]);
  return JSON.parse(runGit(["show", `origin/main:${EVIDENCE_PATH}`]));
}

function validateEvidence(report) {
  const tts = object(report?.tts);
  const sourceSha = text(tts?.source_sha);
  const image = text(tts?.immutable_image_reference);
  const valid =
    report?.contract === "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1" &&
    report?.success === true &&
    text(report?.trigger_sha) === REQUIRED_TRIGGER &&
    tts?.success === true &&
    sourceSha === REQUIRED_TRIGGER &&
    tts?.source_sha_matches_trigger === true &&
    tts?.preflight_outcome === "success" &&
    tts?.build_outcome === "success" &&
    tts?.startup_probe_outcome === "success" &&
    tts?.blackwell_sm120_compiled === true &&
    tts?.container_startup_probe_passed_by_github_build === true &&
    text(tts?.foundation_model) === FOUNDATION &&
    text(tts?.cuda_runtime_expected) === "12.8" &&
    /^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image) &&
    report?.provider_job_submitted === false &&
    report?.production_web_deploy === false &&
    report?.pricing_activation_performed === false;
  return valid ? {
    image,
    source_sha: sourceSha,
    image_digest: text(tts?.image_digest),
    github_run_id: text(report?.github_run_id) || null,
  } : null;
}

async function waitEvidence() {
  const deadline = Date.now() + BUILD_WAIT_MS;
  let lastSource = null;
  while (Date.now() < deadline) {
    try {
      const report = evidenceFromOrigin();
      const valid = validateEvidence(report);
      if (valid) return valid;
      const source = text(report?.tts?.source_sha) || "NONE";
      if (source !== lastSource) {
        console.log(JSON.stringify({
          event: "AVANTIQO_VOICE_TTS_SCALE_ZERO_IMAGE_WAIT",
          current_source_sha: source,
          required_source_sha: REQUIRED_TRIGGER,
          workers_min: 0,
          generation_submitted: false,
          duplicate_generation_submitted: false,
          secrets_printed: false,
        }));
        lastSource = source;
      }
    } catch (error) {
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_TTS_SCALE_ZERO_IMAGE_WAIT",
        error: text(error?.message || error).slice(0, 300),
        workers_min: 0,
        generation_submitted: false,
        secrets_printed: false,
      }));
    }
    await sleep(15_000);
  }
  throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_IMAGE_EVIDENCE_TIMEOUT");
}

function validateAudio(body = {}) {
  const output = object(body?.output);
  const audio = Buffer.from(text(output?.audio_base64), "base64");
  if (
    audio.length <= 1000 ||
    audio.subarray(0, 4).toString("ascii") !== "RIFF" ||
    text(output?.format).toLowerCase() !== "wav" ||
    text(output?.capability) !== "ai.text.to.speech" ||
    text(output?.foundation_model) !== FOUNDATION ||
    output?.voice_cloning_used !== false ||
    output?.raw_reasoning_persisted !== false
  ) {
    throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_AUDIO_INVALID");
  }
  return {
    audio,
    bytes: audio.length,
    sample_rate: Number(output?.sample_rate) || null,
    generation_seconds: Number(output?.generation_seconds) || null,
  };
}

async function saveAndPlay(body, meta, credentials) {
  const validated = validateAudio(body);
  await mkdir(path.dirname(AUDIO_PATH), { recursive: true });
  await writeFile(AUDIO_PATH, validated.audio);
  await workersMinZero(credentials.management);
  const report = {
    success: true,
    contract: CONTRACT,
    endpoint_id: ENDPOINT_ID,
    job_id: meta.job_id,
    image: meta.image,
    source_sha: meta.source_sha,
    image_digest: meta.image_digest,
    github_run_id: meta.github_run_id,
    audio_path: AUDIO_PATH,
    audio_bytes: validated.bytes,
    sample_rate: validated.sample_rate,
    generation_seconds: validated.generation_seconds,
    workers_min: 0,
    workers_max: 1,
    always_on_billing_enabled: false,
    generation_submitted: false,
    duplicate_generation_submitted: false,
    stt_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(STATE_PATH, `${JSON.stringify({ contract: RESIDENT_CONTRACT, state: "COMPLETED", ...report }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`AVANTIQO_VOICE_TTS_RESIDENT_AUDIO=${AUDIO_PATH}`);
  if (process.platform === "darwin") {
    const playback = spawnSync("afplay", [AUDIO_PATH], { stdio: "inherit" });
    console.log(`AVANTIQO_VOICE_TTS_RESIDENT_AFPLAY_STATUS=${playback.status ?? "UNKNOWN"}`);
  }
}

const approved = text(process.env.AVANTIQO_VOICE_TTS_SCALE_ZERO_EXISTING_JOB_APPROVED).toUpperCase() === "YES";
if (!approved) throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_EXISTING_JOB_APPROVED=YES_REQUIRED");

const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};

await workersMinZero(credentials.management);
const state = JSON.parse(await readFile(STATE_PATH, "utf8"));
if (
  state?.contract !== RESIDENT_CONTRACT ||
  state?.state !== "SUBMITTED" ||
  text(state?.endpoint_id) !== ENDPOINT_ID ||
  !text(state?.job_id) ||
  state?.duplicate_generation_allowed !== false
) {
  throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_STATE_UNSAFE");
}

const jobId = text(state.job_id);
let job = await queueRead(`/status/${encodeURIComponent(jobId)}`, credentials);
let status = text(job?.status).toUpperCase() || "UNKNOWN";

if (status === "COMPLETED") {
  await saveAndPlay(job, {
    job_id: jobId,
    image: text(state?.image) || null,
    source_sha: text(state?.source_sha) || null,
    image_digest: null,
    github_run_id: null,
  }, credentials);
} else {
  if (TERMINAL.has(status)) {
    throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_EXISTING_JOB_${status}`);
  }
  if (!new Set(["IN_QUEUE", "IN_PROGRESS"]).has(status)) {
    throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_EXISTING_JOB_STATUS_UNSAFE:${status}`);
  }

  let evidence = null;
  if (status === "IN_QUEUE") {
    evidence = await waitEvidence();
    await workersMinZero(credentials.management);
    const templateId = await bindImage(evidence.image, credentials.management);
    await writeFile(STATE_PATH, `${JSON.stringify({
      ...state,
      state: "SUBMITTED",
      template_id: templateId,
      image: evidence.image,
      source_sha: evidence.source_sha,
      healthy_startup_rebind: true,
      workers_min: 0,
      duplicate_generation_allowed: false,
      secrets_recorded: false,
    }, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_SCALE_ZERO_IMAGE_BOUND_TO_EXISTING_JOB",
      job_id: jobId,
      image_digest: evidence.image_digest,
      source_sha: evidence.source_sha,
      workers_min: 0,
      workers_max: 1,
      generation_submitted: false,
      duplicate_generation_submitted: false,
      secrets_printed: false,
    }));
  }

  const deadline = Date.now() + JOB_WAIT_MS;
  let lastPrint = 0;
  try {
    while (Date.now() < deadline) {
      job = await queueRead(`/status/${encodeURIComponent(jobId)}`, credentials);
      status = text(job?.status).toUpperCase() || "UNKNOWN";
      if (Date.now() - lastPrint >= 15_000 || TERMINAL.has(status)) {
        console.log(JSON.stringify({
          event: "AVANTIQO_VOICE_TTS_SCALE_ZERO_EXISTING_JOB_PROGRESS",
          job_id: jobId,
          status,
          workers_min: 0,
          generation_submitted: false,
          duplicate_generation_submitted: false,
          secrets_printed: false,
        }));
        lastPrint = Date.now();
      }
      if (status === "COMPLETED") {
        const finalState = JSON.parse(await readFile(STATE_PATH, "utf8"));
        await saveAndPlay(job, {
          job_id: jobId,
          image: text(finalState?.image) || evidence?.image || null,
          source_sha: text(finalState?.source_sha) || evidence?.source_sha || null,
          image_digest: evidence?.image_digest || null,
          github_run_id: evidence?.github_run_id || null,
        }, credentials);
        break;
      }
      if (TERMINAL.has(status)) {
        throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_EXISTING_JOB_${status}`);
      }
      await sleep(POLL_MS);
    }
    if (status !== "COMPLETED") {
      throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_EXISTING_JOB_TIMEOUT:${status}`);
    }
  } finally {
    await workersMinZero(credentials.management);
  }
}

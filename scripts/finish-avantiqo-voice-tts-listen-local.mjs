import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_VOICE_TTS_LISTEN_FINISH_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const REQUIRED_CUDA = "12.8";
const REQUIRED_TORCH = "2.7.0";
const EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const REPAIR_SCRIPT = "scripts/repair-avantiqo-voice-tts-runpod-image-local.mjs";
const SMOKE_SCRIPT = "scripts/smoke-avantiqo-voice-tts-cold-start-local.mjs";
const AUDIO_PATH = "/tmp/avantiqo-voice-tts-cold-start-smoke.wav";
const WAIT_MS = Math.max(60_000, Math.min(60 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_LISTEN_WAIT_MS || 45 * 60_000)));
const POLL_MS = Math.max(10_000, Math.min(60_000, Number(process.env.AVANTIQO_VOICE_TTS_LISTEN_POLL_MS || 20_000)));
const DRAIN_TIMEOUT_MS = Math.max(30_000, Math.min(10 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_LISTEN_DRAIN_TIMEOUT_MS || 5 * 60_000)));

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase());
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function command(name, args, options = {}) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: options.env || process.env,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = text(result.stderr || result.stdout).slice(0, 1500);
    throw new Error(`${options.errorCode || "COMMAND_FAILED"}:${detail || `exit=${result.status}`}`);
  }
  return options.inherit ? "" : text(result.stdout);
}

function pullNewestMain() {
  const branch = command("git", ["branch", "--show-current"], { errorCode: "VOICE_TTS_LISTEN_GIT_BRANCH_FAILED" });
  if (branch !== "main") throw new Error(`VOICE_TTS_LISTEN_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  command("git", ["fetch", "origin", "main"], { errorCode: "VOICE_TTS_LISTEN_GIT_FETCH_FAILED" });
  command("git", ["merge", "--ff-only", "origin/main"], { errorCode: "VOICE_TTS_LISTEN_GIT_FAST_FORWARD_FAILED" });
  return command("git", ["rev-parse", "HEAD"], { errorCode: "VOICE_TTS_LISTEN_GIT_HEAD_FAILED" });
}

async function readEvidence() {
  try {
    return JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function evidenceReady(report) {
  const tts = report?.tts || {};
  return Boolean(
    report?.success === true &&
    report?.contract === "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1" &&
    tts?.success === true &&
    tts?.source_sha_matches_trigger === true &&
    text(tts?.source_sha) &&
    text(tts?.source_sha) === text(report?.trigger_sha) &&
    tts?.preflight_outcome === "success" &&
    tts?.build_outcome === "success" &&
    tts?.startup_probe_outcome === "success" &&
    tts?.import_smoke_passed_by_docker_build === true &&
    tts?.container_startup_probe_passed_by_github_build === true &&
    tts?.bootstrap_breadcrumb_baked === true &&
    text(tts?.image_platform) === "linux/amd64" &&
    text(tts?.cuda_runtime_expected) === REQUIRED_CUDA &&
    text(tts?.torch_runtime_expected) === REQUIRED_TORCH &&
    tts?.blackwell_sm120_compiled === true &&
    /^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(text(tts?.immutable_image_reference)) &&
    report?.production_web_deploy === false &&
    report?.provider_job_submitted === false &&
    report?.pricing_activation_performed === false
  );
}

async function waitForBlackwellEvidence() {
  const deadline = Date.now() + WAIT_MS;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    const head = pullNewestMain();
    const report = await readEvidence();
    if (evidenceReady(report)) {
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_TTS_LISTEN_IMAGE_READY",
        contract: CONTRACT,
        head,
        source_sha: report.tts.source_sha,
        image: report.tts.immutable_image_reference,
        cuda: report.tts.cuda_runtime_expected,
        torch: report.tts.torch_runtime_expected,
        blackwell_sm120_compiled: true,
        wait_attempts: attempts,
        secrets_printed: false,
      }));
      return report;
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_LISTEN_WAITING_FOR_BLACKWELL_IMAGE",
      contract: CONTRACT,
      head,
      attempt: attempts,
      current_cuda: text(report?.tts?.cuda_runtime_expected) || null,
      current_torch: text(report?.tts?.torch_runtime_expected) || null,
      current_blackwell_sm120: report?.tts?.blackwell_sm120_compiled === true,
      paid_generation_submitted: false,
      secrets_printed: false,
    }));
    await sleep(POLL_MS);
  }
  throw new Error("AVANTIQO_VOICE_TTS_LISTEN_BLACKWELL_IMAGE_WAIT_TIMEOUT");
}

async function readJson(response, prefix) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`${prefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "RUNPOD_VOICE_TTS_LISTEN_REST");
}

async function queue(endpointId, key, pathname) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_LISTEN_QUEUE");
}

function healthCounters(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
  return {
    jobs: {
      in_queue: Number(jobs.inQueue ?? jobs.in_queue ?? 0) || 0,
      in_progress: Number(jobs.inProgress ?? jobs.in_progress ?? 0) || 0,
    },
    workers: {
      running: Number(workers.running ?? 0) || 0,
      throttled: Number(workers.throttled ?? 0) || 0,
    },
  };
}

function managementDrained(endpoint = {}) {
  const workers = Array.isArray(endpoint?.workers) ? endpoint.workers : [];
  return workers.length === 0 || workers.every((worker) => text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() === "EXITED");
}

async function runCuda128ImageRepair() {
  const original = await readFile(REPAIR_SCRIPT, "utf8");
  let patched = original.replace('const REQUIRED_CUDA = "12.4";', 'const REQUIRED_CUDA = "12.8";');
  if (!patched.includes('const REQUIRED_CUDA = "12.8";')) {
    throw new Error("AVANTIQO_VOICE_TTS_LISTEN_REPAIR_SCRIPT_CUDA_PATCH_FAILED");
  }
  const tempRepair = "/tmp/avantiqo-voice-tts-runpod-image-repair-cuda128.mjs";
  await writeFile(tempRepair, patched, "utf8");
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_LISTEN_BIND_BLACKWELL_IMAGE",
    contract: CONTRACT,
    required_cuda: REQUIRED_CUDA,
    generation_submitted: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
  command(process.execPath, [tempRepair, "--apply"], {
    inherit: true,
    errorCode: "AVANTIQO_VOICE_TTS_LISTEN_IMAGE_REPAIR_FAILED",
    env: {
      ...process.env,
      AVANTIQO_VOICE_TTS_RUNPOD_IMAGE_REPAIR_APPROVED: "YES",
    },
  });
}

async function drainAndRestoreFreshWorker() {
  const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
  const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
  const health = healthCounters(await queue(endpointId, managementKey, "/health"));
  if (health.jobs.in_queue || health.jobs.in_progress || health.workers.running || health.workers.throttled) {
    throw new Error(`AVANTIQO_VOICE_TTS_LISTEN_LIVE_WORK_BLOCKS_DRAIN:${JSON.stringify(health)}`);
  }

  let endpoint = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
  if (text(endpoint.id) !== endpointId || text(endpoint.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_LISTEN_ENDPOINT_BINDING_MISMATCH");
  }
  if (text(endpoint.minCudaVersion) !== REQUIRED_CUDA) {
    throw new Error(`AVANTIQO_VOICE_TTS_LISTEN_ENDPOINT_CUDA_NOT_REPAIRED:${text(endpoint.minCudaVersion) || "MISSING"}`);
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_LISTEN_DRAIN_OLD_WORKERS",
    contract: CONTRACT,
    workers_before: Array.isArray(endpoint.workers) ? endpoint.workers.length : 0,
    generation_submitted: false,
    secrets_printed: false,
  }));

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });

  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    endpoint = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
    if (managementDrained(endpoint)) break;
    await sleep(3000);
  }
  if (!managementDrained(endpoint)) {
    await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
      method: "PATCH",
      body: { workersMin: 0, workersMax: 1, minCudaVersion: REQUIRED_CUDA },
    }).catch(() => null);
    throw new Error("AVANTIQO_VOICE_TTS_LISTEN_WORKER_DRAIN_TIMEOUT");
  }

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 1, minCudaVersion: REQUIRED_CUDA },
  });
  endpoint = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
  if (Number(endpoint.workersMin ?? 0) !== 0 || Number(endpoint.workersMax ?? 0) !== 1 || text(endpoint.minCudaVersion) !== REQUIRED_CUDA) {
    throw new Error("AVANTIQO_VOICE_TTS_LISTEN_ENDPOINT_RESTORE_VERIFY_FAILED");
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_LISTEN_ENDPOINT_READY_FOR_ONE_JOB",
    contract: CONTRACT,
    workers_min: 0,
    workers_max: 1,
    min_cuda_version: REQUIRED_CUDA,
    generation_submitted: false,
    secrets_printed: false,
  }));
}

async function runOneSmokeAndPlay() {
  if (!existsSync(SMOKE_SCRIPT)) throw new Error("AVANTIQO_VOICE_TTS_LISTEN_SMOKE_SCRIPT_REQUIRED");
  command(process.execPath, [resolve(SMOKE_SCRIPT)], {
    inherit: true,
    errorCode: "AVANTIQO_VOICE_TTS_LISTEN_SMOKE_FAILED",
    env: {
      ...process.env,
      AVANTIQO_VOICE_TTS_COLD_START_TIMEOUT_MS: String(20 * 60_000),
      AVANTIQO_VOICE_TTS_COLD_START_AUDIO_OUTPUT: AUDIO_PATH,
    },
  });

  if (!existsSync(AUDIO_PATH)) throw new Error("AVANTIQO_VOICE_TTS_LISTEN_AUDIO_NOT_WRITTEN");
  const info = await stat(AUDIO_PATH);
  if (info.size <= 1000) throw new Error(`AVANTIQO_VOICE_TTS_LISTEN_AUDIO_TOO_SMALL:${info.size}`);

  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_LISTEN_PLAY_AUDIO",
    contract: CONTRACT,
    audio_path: AUDIO_PATH,
    audio_bytes: info.size,
    exactly_one_generation_submitted: true,
    stt_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  }));

  command("afplay", [AUDIO_PATH], {
    inherit: true,
    errorCode: "AVANTIQO_VOICE_TTS_LISTEN_AFPLAY_FAILED",
  });
}

if (!yes(process.env.AVANTIQO_VOICE_TTS_LISTEN_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_TTS_LISTEN_APPROVED=YES_REQUIRED");
}

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_LISTEN_BEGIN",
  contract: CONTRACT,
  waits_for_blackwell_image: true,
  required_cuda: REQUIRED_CUDA,
  required_torch: REQUIRED_TORCH,
  exactly_one_paid_generation_allowed: true,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}));

await waitForBlackwellEvidence();
await runCuda128ImageRepair();
await drainAndRestoreFreshWorker();
await runOneSmokeAndPlay();

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  audio_played: true,
  exactly_one_generation_submitted: true,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}));

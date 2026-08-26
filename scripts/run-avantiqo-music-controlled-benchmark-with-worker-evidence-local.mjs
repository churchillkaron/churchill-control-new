import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_WORKER_EVIDENCE_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_CERTIFICATION_BENCHMARK_V3";
const CHILD_SCRIPT = resolve("scripts/run-avantiqo-music-controlled-benchmark-local.mjs");
const OUTPUT_PATH = resolve(
  process.env.AVANTIQO_AUDIO_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-music-certification-benchmark.json",
);
const POLL_MS = 1_000;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function yes(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") {
    throw new Error(`${name}_YES_REQUIRED`);
  }
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function requestJson(url, key) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 500);
    throw new Error(`RUNPOD_WORKER_EVIDENCE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

function inProgressJobs(body = {}) {
  const jobs = object(body?.jobs);
  return finite(jobs.inProgress ?? jobs.in_progress, 0);
}

function safeWorkers(body = {}) {
  return list(body?.workers)
    .map((worker) => ({
      status: text(worker?.status).toUpperCase() || null,
      version: finite(worker?.version, null),
      gpu_count: finite(worker?.gpuCount, null),
      gpu_type_id: text(worker?.gpuTypeId) || null,
      data_center_id: text(worker?.dataCenterId) || null,
      started_at: text(worker?.startedAt) || null,
      is_stale: worker?.isStale === true,
    }))
    .filter((worker) => worker.gpu_type_id || worker.data_center_id);
}

function uniqueWorkerEvidence(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = JSON.stringify([
      row.status,
      row.version,
      row.gpu_count,
      row.gpu_type_id,
      row.data_center_id,
      row.started_at,
      row.is_stale,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  yes("AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED");
  const configuredRuns = Number(process.env.AVANTIQO_AUDIO_BENCHMARK_RUNS || 1);
  if (!Number.isFinite(configuredRuns) || configuredRuns !== 1) {
    throw new Error(
      `AVANTIQO_MUSIC_WORKER_EVIDENCE_EXACTLY_ONE_RUN_REQUIRED:actual=${process.env.AVANTIQO_AUDIO_BENCHMARK_RUNS || "DEFAULT_1"}`,
    );
  }

  const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
  const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
  const runtimeKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");

  const captures = [];
  let captureAttempts = 0;
  let captureErrors = 0;
  let lastCaptureError = null;
  let childExited = false;

  console.log(`AVANTIQO_MUSIC_WORKER_EVIDENCE_CONTRACT=${CONTRACT}`);
  console.log("AVANTIQO_MUSIC_WORKER_EVIDENCE_EXACTLY_ONE_GENERATION=true");
  console.log("AVANTIQO_MUSIC_WORKER_EVIDENCE_ENDPOINT_MUTATION=false");
  console.log("AVANTIQO_MUSIC_WORKER_EVIDENCE_NETWORK_VOLUME_MUTATION=false");
  console.log("AVANTIQO_MUSIC_WORKER_EVIDENCE_PRODUCTION_DEPLOY=false");
  console.log("AVANTIQO_MUSIC_WORKER_EVIDENCE_PRICING_ACTIVATION=false");
  console.log("AVANTIQO_MUSIC_WORKER_EVIDENCE_SECRETS_PRINTED=false");

  const child = spawn(process.execPath, [CHILD_SCRIPT], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  const poller = (async () => {
    while (!childExited) {
      try {
        const health = await requestJson(
          `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
          runtimeKey,
        );
        if (inProgressJobs(health) > 0) {
          captureAttempts += 1;
          const workers = await requestJson(
            `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
            managementKey,
          );
          captures.push(...safeWorkers(workers));
        }
      } catch (error) {
        captureErrors += 1;
        lastCaptureError = text(error?.message || error).slice(0, 500) || "UNKNOWN";
      }
      if (!childExited) await sleep(POLL_MS);
    }
  })();

  const childResult = await new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => resolvePromise({ code, signal }));
  });
  childExited = true;
  await poller;

  if (childResult.code !== 0) {
    throw new Error(
      `AVANTIQO_MUSIC_WORKER_EVIDENCE_CHILD_FAILED:exit=${childResult.code ?? "UNKNOWN"}:signal=${childResult.signal || "NONE"}`,
    );
  }

  const report = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  if (text(report?.contract) !== BENCHMARK_CONTRACT) {
    throw new Error(
      `AVANTIQO_MUSIC_WORKER_EVIDENCE_BENCHMARK_CONTRACT_MISMATCH:${text(report?.contract) || "MISSING"}`,
    );
  }
  if (report?.summary?.passed !== true) {
    throw new Error("AVANTIQO_MUSIC_WORKER_EVIDENCE_REQUIRES_PASSED_BENCHMARK");
  }

  const observations = list(report?.observations);
  if (observations.length !== 1) {
    throw new Error(`AVANTIQO_MUSIC_WORKER_EVIDENCE_SINGLE_OBSERVATION_REQUIRED:${observations.length}`);
  }

  const evidence = uniqueWorkerEvidence(captures);
  const activeWorker =
    evidence.find((worker) => worker.status === "RUNNING" && worker.gpu_type_id) ||
    evidence.find((worker) => worker.gpu_type_id) ||
    null;

  observations[0].runpod_worker = activeWorker;
  report.observations = observations;
  report.runtime_worker_evidence = {
    contract: CONTRACT,
    captured: Boolean(activeWorker),
    capture_source: "RUNPOD_SERVERLESS_WORKERS_WHILE_JOB_IN_PROGRESS",
    poll_interval_ms: POLL_MS,
    capture_attempts: captureAttempts,
    capture_errors: captureErrors,
    last_capture_error: lastCaptureError,
    active_worker: activeWorker,
    observed_workers: evidence,
    endpoint_mutation_performed: false,
    network_volume_mutation_performed: false,
    generation_submitted_by_evidence_wrapper: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  };
  report.benchmark_scope = {
    ...object(report.benchmark_scope),
    runtime_worker_evidence_capture: true,
    runtime_worker_evidence_contract: CONTRACT,
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    benchmark_output_path: OUTPUT_PATH,
    benchmark_passed: true,
    worker_evidence_captured: Boolean(activeWorker),
    gpu_type_id: activeWorker?.gpu_type_id || null,
    data_center_id: activeWorker?.data_center_id || null,
    capture_attempts: captureAttempts,
    capture_errors: captureErrors,
    generation_count: 1,
    generation_submitted_by_evidence_wrapper: false,
    endpoint_mutation_performed: false,
    network_volume_mutation_performed: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(`AVANTIQO_MUSIC_WORKER_EVIDENCE=FAIL reason=${text(error?.message || error)}`);
  process.exit(1);
});

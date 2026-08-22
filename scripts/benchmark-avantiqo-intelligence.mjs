import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  getAvantiqoIntelligenceEndpointHealth,
} from "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT = resolve(
  process.env.AVANTIQO_INTELLIGENCE_CERTIFICATION_OUTPUT ||
    "/tmp/avantiqo-intelligence-certification-benchmark.json",
);
const INNER_OUTPUT = resolve(
  process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-intelligence-benchmark-inner.json",
);
const TERMINAL = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "CANCELED",
  "TIMED_OUT",
]);

function text(value) {
  return String(value ?? "").trim();
}

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function statusOf(value = {}) {
  return text(value.status || value.state).toUpperCase();
}

function collectRequestObjects(
  value,
  output = [],
  seen = new Set(),
  depth = 0,
) {
  if (!value || typeof value !== "object" || seen.has(value) || depth > 8) {
    return output;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRequestObjects(item, output, seen, depth + 1);
    }
    return output;
  }
  const id = text(
    value.id ||
      value.jobId ||
      value.job_id ||
      value.requestId ||
      value.request_id,
  );
  if (id && (value.status || value.state || value.input || value.request || value.payload)) {
    output.push(value);
  }
  for (const child of Object.values(value)) {
    collectRequestObjects(child, output, seen, depth + 1);
  }
  return output;
}

function requestId(value = {}) {
  return text(
    value.id ||
      value.jobId ||
      value.job_id ||
      value.requestId ||
      value.request_id,
  );
}

function hasTrace(value, traceId) {
  if (!traceId) return false;
  try {
    return JSON.stringify(value).includes(traceId);
  } catch {
    return false;
  }
}

function runNode(script, env = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolveRun({
        code,
        stdout: stdout.slice(-16000),
        stderr: stderr.slice(-16000),
      });
    });
  });
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function credentials() {
  const endpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!endpointId) {
    throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID_REQUIRED");
  }
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  return { endpointId, apiKey };
}

async function requestJson(url, options = {}) {
  const { apiKey } = credentials();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const raw = await response.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
    if (!response.ok) {
      throw new Error(
        `RUNPOD_INTELLIGENCE_CERTIFICATION_REQUEST_FAILED:${response.status}:${text(raw).slice(0, 500)}`,
      );
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function scanRequests() {
  const { endpointId } = credentials();
  const response = await requestJson(
    `${RUNPOD_API_BASE}/${endpointId}/requests`,
  );
  const requests = collectRequestObjects(response);
  return {
    requests,
    nonterminal: requests.filter(
      (request) => !TERMINAL.has(statusOf(request)),
    ),
  };
}

async function cancelOwnRequest(id) {
  if (!id) return false;
  const { endpointId } = credentials();
  await requestJson(
    `${RUNPOD_API_BASE}/${endpointId}/cancel/${encodeURIComponent(id)}`,
    { method: "POST" },
  );
  return true;
}

function compactHealth(health = {}) {
  return {
    workers_running: n(health?.workers?.running),
    workers_idle: n(health?.workers?.idle),
    workers_initializing: n(health?.workers?.initializing),
    jobs_in_queue: n(health?.jobs?.inQueue),
    jobs_in_progress: n(health?.jobs?.inProgress),
    latency_ms: n(health?.latency_ms),
  };
}

function isQuiescent(health = {}) {
  return (
    n(health?.jobs?.inQueue) === 0 &&
    n(health?.jobs?.inProgress) === 0
  );
}

async function waitForQuiescence(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() <= deadline) {
    last = await getAvantiqoIntelligenceEndpointHealth();
    if (isQuiescent(last)) return last;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  return last;
}

const traceId = `avantiqo-cert-${randomUUID()}`;
const startedAt = Date.now();
let preHealth = null;
let preRequests = null;
let execution = null;
let innerEvidence = null;
let postHealth = null;
let postRequests = null;
const cleanup = {
  own_nonterminal_detected: 0,
  own_requests_cancelled: 0,
  foreign_nonterminal_detected: 0,
  remaining_nonterminal: 0,
};

try {
  preHealth = await getAvantiqoIntelligenceEndpointHealth();
  const warmWorkers =
    n(preHealth?.workers?.running) + n(preHealth?.workers?.idle);
  if (warmWorkers < 1 || !isQuiescent(preHealth)) {
    throw new Error("INTELLIGENCE_CERTIFICATION_REQUIRES_WARM_QUIESCENT_ENDPOINT");
  }

  preRequests = await scanRequests();
  if (preRequests.nonterminal.length > 0) {
    throw new Error(
      "INTELLIGENCE_CERTIFICATION_REFUSES_PREEXISTING_NONTERMINAL_REQUESTS",
    );
  }

  execution = await runNode(
    resolve(ROOT, "scripts/avantiqo-intelligence-benchmark.mjs"),
    {
      AVANTIQO_INTELLIGENCE_CERTIFICATION_TRACE_ID: traceId,
      AVANTIQO_INTELLIGENCE_BENCHMARK_OUTPUT: INNER_OUTPUT,
    },
  );
  innerEvidence = await readJson(INNER_OUTPUT);

  postRequests = await scanRequests();
  const ownNonterminal = postRequests.nonterminal.filter((request) =>
    hasTrace(request, traceId),
  );
  const foreignNonterminal = postRequests.nonterminal.filter(
    (request) => !hasTrace(request, traceId),
  );
  cleanup.own_nonterminal_detected = ownNonterminal.length;
  cleanup.foreign_nonterminal_detected = foreignNonterminal.length;

  for (const request of ownNonterminal) {
    const id = requestId(request);
    if (id && (await cancelOwnRequest(id))) {
      cleanup.own_requests_cancelled += 1;
    }
  }

  postHealth = await waitForQuiescence();
  const finalRequests = await scanRequests();
  cleanup.remaining_nonterminal = finalRequests.nonterminal.length;

  const benchmarkPassed =
    execution?.code === 0 &&
    innerEvidence?.summary?.passed === true;
  const isolationPassed =
    cleanup.foreign_nonterminal_detected === 0 &&
    cleanup.remaining_nonterminal === 0 &&
    isQuiescent(postHealth);

  const report = {
    contract: "AVANTIQO_INTELLIGENCE_NON_QUEUE_CERTIFICATION_V1",
    generated_at: new Date().toISOString(),
    provider: "avantiqo-intelligence",
    model: "Qwen/Qwen3-30B-A3B-Thinking-2507",
    purpose: "READINESS_AND_MEASUREMENT_ONLY",
    trace_id: traceId,
    preexisting_nonterminal_refused: true,
    cleanup_only_own_traced_requests: true,
    pricing_activation_performed: false,
    provider_selection_changed: false,
    activation_allowed: false,
    pre_health: compactHealth(preHealth),
    post_health: compactHealth(postHealth),
    cleanup,
    benchmark: innerEvidence,
    execution: {
      exit_code: execution?.code ?? null,
      stdout_tail: execution?.stdout || "",
      stderr_tail: execution?.stderr || "",
    },
    total_latency_ms: Date.now() - startedAt,
    summary: {
      passed: benchmarkPassed && isolationPassed,
      benchmark_passed: benchmarkPassed,
      isolation_passed: isolationPassed,
      own_orphans_cancelled: cleanup.own_requests_cancelled,
      foreign_requests_touched: 0,
    },
  };

  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        success: report.summary.passed,
        output_path: OUTPUT,
        summary: report.summary,
        activation_allowed: false,
      },
      null,
      2,
    ),
  );
  if (!report.summary.passed) process.exit(1);
} catch (error) {
  const report = {
    contract: "AVANTIQO_INTELLIGENCE_NON_QUEUE_CERTIFICATION_V1",
    generated_at: new Date().toISOString(),
    provider: "avantiqo-intelligence",
    purpose: "READINESS_AND_MEASUREMENT_ONLY",
    trace_id: traceId,
    preexisting_nonterminal_refused: true,
    cleanup_only_own_traced_requests: true,
    pricing_activation_performed: false,
    provider_selection_changed: false,
    activation_allowed: false,
    pre_health: compactHealth(preHealth),
    post_health: compactHealth(postHealth),
    cleanup,
    benchmark: innerEvidence,
    execution,
    total_latency_ms: Date.now() - startedAt,
    error: text(error?.message || error).slice(0, 1000),
    summary: {
      passed: false,
      benchmark_passed: false,
      isolation_passed: false,
      own_orphans_cancelled: cleanup.own_requests_cancelled,
      foreign_requests_touched: 0,
    },
  };
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.error(
    `AVANTIQO_INTELLIGENCE_NON_QUEUE_CERTIFICATION=FAIL reason=${report.error}`,
  );
  process.exit(1);
}

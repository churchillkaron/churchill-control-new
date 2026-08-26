import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const EXPECTED_MODEL_REFERENCE =
  "https://huggingface.co/Qwen/Qwen3-30B-A3B-Instruct-2507:main";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_EXPECTED_MAIN";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_DIAGNOSTIC_V1";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(
      /((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi,
      "$1[REDACTED]",
    );
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(result.stderr || result.stdout).slice(0, 700)}`);
  }
  return text(result.stdout);
}

function validateMain() {
  const expectedMain = text(process.env[EXPECTED_MAIN_ENV]);
  if (expectedMain && !/^[0-9a-f]{40}$/i.test(expectedMain)) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_EXPECTED_MAIN_INVALID:${expectedMain.slice(0, 80)}`,
    );
  }

  const branch = shell(
    "git",
    ["branch", "--show-current"],
    "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_GIT_BRANCH_FAILED",
  );
  if (branch !== "main") {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_MAIN_REQUIRED:actual=${branch || "DETACHED"}`,
    );
  }

  const head = shell(
    "git",
    ["rev-parse", "HEAD"],
    "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_GIT_HEAD_FAILED",
  );

  if (expectedMain) {
    if (head !== expectedMain) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_PINNED_MAIN_MISMATCH:head=${head}:expected=${expectedMain}`,
      );
    }
    return { head, pinned: true };
  }

  shell(
    "git",
    ["fetch", "origin", "main"],
    "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_GIT_FETCH_FAILED",
  );
  const remote = shell(
    "git",
    ["rev-parse", "origin/main"],
    "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_GIT_REMOTE_FAILED",
  );
  if (head !== remote) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`,
    );
  }
  return { head, pinned: false };
}

function credential() {
  const value = text(
    process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
  );
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function runtimeCredential(managementKey) {
  return text(process.env.RUNPOD_API_KEY) || managementKey;
}

async function requestJson(url, key, timeoutMs = 30_000) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body === null) {
    const detail = redact(body?.message || body?.error || body?.detail || raw).slice(
      0,
      700,
    );
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  return body;
}

function normalizeRows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function resolveOne(rows, name) {
  const matches = normalizeRows(rows).filter((row) => text(row?.name) === name);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_ENDPOINT_RESOLUTION_FAILED:name=${name}:matches=${matches.length}`,
    );
  }
  return matches[0];
}

function modelReferences(endpoint) {
  return list(endpoint?.modelReferences)
    .map((entry) => text(typeof entry === "string" ? entry : entry?.url || entry?.reference))
    .filter(Boolean);
}

function normalizeModelReference(value) {
  return text(value).replace(/\/$/, "");
}

function expectedModelReferenceAttached(endpoint) {
  const expected = normalizeModelReference(EXPECTED_MODEL_REFERENCE);
  return modelReferences(endpoint).some(
    (entry) => normalizeModelReference(entry) === expected,
  );
}

function networkVolumeIds(endpoint) {
  const ids = [];
  const primary = text(endpoint?.networkVolumeId);
  if (primary) ids.push(primary);
  for (const entry of list(endpoint?.networkVolumeIds)) {
    const id = text(typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id);
    if (id) ids.push(id);
  }
  return [...new Set(ids)].sort();
}

function envMap(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
        .filter(([key]) => key),
    );
  }
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, entry]) => [key, String(entry ?? "")]),
  );
}

function publicModelBinding(endpoint) {
  const env = envMap(endpoint?.template?.env);
  const candidates = ["MODEL_NAME", "MODEL", "MODEL_ID", "HF_MODEL_ID"];
  for (const key of candidates) {
    const value = text(env[key]);
    if (value === FAST_MODEL || value.startsWith(`${FAST_MODEL}:`)) {
      return { key, value };
    }
  }
  return null;
}

function healthSummary(value = {}) {
  const jobs = object(value?.jobs);
  const workers = object(value?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
      completed: finite(jobs.completed),
      failed: finite(jobs.failed),
      retried: finite(jobs.retried),
    },
    workers: {
      idle: finite(workers.idle),
      initializing: finite(workers.initializing),
      ready: finite(workers.ready),
      running: finite(workers.running),
      throttled: finite(workers.throttled),
      unhealthy: finite(workers.unhealthy),
    },
  };
}

function safeEndpoint(endpoint, health) {
  return {
    name: text(endpoint?.name) || null,
    workers_min: finite(endpoint?.workersMin, -1),
    workers_max: finite(endpoint?.workersMax, -1),
    flashboot: endpoint?.flashboot === true,
    model_references: modelReferences(endpoint),
    network_volume_ids: networkVolumeIds(endpoint),
    template_image: text(endpoint?.template?.imageName) || null,
    public_model_binding: publicModelBinding(endpoint),
    health,
  };
}

function isCanonical(deep, fast) {
  return (
    deep.workers_min === 0 &&
    deep.workers_max === 1 &&
    fast.workers_min === 0 &&
    fast.workers_max === 0 &&
    deep.health.jobs.in_queue === 0 &&
    deep.health.jobs.in_progress === 0 &&
    fast.health.jobs.in_queue === 0 &&
    fast.health.jobs.in_progress === 0
  );
}

function classify(deep, fast) {
  if (!isCanonical(deep, fast)) {
    return "LIVE_STATE_NOT_CANONICAL_READ_ONLY_DIAGNOSTIC";
  }
  if (expectedModelReferenceAttached(fast)) {
    return "FAST_HOST_CACHE_ATTACHED";
  }
  if (fast.model_references.length > 0) {
    return "FAST_HOST_CACHE_MODEL_MISMATCH";
  }
  return "FAST_HOST_CACHE_MISSING_COLD_START_OPTIMIZATION_REQUIRED";
}

const main = validateMain();
const managementKey = credential();
const queueKey = runtimeCredential(managementKey);

const endpointsRaw = await requestJson(
  `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
const endpoints = normalizeRows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const deepEndpoint = resolveOne(endpoints, DEEP_NAME);
const fastEndpoint = resolveOne(endpoints, FAST_NAME);
const deepId = text(deepEndpoint?.id);
const fastId = text(fastEndpoint?.id);
if (!deepId || !fastId) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_ENDPOINT_IDS_REQUIRED");
}

const [deepHealthRaw, fastHealthRaw] = await Promise.all([
  requestJson(`${QUEUE_BASE}/${encodeURIComponent(deepId)}/health`, queueKey, 20_000),
  requestJson(`${QUEUE_BASE}/${encodeURIComponent(fastId)}/health`, queueKey, 20_000),
]);

const deep = safeEndpoint(deepEndpoint, healthSummary(deepHealthRaw));
const fast = safeEndpoint(fastEndpoint, healthSummary(fastHealthRaw));
const canonical = isCanonical(deep, fast);
const classification = classify(deep, fast);

console.log(
  JSON.stringify(
    {
      success: true,
      contract: CONTRACT,
      mode: "READ_ONLY_FAST_MODEL_CACHE_DIAGNOSTIC",
      main_commit: main.head,
      pinned_main: main.pinned,
      expected_fast_model: FAST_MODEL,
      expected_model_reference: EXPECTED_MODEL_REFERENCE,
      expected_cached_model_attached: expectedModelReferenceAttached(fastEndpoint),
      canonical_deep_active_fast_parked: canonical,
      deep_endpoint: deep,
      fast_endpoint: fast,
      classification,
      generation_submitted: false,
      inference_performed: false,
      queue_mutation_performed: false,
      endpoint_mutation_performed: false,
      template_mutation_performed: false,
      network_volume_mutation_performed: false,
      production_deploy_performed: false,
      secrets_in_output: false,
    },
    null,
    2,
  ),
);
console.log(`AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_DIAGNOSTIC=${classification}`);
console.log("AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_DIAGNOSTIC_RESULT=PASS");
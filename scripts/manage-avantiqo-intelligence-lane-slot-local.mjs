import { chmod, readFile, writeFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_LANE_SLOT_MANAGER_V1";
const ENV_PATH = ".env.local";
const DEEP_ENDPOINT_NAME = "avantiqo-intelligence-v1";
const FAST_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const FAST_TEMPLATE_NAME = "avantiqo-intelligence-fast-v1";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";

function text(value) {
  return String(value ?? "").trim();
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function requiredCredential() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}
function runtimeCredential(managementKey) {
  return text(process.env.RUNPOD_API_KEY) || managementKey;
}
function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") {
    throw new Error(`${name}=YES_REQUIRED`);
  }
}

async function rest(path, key, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`RUNPOD_REST_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function queueHealth(endpointId, key) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
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
    throw new Error(`RUNPOD_QUEUE_HEALTH_HTTP_${response.status}`);
  }
  return object(body);
}

function managementNonExited(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus || worker?.desired_status).toUpperCase();
    return desired !== "EXITED";
  }).length;
}

function healthSummary(value = {}) {
  const jobs = object(value.jobs);
  const workers = object(value.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      initializing: finite(workers.initializing, 0),
      running: finite(workers.running, 0),
    },
  };
}

function assertIdleForDisable(endpoint, health, code) {
  const summary = healthSummary(health);
  if (finite(endpoint.workersMin, 0) !== 0) {
    throw new Error(`${code}_WORKERS_MIN_NOT_ZERO`);
  }
  if (managementNonExited(endpoint) !== 0) {
    throw new Error(`${code}_ACTIVE_MANAGEMENT_WORKERS`);
  }
  if (summary.jobs.in_queue !== 0 || summary.jobs.in_progress !== 0) {
    throw new Error(`${code}_ACTIVE_JOBS`);
  }
  if (summary.workers.initializing !== 0 || summary.workers.running !== 0) {
    throw new Error(`${code}_ACTIVE_RUNTIME_WORKERS`);
  }
}

function safeEndpoint(endpoint = {}) {
  return {
    present: Boolean(text(endpoint.id)),
    name: text(endpoint.name) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    active_management_workers: managementNonExited(endpoint),
    template_id_present: Boolean(text(endpoint.templateId || endpoint.template?.id)),
  };
}

function replaceModel(value) {
  if (typeof value === "string") return value.split(DEEP_MODEL).join(FAST_MODEL);
  if (Array.isArray(value)) return value.map(replaceModel);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, replaceModel(entry)]),
    );
  }
  return value;
}

function stripReasoningParser(value) {
  if (Array.isArray(value)) {
    const source = value.map(replaceModel);
    const output = [];
    for (let index = 0; index < source.length; index += 1) {
      const current = text(source[index]);
      if (/^--reasoning-parser(?:=|$)/i.test(current)) {
        if (/^--reasoning-parser$/i.test(current)) index += 1;
        continue;
      }
      output.push(source[index]);
    }
    return output;
  }
  if (typeof value === "string") {
    return replaceModel(value)
      .replace(/\s+--reasoning-parser(?:=\S+|\s+\S+)/gi, "")
      .trim();
  }
  return value;
}

function fastEnvironment(value) {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => {
        const key = text(entry?.key || entry?.name).toUpperCase();
        return !key.includes("REASONING_PARSER");
      })
      .map(replaceModel);
  }
  return Object.fromEntries(
    Object.entries(object(value))
      .filter(([key]) => !key.toUpperCase().includes("REASONING_PARSER"))
      .map(([key, entry]) => [key, replaceModel(entry)]),
  );
}

function assertFastTemplate(template, code) {
  const serialized = JSON.stringify(template || {});
  if (!serialized.includes(FAST_MODEL) || serialized.includes(DEEP_MODEL)) {
    throw new Error(`${code}_MODEL_MISMATCH`);
  }
  if (/reasoning[_-]?parser|--reasoning-parser/i.test(serialized)) {
    throw new Error(`${code}_REASONING_PARSER_PRESENT`);
  }
}

function templateBodyFromDeep(template = {}) {
  const source = object(template);
  if (!JSON.stringify(source).includes(DEEP_MODEL)) {
    throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_MODEL_BINDING_NOT_FOUND");
  }
  const body = {
    imageName: text(source.imageName),
    name: FAST_TEMPLATE_NAME,
    category: text(source.category) || "NVIDIA",
    containerDiskInGb: Math.max(10, finite(source.containerDiskInGb, 30)),
    dockerEntrypoint: stripReasoningParser(source.dockerEntrypoint || []),
    dockerStartCmd: stripReasoningParser(source.dockerStartCmd || []),
    env: fastEnvironment(source.env),
    isPublic: false,
    isServerless: true,
    ports: list(source.ports),
    readme:
      "Avantiqo-owned fast Intelligence lane. Qwen3-30B-A3B-Instruct-2507; bounded non-thinking decisions only.",
    volumeInGb: Math.max(0, finite(source.volumeInGb, 0)),
    volumeMountPath: text(source.volumeMountPath) || "/workspace",
    ...(text(source.containerRegistryAuthId)
      ? { containerRegistryAuthId: text(source.containerRegistryAuthId) }
      : {}),
  };
  if (!body.imageName) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_IMAGE_REQUIRED");
  assertFastTemplate(body, "AVANTIQO_INTELLIGENCE_FAST_TEMPLATE");
  return body;
}

function endpointBodyFromDeep(endpoint = {}, templateId) {
  return {
    templateId,
    computeType: text(endpoint.computeType) || "GPU",
    executionTimeoutMs: Math.max(
      30_000,
      Math.min(300_000, finite(endpoint.executionTimeoutMs, 90_000)),
    ),
    flashboot: endpoint.flashboot !== false,
    gpuCount: Math.max(1, finite(endpoint.gpuCount, 1)),
    gpuTypeIds: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    idleTimeout: Math.max(1, finite(endpoint.idleTimeout, 5)),
    name: FAST_ENDPOINT_NAME,
    scalerType: text(endpoint.scalerType) || "QUEUE_DELAY",
    scalerValue: Math.max(1, finite(endpoint.scalerValue, 4)),
    workersMax: 1,
    workersMin: 0,
    ...(text(endpoint.networkVolumeId)
      ? { networkVolumeId: text(endpoint.networkVolumeId) }
      : {}),
  };
}

async function persistFastEndpointId(endpointId) {
  const id = text(endpointId);
  if (!id) throw new Error("AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID_REQUIRED");
  let source = "";
  try {
    source = await readFile(ENV_PATH, "utf8");
  } catch {
    source = "";
  }
  const key = "RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID";
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${id}`;
  const next = pattern.test(source)
    ? source.replace(pattern, line)
    : `${source.replace(/\s*$/, "")}\n${line}\n`;
  await writeFile(ENV_PATH, next, { encoding: "utf8", mode: 0o600 });
  await chmod(ENV_PATH, 0o600);
}

async function loadState(managementKey) {
  const [endpoints, templates] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest(
      "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
      managementKey,
    ),
  ]);
  if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");

  const deepMatches = endpoints.filter((entry) => text(entry?.name) === DEEP_ENDPOINT_NAME);
  if (deepMatches.length !== 1) {
    throw new Error(`AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_RESOLUTION_FAILED:matches=${deepMatches.length}`);
  }
  const fastMatches = endpoints.filter((entry) => text(entry?.name) === FAST_ENDPOINT_NAME);
  if (fastMatches.length > 1) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_AMBIGUOUS:matches=${fastMatches.length}`);
  }
  const deep = deepMatches[0];
  const deepTemplateId = text(deep.templateId || deep.template?.id);
  const deepTemplate = templates.find((entry) => text(entry?.id) === deepTemplateId) || deep.template;
  if (!deepTemplateId || !deepTemplate) {
    throw new Error("AVANTIQO_INTELLIGENCE_DEEP_TEMPLATE_REQUIRED");
  }

  let fast = fastMatches[0] || null;
  let fastTemplate = null;
  if (fast) {
    const fastTemplateId = text(fast.templateId || fast.template?.id);
    fastTemplate = templates.find((entry) => text(entry?.id) === fastTemplateId) || fast.template;
    assertFastTemplate(fastTemplate, "AVANTIQO_INTELLIGENCE_FAST_EXISTING_ENDPOINT");
  }

  return { endpoints, templates, deep, deepTemplate, fast, fastTemplate };
}

async function patchWorkers(endpointId, workersMax, managementKey) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax },
  });
  const verified = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  if (finite(verified.workersMin, -1) !== 0 || finite(verified.workersMax, -1) !== workersMax) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_SLOT_PATCH_VERIFY_FAILED:${text(verified.name)}:min=${finite(verified.workersMin)}:max=${finite(verified.workersMax)}:expected_max=${workersMax}`,
    );
  }
  return verified;
}

async function ensureFastTemplate(state, managementKey) {
  const matches = state.templates.filter((entry) => text(entry?.name) === FAST_TEMPLATE_NAME);
  if (matches.length > 1) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_AMBIGUOUS:matches=${matches.length}`);
  }
  if (matches[0]) {
    assertFastTemplate(matches[0], "AVANTIQO_INTELLIGENCE_FAST_EXISTING_TEMPLATE");
    return matches[0];
  }
  const created = await rest("/templates", managementKey, {
    method: "POST",
    body: templateBodyFromDeep(state.deepTemplate),
  });
  assertFastTemplate(created, "AVANTIQO_INTELLIGENCE_FAST_CREATED_TEMPLATE");
  return created;
}

async function ensureParkedState(managementKey, runtimeKey) {
  let state = await loadState(managementKey);
  if (!state.fast) {
    const deepId = text(state.deep.id);
    if (finite(state.deep.workersMin, -1) !== 0 || finite(state.deep.workersMax, -1) !== 1) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_DEEP_SLOT_BASELINE_REQUIRED:min=${finite(state.deep.workersMin)}:max=${finite(state.deep.workersMax)}`,
      );
    }
    const deepHealth = await queueHealth(deepId, runtimeKey);
    assertIdleForDisable(state.deep, deepHealth, "AVANTIQO_INTELLIGENCE_DEEP_SLOT_BORROW");
    const fastTemplate = await ensureFastTemplate(state, managementKey);
    const fastTemplateId = text(fastTemplate.id);
    if (!fastTemplateId) throw new Error("AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_ID_REQUIRED");

    await patchWorkers(deepId, 0, managementKey);
    let createdFast = null;
    try {
      createdFast = await rest("/endpoints", managementKey, {
        method: "POST",
        body: endpointBodyFromDeep(state.deep, fastTemplateId),
      });
      const fastId = text(createdFast.id);
      if (!fastId) throw new Error("AVANTIQO_INTELLIGENCE_FAST_CREATED_ENDPOINT_ID_REQUIRED");
      await patchWorkers(fastId, 0, managementKey);
      await patchWorkers(deepId, 1, managementKey);
    } catch (error) {
      let fastParked = false;
      const fastId = text(createdFast?.id);
      if (fastId) {
        try {
          await patchWorkers(fastId, 0, managementKey);
          fastParked = true;
        } catch {
          fastParked = false;
        }
      }
      let deepRestored = false;
      if (!fastId || fastParked) {
        try {
          await patchWorkers(deepId, 1, managementKey);
          deepRestored = true;
        } catch {
          deepRestored = false;
        }
      }
      throw new Error(
        `AVANTIQO_INTELLIGENCE_FAST_BOOTSTRAP_FAILED:fast_parked=${fastParked ? "YES" : "NO"}:deep_restored=${deepRestored ? "YES" : "NO"}:${text(error?.message).slice(0, 700)}`,
      );
    }
    state = await loadState(managementKey);
  }

  const deepId = text(state.deep.id);
  const fastId = text(state.fast.id);
  if (!deepId || !fastId) throw new Error("AVANTIQO_INTELLIGENCE_LANE_ENDPOINT_IDS_REQUIRED");

  const deepMax = finite(state.deep.workersMax, -1);
  const fastMax = finite(state.fast.workersMax, -1);
  if (fastMax !== 0) {
    await patchWorkers(fastId, 0, managementKey);
  }
  if (deepMax !== 1) {
    await patchWorkers(deepId, 1, managementKey);
  }

  state = await loadState(managementKey);
  if (finite(state.deep.workersMax, -1) !== 1 || finite(state.fast.workersMax, -1) !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_PARKED_STATE_VERIFY_FAILED");
  }
  await persistFastEndpointId(state.fast.id);
  return state;
}

async function activateFast(managementKey, runtimeKey) {
  let state = await ensureParkedState(managementKey, runtimeKey);
  const deepId = text(state.deep.id);
  const fastId = text(state.fast.id);
  const deepHealth = await queueHealth(deepId, runtimeKey);
  assertIdleForDisable(state.deep, deepHealth, "AVANTIQO_INTELLIGENCE_DEEP_FAST_SWAP");

  await patchWorkers(deepId, 0, managementKey);
  try {
    await patchWorkers(fastId, 1, managementKey);
  } catch (error) {
    let deepRestored = false;
    try {
      await patchWorkers(deepId, 1, managementKey);
      deepRestored = true;
    } catch {
      deepRestored = false;
    }
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_ACTIVATION_FAILED:deep_restored=${deepRestored ? "YES" : "NO"}:${text(error?.message).slice(0, 700)}`,
    );
  }

  state = await loadState(managementKey);
  if (finite(state.deep.workersMax, -1) !== 0 || finite(state.fast.workersMax, -1) !== 1) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_ACTIVE_STATE_VERIFY_FAILED");
  }
  return state;
}

async function restoreDeep(managementKey) {
  let state = await loadState(managementKey);
  if (!state.fast) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_REQUIRED_FOR_RESTORE");
  }
  const fastId = text(state.fast.id);
  const deepId = text(state.deep.id);
  if (finite(state.fast.workersMax, -1) !== 0) {
    await patchWorkers(fastId, 0, managementKey);
  }
  if (finite(state.deep.workersMax, -1) !== 1) {
    await patchWorkers(deepId, 1, managementKey);
  }
  state = await loadState(managementKey);
  if (finite(state.deep.workersMax, -1) !== 1 || finite(state.fast.workersMax, -1) !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_DEEP_RESTORE_VERIFY_FAILED");
  }
  return state;
}

const provision = process.argv.includes("--provision");
const activate = process.argv.includes("--activate-fast");
const restore = process.argv.includes("--restore-deep");
const actionCount = [provision, activate, restore].filter(Boolean).length;
if (actionCount > 1) throw new Error("AVANTIQO_INTELLIGENCE_SLOT_MANAGER_SINGLE_ACTION_REQUIRED");
if (provision) approved("AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_APPROVED");
if (activate) approved("AVANTIQO_INTELLIGENCE_FAST_SLOT_SWAP_APPROVED");
if (restore) approved("AVANTIQO_INTELLIGENCE_FAST_SLOT_RESTORE_APPROVED");

const managementKey = requiredCredential();
const runtimeKey = runtimeCredential(managementKey);
let state;
let mode = "PLAN";
if (provision) {
  mode = "PROVISION";
  state = await ensureParkedState(managementKey, runtimeKey);
} else if (activate) {
  mode = "ACTIVATE_FAST";
  state = await activateFast(managementKey, runtimeKey);
} else if (restore) {
  mode = "RESTORE_DEEP";
  state = await restoreDeep(managementKey);
} else {
  state = await loadState(managementKey);
}

const result = {
  success: true,
  contract: CONTRACT,
  mode,
  deep_model: DEEP_MODEL,
  fast_model: FAST_MODEL,
  deep_endpoint: safeEndpoint(state.deep),
  fast_endpoint: state.fast ? safeEndpoint(state.fast) : { present: false, name: FAST_ENDPOINT_NAME },
  parked_state:
    Boolean(state.fast) &&
    finite(state.deep.workersMax, -1) === 1 &&
    finite(state.fast.workersMax, -1) === 0,
  fast_active_state:
    Boolean(state.fast) &&
    finite(state.deep.workersMax, -1) === 0 &&
    finite(state.fast.workersMax, -1) === 1,
  total_intelligence_workers_max:
    finite(state.deep.workersMax, 0) + finite(state.fast?.workersMax, 0),
  generation_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
};
console.log(JSON.stringify(result, null, 2));

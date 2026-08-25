import fs from "node:fs";
import path from "node:path";

import {
  groupCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_CODE_SHARED_VOLUME_EXPANSION_V1";
const SHARED_GROUP = sharedVolumeGroup("INTELLIGENCE_CODE");
const MIN_CURRENT_SIZE_GB = 80;
const TARGET_SIZE_GB = 160;
const STORAGE_RATE_USD_PER_GB_MONTH_REFERENCE = 0.07;
const ENV_FILE_VARIABLES = [
  "AVANTIQO_INTELLIGENCE_RUNPOD_ENV_FILE",
  "AVANTIQO_INTELLIGENCE_READINESS_ENV_FILE",
];

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique(values) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))];
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}

function decodeAssignmentValue(rawValue) {
  let value = String(rawValue ?? "").trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    const quote = value[0];
    value = value.slice(1, -1);
    if (quote === '"') {
      value = value
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }
  return value;
}

function explicitEnvPath() {
  for (const name of ENV_FILE_VARIABLES) {
    const value = text(process.env[name]);
    if (value) return value;
  }
  const fallback = path.resolve(process.cwd(), ".env.local");
  return fs.existsSync(fallback) ? fallback : "";
}

function loadRelevantLocalEnv() {
  const envPath = explicitEnvPath();
  if (!envPath) {
    return {
      path_available: false,
      parsed_without_execution: false,
      relevant_assignment_count: 0,
      secret_values_printed: false,
    };
  }
  const source = fs.readFileSync(envPath, "utf8");
  let relevantAssignmentCount = 0;
  for (const rawLine of source.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = rawLine.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/,
    );
    if (!match) continue;
    const [, name, rawValue] = match;
    if (
      !/^RUNPOD_[A-Z0-9_]*API_KEY$/.test(name) &&
      name !== "AVANTIQO_INTELLIGENCE_CODE_VOLUME_EXPANSION_APPROVED"
    ) {
      continue;
    }
    relevantAssignmentCount += 1;
    const value = decodeAssignmentValue(rawValue);
    if (!text(process.env[name]) && value) process.env[name] = value;
  }
  return {
    path_available: true,
    parsed_without_execution: true,
    malformed_non_assignment_lines_ignored: true,
    relevant_assignment_count: relevantAssignmentCount,
    secret_values_printed: false,
  };
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw, 1000);
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body ?? {};
}

async function rest(pathname, credential, options = {}) {
  return readJson(
    await fetch(`${REST_BASE}${pathname}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs || 30_000),
    }),
    "AVANTIQO_INTELLIGENCE_CODE_VOLUME_REST",
  );
}

function managementCredentialCandidates() {
  const preferred = ["RUNPOD_MANAGEMENT_API_KEY", "RUNPOD_API_KEY"];
  const discovered = Object.keys(process.env)
    .filter((name) => /^RUNPOD_[A-Z0-9_]*API_KEY$/.test(name))
    .sort();
  const seenNames = new Set();
  const seenValues = new Set();
  const candidates = [];
  for (const name of [...preferred, ...discovered]) {
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    const value = text(process.env[name]);
    if (!value || seenValues.has(value)) continue;
    seenValues.add(value);
    candidates.push({ name, value });
  }
  return candidates;
}

async function resolveManagementCredential() {
  const candidates = managementCredentialCandidates();
  if (!candidates.length) {
    throw new Error("RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED_FOR_INTELLIGENCE_CODE_VOLUME");
  }
  const rejectedStatuses = [];
  for (const candidate of candidates) {
    const response = await fetch(
      `${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=true`,
      {
        headers: {
          Authorization: `Bearer ${candidate.value}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (response.ok) {
      const body = await readJson(response, "AVANTIQO_INTELLIGENCE_CODE_VOLUME_MANAGEMENT_PROBE");
      if (!Array.isArray(body)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
      return {
        credential: candidate.value,
        source: candidate.name,
        candidate_count: candidates.length,
        endpoints: body,
      };
    }
    if ([401, 403].includes(response.status)) {
      rejectedStatuses.push(response.status);
      await response.text().catch(() => "");
      continue;
    }
    const detail = text(await response.text(), 500);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_CODE_VOLUME_MANAGEMENT_PROBE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  throw new Error(
    `RUNPOD_MANAGEMENT_SCOPE_CREDENTIAL_NOT_FOUND:candidates=${candidates.length}:rejected_statuses=${rejectedStatuses.join(",") || "NONE"}`,
  );
}

function endpointVolumeIds(endpoint = {}) {
  return unique([
    text(endpoint?.networkVolumeId),
    ...list(endpoint?.networkVolumeIds).map((value) => text(value)),
  ]);
}

function attachedEndpointSummary(endpoint = {}) {
  const workers = list(endpoint?.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    status: text(worker?.status).toUpperCase() || null,
  }));
  const liveWorkers = workers.filter((worker) => {
    const effective = worker.desired_status || worker.status;
    return effective && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(effective);
  });
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    workers_min: finite(endpoint?.workersMin, 0),
    workers_max: finite(endpoint?.workersMax, 0),
    management_worker_count: workers.length,
    live_management_worker_count: liveWorkers.length,
  };
}

function assertAttachedEndpointsSafe(users) {
  for (const user of users) {
    if (!SHARED_GROUP.endpoint_names.includes(user.name)) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_CODE_VOLUME_UNEXPECTED_ENDPOINT_USER:${user.name || "MISSING"}`,
      );
    }
    if (user.workers_min !== 0) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_CODE_VOLUME_WORKERS_MIN_BLOCKED:${user.name}:min=${user.workers_min}`,
      );
    }
    if (user.live_management_worker_count > 0) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_CODE_VOLUME_LIVE_WORKER_BLOCKED:${user.name}:count=${user.live_management_worker_count}`,
      );
    }
  }
}

const localEnv = loadRelevantLocalEnv();
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_INTELLIGENCE_CODE_VOLUME_EXPANSION_APPROVED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_CODE_VOLUME_EXPANSION_APPROVED=YES_REQUIRED");
}

const management = await resolveManagementCredential();
const managementKey = management.credential;
const volumes = await rest("/networkvolumes", managementKey);
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const policy = sharedVolumePolicySummary(volumes);
if (!policy.policy_compliant) {
  throw new Error(
    `AVANTIQO_INTELLIGENCE_CODE_VOLUME_SHARED_POLICY_INVALID:managed=${policy.managed_cache_volume_count}:duplicates=${policy.duplicate_groups.join(",") || "NONE"}`,
  );
}

const groupVolumes = groupCacheVolumes(volumes, SHARED_GROUP);
if (groupVolumes.length !== 1) {
  throw new Error(
    `AVANTIQO_INTELLIGENCE_CODE_VOLUME_CANONICAL_COUNT_INVALID:${groupVolumes.length}`,
  );
}
const volume = groupVolumes[0];
const volumeId = text(volume?.id);
const volumeName = text(volume?.name);
const dataCenterId = text(volume?.dataCenterId);
const currentSizeGb = finite(volume?.size ?? volume?.sizeGb, 0);
if (!volumeId || volumeName !== SHARED_GROUP.canonical_name || !dataCenterId) {
  throw new Error("AVANTIQO_INTELLIGENCE_CODE_VOLUME_CANONICAL_IDENTITY_INVALID");
}
if (currentSizeGb < MIN_CURRENT_SIZE_GB) {
  throw new Error(
    `AVANTIQO_INTELLIGENCE_CODE_VOLUME_CURRENT_SIZE_INVALID:${currentSizeGb}`,
  );
}

const attachedEndpoints = management.endpoints
  .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
  .map(attachedEndpointSummary);
assertAttachedEndpointsSafe(attachedEndpoints);

const expansionGb = Math.max(0, TARGET_SIZE_GB - currentSizeGb);
const estimatedIncrementalMonthlyUsd = Number(
  (expansionGb * STORAGE_RATE_USD_PER_GB_MONTH_REFERENCE).toFixed(2),
);
const mutationRequired = currentSizeGb < TARGET_SIZE_GB;

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_env: localEnv,
  management_credential: {
    source_variable: management.source,
    candidate_count: management.candidate_count,
    scope_verified_by_read_only_endpoint_list: true,
    value_exposed: false,
  },
  shared_volume_policy: {
    contract: policy.contract,
    managed_cache_volume_count: policy.managed_cache_volume_count,
    maximum_managed_cache_volumes: policy.maximum_managed_cache_volumes,
    policy_compliant: policy.policy_compliant,
    group: SHARED_GROUP.id,
    allowed_endpoint_names: [...SHARED_GROUP.endpoint_names],
  },
  volume: {
    id: volumeId,
    name: volumeName,
    data_center_id: dataCenterId,
    current_size_gb: currentSizeGb,
    target_size_gb: Math.max(currentSizeGb, TARGET_SIZE_GB),
    expansion_gb: expansionGb,
    estimated_incremental_monthly_usd_at_reference_rate: estimatedIncrementalMonthlyUsd,
    reference_storage_rate_usd_per_gb_month: STORAGE_RATE_USD_PER_GB_MONTH_REFERENCE,
  },
  attached_endpoints: attachedEndpoints,
  capacity_rationale: {
    code_model_family: "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8",
    trainer_model_family: "Qwen/Qwen3-30B-A3B-Thinking-2507-BF16",
    shared_huggingface_cache: "/runpod-volume/huggingface-cache",
    trainer_artifact_root: "/runpod-volume/avantiqo-intelligence-training",
    separate_model_cache_artifacts_expected: true,
    target_has_model_and_adapter_headroom: true,
  },
  mutation_required: mutationRequired,
  next_action: mutationRequired
    ? apply
      ? "EXPAND_EXISTING_INTELLIGENCE_CODE_SHARED_VOLUME"
      : "APPROVE_INTELLIGENCE_CODE_SHARED_VOLUME_EXPANSION"
    : "INTELLIGENCE_CODE_SHARED_VOLUME_CAPACITY_READY",
  governance: {
    new_volume_created: false,
    endpoint_mutated: false,
    template_mutated: false,
    provider_job_submitted: false,
    gpu_job_submitted: false,
    inference_performed: false,
    training_started: false,
    production_model_promoted: false,
    production_web_deploy: false,
    secret_values_printed: false,
    volume_mutated: false,
  },
};

if (!apply || !mutationRequired) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const freshVolume = await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey);
if (
  text(freshVolume?.id) !== volumeId ||
  text(freshVolume?.name) !== volumeName ||
  text(freshVolume?.dataCenterId) !== dataCenterId ||
  finite(freshVolume?.size ?? freshVolume?.sizeGb, 0) !== currentSizeGb
) {
  throw new Error("AVANTIQO_INTELLIGENCE_CODE_VOLUME_CONCURRENT_STATE_CHANGED");
}

const freshEndpoints = await rest(
  "/endpoints?includeTemplate=false&includeWorkers=true",
  managementKey,
);
if (!Array.isArray(freshEndpoints)) throw new Error("RUNPOD_FRESH_ENDPOINT_LIST_INVALID");
const freshAttached = freshEndpoints
  .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
  .map(attachedEndpointSummary);
assertAttachedEndpointsSafe(freshAttached);

await rest(`/networkvolumes/${encodeURIComponent(volumeId)}/update`, managementKey, {
  method: "POST",
  body: { name: volumeName, size: TARGET_SIZE_GB },
});
const verified = await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey);
const verifiedSizeGb = finite(verified?.size ?? verified?.sizeGb, 0);
if (
  text(verified?.id) !== volumeId ||
  text(verified?.name) !== volumeName ||
  text(verified?.dataCenterId) !== dataCenterId ||
  verifiedSizeGb < TARGET_SIZE_GB
) {
  throw new Error("AVANTIQO_INTELLIGENCE_CODE_VOLUME_EXPANSION_VERIFY_FAILED");
}

console.log(
  JSON.stringify(
    {
      ...plan,
      mode: "APPLY",
      volume: {
        ...plan.volume,
        final_size_gb: verifiedSizeGb,
      },
      next_action: "RUN_INTELLIGENCE_TRAINER_PROVISION_PLAN_AFTER_VOLUME_EXPANSION",
      governance: {
        ...plan.governance,
        volume_mutated: true,
      },
    },
    null,
    2,
  ),
);

import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_FOREIGN_EPHEMERAL_POD_INSPECTOR_V1";
const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const NETWORK_VOLUME_ID = "7obluigbr0";
const POD_PREFIX = "avantiqo-code-cert-ephemeral-";
const EXPECTED_IMAGE = "ghcr.io/churchillkaron/avantiqo-code-pod@sha256:22d34b892d2718c8381557bc45e092063d66a47b8278dccd31b29eb360c2f4dc";
const LOCAL_RUNNER_MARKER = "run-avantiqo-code-ephemeral-pod-health-proof-v1-local.mjs";
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const required = (name, fallback = "") => {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
};
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

async function readJson(response, code) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${code}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 800)}`);
  return body ?? {};
}
async function rest(path, key) {
  return readJson(await fetch(`${REST}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_REST`);
}
async function health(endpointKey) {
  return readJson(await fetch(`${SERVERLESS}/${ENDPOINT_ID}/health`, {
    headers: { Authorization: `Bearer ${endpointKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_SERVERLESS_HEALTH`);
}
function podList(raw) {
  return Array.isArray(raw) ? raw : list(raw?.data || raw?.items || raw?.results || raw?.pods);
}
function endpointList(raw) {
  return Array.isArray(raw) ? raw : list(raw?.data || raw?.items || raw?.results || raw?.endpoints);
}
function podVolumeId(pod) {
  return text(pod?.networkVolume?.id || pod?.networkVolumeId);
}
function endpointVolumeIds(endpoint) {
  return unique([endpoint?.networkVolumeId, ...list(endpoint?.networkVolumeIds)]);
}
function activeWorkers(endpoint) {
  return list(endpoint?.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    if (desired && !TERMINAL.has(desired)) return true;
    if (status && !TERMINAL.has(status)) return true;
    return !desired && !status;
  });
}
function parseNameCreatedMs(name) {
  const match = text(name).match(/^avantiqo-code-cert-ephemeral-(\d{13})-[a-f0-9]{8}$/i);
  return match ? Number(match[1]) : null;
}
function localRunnerProcesses() {
  const result = spawnSync("ps", ["ax", "-o", "pid=,etime=,command="], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return text(result.stdout).split("\n").filter((line) => line.includes(LOCAL_RUNNER_MARKER)).map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
    return match ? { pid: Number(match[1]), elapsed: match[2], command_contains_runner: true } : null;
  }).filter(Boolean);
}
async function probePodHealth(podId) {
  try {
    const response = await fetch(`https://${podId}-8000.proxy.runpod.net/health`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    return {
      reachable: response.ok,
      http_status: response.status,
      contract: text(body?.contract) || null,
      provider: text(body?.provider) || null,
      transport: text(body?.transport) || null,
      runtime_model: text(body?.runtime_model) || null,
      quantization: text(body?.quantization) || null,
      cached_model_found: body?.cached_model_found ?? null,
      engine_loaded: body?.engine_loaded ?? null,
    };
  } catch (error) {
    return { reachable: false, http_status: null, error: text(error?.message).slice(0, 300) };
  }
}

console.log("AVANTIQO_CODE_FOREIGN_EPHEMERAL_POD_MODE=READ_ONLY");
console.log("AVANTIQO_CODE_FOREIGN_EPHEMERAL_POD_MUTATION=false");
console.log("AVANTIQO_CODE_FOREIGN_EPHEMERAL_POD_DELETE=false");
console.log("AVANTIQO_CODE_FOREIGN_EPHEMERAL_POD_INFERENCE=false");
console.log("AVANTIQO_CODE_FOREIGN_EPHEMERAL_POD_SECRETS_PRINTED=false");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const endpointKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
const [podsRaw, endpointsRaw, codeEndpoint, codeHealth] = await Promise.all([
  rest("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", managementKey),
  rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
  health(endpointKey),
]);

const now = Date.now();
const runners = localRunnerProcesses();
const matchingPods = podList(podsRaw).filter((pod) => text(pod?.name).startsWith(POD_PREFIX) && podVolumeId(pod) === NETWORK_VOLUME_ID);
const inspected = await Promise.all(matchingPods.map(async (pod) => {
  const id = text(pod?.id);
  const name = text(pod?.name);
  const createdMs = parseNameCreatedMs(name);
  const desired = text(pod?.desiredStatus).toUpperCase();
  const image = text(pod?.imageName || pod?.image || pod?.container?.image);
  const healthProof = id ? await probePodHealth(id) : { reachable: false };
  return {
    id,
    name,
    name_contract_matches: Boolean(createdMs),
    age_seconds_from_name: createdMs ? Math.max(0, Math.floor((now - createdMs) / 1000)) : null,
    desired_status: desired || null,
    terminal: TERMINAL.has(desired),
    image: image || null,
    exact_expected_image: image === EXPECTED_IMAGE,
    network_volume_id: podVolumeId(pod) || null,
    data_center_id: text(pod?.machine?.dataCenterId || pod?.networkVolume?.dataCenterId || pod?.dataCenterId) || null,
    gpu_type_id: text(pod?.gpuTypeId || pod?.gpu?.id || pod?.machine?.gpuTypeId || pod?.machine?.gpuDisplayName) || null,
    machine_id_present: Boolean(text(pod?.machineId || pod?.machine?.id)),
    public_ip_present: Boolean(text(pod?.publicIp)),
    adjusted_cost_per_hr: finite(pod?.adjustedCostPerHr ?? pod?.costPerHr),
    last_status_change: text(pod?.lastStatusChange) || null,
    uptime_seconds: finite(pod?.uptimeInSeconds ?? pod?.uptimeSeconds),
    health: healthProof,
  };
}));

const endpoints = endpointList(endpointsRaw);
const activeSharedEndpoints = endpoints.filter((endpoint) => endpointVolumeIds(endpoint).includes(NETWORK_VOLUME_ID) && activeWorkers(endpoint).length > 0).map((endpoint) => ({
  id: text(endpoint?.id),
  name: text(endpoint?.name) || null,
  active_workers: activeWorkers(endpoint).length,
  workers_min: finite(endpoint?.workersMin),
  workers_max: finite(endpoint?.workersMax),
}));
const codeJobs = object(codeHealth?.jobs);
const codeWorkers = object(codeHealth?.workers);
const codeIdle = finite(codeJobs?.inQueue ?? codeJobs?.in_queue, 0) === 0 && finite(codeJobs?.inProgress ?? codeJobs?.in_progress, 0) === 0 && !Object.values(codeWorkers).some((value) => Number(value) > 0) && activeWorkers(codeEndpoint).length === 0;
const activeMatching = inspected.filter((pod) => !pod.terminal);

let diagnosis = "NO_FOREIGN_CODE_EPHEMERAL_POD_PRESENT";
let nextAction = "RUN_EPHEMERAL_POD_HEALTH_PROOF";
if (activeMatching.length > 1) {
  diagnosis = "MULTIPLE_ACTIVE_CODE_EPHEMERAL_PODS_PRESENT";
  nextAction = "DO_NOT_DELETE_OR_CREATE;REPAIR_OWNERSHIP_FIRST";
} else if (activeMatching.length === 1) {
  const pod = activeMatching[0];
  const exactKnownPod = pod.name_contract_matches && pod.exact_expected_image && pod.network_volume_id === NETWORK_VOLUME_ID;
  if (runners.length > 0) {
    diagnosis = "LOCAL_CODE_POD_HEALTH_PROOF_PROCESS_STILL_LIVE";
    nextAction = "DO_NOT_DELETE_OR_CREATE;LET_LIVE_OWNER_FINISH";
  } else if (!exactKnownPod) {
    diagnosis = "ACTIVE_FOREIGN_POD_NOT_PROVEN_OWNED_BY_CODE_HEALTH_PROOF";
    nextAction = "DO_NOT_DELETE_OR_CREATE;MANUAL_OWNERSHIP_REVIEW_REQUIRED";
  } else if ((pod.age_seconds_from_name ?? 0) < 1800) {
    diagnosis = "EXACT_CODE_HEALTH_PROOF_POD_RECENT_WITHOUT_LOCAL_OWNER";
    nextAction = "DO_NOT_DELETE_YET;RECHECK_UNTIL_30_MIN_STALE_BOUNDARY";
  } else if (!codeIdle || activeSharedEndpoints.length > 0) {
    diagnosis = "EXACT_CODE_HEALTH_PROOF_POD_STALE_BUT_SHARED_RESOURCE_ACTIVE";
    nextAction = "DO_NOT_DELETE;WAIT_FOR_SHARED_RESOURCE_IDLE";
  } else {
    diagnosis = "EXACT_CODE_HEALTH_PROOF_POD_ORPHAN_CANDIDATE";
    nextAction = "RUN_OWNERSHIP_SAFE_EXACT_POD_DELETE_REPAIR";
  }
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  diagnosis,
  next_action: nextAction,
  local_runner_processes: runners,
  code_serverless: {
    workers_min: finite(codeEndpoint?.workersMin),
    workers_max: finite(codeEndpoint?.workersMax),
    idle: codeIdle,
    jobs: {
      in_queue: finite(codeJobs?.inQueue ?? codeJobs?.in_queue, 0),
      in_progress: finite(codeJobs?.inProgress ?? codeJobs?.in_progress, 0),
    },
  },
  active_shared_volume_endpoints: activeSharedEndpoints,
  matching_code_ephemeral_pods: inspected,
  safeguards: {
    mutation_performed: false,
    pod_deleted: false,
    provider_job_submitted: false,
    inference_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));
console.log(`${CONTRACT}=PASS`);

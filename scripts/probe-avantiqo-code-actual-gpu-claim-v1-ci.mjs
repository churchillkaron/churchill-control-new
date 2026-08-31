import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_ACTUAL_GPU_CLAIM_PROBE_V1";
const REST = "https://rest.runpod.io/v1";
const GQL = "https://api.runpod.io/graphql";
const IMAGE = "ghcr.io/churchillkaron/avantiqo-code-pod@sha256:764bcb2ce3636adc68ada7ce2a51d41de995e5e0d54e543b41044d76e5686535";
const CERTIFIED_GPU_TYPES = [
  "NVIDIA B200",
  "NVIDIA H200",
  "NVIDIA H100 NVL",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
];
const MAX_CLAIM_ATTEMPTS = 18;
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!key) throw new Error(`${CONTRACT}_RUNPOD_KEY_REQUIRED`);

async function readJson(response, label, allow404 = false) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 800)}`);
  return body || {};
}
async function rest(pathname, options = {}) {
  return readJson(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), `${CONTRACT}_REST`, options.allow404 === true);
}
async function gql(query, variables = {}) {
  const body = await readJson(await fetch(`${GQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_GQL`);
  const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (errors.length) throw new Error(`${CONTRACT}_GQL_ERROR:${errors.join(" | ")}`);
  return body?.data || {};
}
async function deleteVerified(id) {
  if (!id) return true;
  await rest(`/pods/${encodeURIComponent(id)}`, { method: "DELETE", allow404: true }).catch(() => null);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const pod = await rest(`/pods/${encodeURIComponent(id)}`, { allow404: true, timeoutMs: 10_000 }).catch(() => null);
    if (!pod) return true;
    await sleep(1_000);
  }
  return false;
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_ACTUAL_GPU_CLAIM_PROBE_START",
  contract: CONTRACT,
  inference_performed: false,
  network_volume_attached: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

const query = `query($input:GpuAvailabilityInput){dataCenters{id name location storageSupport gpuAvailability(input:$input){available stockStatus gpuTypeId}}}`;
const graph = await gql(query, { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 80, secureCloud: true } });
const certified = new Set(CERTIFIED_GPU_TYPES);
const preferredDcOrder = ["AP-JP-1", "US-NC-2", "US-NE-1", "EU-NL-1", "EUR-IS-3", "EUR-IS-4", "EUR-IS-5", "EUR-NO-2", "US-CA-2", "US-MO-2", "EUR-IS-1"];
const dcRank = new Map(preferredDcOrder.map((id, index) => [id, index]));
const gpuRank = new Map(CERTIFIED_GPU_TYPES.map((id, index) => [id, index]));
const candidates = [];
for (const dc of list(graph?.dataCenters)) {
  if (dc?.storageSupport === false) continue;
  for (const gpu of list(dc?.gpuAvailability)) {
    const gpuTypeId = text(gpu?.gpuTypeId);
    if (gpu?.available !== true || !certified.has(gpuTypeId)) continue;
    candidates.push({
      data_center_id: text(dc?.id),
      location: text(dc?.location) || null,
      gpu_type_id: gpuTypeId,
      stock_status: text(gpu?.stockStatus).toUpperCase() || null,
    });
  }
}
candidates.sort((a, b) =>
  (dcRank.get(a.data_center_id) ?? 999) - (dcRank.get(b.data_center_id) ?? 999)
  || (gpuRank.get(a.gpu_type_id) ?? 999) - (gpuRank.get(b.gpu_type_id) ?? 999));

let winner = null;
let attempts = 0;
for (const candidate of candidates.slice(0, MAX_CLAIM_ATTEMPTS)) {
  attempts += 1;
  let podId = "";
  try {
    const created = await rest("/pods", {
      method: "POST",
      timeoutMs: 45_000,
      body: {
        name: `avantiqo-code-claim-${Date.now().toString(36)}-${attempts}`,
        imageName: IMAGE,
        cloudType: "SECURE",
        computeType: "GPU",
        gpuCount: 1,
        gpuTypeIds: [candidate.gpu_type_id],
        gpuTypePriority: "custom",
        dataCenterIds: [candidate.data_center_id],
        dataCenterPriority: "custom",
        containerDiskInGb: 10,
        interruptible: false,
        locked: false,
        supportPublicIp: false,
      },
    });
    podId = text(created?.id);
    if (!podId) throw new Error(`${CONTRACT}_POD_ID_REQUIRED`);
    const deleted = await deleteVerified(podId);
    if (!deleted) throw new Error(`${CONTRACT}_CLAIM_POD_DELETE_VERIFY_FAILED`);
    winner = { ...candidate, actual_claim_succeeded: true, claim_pod_deleted: true };
    console.log(JSON.stringify({ event: "AVANTIQO_CODE_ACTUAL_GPU_CLAIM_SUCCESS", attempt: attempts, ...winner, inference_performed: false, production_deploy_performed: false, secrets_printed: false }));
    break;
  } catch (error) {
    if (podId) await deleteVerified(podId).catch(() => false);
    const message = text(error?.message || error);
    const capacityMiss = message.includes("There are no instances currently available");
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_ACTUAL_GPU_CLAIM_MISS",
      attempt: attempts,
      data_center_id: candidate.data_center_id,
      gpu_type_id: candidate.gpu_type_id,
      stock_status: candidate.stock_status,
      capacity_miss: capacityMiss,
      error: message.slice(0, 400),
      inference_performed: false,
      secrets_printed: false,
    }));
    if (!capacityMiss) throw error;
  }
}

const report = {
  success: Boolean(winner),
  contract: CONTRACT,
  candidate_count: candidates.length,
  claim_attempts: attempts,
  winner,
  gpu_pod_left_running: false,
  network_volume_mutation_performed: false,
  inference_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
};
console.log(JSON.stringify(report, null, 2));
if (!winner) throw new Error(`${CONTRACT}_NO_ACTUAL_CLAIMABLE_GPU`);
console.log(`${CONTRACT}=PASS`);

import { pathToFileURL } from "node:url";
import path from "node:path";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_V2_LAUNCHER";
const REST = "https://rest.runpod.io/v1";
const V1_PATH = "scripts/run-avantiqo-code-real-write-e2e-proof-v1-local.mjs";
const PREFERRED_VOLUME_NAMES = [
  "avantiqo-code-cache-eur-is-1",
  "avantiqo-shared-intelligence-code-cache",
];

const text = (value) => String(value ?? "").trim();
const rows = (raw) => {
  if (Array.isArray(raw)) return raw;
  for (const key of ["data", "items", "results", "networkVolumes", "volumes"]) {
    if (Array.isArray(raw?.[key])) return raw[key];
  }
  return [];
};

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error(`${CONTRACT}_RUNPOD_MANAGEMENT_KEY_REQUIRED`);

async function rest(pathname) {
  const response = await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${managementKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${CONTRACT}_RUNPOD_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 800)}`);
  }
  return body || {};
}

function gpuPool(dataCenterId) {
  if (dataCenterId === "EUR-IS-1") {
    return ["NVIDIA RTX PRO 6000 Blackwell Server Edition"];
  }
  return [
    "NVIDIA H100 80GB HBM3",
    "NVIDIA H200",
    "NVIDIA B200",
    "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  ];
}

const volumes = rows(await rest("/networkvolumes"));
let volume = null;
for (const name of PREFERRED_VOLUME_NAMES) {
  const matches = volumes.filter((row) => text(row?.name) === name);
  if (matches.length > 1) throw new Error(`${CONTRACT}_VOLUME_NAME_AMBIGUOUS:${name}:${matches.length}`);
  if (matches.length === 1) {
    volume = matches[0];
    break;
  }
}
if (!volume) {
  const candidates = volumes.filter((row) => /avantiqo.*code.*cache/i.test(text(row?.name)));
  if (candidates.length === 1) volume = candidates[0];
}
if (!volume) throw new Error(`${CONTRACT}_OWNED_CODE_CACHE_VOLUME_REQUIRED`);

const volumeId = text(volume?.id);
const dataCenterId = text(volume?.dataCenterId ?? volume?.data_center_id);
if (!volumeId || !dataCenterId) throw new Error(`${CONTRACT}_VOLUME_CONTRACT_INVALID`);
const gpuTypeIds = gpuPool(dataCenterId);

process.env.AVANTIQO_CODE_E2E_NETWORK_VOLUME_ID = volumeId;
process.env.AVANTIQO_CODE_E2E_DATA_CENTER_ID = dataCenterId;
process.env.AVANTIQO_CODE_E2E_GPU_TYPE_IDS = gpuTypeIds.join(",");

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_REAL_WRITE_E2E_PLACEMENT_RESOLVED",
  contract: CONTRACT,
  network_volume_name: text(volume?.name) || null,
  network_volume_id_present: true,
  data_center_id: dataCenterId,
  gpu_type_ids: gpuTypeIds,
  production_deploy_performed: false,
  secrets_printed: false,
}));

await import(`${pathToFileURL(path.resolve(V1_PATH)).href}?placement=${Date.now()}`);

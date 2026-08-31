const CONTRACT = "AVANTIQO_CODE_LIVE_CAPACITY_AUDIT_V1";
const GQL = "https://api.runpod.io/graphql";
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!key) throw new Error(`${CONTRACT}_RUNPOD_KEY_REQUIRED`);

const APPROVED_GPU_TYPES = [
  "NVIDIA B200",
  "NVIDIA H200",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
];
const query = `query($input:GpuAvailabilityInput){dataCenters{id name location storageSupport gpuAvailability(input:$input){available stockStatus gpuTypeId gpuTypeDisplayName displayName}}}`;
const response = await fetch(`${GQL}?api_key=${encodeURIComponent(key)}`, {
  method: "POST",
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 80, secureCloud: true } } }),
  signal: AbortSignal.timeout(30_000),
});
const raw = await response.text();
let body = null;
try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
if (!response.ok) throw new Error(`${CONTRACT}_HTTP_${response.status}:${text(raw).slice(0, 600)}`);
const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
if (errors.length) throw new Error(`${CONTRACT}_GQL_ERROR:${errors.join(" | ")}`);
const rank = { HIGH: 4, MEDIUM: 3, LOW: 2 };
const rows = [];
for (const dc of list(body?.data?.dataCenters)) {
  if (dc?.storageSupport === false) continue;
  for (const gpu of list(dc?.gpuAvailability)) {
    const gpuTypeId = text(gpu?.gpuTypeId);
    if (!APPROVED_GPU_TYPES.includes(gpuTypeId)) continue;
    rows.push({
      data_center_id: text(dc?.id),
      data_center_name: text(dc?.name) || null,
      location: text(dc?.location) || null,
      storage_support: dc?.storageSupport !== false,
      gpu_type_id: gpuTypeId,
      available: gpu?.available === true,
      stock_status: text(gpu?.stockStatus).toUpperCase() || "NONE",
    });
  }
}
rows.sort((a,b) => Number(b.available)-Number(a.available) || (rank[b.stock_status]||0)-(rank[a.stock_status]||0) || a.data_center_id.localeCompare(b.data_center_id));
const usable = rows.filter((row) => row.available && ["HIGH","MEDIUM"].includes(row.stock_status));
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  approved_gpu_types: APPROVED_GPU_TYPES,
  preferred_usable_capacity: usable,
  all_candidates: rows,
  runpod_mutation_performed: false,
  gpu_pod_created: false,
  inference_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

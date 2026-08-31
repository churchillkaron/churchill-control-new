const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FP8_SERVERLESS_CAPACITY_NOW_V1";
const MEMORY_FLOOR_GB = 48;
const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const finite = (v, d = null) => Number.isFinite(Number(v)) ? Number(v) : d;
const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!key) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
const query = `query AvantiqoIntelligenceFp8CapacityNow { gpuTypes { id displayName memoryInGb } dataCenters { id name location gpuAvailability { gpuTypeId displayName stockStatus } } }`;
const response = await fetch(GRAPHQL_URL, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
  signal: AbortSignal.timeout(30000),
});
const raw = await response.text();
let body = null;
try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
if (!response.ok || body === null) throw new Error(`${CONTRACT}_HTTP_${response.status}`);
if (list(body.errors).length) throw new Error(`${CONTRACT}_GRAPHQL:${text(body.errors[0]?.message).slice(0, 500)}`);
const gpuTypes = list(body?.data?.gpuTypes)
  .map((g) => ({ id: text(g.id), display_name: text(g.displayName) || null, memory_gb: finite(g.memoryInGb) }))
  .filter((g) => /^NVIDIA\b/i.test(g.id) && finite(g.memory_gb, 0) >= MEMORY_FLOOR_GB)
  .sort((a, b) => (b.memory_gb || 0) - (a.memory_gb || 0) || a.id.localeCompare(b.id));
const byId = new Map(gpuTypes.map((g) => [g.id, g]));
const availability = [];
for (const dc of list(body?.data?.dataCenters)) {
  for (const row of list(dc?.gpuAvailability)) {
    const id = text(row.gpuTypeId);
    if (!byId.has(id)) continue;
    availability.push({
      gpu_type_id: id,
      display_name: text(row.displayName) || byId.get(id)?.display_name || null,
      memory_gb: byId.get(id)?.memory_gb || null,
      data_center_id: text(dc.id) || null,
      location: text(dc.location || dc.name) || null,
      stock_status: text(row.stockStatus) || null,
    });
  }
}
const rank = { HIGH: 4, MEDIUM: 3, LOW: 2, NONE: 1, UNAVAILABLE: 0 };
const summary = gpuTypes.map((gpu) => {
  const rows = availability.filter((row) => row.gpu_type_id === gpu.id);
  const best = rows.slice().sort((a, b) => (rank[text(b.stock_status).toUpperCase()] || 0) - (rank[text(a.stock_status).toUpperCase()] || 0))[0] || null;
  return {
    ...gpu,
    best_stock_status: best?.stock_status || null,
    best_location: best?.location || null,
    visible_locations: rows.length,
  };
}).sort((a, b) => (rank[text(b.best_stock_status).toUpperCase()] || 0) - (rank[text(a.best_stock_status).toUpperCase()] || 0) || (b.memory_gb || 0) - (a.memory_gb || 0));
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  memory_floor_gb: MEMORY_FLOOR_GB,
  gpu_summary: summary,
  availability,
  generation_submitted: false,
  gpu_activation_performed: false,
  mutation_performed: false,
  new_network_volume_created: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);

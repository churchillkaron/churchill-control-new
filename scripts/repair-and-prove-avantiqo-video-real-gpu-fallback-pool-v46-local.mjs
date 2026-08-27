import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "scripts/repair-and-prove-avantiqo-video-real-gpu-fallback-pool-v45-local.mjs";

function replaceExactlyOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`AVANTIQO_VIDEO_V46_SOURCE_TRANSFORM_${label}_MISMATCH:occurrences=${count}`);
  return source.replace(search, replacement);
}

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 20) {
  throw new Error(`AVANTIQO_VIDEO_V46_NODE20_REQUIRED:${process.version}`);
}

let source = await readFile(resolve(process.cwd(), BASE), "utf8");

source = replaceExactlyOnce(
  source,
  `  const available = rows.filter((row) => row.available && row.secure_cloud_supported && row.memory_gb >= MIN_MEMORY_GB);\n  for (const gpuTypeId of TARGET_POOL) {\n    if (!available.some((row) => row.gpu_type_id === gpuTypeId)) {\n      throw new Error(\`AVANTIQO_VIDEO_V45_TARGET_GPU_NOT_CURRENTLY_VISIBLE:\${gpuTypeId}\`);\n    }\n  }\n  return rows;`,
  `  const globallyValid = TARGET_POOL.filter((gpuTypeId) => {\n    const m = meta.get(gpuTypeId) || {};\n    return m.secureCloud === true && finite(m.memoryInGb, null) >= MIN_MEMORY_GB;\n  });\n  if (!sameOrder(globallyValid, TARGET_POOL)) {\n    throw new Error(\`AVANTIQO_VIDEO_V45_TARGET_GPU_GLOBAL_CONTRACT_INVALID:\${JSON.stringify({ target_pool: TARGET_POOL, globally_valid: globallyValid })}\`);\n  }\n\n  const available = rows.filter((row) => row.available && row.secure_cloud_supported && row.memory_gb >= MIN_MEMORY_GB);\n  if (!available.length) {\n    throw new Error(\`AVANTIQO_VIDEO_V45_NO_TARGET_GPU_CURRENTLY_VISIBLE:\${JSON.stringify(rows)}\`);\n  }\n\n  const currentlyVisibleGpuTypes = TARGET_POOL.filter((gpuTypeId) =>\n    available.some((row) => row.gpu_type_id === gpuTypeId),\n  );\n  const temporarilyUnavailableGpuTypes = TARGET_POOL.filter((gpuTypeId) =>\n    !currentlyVisibleGpuTypes.includes(gpuTypeId),\n  );\n  console.log(\`AVANTIQO_VIDEO_V45_LIVE_TARGET_CAPACITY=\${JSON.stringify({\n    configured_priority_pool: TARGET_POOL,\n    currently_visible_gpu_types: currentlyVisibleGpuTypes,\n    temporarily_unavailable_gpu_types: temporarilyUnavailableGpuTypes,\n    live_rows: available,\n    policy: \"VALID_FALLBACK_TYPES_MAY_REMAIN_CONFIGURED_WHILE_TEMPORARILY_OUT_OF_STOCK\",\n  })}\`);\n  return rows;`,
  "TRANSIENT_STOCK_GUARD",
);

source = source.replaceAll("V45", "V46");
if (source.includes("V45")) throw new Error("AVANTIQO_VIDEO_V46_SOURCE_TRANSFORM_V45_REMAINS");

console.log(`AVANTIQO_VIDEO_V46_SOURCE_TRANSFORM_ACTIVE=${JSON.stringify({
  base: BASE,
  node: process.version,
  repair: "TRANSIENT_GPU_STOCK_DOES_NOT_INVALIDATE_CONFIGURED_FALLBACK_TYPE",
  spend_gate: "AT_LEAST_ONE_TARGET_GPU_CURRENTLY_VISIBLE",
  global_gpu_contract_still_required: true,
  safe_lease_changed: false,
  image_endpoint_changed: false,
})}`);

const encoded = Buffer.from(source, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);

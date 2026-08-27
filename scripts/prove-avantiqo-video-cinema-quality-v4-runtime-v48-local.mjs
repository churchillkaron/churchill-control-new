import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "scripts/repair-and-prove-avantiqo-video-real-gpu-fallback-pool-v45-local.mjs";

function replaceExactlyOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`AVANTIQO_VIDEO_V48_SOURCE_TRANSFORM_${label}_MISMATCH:occurrences=${count}`);
  }
  return source.replace(search, replacement);
}

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 20) {
  throw new Error(`AVANTIQO_VIDEO_V48_NODE20_REQUIRED:${process.version}`);
}

let source = await readFile(resolve(process.cwd(), BASE), "utf8");

// Preserve V46's proven stock-race-tolerant fallback-pool guard. All target GPU
// types must remain globally valid, but transient regional stock is allowed to
// fluctuate as long as at least one compatible target is currently visible.
source = replaceExactlyOnce(
  source,
  `  const available = rows.filter((row) => row.available && row.secure_cloud_supported && row.memory_gb >= MIN_MEMORY_GB);\n  for (const gpuTypeId of TARGET_POOL) {\n    if (!available.some((row) => row.gpu_type_id === gpuTypeId)) {\n      throw new Error(\`AVANTIQO_VIDEO_V45_TARGET_GPU_NOT_CURRENTLY_VISIBLE:\${gpuTypeId}\`);\n    }\n  }\n  return rows;`,
  `  const globallyValid = TARGET_POOL.filter((gpuTypeId) => {\n    const m = meta.get(gpuTypeId) || {};\n    return m.secureCloud === true && finite(m.memoryInGb, null) >= MIN_MEMORY_GB;\n  });\n  if (!sameOrder(globallyValid, TARGET_POOL)) {\n    throw new Error(\`AVANTIQO_VIDEO_V45_TARGET_GPU_GLOBAL_CONTRACT_INVALID:\${JSON.stringify({ target_pool: TARGET_POOL, globally_valid: globallyValid })}\`);\n  }\n\n  const available = rows.filter((row) => row.available && row.secure_cloud_supported && row.memory_gb >= MIN_MEMORY_GB);\n  if (!available.length) {\n    throw new Error(\`AVANTIQO_VIDEO_V45_NO_TARGET_GPU_CURRENTLY_VISIBLE:\${JSON.stringify(rows)}\`);\n  }\n\n  const currentlyVisibleGpuTypes = TARGET_POOL.filter((gpuTypeId) =>\n    available.some((row) => row.gpu_type_id === gpuTypeId),\n  );\n  const temporarilyUnavailableGpuTypes = TARGET_POOL.filter((gpuTypeId) =>\n    !currentlyVisibleGpuTypes.includes(gpuTypeId),\n  );\n  console.log(\`AVANTIQO_VIDEO_V45_LIVE_TARGET_CAPACITY=\${JSON.stringify({\n    configured_priority_pool: TARGET_POOL,\n    currently_visible_gpu_types: currentlyVisibleGpuTypes,\n    temporarily_unavailable_gpu_types: temporarilyUnavailableGpuTypes,\n    live_rows: available,\n    policy: \"VALID_FALLBACK_TYPES_MAY_REMAIN_CONFIGURED_WHILE_TEMPORARILY_OUT_OF_STOCK\",\n  })}\`);\n  return rows;`,
  "TRANSIENT_STOCK_GUARD",
);

const resultMarker = `  console.log(JSON.stringify({\n    success: true,\n    contract: CONTRACT,\n    endpoint_id: ENDPOINT_ID,\n    worker_allocation_proven: true,\n    runtime_probe_completed: true,`;
const v4Assertions = `  const qualityDefaults = output?.quality_defaults || {};\n  const t2vDefaults = qualityDefaults?.t2v || {};\n  if (text(output?.entrypoint) !== \"handler_v4.py\") {\n    throw new Error(\`AVANTIQO_VIDEO_V45_V4_ENTRYPOINT_INVALID:\${text(output?.entrypoint) || \"NONE\"}\`);\n  }\n  if (text(output?.entrypoint_revision) !== \"AVANTIQO_VIDEO_HANDLER_V4_WAN22_CINEMA_QUALITY_V1\") {\n    throw new Error(\`AVANTIQO_VIDEO_V45_V4_ENTRYPOINT_REVISION_INVALID:\${text(output?.entrypoint_revision) || \"NONE\"}\`);\n  }\n  if (text(output?.runtime_revision) !== \"AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1\") {\n    throw new Error(\`AVANTIQO_VIDEO_V45_V4_RUNTIME_REVISION_INVALID:\${text(output?.runtime_revision) || \"NONE\"}\`);\n  }\n  if (text(output?.quality_contract) !== \"AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1\") {\n    throw new Error(\`AVANTIQO_VIDEO_V45_V4_QUALITY_CONTRACT_INVALID:\${text(output?.quality_contract) || \"NONE\"}\`);\n  }\n  if (JSON.stringify(qualityDefaults?.native_720p_landscape) !== JSON.stringify([1280, 720])) {\n    throw new Error(\`AVANTIQO_VIDEO_V45_V4_NATIVE_720P_INVALID:\${JSON.stringify(qualityDefaults?.native_720p_landscape)}\`);\n  }\n  if (finite(qualityDefaults?.minimum_cinema_fps, 0) < 16) {\n    throw new Error(\`AVANTIQO_VIDEO_V45_V4_MINIMUM_FPS_INVALID:\${qualityDefaults?.minimum_cinema_fps}\`);\n  }\n  if (finite(t2vDefaults?.inference_steps, 0) < 40) {\n    throw new Error(\`AVANTIQO_VIDEO_V45_V4_T2V_STEPS_INVALID:\${t2vDefaults?.inference_steps}\`);\n  }\n  if (finite(t2vDefaults?.guidance_scale_high_noise, null) !== 4 || finite(t2vDefaults?.guidance_scale_low_noise, null) !== 3) {\n    throw new Error(\`AVANTIQO_VIDEO_V45_V4_T2V_GUIDANCE_INVALID:\${JSON.stringify(t2vDefaults)}\`);\n  }\n  if (text(qualityDefaults?.vae_decode_dtype) !== \"float32\") {\n    throw new Error(\`AVANTIQO_VIDEO_V45_V4_VAE_DTYPE_INVALID:\${text(qualityDefaults?.vae_decode_dtype) || \"NONE\"}\`);\n  }\n  if (text(qualityDefaults?.diffusion_dtype) !== \"bfloat16\") {\n    throw new Error(\`AVANTIQO_VIDEO_V45_V4_DIFFUSION_DTYPE_INVALID:\${text(qualityDefaults?.diffusion_dtype) || \"NONE\"}\`);\n  }\n  if (finite(qualityDefaults?.export_quality, 0) < 9) {\n    throw new Error(\`AVANTIQO_VIDEO_V45_V4_EXPORT_QUALITY_INVALID:\${qualityDefaults?.export_quality}\`);\n  }\n\n`;
source = replaceExactlyOnce(
  source,
  resultMarker,
  `${v4Assertions}${resultMarker}`,
  "V4_QUALITY_ASSERTIONS",
);

source = replaceExactlyOnce(
  source,
  `      runtime_revision: text(output.runtime_revision) || null,\n      generation_requested: output.generation_requested,`,
  `      runtime_revision: text(output.runtime_revision) || null,\n      quality_contract: text(output.quality_contract) || null,\n      quality_defaults: output.quality_defaults || null,\n      generation_requested: output.generation_requested,`,
  "V4_QUALITY_EVIDENCE",
);

source = source.replaceAll("V45", "V48");
if (source.includes("V45")) {
  throw new Error("AVANTIQO_VIDEO_V48_SOURCE_TRANSFORM_V45_REMAINS");
}

console.log(`AVANTIQO_VIDEO_V48_SOURCE_TRANSFORM_ACTIVE=${JSON.stringify({
  base: BASE,
  node: process.version,
  proof: "V4_IMMUTABLE_IMAGE_REAL_WORKER_RUNTIME_AND_CINEMA_QUALITY_DEFAULTS",
  expected_entrypoint: "handler_v4.py",
  expected_entrypoint_revision: "AVANTIQO_VIDEO_HANDLER_V4_WAN22_CINEMA_QUALITY_V1",
  expected_runtime_revision: "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1",
  expected_quality_contract: "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1",
  inference_requested: false,
  generation_requested: false,
  model_download_requested: false,
  storage_mutation_requested: false,
  safe_lease_changed: false,
  image_endpoint_changed: false,
})}`);

const encoded = Buffer.from(source, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);

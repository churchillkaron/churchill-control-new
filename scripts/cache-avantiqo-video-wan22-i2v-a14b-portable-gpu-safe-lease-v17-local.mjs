import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const V16 = "scripts/cache-avantiqo-video-wan22-i2v-a14b-safe-lease-v16-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_I2V_A14B_PORTABLE_GPU_SAFE_LEASE_V17";
const APPROVAL_ENV = "AVANTIQO_VIDEO_WAN22_I2V_PORTABLE_GPU_SAFE_LEASE_APPROVED";
const FALLBACK_GPU_TYPES = [
  "NVIDIA H200",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA A100-SXM4-80GB",
];
const text = (value) => String(value ?? "").trim();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_ANCHOR_COUNT:${count}`);
  return source.replace(before, after);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_I2V_V17_NODE24_REQUIRED:${process.version}`);
}

const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL_ENV])) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

let source = await readFile(V16, "utf8");
const injectionClose = '\n`;\nwrapper = replaceOnce(wrapper, injectionAnchor, `${injection}\\n${injectionAnchor}`, "AVANTIQO_VIDEO_I2V_V16_INJECTION");';
const extra = String.raw`
// V17: temporarily broaden only the leased Cinema cache-worker GPU pool, then restore the certified Blackwell pool.
source = replaceExactly(
  source,
  '  delete value.execution_timeout_ms;\n  return value;',
  '  delete value.execution_timeout_ms;\n  delete value.gpu_type_ids;\n  return value;',
  1,
  "AVANTIQO_VIDEO_I2V_V17_STABLE_BASELINE_GPU_TOLERANCE",
);
source = replaceExactly(
  source,
  'const originalCinema = safeEndpoint(cinema);',
  'const originalCinema = safeEndpoint(cinema);\nconst originalGpuTypeIds = [...originalCinema.gpu_type_ids];\nconst portableCacheGpuTypeIds = ["NVIDIA H200", "NVIDIA H100 80GB HBM3", "NVIDIA A100-SXM4-80GB"];\nlet gpuPoolChangedByThisScript = false;',
  1,
  "AVANTIQO_VIDEO_I2V_V17_GPU_STATE",
);
source = replaceExactly(
  source,
  'async function restoreTemporaryState() {\n  const endpointId = text(cinema.id);',
  'async function restoreTemporaryState() {\n  const endpointId = text(cinema.id);\n  if (gpuPoolChangedByThisScript) {\n    const drainDeadline = Date.now() + 60_000;\n    let lastHealth = null;\n    while (Date.now() <= drainDeadline) {\n      lastHealth = healthSummary(await queueRequest(endpointId, "/health", queueCredential.key));\n      if (lastHealth.jobs.in_queue === 0 && lastHealth.jobs.in_progress === 0) break;\n      await sleep(2_000);\n    }\n    if (!lastHealth || lastHealth.jobs.in_queue !== 0 || lastHealth.jobs.in_progress !== 0) {\n      throw new Error("AVANTIQO_VIDEO_I2V_V17_GPU_RESTORE_JOBS_NOT_DRAINED:" + JSON.stringify(lastHealth || {}));\n    }\n    const current = await waitForEndpoint(endpointId, managementKey, () => true, "AVANTIQO_VIDEO_I2V_V17_GPU_RESTORE_READ", 15_000);\n    const currentGpuTypes = unique(list(current.gpuTypeIds));\n    if (sameSet(currentGpuTypes, portableCacheGpuTypeIds)) {\n      await rest("/endpoints/" + encodeURIComponent(endpointId), managementKey, { method: "PATCH", body: { gpuTypeIds: originalGpuTypeIds } });\n      await waitForEndpoint(endpointId, managementKey, (endpoint) => sameSet(list(endpoint.gpuTypeIds), originalGpuTypeIds), "AVANTIQO_VIDEO_I2V_V17_GPU_RESTORE", 90_000);\n      console.log("AVANTIQO_VIDEO_I2V_V17_ORIGINAL_BLACKWELL_POOL_RESTORED=true");\n    } else if (!sameSet(currentGpuTypes, originalGpuTypeIds)) {\n      throw new Error("AVANTIQO_VIDEO_I2V_V17_GPU_RESTORE_CONCURRENT_CHANGE:" + JSON.stringify(currentGpuTypes));\n    }\n    gpuPoolChangedByThisScript = false;\n  }',
  1,
  "AVANTIQO_VIDEO_I2V_V17_RESTORE_GPU_POOL",
);
source = replaceExactly(
  source,
  'try {\n  const preTimeout = await revalidateBeforeMutation("AVANTIQO_VIDEO_T2V_CACHE_PRE_TIMEOUT");',
  'try {\n  const preFallbackHealth = healthSummary(await queueRequest(text(cinema.id), "/health", queueCredential.key));\n  assertNoActiveJobs(preFallbackHealth, "AVANTIQO_VIDEO_I2V_V17_PRE_GPU_FALLBACK");\n  const preFallbackEndpoint = await waitForEndpoint(text(cinema.id), managementKey, () => true, "AVANTIQO_VIDEO_I2V_V17_GPU_FALLBACK_READ", 15_000);\n  if (!sameSet(list(preFallbackEndpoint.gpuTypeIds), originalGpuTypeIds)) {\n    throw new Error("AVANTIQO_VIDEO_I2V_V17_ORIGINAL_GPU_POOL_CHANGED_BEFORE_FALLBACK");\n  }\n  await rest("/endpoints/" + encodeURIComponent(text(cinema.id)), managementKey, { method: "PATCH", body: { gpuTypeIds: portableCacheGpuTypeIds } });\n  gpuPoolChangedByThisScript = true;\n  await waitForEndpoint(text(cinema.id), managementKey, (endpoint) => sameSet(list(endpoint.gpuTypeIds), portableCacheGpuTypeIds), "AVANTIQO_VIDEO_I2V_V17_GPU_FALLBACK_PROPAGATION", 90_000);\n  console.log("AVANTIQO_VIDEO_I2V_V17_PORTABLE_CACHE_GPU_POOL_ACTIVE=" + JSON.stringify(portableCacheGpuTypeIds));\n\n  const preTimeout = await revalidateBeforeMutation("AVANTIQO_VIDEO_T2V_CACHE_PRE_TIMEOUT");',
  1,
  "AVANTIQO_VIDEO_I2V_V17_APPLY_GPU_FALLBACK",
);
source = replaceExactly(
  source,
  '  if (finite(finalCinema.executionTimeoutMs ?? finalCinema.executionTimeout) !== originalTimeoutMs) {',
  '  if (!sameSet(list(finalCinema.gpuTypeIds), originalGpuTypeIds)) {\n    throw new Error("AVANTIQO_VIDEO_I2V_V17_FINAL_ORIGINAL_GPU_POOL_NOT_RESTORED");\n  }\n  if (finite(finalCinema.executionTimeoutMs ?? finalCinema.executionTimeout) !== originalTimeoutMs) {',
  1,
  "AVANTIQO_VIDEO_I2V_V17_FINAL_GPU_POOL",
);
`;
source = replaceOnce(source, injectionClose, `${extra}${injectionClose}`, "AVANTIQO_VIDEO_I2V_V17_INJECT_PORTABLE_GPU_POOL");

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-i2v-v17-"));
const patchedV16 = join(dir, "cache-avantiqo-video-wan22-i2v-a14b-portable-gpu-safe-lease-v17.mjs");
try {
  await writeFile(patchedV16, source, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", patchedV16], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (syntax.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_I2V_V17_PATCHED_V16_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 2400)}`);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    reason: "BLACKWELL_POOL_NO_WORKER_STARTUP",
    safe_lease: {
      controller: "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
      lane: "cinema",
      direct_workers_max_write: false,
      jobs_outside_safe_lease: 0,
    },
    temporary_cache_gpu_pool: FALLBACK_GPU_TYPES,
    original_blackwell_pool_restore_required: true,
    image_endpoint_mutation: false,
    shared_volume_rebind: false,
    video_generation: false,
    inference: false,
    worker_startup_timeout_ms: 300000,
  }, null, 2));

  const env = {
    ...process.env,
    AVANTIQO_VIDEO_WAN22_I2V_WORKER_STARTUP_TIMEOUT_MS: "300000",
    ...(apply ? { AVANTIQO_VIDEO_WAN22_I2V_SAFE_LEASE_CACHE_APPROVED: "YES" } : {}),
  };
  const child = spawnSync(process.execPath, [patchedV16, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`AVANTIQO_VIDEO_I2V_V17_CHILD_FAILED:exit=${child.status}`);
  if (apply) console.log("AVANTIQO_VIDEO_WAN22_I2V_PORTABLE_GPU_SAFE_LEASE_V17_APPLIED=true");
} finally {
  await rm(dir, { recursive: true, force: true });
}

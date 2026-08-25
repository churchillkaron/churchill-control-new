import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONTRACT = "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V5";
const V4_SCRIPT = "run-avantiqo-code-capacity-relocation-after-timeout-v4-local.mjs";

function replaceExactlyOnce(source, needle, replacement, code) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`${code}_ANCHOR_MISSING`);
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`${code}_ANCHOR_AMBIGUOUS`);
  }
  return source.replace(needle, replacement);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const v4Path = resolve(scriptDir, V4_SCRIPT);
if (!existsSync(v4Path)) throw new Error("CODE_TIMEOUT_RECOVERY_V5_V4_SOURCE_REQUIRED");

const v4Source = readFileSync(v4Path, "utf8");
if (!v4Source.includes('const CONTRACT = "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V4";')) {
  throw new Error("CODE_TIMEOUT_RECOVERY_V5_V4_CONTRACT_CHANGED");
}

const stateAnchor = `  let cacheStartupObservedAt = null;
  let cacheLastControl = null;`;
const stateReplacement = `  let cacheStartupObservedAt = null;
  let cacheLastControl = null;
  let coldStartHealth = null;
  let coldStartHealthWorkerActivity = false;`;

const jobKindAnchor = `    const isCacheJob = label === "AVANTIQO_CODE_CAPACITY_CACHE";

    if (status === "IN_QUEUE" && isCacheJob) {`;
const jobKindReplacement = `    const isCacheJob = label === "AVANTIQO_CODE_CAPACITY_CACHE";
    const isInferenceJob = label === "AVANTIQO_CODE_CAPACITY_INFERENCE";
    const isColdStartAwareJob = isCacheJob || isInferenceJob;

    if (status === "IN_QUEUE" && isColdStartAwareJob) {`;

const observationAnchor = `      cacheLastControl = await cacheControlSnapshot();
      if (cacheLastControl.available && cacheLastControl.workers.length > 0 && cacheStartupObservedAt === null) {
        cacheStartupObservedAt = Date.now();
      }`;
const observationReplacement = `      cacheLastControl = await cacheControlSnapshot();
      const coldStartHealthRaw = await serverless(endpointId, "/health", key).catch(() => null);
      coldStartHealth = coldStartHealthRaw ? healthCounters(coldStartHealthRaw) : null;
      coldStartHealthWorkerActivity = Boolean(coldStartHealth) && (
        coldStartHealth.workers.initializing > 0 ||
        coldStartHealth.workers.ready > 0 ||
        coldStartHealth.workers.running > 0 ||
        coldStartHealth.workers.throttled > 0
      );
      if (
        (
          (cacheLastControl.available && cacheLastControl.workers.length > 0) ||
          coldStartHealthWorkerActivity
        ) &&
        cacheStartupObservedAt === null
      ) {
        cacheStartupObservedAt = Date.now();
      }`;

const timeoutSuffixAnchor = `          "s_since_control_worker_observed",`;
const timeoutSuffixReplacement = `          "s_since_worker_activity_observed",`;

const loggingAnchor = `        cache_cold_start_policy: isCacheJob ? "CONTROL_AWARE" : null,
        cache_startup_observed: isCacheJob ? cacheStartupObservedAt !== null : null,
        cache_seconds_since_startup_observed:
          isCacheJob && cacheStartupObservedAt !== null
            ? Math.round((Date.now() - cacheStartupObservedAt) / 1000)
            : null,
        cache_control_plane: isCacheJob ? cacheLastControl : null,`;
const loggingReplacement = `        cold_start_policy: isColdStartAwareJob ? "CONTROL_OR_HEALTH_AWARE" : null,
        cold_start_job_kind: isCacheJob ? "CACHE" : (isInferenceJob ? "INFERENCE" : null),
        cold_start_startup_observed: isColdStartAwareJob ? cacheStartupObservedAt !== null : null,
        cold_start_seconds_since_startup_observed:
          isColdStartAwareJob && cacheStartupObservedAt !== null
            ? Math.round((Date.now() - cacheStartupObservedAt) / 1000)
            : null,
        cold_start_control_plane: isColdStartAwareJob ? cacheLastControl : null,
        cold_start_health: isColdStartAwareJob ? coldStartHealth : null,
        cold_start_health_worker_activity: isColdStartAwareJob ? coldStartHealthWorkerActivity : null,
        cache_cold_start_policy: isCacheJob ? "CONTROL_OR_HEALTH_AWARE" : null,
        cache_startup_observed: isCacheJob ? cacheStartupObservedAt !== null : null,
        cache_seconds_since_startup_observed:
          isCacheJob && cacheStartupObservedAt !== null
            ? Math.round((Date.now() - cacheStartupObservedAt) / 1000)
            : null,
        cache_control_plane: isCacheJob ? cacheLastControl : null,
        inference_cold_start_policy: isInferenceJob ? "CONTROL_OR_HEALTH_AWARE" : null,
        inference_startup_observed: isInferenceJob ? cacheStartupObservedAt !== null : null,
        inference_seconds_since_startup_observed:
          isInferenceJob && cacheStartupObservedAt !== null
            ? Math.round((Date.now() - cacheStartupObservedAt) / 1000)
            : null,
        inference_control_plane: isInferenceJob ? cacheLastControl : null,`;

const verifyAnchor = `  !patchedRelocation.includes('cache_cold_start_policy: isCacheJob ? "CONTROL_AWARE" : null')`;
const verifyReplacement = `  !patchedRelocation.includes('inference_cold_start_policy: isInferenceJob ? "CONTROL_OR_HEALTH_AWARE" : null') ||
  !patchedRelocation.includes("coldStartHealthWorkerActivity = Boolean(coldStartHealth)")`;

const startMetadataAnchor = `  cache_queue_monitoring: {
    policy: "CONTROL_AWARE",
    no_worker_timeout_seconds: 180,
    degraded_control_timeout_seconds: 480,
    cold_start_timeout_after_worker_observed_seconds: 720,
    overall_job_timeout_seconds: 1200,
    generic_probe_and_inference_queue_timeout_unchanged: true,
  },`;
const startMetadataReplacement = `  cache_queue_monitoring: {
    policy: "CONTROL_OR_HEALTH_AWARE",
    no_worker_timeout_seconds: 180,
    degraded_control_timeout_seconds: 480,
    cold_start_timeout_after_worker_observed_seconds: 720,
    overall_job_timeout_seconds: 1200,
    generic_probe_queue_timeout_unchanged: true,
  },
  inference_queue_monitoring: {
    policy: "CONTROL_OR_HEALTH_AWARE",
    no_worker_timeout_seconds: 180,
    degraded_control_timeout_seconds: 480,
    cold_start_timeout_after_worker_observed_seconds: 720,
    overall_job_timeout_seconds: 1200,
    previous_blind_queue_timeout_seconds: 300,
    serverless_health_worker_activity_counts_as_startup_evidence: true,
    generic_probe_queue_timeout_unchanged: true,
  },`;

const completeMetadataAnchor = `    cache_queue_monitoring: "CONTROL_AWARE",`;
const completeMetadataReplacement = `    cache_queue_monitoring: "CONTROL_OR_HEALTH_AWARE",
    inference_queue_monitoring: "CONTROL_OR_HEALTH_AWARE",`;

let patchedV4 = replaceExactlyOnce(
  v4Source,
  stateAnchor,
  stateReplacement,
  "CODE_TIMEOUT_RECOVERY_V5_STATE",
);
patchedV4 = replaceExactlyOnce(
  patchedV4,
  jobKindAnchor,
  jobKindReplacement,
  "CODE_TIMEOUT_RECOVERY_V5_JOB_KIND",
);
patchedV4 = replaceExactlyOnce(
  patchedV4,
  observationAnchor,
  observationReplacement,
  "CODE_TIMEOUT_RECOVERY_V5_STARTUP_OBSERVATION",
);
patchedV4 = replaceExactlyOnce(
  patchedV4,
  timeoutSuffixAnchor,
  timeoutSuffixReplacement,
  "CODE_TIMEOUT_RECOVERY_V5_TIMEOUT_SUFFIX",
);
patchedV4 = replaceExactlyOnce(
  patchedV4,
  loggingAnchor,
  loggingReplacement,
  "CODE_TIMEOUT_RECOVERY_V5_LOGGING",
);
patchedV4 = replaceExactlyOnce(
  patchedV4,
  verifyAnchor,
  verifyReplacement,
  "CODE_TIMEOUT_RECOVERY_V5_PATCH_VERIFY",
);
patchedV4 = replaceExactlyOnce(
  patchedV4,
  startMetadataAnchor,
  startMetadataReplacement,
  "CODE_TIMEOUT_RECOVERY_V5_START_METADATA",
);
patchedV4 = replaceExactlyOnce(
  patchedV4,
  completeMetadataAnchor,
  completeMetadataReplacement,
  "CODE_TIMEOUT_RECOVERY_V5_COMPLETE_METADATA",
);
patchedV4 = replaceExactlyOnce(
  patchedV4,
  '"RUNPOD_CODE_CACHE_CONTROL_HTTP_" + response.status',
  '"RUNPOD_CODE_COLD_START_CONTROL_HTTP_" + response.status',
  "CODE_TIMEOUT_RECOVERY_V5_CONTROL_ERROR_LABEL",
);

if (
  patchedV4 === v4Source ||
  patchedV4.includes(jobKindAnchor) ||
  patchedV4.includes(observationAnchor) ||
  patchedV4.includes(loggingAnchor) ||
  patchedV4.includes(startMetadataAnchor) ||
  !patchedV4.includes('const isInferenceJob = label === "AVANTIQO_CODE_CAPACITY_INFERENCE";') ||
  !patchedV4.includes('inference_cold_start_policy: isInferenceJob ? "CONTROL_OR_HEALTH_AWARE" : null') ||
  !patchedV4.includes("serverless_health_worker_activity_counts_as_startup_evidence: true")
) {
  throw new Error("CODE_TIMEOUT_RECOVERY_V5_PATCH_VERIFY_FAILED");
}

const tempV4Name = `.avantiqo-code-capacity-timeout-recovery-v5-v4-${process.pid}.mjs`;
const tempV4Path = resolve(scriptDir, tempV4Name);

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V5_START",
  contract: CONTRACT,
  child_contract: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V4",
  cache_queue_monitoring: "CONTROL_OR_HEALTH_AWARE",
  inference_queue_monitoring: "CONTROL_OR_HEALTH_AWARE",
  inference_serverless_health_startup_evidence: ["initializing", "ready", "running", "throttled"],
  no_worker_timeout_seconds: 180,
  degraded_control_timeout_seconds: 480,
  cold_start_timeout_after_worker_observed_seconds: 720,
  overall_job_timeout_seconds: 1200,
  generic_probe_queue_timeout_unchanged: true,
  model_contract_changed: false,
  vllm_contract_changed: false,
  fp8_contract_changed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

try {
  writeFileSync(tempV4Path, patchedV4, { encoding: "utf8", flag: "wx" });
  const child = spawnSync(process.execPath, [tempV4Path, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.signal) throw new Error(`CODE_TIMEOUT_RECOVERY_V5_CHILD_SIGNAL:${child.signal}`);
  if (child.status !== 0) {
    throw new Error(`CODE_TIMEOUT_RECOVERY_V5_CHILD_EXIT:${child.status ?? "UNKNOWN"}`);
  }
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V5_COMPLETE",
    contract: CONTRACT,
    child_exit_code: 0,
    cache_queue_monitoring: "CONTROL_OR_HEALTH_AWARE",
    inference_queue_monitoring: "CONTROL_OR_HEALTH_AWARE",
    production_deploy_performed: false,
    secrets_printed: false,
  }));
} finally {
  if (existsSync(tempV4Path)) unlinkSync(tempV4Path);
}

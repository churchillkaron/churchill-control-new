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

const relocationReadAnchor = `const relocationSource = readFileSync(relocationPath, "utf8");`;
const relocationReadReplacement = `let relocationSource = readFileSync(relocationPath, "utf8");
const scopedMainGuardStart = relocationSource.indexOf("function requireCurrentMain() {");
const scopedMainGuardEnd = relocationSource.indexOf("\\n\\nfunction gpuProfile", scopedMainGuardStart);
if (scopedMainGuardStart < 0 || scopedMainGuardEnd < 0 || scopedMainGuardEnd <= scopedMainGuardStart) {
  throw new Error("CODE_TIMEOUT_RECOVERY_V5_SCOPED_MAIN_GUARD_BOUNDARY_MISSING");
}
const scopedMainGuardReplacement = \`const CODE_RELOCATION_PROTECTED_PATHS = Object.freeze([
  "scripts/relocate-avantiqo-code-runpod-capacity-local.mjs",
  "scripts/run-avantiqo-code-capacity-relocation-after-timeout-v2-local.mjs",
  "scripts/run-avantiqo-code-capacity-relocation-after-timeout-v3-local.mjs",
  "scripts/run-avantiqo-code-capacity-relocation-after-timeout-v4-local.mjs",
  "scripts/run-avantiqo-code-capacity-relocation-after-timeout-v5-local.mjs",
  "scripts/lib/avantiqo-code-runpod-endpoint-ready-fetch-guard.mjs",
  "scripts/lib/avantiqo-runpod-shared-volumes.mjs",
  "services/avantiqo-code-engine/handler.py",
  "services/avantiqo-code-engine/Dockerfile.runpod",
]);

function requireCurrentMain() {
  command("git", ["fetch", "origin", "main"], "CODE_CAPACITY_RELOCATION_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "CODE_CAPACITY_RELOCATION_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error("CODE_CAPACITY_RELOCATION_MAIN_REQUIRED:" + (branch || "DETACHED"));
  const head = command("git", ["rev-parse", "HEAD"], "CODE_CAPACITY_RELOCATION_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "CODE_CAPACITY_RELOCATION_ORIGIN_READ_FAILED");
  if (head === origin) return head;
  const mergeBase = command("git", ["merge-base", head, origin], "CODE_CAPACITY_RELOCATION_MERGE_BASE_FAILED");
  if (mergeBase !== head) {
    throw new Error("CODE_CAPACITY_RELOCATION_LOCAL_MAIN_DIVERGED:head=" + head + ":origin=" + origin + ":merge_base=" + mergeBase);
  }
  const changed = command(
    "git",
    ["diff", "--name-only", head + ".." + origin, "--", ...CODE_RELOCATION_PROTECTED_PATHS],
    "CODE_CAPACITY_RELOCATION_PROTECTED_DIFF_FAILED",
  ).split("\\n").map((entry) => entry.trim()).filter(Boolean);
  if (changed.length) {
    throw new Error(
      "CODE_CAPACITY_RELOCATION_PROTECTED_MAIN_ADVANCE_REPLAN_REQUIRED:head=" +
      head +
      ":origin=" +
      origin +
      ":changed=" +
      changed.join("|"),
    );
  }
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CAPACITY_RELOCATION_UNRELATED_MAIN_ADVANCE_ACCEPTED",
    local_head: head,
    origin_main: origin,
    protected_paths_changed: [],
    local_head_is_ancestor_of_origin_main: true,
  }));
  return head;
}\`;
relocationSource =
  relocationSource.slice(0, scopedMainGuardStart) +
  scopedMainGuardReplacement +
  relocationSource.slice(scopedMainGuardEnd);
if (!relocationSource.includes("AVANTIQO_CODE_CAPACITY_RELOCATION_UNRELATED_MAIN_ADVANCE_ACCEPTED")) {
  throw new Error("CODE_TIMEOUT_RECOVERY_V5_SCOPED_MAIN_GUARD_VERIFY_FAILED");
}`;

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
  },
  main_concurrency_guard: {
    policy: "PROTECTED_PATH_SCOPED",
    unrelated_main_advance_allowed: true,
    local_head_must_remain_ancestor: true,
    protected_code_runtime_change_requires_replan: true,
  },`;

const completeMetadataAnchor = `    cache_queue_monitoring: "CONTROL_AWARE",`;
const completeMetadataReplacement = `    cache_queue_monitoring: "CONTROL_OR_HEALTH_AWARE",
    inference_queue_monitoring: "CONTROL_OR_HEALTH_AWARE",
    main_concurrency_guard: "PROTECTED_PATH_SCOPED",`;

let patchedV4 = replaceExactlyOnce(
  v4Source,
  relocationReadAnchor,
  relocationReadReplacement,
  "CODE_TIMEOUT_RECOVERY_V5_RELOCATION_READ",
);
patchedV4 = replaceExactlyOnce(
  patchedV4,
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
  patchedV4.includes(relocationReadAnchor) ||
  patchedV4.includes(jobKindAnchor) ||
  patchedV4.includes(observationAnchor) ||
  patchedV4.includes(loggingAnchor) ||
  patchedV4.includes(startMetadataAnchor) ||
  !patchedV4.includes("CODE_TIMEOUT_RECOVERY_V5_SCOPED_MAIN_GUARD_BOUNDARY_MISSING") ||
  !patchedV4.includes("AVANTIQO_CODE_CAPACITY_RELOCATION_UNRELATED_MAIN_ADVANCE_ACCEPTED") ||
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
  main_concurrency_guard: "PROTECTED_PATH_SCOPED",
  unrelated_main_advance_allowed: true,
  protected_code_runtime_change_requires_replan: true,
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
    main_concurrency_guard: "PROTECTED_PATH_SCOPED",
    production_deploy_performed: false,
    secrets_printed: false,
  }));
} finally {
  if (existsSync(tempV4Path)) unlinkSync(tempV4Path);
}

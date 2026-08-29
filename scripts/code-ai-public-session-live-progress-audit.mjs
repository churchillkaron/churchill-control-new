import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_PUBLIC_SESSION_LIVE_PROGRESS_AUDIT_V1";

const files = Object.freeze({
  fastStart: "lib/code/runtime/CodeAIEmployeeFastStartRuntime.js",
  warmCapability: "lib/platform/capabilities/createCodeAIWarmCapability.js",
  prewarmRoute: "app/api/operator/code/prewarm/route.js",
  liveProgress: "lib/code/runtime/CodeAILiveProgressRuntime.js",
  leaseTouch: "lib/code/runtime/CodeAIWorkerLeaseTouchRuntime.js",
  progressRoute: "app/api/operator/code/progress/route.js",
  progressPanel: "components/operator/CodeAILiveProgressPanel.jsx",
  operatorHome: "components/operator/HomeAvantiqoIntelligence.jsx",
});

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

assert.match(source.fastStart, /const DEFAULT_WARM_SESSION_IDLE_MS = 30 \* 60 \* 1000;/);
assert.match(source.fastStart, /const MAX_WARM_SESSION_IDLE_MS = 30 \* 60 \* 1000;/);
assert.match(source.warmCapability, /const DEFAULT_IDLE_MS = 30 \* 60 \* 1000;/);
assert.match(source.prewarmRoute, /const DEFAULT_IDLE_MS = 30 \* 60 \* 1000;/);
assert.match(source.liveProgress, /const ACTIVE_WORKER_IDLE_MS = 30 \* 60 \* 1000;/);
assert.match(source.liveProgress, /touchReadyCodeAIWorkerLease\(\{[\s\S]*idle_ms: ACTIVE_WORKER_IDLE_MS/);
assert.doesNotMatch(source.liveProgress, /ensureCodeAIWorkerSession/);
assert.match(source.leaseTouch, /session\.state[\s\S]*READY/);
assert.match(source.leaseTouch, /session\.engine_ready !== true/);
assert.match(source.progressRoute, /requiredPermission: REQUIRED_PERMISSION/);
assert.match(source.progressRoute, /contains_source_content: false/);
assert.match(source.progressRoute, /contains_raw_reasoning: false/);
assert.match(source.progressPanel, /\/api\/operator\/code\/progress/);
assert.match(source.progressPanel, /const ACTIVE_POLL_MS = 1000;/);
assert.match(source.operatorHome, /\/api\/operator\/code\/prewarm/);
assert.match(source.operatorHome, /const CODE_PREWARM_POLL_MS = 5000;/);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  public_idle_policy_ms: 30 * 60 * 1000,
  public_idle_policy: "30_MINUTES_ACTUAL_IDLE",
  fast_start_default_30m: true,
  governed_warm_capability_default_30m: true,
  operator_prewarm_default_30m: true,
  active_work_lease_refresh_30m: true,
  live_progress_ready_only_lease_touch: true,
  live_progress_worker_lifecycle_mutation_performed: false,
  live_progress_api_permission_guarded: true,
  live_progress_source_content_exposed: false,
  live_progress_raw_reasoning_exposed: false,
  operator_live_progress_polling_wired: true,
  operator_prewarm_wired: true,
  provider_execution_performed: false,
  reasoning_calls_consumed: false,
  wallet_mutation_performed: false,
  runpod_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

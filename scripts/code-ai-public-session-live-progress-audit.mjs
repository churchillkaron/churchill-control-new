import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_PUBLIC_SESSION_LIVE_PROGRESS_AUDIT_V2_LOCAL";
const source = {
  readiness: await readFile("app/api/operator/code/prewarm/route.js", "utf8"),
  liveProgress: await readFile("lib/code/runtime/CodeAILiveProgressRuntime.js", "utf8"),
  leaseTouch: await readFile("lib/code/runtime/CodeAIWorkerLeaseTouchRuntime.js", "utf8"),
  progressRoute: await readFile("app/api/operator/code/progress/route.js", "utf8"),
  progressPanel: await readFile("components/operator/CodeAILiveProgressPanel.jsx", "utf8"),
  codeIde: await readFile("components/creative/code/AvantiqoCodeIDE.jsx", "utf8"),
};

assert.match(source.readiness, /AVANTIQO_CODE_OPERATOR_LOCAL_READINESS_V4/);
assert.match(source.readiness, /execution_transport_mode: "AVANTIQO_LOCAL_NODE_V1"/);
assert.match(source.readiness, /warming: false/);
assert.match(source.liveProgress, /const DURABLE_PROGRESS_CHECKPOINT_MS = 15 \* 1000;/);
assert.match(source.liveProgress, /const WORKER_LEASE_TOUCH_INTERVAL_MS = 60 \* 1000;/);
assert.match(source.liveProgress, /CODE_AI_LIVE_PROGRESS_LOCAL_HOT_PATH/);
assert.match(source.liveProgress, /local_authoritative: true/);
assert.match(source.liveProgress, /withDeadline\([\s\S]*refreshActiveWorkerLease\(\)[\s\S]*120/);
assert.doesNotMatch(source.liveProgress, /ensureCodeAIWorkerSession/);
assert.match(source.leaseTouch, /session\.engine_ready !== true/);
assert.match(source.leaseTouch, /\.eq\("updated_at", row\.updated_at\)/);
assert.match(source.progressRoute, /requiredPermission: REQUIRED_PERMISSION/);
assert.match(source.progressRoute, /contains_source_content: false/);
assert.match(source.progressRoute, /contains_raw_reasoning: false/);
assert.match(source.progressPanel, /const ACTIVE_POLL_MS = 1000;/);
assert.match(source.progressPanel, /\/api\/operator\/code\/progress/);
assert.match(source.codeIde, /useCodeProgressFeed/);
assert.match(source.codeIde, /MISSION_IDLE_DEADLINE_MS = 45 \* 1000/);
assert.match(source.codeIde, /MISSION_ABSOLUTE_DEADLINE_MS = 30 \* 60 \* 1000/);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  public_transport: "AVANTIQO_LOCAL_NODE_V1",
  active_progress_poll_ms: 1000,
  durable_checkpoint_ms: 15000,
  worker_lease_touch_interval_ms: 60000,
  local_hot_path_is_authoritative_between_checkpoints: true,
  live_progress_worker_lifecycle_mutation_performed: false,
  live_progress_api_permission_guarded: true,
  live_progress_source_content_exposed: false,
  live_progress_raw_reasoning_exposed: false,
  code_studio_progress_feed_wired: true,
  provider_execution_performed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

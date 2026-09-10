import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_AUTONOMY_MODAL_AUDIT_V1";
const forbiddenProviderControlPlane = /api\.runpod|rest\.runpod|RUNPOD_API_KEY|RUNPOD_MANAGEMENT_API_KEY|AvantiqoOwnedRunpodWorker|RunpodCodeProvider/i;

const files = {
  worker: "services/avantiqo-code-engine/handler.py",
  provider: "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderV2.js",
  registration: "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderRegistration.js",
  planner: "lib/code/runtime/CodeAIPlannerExecutionRuntime.js",
  workerSession: "lib/code/runtime/CodeAIWorkerSessionRuntime.js",
  zeroIdle: "lib/code/runtime/CodeAIServerlessZeroIdleLifecycleRuntime.js",
  mission: "lib/code/runtime/CodeAIMissionRuntime.js",
  autonomous: "lib/code/runtime/CodeAIAutonomousRuntime.js",
  autonomousCapability: "lib/platform/capabilities/createCodeAIAutonomousCapability.js",
  commitCapability: "lib/platform/capabilities/createCodeAICommitCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  research: "lib/platform/capabilities/createOperatorWebResearchCapability.js",
};

async function source(path) {
  try { return await readFile(path, "utf8"); }
  catch (error) { throw new Error(`${CONTRACT}_FILE_MISSING:${path}:${error?.code || "READ_FAILED"}`); }
}

function markers(label, sourceText, expected) {
  const missing = expected.filter((value) => !sourceText.includes(value));
  if (missing.length) throw new Error(`${CONTRACT}_${label}_MARKERS_MISSING:${missing.join(",")}`);
}

const entries = await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await source(path)]));
const loaded = Object.fromEntries(entries);

markers("WORKER", loaded.worker, ["AVANTIQO_CODE_ENGINE_V1", "ai.code.generate", "ai.code.edit", "ai.code.review", "raw_reasoning_persisted"]);
markers("PROVIDER", loaded.provider, ["AVANTIQO_CODE_MODAL_CONFIGURATION_REQUIRED", "executeModal", "getModalStatus"]);
markers("REGISTRATION", loaded.registration, ["MODAL_H100_ASYNC_V1", "modal_only_execution: true", "external_provider_fallback_allowed: false", "owned_only_required: true"]);
markers("PLANNER", loaded.planner, ["ServiceExecutionRuntime", "serviceRuntime.execute", "serviceRuntime.settle", "provider_job_id", "usage_id", "recoverStaleQueuedPlannerExecution"]);
markers("WORKER_SESSION", loaded.workerSession, ["MODAL_SCALE_TO_ZERO", "MODAL_SCALE_TO_ZERO_NO_PREWARM_REQUIRED", "worker_session_created: false"]);
markers("ZERO_IDLE", loaded.zeroIdle, ["MODAL_OWNS_SCALE_TO_ZERO_LIFECYCLE", "worker_mutation_performed: false"]);
markers("MISSION", loaded.mission, ["AVANTIQO_CODE_AI_MISSION_V1", "repair_required", "verification_required", "CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED"]);
markers("AUTONOMOUS", loaded.autonomous, ["executeCodeAIPlannerRequest", "executeCodeAIMission", "runOperatorWebResearch", "owned_orchestration: true"]);
markers("AUTONOMOUS_CAPABILITY", loaded.autonomousCapability, ["platform.code.ai.execute", "executeCodeAIEmployeeFastStartMission", "executeCodeAIEmployeeZeroIdleFastStartMission", "fresh-verification", "final-diff-review", "world-class-quality-gate", "persistCodeAIAutonomousExecutionState", "persistCodeAICommitArtifact", "operatorAutoExecute: true", "operatorRequiresConfirmation: false"]);
markers("COMMIT_CAPABILITY", loaded.commitCapability, ["platform.code.ai.commit", "operatorAutoExecute: false", "operatorRequiresConfirmation: true", "commitVerifiedCodeMission"]);
markers("PLATFORM", loaded.platform, ["createCodeAIAutonomousCapability", "createCodeAICommitCapability", "createOperatorWebResearchCapability"]);
markers("RESEARCH", loaded.research, ["Governed Knowledge & Web Research", "untrusted evidence", "source-backed"]);

for (const [label, sourceText] of Object.entries(loaded)) {
  if (forbiddenProviderControlPlane.test(sourceText)) {
    throw new Error(`${CONTRACT}_${label.toUpperCase()}_RETIRED_PROVIDER_CONTROL_PLANE_PRESENT`);
  }
}

if (!/async function recoverStaleQueuedPlannerExecution\(\)\s*\{[\s\S]*return null;[\s\S]*\}/.test(loaded.planner)) {
  throw new Error(`${CONTRACT}_PLANNER_PROVIDER_QUEUE_RECOVERY_MUST_BE_DISABLED`);
}

console.log(`${CONTRACT}=PASS`);
console.log("CODE_AI_EXECUTION_INFRASTRUCTURE=MODAL_H100_ASYNC_V1");
console.log("CODE_AI_PROVIDER_FALLBACK=NONE");
console.log("CODE_AI_PREWARM=MODAL_SCALE_TO_ZERO_NO_PREWARM_REQUIRED");
console.log("CODE_AI_COMMIT_GOVERNANCE=SEPARATE_CONFIRMATION_REQUIRED");

import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_AUTONOMY_LOCAL_NODE_AUDIT_V2";
const forbiddenExternalControlPlane = /api\.runpod|rest\.runpod|RUNPOD_API_KEY|RunpodCodeProvider|executeModal|getModalStatus|MODAL_H100_ASYNC/i;

const files = {
  worker: "scripts/local-node/avantiqo-node01-worker.ps1",
  provider: "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderV2.js",
  queue: "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js",
  registration: "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderRegistration.js",
  planner: "lib/code/runtime/CodeAIPlannerExecutionRuntime.js",
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

markers("WORKER", loaded.worker, ["ai.code.generate", "ai.code.edit", "ai.code.review", "code_text", "AVANTIQO_NODE01_WORKER_V6_MODEL_AWARE_CODE", "LOCAL_QWEN4B_GPU_STRONG_MUTATION_QWEN17B_INTERACTIVE_QWEN06B_DISCOVERY_CPU_FALLBACK", "$CodeCpuFallbackModel = 'qwen3:0.6b'", "$forceCpu = ($freeGpuMb -lt $codeGpuMinFreeMb)", "codeGpuMinFreeMb = 1800", "codeGpuMinFreeMb = 3000", "codeGpuMinFreeMb = 4300", "interactiveGpuWaitDeadline = $interactiveGpuWaitStarted.AddSeconds(10)", "$runtimeModel = $CodeCpuFallbackModel", "$body.options.num_gpu = 0", "AVANTIQO_CODE_OLLAMA_TIMEOUT", "$retryable = $false", "$ollamaTimeoutSeconds"]);
markers("PROVIDER", loaded.provider, ["AVANTIQO_CODE_LOCAL_NODE_UNAVAILABLE", "AvantiqoCodeLocalQueueProvider.execute", "AvantiqoCodeLocalQueueProvider.getStatus"]);
markers("QUEUE", loaded.queue, ["AVANTIQO_CODE_LOCAL_GOVERNED_CONTEXT_REQUIRED", "avantiqo_local_compute_jobs", "AVANTIQO_CODE_LOCAL_COMPLETED_RESULT_REQUIRED", "customer_charge_eligible:false"]);
markers("REGISTRATION", loaded.registration, ["AVANTIQO_LOCAL_NODE_V1", "local_only_execution: true", "modal_fallback_allowed: false", "external_provider_fallback_allowed: false", "owned_only_required: true"]);
markers("PLANNER", loaded.planner, ["ServiceExecutionRuntime", "serviceRuntime.execute", "serviceRuntime.settle", "provider_job_id", "usage_id", "recoverStaleQueuedPlannerExecution"]);
markers("MISSION", loaded.mission, ["AVANTIQO_CODE_AI_MISSION_V1", "repair_required", "verification_required", "CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED"]);
markers("AUTONOMOUS", loaded.autonomous, ["executeCodeAIPlannerRequest", "executeCodeAIMission", "runOperatorWebResearch", "owned_orchestration: true"]);
markers("AUTONOMOUS_CAPABILITY", loaded.autonomousCapability, ["platform.code.ai.execute", "executeCanonicalCodeAIEmployeeMission", "resolveCodeAIEmployeeExecutionTransport", "fresh-verification", "final-diff-review", "world-class-quality-gate", "operatorAutoExecute: true", "operatorRequiresConfirmation: false"]);
markers("COMMIT_CAPABILITY", loaded.commitCapability, ["platform.code.ai.commit", "operatorAutoExecute: false", "operatorRequiresConfirmation: true", "commitVerifiedCodeMission"]);
markers("PLATFORM", loaded.platform, ["createCodeAIAutonomousCapability", "createCodeAICommitCapability", "createOperatorWebResearchCapability"]);
markers("RESEARCH", loaded.research, ["Governed Knowledge & Web Research", "untrusted evidence", "source-backed"]);

for (const [label, sourceText] of Object.entries(loaded)) {
  if (forbiddenExternalControlPlane.test(sourceText)) {
    throw new Error(`${CONTRACT}_${label.toUpperCase()}_EXTERNAL_CODE_CONTROL_PLANE_PRESENT`);
  }
}

markers("PLANNER_STALE_LOCAL_RECOVERY", loaded.planner, [
  "MAX_STALE_LOCAL_QUEUE_RECOVERIES = 1",
  "STALE_LOCAL_INTERACTIVE_RECOVERY_MS = 105000",
  "STALE_LOCAL_STRONG_RECOVERY_MS = 170000",
  "if (finalStatusValue !== \"processing\") return null",
  "if (!providerJobId || !isCodeLocalJob(providerJobId)) return null",
  "const finalStatus = await transientPlannerPollRetry(() => fastLocalPlannerJobStatus(pending))",
  "serviceRuntime.cancelPending({",
  "CODE_AI_PLANNER_STALE_LOCAL_JOB_RECOVERY",
  "executionInputForRuntimeRecovery(executionInput, nextRecoveryCount)",
  "recovered_from_provider_job_id: providerJobId",
]);

console.log(`${CONTRACT}=PASS`);
console.log("CODE_AI_EXECUTION_INFRASTRUCTURE=AVANTIQO_LOCAL_NODE_V1");
console.log("CODE_AI_RUNTIME_MODEL=QWEN17B_GPU_WITH_QWEN06B_CPU_FALLBACK");
console.log("CODE_AI_NODE01_SCHEDULING=SAFE_GPU_HEADROOM_WITH_FAST_CPU_FALLBACK");
console.log("CODE_AI_PROVIDER_FALLBACK=NONE");
console.log("CODE_AI_EXTERNAL_CODE_CONTROL_PLANE=DISABLED");
console.log("CODE_AI_COMMIT_GOVERNANCE=SEPARATE_CONFIRMATION_REQUIRED");

import { readFile } from "node:fs/promises";

const files = {
  worker: "services/avantiqo-code-engine/handler.py",
  provider: "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderRegistration.js",
  workspace: "lib/code/runtime/CodeWorkspaceSandboxRuntime.js",
  mission: "lib/code/runtime/CodeAIMissionRuntime.js",
  capability: "lib/platform/capabilities/createCodeAIMissionCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  research: "lib/platform/capabilities/createOperatorWebResearchCapability.js",
  benchmark: "scripts/benchmark-avantiqo-code.mjs",
};

async function source(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`CODE_AI_AUDIT_FILE_MISSING:${path}:${error?.code || "READ_FAILED"}`);
  }
}

function requireMarkers(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker));
  if (missing.length) {
    throw new Error(`CODE_AI_AUDIT_${label}_MARKERS_MISSING:${missing.join(",")}`);
  }
}

const [worker, provider, workspace, mission, capability, platform, research, benchmark] =
  await Promise.all(Object.values(files).map(source));

requireMarkers("WORKER", worker, [
  "AVANTIQO_CODE_ENGINE_V1",
  "ai.code.generate",
  "ai.code.edit",
  "ai.code.refactor",
  "ai.code.review",
  "ai.code.debug",
  "raw_reasoning_persisted",
]);

requireMarkers("PROVIDER", provider, [
  "TARGET_CAPABILITIES",
  "AVANTIQO_CODE_CERTIFIED_CAPABILITIES",
  "target_capabilities",
  "certified_capabilities",
]);

requireMarkers("WORKSPACE", workspace, [
  "AVANTIQO_CODE_WORKSPACE_SANDBOX_V1",
  "Sandbox.create",
  '"clone", "--depth", "1"',
  "sandbox.readFileToBuffer",
  "sandbox.writeFiles",
  "CODE_AI_GIT_PUSH_REQUIRES_GOVERNED_COMMIT_RUNTIME",
  "CODE_AI_DEPLOYMENT_OR_DATABASE_TOOL_BLOCKED",
  '"bash",',
  '"sh",',
  '"diff", "--check"',
]);

requireMarkers("MISSION", mission, [
  "AVANTIQO_CODE_AI_MISSION_V1",
  "repair_required",
  "verification_required",
  "completed_operation_ids",
  "base_commit",
  "CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
  "resume_patch",
  "successfulVerification",
]);

requireMarkers("CAPABILITY", capability, [
  "platform.code.ai.execute",
  "operatorEnabled: true",
  "operatorAutoExecute: true",
  "operatorRequiresConfirmation: false",
  "CODE_AI_MISSION_RESUME_ORGANIZATION_MISMATCH",
  "executeCodeAIMission",
]);

requireMarkers("PLATFORM", platform, [
  "createCodeAIMissionCapability",
  "code_ai_mission",
  "createOperatorWebResearchCapability",
  "research",
]);

requireMarkers("SHARED_RESEARCH", research, [
  "Governed Web Research",
  "untrusted evidence",
  "source-backed",
  "operatorAutoExecute: true",
]);

requireMarkers("BENCHMARK", benchmark, [
  "sandbox_execution_certified:false",
  "broader_capability_suite_required:true",
]);

if (/git\s+push|vercel\s+deploy|supabase\s+db\s+push/.test(mission)) {
  throw new Error("CODE_AI_MISSION_MUST_NOT_EMBED_PRODUCTION_SIDE_EFFECT_COMMANDS");
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_AUTONOMY_SOURCE_AUDIT_V1",
  verified: {
    owned_code_worker: true,
    certified_capability_gate: true,
    isolated_repository_workspace: true,
    resumable_patch_state: true,
    base_commit_concurrency_guard: true,
    repair_state: true,
    post_change_verification_gate: true,
    organization_scoped_capability: true,
    shared_governed_research_available: true,
    production_side_effects_blocked_from_autonomous_workspace: true,
    live_sandbox_execution_certified: false,
  },
  note: "Source contract passed. Live Sandbox execution and broader coding benchmarks remain locked until an environment-backed certification run actually passes.",
}, null, 2));

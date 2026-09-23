import { loadCodeAICommitExecutionState } from "@/lib/code/runtime/CodeAICommitExecutionStateRuntime";
import {
  verifyExistingVercelDeployment,
  getVercelRollingRelease,
  approveVercelRollingReleaseStage,
  completeVercelRollingRelease,
} from "@/lib/platform/runtime/AvantiqoProductionReleaseRuntime";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.deploy.production";
const ACTIONS = new Set(["status", "advance", "complete"]);
function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

export function createCodeAIRollingReleaseCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_rolling_release",
    action: "execute",
    description: "Inspect or explicitly advance the Vercel rolling release for one exact Code production canary. Requires prior Code release certification and exact deployment/commit verification. It cannot configure project policy, mutate source, merge branches, or bypass production permissions.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: ["platform", "code-ai", "rolling-release", "production", "explicit-stage-approval", "exact-canary"],
    transactional: false,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: false,
    operatorRequiresConfirmation: true,
    contextScope: "organization",
    risk: "high",
    reversible: false,
    inputSchema: {
      type: "object",
      required: ["execution_key", "operation", "canary_deployment_id", "expected_commit_sha"],
      properties: {
        execution_key: { type: "string", minLength: 12, maxLength: 160 },
        operation: { type: "string", enum: ["status", "advance", "complete"] },
        canary_deployment_id: { type: "string", minLength: 1, maxLength: 300 },
        expected_commit_sha: { type: "string", pattern: "^[0-9a-fA-F]{40}$" },
        next_stage_index: { type: "integer", minimum: 0, maximum: 20 },
      },
      additionalProperties: false,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    const executionKey = text(payload.execution_key, 160);
    const operation = text(payload.operation, 80).toLowerCase();
    const canaryId = text(payload.canary_deployment_id, 300);
    const commitSha = text(payload.expected_commit_sha, 160);
    if (!executionKey || !ACTIONS.has(operation) || !canaryId || !/^[0-9a-f]{40}$/i.test(commitSha)) {
      throw new Error("CODE_AI_ROLLING_RELEASE_INPUT_INVALID");
    }
    const commitState = await loadCodeAICommitExecutionState({ context, executionKey });
    if (!commitState.found || !commitState.commit) throw new Error("CODE_AI_ROLLING_RELEASE_COMMIT_STATE_NOT_FOUND");
    const release = object(commitState.release);
    if (release.release_certified !== true) throw new Error("CODE_AI_ROLLING_RELEASE_RELEASE_CERTIFICATION_REQUIRED");
    if (text(commitState.commit.commit_sha, 160).toLowerCase() !== commitSha.toLowerCase()) {
      throw new Error("CODE_AI_ROLLING_RELEASE_COMMIT_STATE_MISMATCH");
    }
    if (text(release.certified_review_commit_sha, 160).toLowerCase() !== commitSha.toLowerCase()) {
      throw new Error("CODE_AI_ROLLING_RELEASE_CERTIFIED_COMMIT_MISMATCH");
    }

    const deployment = await verifyExistingVercelDeployment({
      deployment_id: canaryId,
      expected_commit_sha: commitSha,
      expected_target: "production",
    });
    if (deployment.ready !== true || deployment.exact_commit_verified !== true) {
      throw new Error("CODE_AI_ROLLING_RELEASE_EXACT_CANARY_REQUIRED");
    }
    const current = await getVercelRollingRelease();
    if (current.state !== "ACTIVE") throw new Error("CODE_AI_ROLLING_RELEASE_NOT_ACTIVE");
    if (current.canary_deployment_id !== canaryId) throw new Error("CODE_AI_ROLLING_RELEASE_CANARY_MISMATCH");

    if (operation === "status") {
      return { success: true, operation, commit_state: commitState.commit, release_certification: release, deployment, rolling_release: current, current_state: current, production_mutation_performed: false };
    }
    if (operation === "advance") {
      const nextStageIndex = Number(payload.next_stage_index);
      if (!Number.isInteger(nextStageIndex) || nextStageIndex < 0) throw new Error("CODE_AI_ROLLING_RELEASE_NEXT_STAGE_REQUIRED");
      const advanced = await approveVercelRollingReleaseStage({ canary_deployment_id: canaryId, next_stage_index: nextStageIndex });
      const nextState = await getVercelRollingRelease();
      return { success: true, operation, deployment, previous_state: current, rolling_release: advanced, current_state: nextState, production_mutation_performed: true };
    }
    const completed = await completeVercelRollingRelease({ canary_deployment_id: canaryId });
    const nextState = await getVercelRollingRelease();
    return { success: true, operation, deployment, previous_state: current, rolling_release: completed, current_state: nextState, production_mutation_performed: true };
  }

  return { manifest, authorize, execute };
}
export default createCodeAIRollingReleaseCapability;

import { createVerifiedCodeMissionPullRequest } from "@/lib/code/runtime/CodeGitHubCommitRuntime";
import {
  loadCodeAICommitArtifact,
  persistCodeAICommitArtifact,
} from "@/lib/code/runtime/CodeAICommitArtifactRuntime";
import { attestCodeMissionState } from "@/lib/code/runtime/CodeMissionAttestationRuntime";
import { assertCodeAIWorldClassCommitReady } from "@/lib/code/runtime/CodeAIWorldClassCommitGuard";
import { assertCodeAIEngineeringOSCommitReady } from "@/lib/code/runtime/CodeAIEngineeringOperatingSystemRuntime";
import { assertCodeAIEngineeringPrecisionReviewReady } from "@/lib/code/runtime/CodeAIEngineeringPrecisionOperatingSystemRuntime";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "platform.code.ai.commit";
function text(value, maximum = 12000) { return String(value ?? "").trim().slice(0, maximum); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

export function createCodeAIReviewPullRequestCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_review_pull_request",
    action: "execute",
    description: "Create a verified draft GitHub pull request from an attested Code mission. The review branch is created from the exact attested main HEAD; no merge, force update or production deployment is performed.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: ["platform", "code-ai", "github", "pull-request", "draft", "review", "verified", "no-auto-merge"],
    transactional: true,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: false,
    operatorRequiresConfirmation: true,
    contextScope: "organization",
    risk: "medium",
    reversible: true,
    inputSchema: {
      type: "object",
      required: ["execution_key", "title"],
      properties: {
        execution_key: { type: "string", minLength: 12, maxLength: 160 },
        title: { type: "string", minLength: 1, maxLength: 200 },
        body: { type: "string", maxLength: 12000 },
        branch_name: { type: "string", maxLength: 120 },
      },
      additionalProperties: false,
    },
  });
  function authorize({ context }) { return requireExecutionPermission(context, REQUIRED_PERMISSION); }
  async function execute({ context, payload = {} }) {
    const artifact = await loadCodeAICommitArtifact({ context, executionKey: text(payload.execution_key, 160) });
    if (!artifact.found || !artifact.mission_state) throw new Error("CODE_AI_REVIEW_ARTIFACT_NOT_FOUND");
    const state = object(artifact.mission_state);
    if (text(state.organization_id, 200) !== text(context?.organizationId, 200)) throw new Error("CODE_AI_REVIEW_ORGANIZATION_MISMATCH");
    assertCodeAIWorldClassCommitReady(state);
    assertCodeAIEngineeringOSCommitReady(state);
    assertCodeAIEngineeringPrecisionReviewReady(state);
    const review = await createVerifiedCodeMissionPullRequest({
      mission_state: state,
      title: payload.title,
      body: payload.body,
      branch_name: payload.branch_name,
    });
    const enrichedState = attestCodeMissionState({
      ...state,
      review_delivery: {
        contract: "AVANTIQO_CODE_REVIEW_DELIVERY_V1",
        review_branch: review.review_branch,
        commit_sha: review.commit_sha,
        pull_request_number: review.pull_request_number,
        pull_request_url: review.pull_request_url,
        draft: review.draft === true,
        merge_performed: false,
        verified: review.verified === true,
      },
    });
    await persistCodeAICommitArtifact({
      context,
      executionKey: text(payload.execution_key, 160),
      missionState: enrichedState,
    });
    return { ...review, review_delivery_persisted: true };
  }
  return { manifest, authorize, execute };
}
export default createCodeAIReviewPullRequestCapability;

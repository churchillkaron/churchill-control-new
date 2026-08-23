import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import {
  loadCodeAICommitExecutionState,
} from "@/lib/code/runtime/CodeAICommitExecutionStateRuntime";
import {
  loadCodeAICommitArtifact,
} from "@/lib/code/runtime/CodeAICommitArtifactRuntime";
import {
  recoverVerifiedCodeMissionCommit,
} from "@/lib/code/runtime/CodeGitHubCommitRuntime";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const EXECUTION_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$";

export function createCodeAICommitStatusCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_commit_status",
    action: "verify",
    name: "Verify Code AI Commit",
    document: "code_ai_commit_verification",
    description:
      "Verify a governed Code AI GitHub commit without ever replaying the write. This verifier is read-authority only: platform.code.ai.execute may inspect commit verification evidence, while platform.code.ai.commit remains required only by the separate write capability. The normal path reads the server-owned commit verification record. If that record is missing after a commit was actually attempted, the verifier may use the retained attested Code AI commit artifact only when its server-owned pre-write attempt marker is present, then perform bounded read-only recovery against recent history reachable from current main, requiring the exact base parent, exact changed-path set and exact resulting file contents. An unattempted artifact never triggers GitHub recovery. This read never commits, deploys, edits source, repairs database state, exposes patch contents, or changes authorization.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "code-ai",
      "github",
      "commit",
      "verification",
      "read-authority",
      "server-owned-evidence",
      "attempt-marker-required",
      "attested-recovery",
      "no-write-replay",
      "read",
    ],
    operatorAliases: [
      "verify code ai commit",
      "check code ai commit",
      "verify engineering commit",
      "check whether code ai committed",
    ],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    inputSchema: {
      type: "object",
      required: ["execution_key"],
      properties: {
        execution_key: {
          type: "string",
          minLength: 12,
          maxLength: 160,
          pattern: EXECUTION_KEY_PATTERN,
          description:
            "Exact opaque execution key used by the Code AI autonomous run and governed commit action.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        verified: { type: "boolean" },
        execution_key: { type: "string" },
        commit: { type: "object" },
        verification_source: { type: "string" },
        server_state_found: { type: "boolean" },
        updated_at: { type: ["string", "null"] },
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    const loaded = await loadCodeAICommitExecutionState({
      context,
      executionKey: payload.execution_key,
    });
    if (loaded.found && loaded.commit) {
      return {
        status: "VERIFIED_COMMITTED",
        verified: true,
        execution_key: payload.execution_key,
        commit: loaded.commit,
        verification_source: "SERVER_OWNED_COMMIT_EXECUTION_STATE",
        server_state_found: true,
        recovered_without_write_replay: false,
        updated_at: loaded.updated_at || null,
      };
    }

    const artifact = await loadCodeAICommitArtifact({
      context,
      executionKey: payload.execution_key,
    });
    if (!artifact.found || !artifact.mission_state) {
      throw new Error("CODE_AI_COMMIT_STATE_AND_RECOVERY_ARTIFACT_NOT_FOUND");
    }
    if (artifact.commit_attempted !== true) {
      throw new Error("CODE_AI_COMMIT_RECOVERY_ATTEMPT_EVIDENCE_REQUIRED");
    }

    const recovered = await recoverVerifiedCodeMissionCommit({
      mission_state: artifact.mission_state,
    });
    if (recovered.success !== true || recovered.verified !== true) {
      throw new Error("CODE_AI_COMMIT_RECOVERY_NOT_VERIFIED");
    }

    return {
      status: "VERIFIED_COMMITTED",
      verified: true,
      execution_key: payload.execution_key,
      commit: recovered,
      verification_source: "GITHUB_RECOVERY_FROM_ATTESTED_ARTIFACT",
      server_state_found: false,
      commit_attempt_evidence_found: true,
      commit_attempted_at: artifact.commit_attempted_at || null,
      recovered_without_write_replay: true,
      recovery_persisted_server_state: false,
      updated_at: null,
    };
  }

  return { manifest, authorize, execute };
}

export default createCodeAICommitStatusCapability;

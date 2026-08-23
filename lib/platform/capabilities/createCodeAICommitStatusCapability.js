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

const REQUIRED_PERMISSION = "platform.code.ai.commit";
const EXECUTION_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$";

export function createCodeAICommitStatusCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_commit_status",
    action: "verify",
    name: "Verify Code AI Commit",
    document: "code_ai_commit_verification",
    description:
      "Verify a governed Code AI GitHub commit without ever replaying the write. The normal path reads the server-owned commit verification record. If that record is missing after an already verified GitHub write, the verifier may use the retained attested Code AI commit artifact to perform a bounded read-only recovery against recent history reachable from current main, requiring the exact base parent, exact changed-path set and exact resulting file contents. This read never commits, deploys, edits source, repairs database state, or changes authorization.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "code-ai",
      "github",
      "commit",
      "verification",
      "server-owned-evidence",
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
      recovered_without_write_replay: true,
      recovery_persisted_server_state: false,
      updated_at: null,
    };
  }

  return { manifest, authorize, execute };
}

export default createCodeAICommitStatusCapability;

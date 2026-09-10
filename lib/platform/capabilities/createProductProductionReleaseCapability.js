import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { deployVerifiedMainCommit } from "@/lib/platform/runtime/AvantiqoProductionReleaseRuntime";

const COMMIT_PERMISSION = "platform.code.ai.commit";
const DEPLOY_PERMISSION = "platform.deploy.production";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

export function createProductProductionReleaseCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "product_production_release",
    action: "execute",
    name: "Release Verified Avantiqo Code to Production",
    document: "product_production_release",
    description:
      "Persist one completed and attested Avantiqo Code AI execution to exact GitHub main and deploy only that independently verified commit SHA to Vercel production. This internal release path cannot apply database migrations, change secrets, force-push, deploy a different ref, or release an unverified Code AI artifact.",
    permissions: [COMMIT_PERMISSION, DEPLOY_PERMISSION],
    events: [],
    tags: ["platform", "code-ai", "verified-release", "main-only", "production", "no-migrations", "no-secrets"],
    transactional: true,
    aiEnabled: true,
    operatorEnabled: false,
    operatorMode: "write",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "medium",
    reversible: true,
    inputSchema: {
      type: "object",
      required: ["execution_key", "commit_message"],
      properties: {
        execution_key: { type: "string", minLength: 12, maxLength: 160 },
        commit_message: { type: "string", minLength: 1, maxLength: 200 },
      },
      additionalProperties: false,
    },
  });

  function authorize({ context }) {
    requireExecutionPermission(context, COMMIT_PERMISSION);
    requireExecutionPermission(context, DEPLOY_PERMISSION);
    return true;
  }

  async function execute({ context, payload = {} }) {
    const executionKey = text(payload.execution_key, 160);
    const commitMessage = text(payload.commit_message, 200);
    if (!executionKey || !commitMessage) {
      throw new Error("PRODUCT_PRODUCTION_RELEASE_INPUT_REQUIRED");
    }

    const committed = await executeUbteCapability({
      organizationId: context.organizationId,
      domain: "platform",
      capability: "code_ai_commit",
      action: "execute",
      payload: { execution_key: executionKey, commit_message: commitMessage },
      actor: context.actor,
      runtime: {
        entityId: context.entityId,
        periodId: context.periodId,
        permissions: context.permissions,
        callerRequest: context.callerRequest,
        metadata: {
          ...(context.metadata || {}),
          source: "AVANTIQO_PRODUCT_PRODUCTION_RELEASE",
          verifiedAutomaticRelease: true,
          databaseMigrationExecutionAllowed: false,
          secretMutationAllowed: false,
        },
      },
    });
    const commitResult = committed?.result ?? committed;
    const commitSha = text(commitResult?.commit_sha, 160);
    if (commitResult?.verified !== true || !/^[0-9a-f]{40}$/i.test(commitSha)) {
      throw new Error("PRODUCT_PRODUCTION_RELEASE_VERIFIED_COMMIT_REQUIRED");
    }

    const deployment = await deployVerifiedMainCommit({ commit_sha: commitSha });
    return {
      success: true,
      execution_key: executionKey,
      commit: commitResult,
      deployment,
      commit_completed: true,
      production_deployed: deployment.production_deployed === true,
      deployment_pending: deployment.deployment_pending === true,
      database_migrations_applied: false,
      secrets_changed: false,
      governance: {
        exact_verified_commit_required: true,
        main_only: true,
        force_push_allowed: false,
        database_migrations_allowed: false,
        secret_mutation_allowed: false,
      },
    };
  }

  return { manifest, authorize, execute };
}

export default createProductProductionReleaseCapability;

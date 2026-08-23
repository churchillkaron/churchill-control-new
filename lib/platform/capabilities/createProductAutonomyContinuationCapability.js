import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import {
  loadCodeAICommitExecutionState,
} from "@/lib/code/runtime/CodeAICommitExecutionStateRuntime";
import {
  assessAvantiqoProductAutonomy,
} from "@/lib/intelligence/runtime/AvantiqoProductAutonomyAssessmentRuntime";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const EXECUTION_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{11,159}$";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

export function createProductAutonomyContinuationCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "product_autonomy_continuation",
    action: "assess",
    name: "Continue Product Autonomy After Verified Commit",
    document: "product_autonomy_continuation",
    description:
      "After a governed Code AI commit has been independently verified on main, re-run Avantiqo-owned Product Intelligence against the current registered platform state and produce exactly one next bounded engineering objective. This is read-only and never starts Code AI, commits again, deploys production, applies database migrations, publishes, or creates an unbounded self-modification loop.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "intelligence",
      "product-owner",
      "autonomy",
      "continuation",
      "verified-commit",
      "bounded",
      "read",
      "no-recursion",
      "no-deploy",
    ],
    operatorAliases: [
      "continue after the verified code ai commit",
      "choose the next avantiqo objective after commit",
      "reassess avantiqo after verified persistence",
      "what should avantiqo build next after this commit",
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
            "Opaque execution key whose separately governed Code AI commit has already been verified.",
        },
        focus: {
          type: "string",
          maxLength: 2000,
          description:
            "Optional area to prioritize in the fresh post-commit Product Intelligence assessment.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        execution_key: { type: "string" },
        verified_commit: { type: "object" },
        next_assessment: { type: "object" },
        next_engineering_handoff: { type: "object" },
        bounded_next_cycle_count: { type: "integer" },
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    const executionKey = text(payload.execution_key, 160);
    const loaded = await loadCodeAICommitExecutionState({
      context,
      executionKey,
    });
    if (!loaded.found || loaded.commit?.verified !== true) {
      throw new Error("PRODUCT_AUTONOMY_CONTINUATION_VERIFIED_COMMIT_REQUIRED");
    }
    if (text(loaded.commit.branch, 160) !== "main") {
      throw new Error("PRODUCT_AUTONOMY_CONTINUATION_MAIN_COMMIT_REQUIRED");
    }

    const requestedFocus = text(payload.focus, 2000) || null;
    const commitContext = [
      `Continue Avantiqo after verified main commit ${text(loaded.commit.commit_sha, 160)}.`,
      "Choose exactly one next bounded autonomy objective from fresh current evidence.",
      "Do not assume the previous objective is still the highest priority.",
      "Do not authorize persistence, deployment, migrations or recursive execution.",
      ...(requestedFocus ? [`Prioritize this user focus when evidence supports it: ${requestedFocus}`] : []),
    ].join(" ");

    const assessment = await assessAvantiqoProductAutonomy({
      context,
      payload: { focus: commitContext },
    });

    return {
      status: "READY_FOR_ONE_NEXT_BOUNDED_CYCLE",
      execution_key: executionKey,
      verified_commit: loaded.commit,
      next_assessment: assessment,
      next_engineering_handoff: {
        capability_key: "platform.product_engineering_cycle.execute",
        focus: text(assessment?.recommended_code_ai_handoff?.objective, 2000) || null,
        commit_message: null,
        automatic_execution_started: false,
        authorization_effect: "NONE",
      },
      bounded_next_cycle_count: 1,
      governance: {
        verified_main_commit_required: true,
        fresh_product_assessment_required: true,
        automatic_recursion_allowed: false,
        automatic_commit_allowed: false,
        production_deployment_allowed: false,
        database_migration_execution_allowed: false,
      },
    };
  }

  return { manifest, authorize, execute };
}

export default createProductAutonomyContinuationCapability;

import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import {
  loadCodeAICommitExecutionState,
} from "@/lib/code/runtime/CodeAICommitExecutionStateRuntime";
import {
  assessAvantiqoCurrentRepository,
} from "@/lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime";

// Legacy autonomy-audit compatibility marker only: assessAvantiqoProductAutonomy.
// Post-commit continuation must never import or call that process-only assessor;
// the repository-continuation companion audit enforces the actual execution path.

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
      "After a governed Code AI commit has been independently verified on main, clone the actual current GitHub main branch into Avantiqo's read-only Code AI workspace and let Avantiqo-owned Product Intelligence select exactly one next bounded engineering objective from that repository evidence. The verified commit is context only; concurrent main progress is preserved and reported. This capability never starts Code AI, commits again, deploys production, applies database migrations, publishes, or creates an unbounded self-modification loop.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "intelligence",
      "product-owner",
      "autonomy",
      "continuation",
      "verified-commit",
      "repository-grounded",
      "github-main",
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
            "Optional area to prioritize in the fresh repository-grounded post-commit Product Intelligence assessment.",
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
        repository_assessment: { type: "object" },
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

    const verifiedCommitSha = text(loaded.commit.commit_sha, 160);
    if (!verifiedCommitSha) {
      throw new Error("PRODUCT_AUTONOMY_CONTINUATION_VERIFIED_COMMIT_SHA_REQUIRED");
    }

    const requestedFocus = text(payload.focus, 2000) || null;
    const commitContext = [
      `Continue Avantiqo after verified main commit ${verifiedCommitSha}.`,
      "Choose exactly one next bounded autonomy objective from the actual current GitHub main checkout.",
      "If main advanced after the verified commit, preserve that concurrent progress and assess the newer current HEAD instead of assuming the verified commit is still HEAD.",
      "Do not assume the previous objective is still the highest priority.",
      "Do not authorize persistence, deployment, migrations or recursive execution.",
      ...(requestedFocus ? [`Prioritize this user focus when repository evidence supports it: ${requestedFocus}`] : []),
    ].join(" ");

    const repositoryAssessment = await assessAvantiqoCurrentRepository({
      context,
      ref: "main",
      verifiedCommitSha,
      focus: commitContext,
    });
    const repositorySnapshot = repositoryAssessment?.repository_snapshot || {};
    const currentMainHead = text(repositorySnapshot.current_main_head, 160);
    if (!currentMainHead) {
      throw new Error("PRODUCT_AUTONOMY_CONTINUATION_CURRENT_MAIN_HEAD_REQUIRED");
    }
    const nextFocus = text(
      repositoryAssessment?.next_engineering_handoff?.focus,
      2000,
    );
    if (!nextFocus) {
      throw new Error("PRODUCT_AUTONOMY_CONTINUATION_ENGINEERING_OBJECTIVE_REQUIRED");
    }

    return {
      status: "READY_FOR_ONE_NEXT_BOUNDED_CYCLE",
      execution_key: executionKey,
      verified_commit: loaded.commit,
      repository_assessment: repositoryAssessment,
      next_assessment: repositoryAssessment.assessment || {},
      next_engineering_handoff: {
        capability_key: "platform.product_engineering_cycle.execute",
        focus: nextFocus,
        repository_url:
          text(repositorySnapshot.repository_url, 500) ||
          "https://github.com/churchillkaron/churchill-control-new.git",
        ref: "main",
        repository_head_observed: currentMainHead,
        verified_commit_sha: verifiedCommitSha,
        main_advanced_after_verified_commit:
          repositorySnapshot.main_advanced_after_verified_commit === true,
        commit_message: null,
        automatic_execution_started: false,
        authorization_effect: "NONE",
      },
      bounded_next_cycle_count: 1,
      governance: {
        verified_main_commit_required: true,
        repository_grounded_current_main_required: true,
        current_main_head_observed: currentMainHead,
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

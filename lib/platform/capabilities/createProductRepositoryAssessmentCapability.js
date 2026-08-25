import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import {
  assessAvantiqoCurrentRepository,
} from "@/lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const DEFAULT_REPOSITORY =
  "https://github.com/churchillkaron/churchill-control-new.git";
const OBJECTIVE_REQUIRED_ERROR =
  "PRODUCT_REPOSITORY_ASSESSMENT_EVIDENCE_BACKED_OBJECTIVE_REQUIRED";
const OBJECTIVE_REPAIR_CONTRACT =
  "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_OBJECTIVE_REPAIR_V1";
const MAX_OBJECTIVE_REPAIR_ATTEMPTS = 1;

function text(value, limit = 2000) {
  return String(value ?? "").trim().slice(0, limit);
}

function objectiveRepairFocus(focus) {
  const repairInstruction = [
    "OBJECTIVE CANDIDATE REPAIR REQUIRED.",
    "The previous read-only assessment produced no server-eligible evidence-backed engineering objective.",
    "On this fresh reassessment, every objective candidate must cite at least one evidence_paths value copied exactly from a successfully read repository_snapshot.evidence_files[].file_path or repository_snapshot.dynamic_evidence_expansion.files[].file_path.",
    "Do not cite paths absent from the supplied snapshot.",
    "Every candidate must contain one to six concrete evidence-verifiable completion_criteria.",
    "Keep each objective bounded, require Code AI to re-inspect newest main before edits, and do not authorize commit, deploy, migration, publication, secret access, destructive action, or recursive execution.",
    `Repair contract: ${OBJECTIVE_REPAIR_CONTRACT}.`,
  ].join(" ");
  const original = text(focus, 700);
  return text(
    original ? `${original}\n\n${repairInstruction}` : repairInstruction,
    2000,
  );
}

function repairEvidence({ attempted, succeeded, trigger = null }) {
  return {
    contract: OBJECTIVE_REPAIR_CONTRACT,
    attempted,
    succeeded,
    trigger,
    maximum_attempts: MAX_OBJECTIVE_REPAIR_ATTEMPTS,
    fresh_main_reassessment: attempted,
    read_only: true,
    authorization_effect: "NONE",
  };
}

export function createProductRepositoryAssessmentCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "product_repository_assessment",
    action: "read",
    name: "Assess Actual Avantiqo Main Repository",
    document: "product_repository_assessment",
    description:
      "Clone the actual GitHub main branch into Avantiqo's read-only Code AI workspace, capture bounded current source evidence including the real HEAD, and let Avantiqo-owned Product Intelligence select one next bounded engineering objective from that repository evidence. This capability never edits source, commits, deploys, applies migrations, publishes, or starts the next engineering cycle.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "intelligence",
      "product-owner",
      "repository-evidence",
      "github-main",
      "read-only",
      "bounded",
      "no-deploy",
    ],
    operatorAliases: [
      "assess actual avantiqo main",
      "inspect current github main for the next product objective",
      "ground the next avantiqo objective in repository evidence",
      "reassess current main after a commit",
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
      properties: {
        repository_url: {
          type: "string",
          maxLength: 500,
          default: DEFAULT_REPOSITORY,
        },
        verified_commit_sha: {
          type: "string",
          maxLength: 160,
          description:
            "Optional verified commit that preceded this fresh main reassessment. It is evidence context only and has no authorization effect.",
        },
        focus: {
          type: "string",
          maxLength: 2000,
        },
        timeout_ms: {
          type: "integer",
          minimum: 30000,
          maximum: 1200000,
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        repository_snapshot: { type: "object" },
        assessment: { type: "object" },
        next_engineering_handoff: { type: "object" },
        objective_candidate_repair: { type: "object" },
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    const assessmentInput = {
      context,
      repositoryUrl: payload.repository_url || DEFAULT_REPOSITORY,
      ref: "main",
      verifiedCommitSha: payload.verified_commit_sha || null,
      focus: payload.focus || null,
      timeoutMs: payload.timeout_ms || null,
    };

    try {
      const result = await assessAvantiqoCurrentRepository(assessmentInput);
      return {
        ...result,
        objective_candidate_repair: repairEvidence({
          attempted: false,
          succeeded: false,
        }),
      };
    } catch (error) {
      const reason = text(error?.message, 500);
      if (reason !== OBJECTIVE_REQUIRED_ERROR) throw error;

      const repaired = await assessAvantiqoCurrentRepository({
        ...assessmentInput,
        focus: objectiveRepairFocus(assessmentInput.focus),
      });
      return {
        ...repaired,
        objective_candidate_repair: repairEvidence({
          attempted: true,
          succeeded: true,
          trigger: OBJECTIVE_REQUIRED_ERROR,
        }),
      };
    }
  }

  return { manifest, authorize, execute };
}

export default createProductRepositoryAssessmentCapability;

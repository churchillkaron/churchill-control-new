import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import {
  assessAvantiqoCurrentRepository,
} from "@/lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const DEFAULT_REPOSITORY =
  "https://github.com/churchillkaron/churchill-control-new.git";

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
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    return assessAvantiqoCurrentRepository({
      context,
      repositoryUrl: payload.repository_url || DEFAULT_REPOSITORY,
      ref: "main",
      verifiedCommitSha: payload.verified_commit_sha || null,
      focus: payload.focus || null,
      timeoutMs: payload.timeout_ms || null,
    });
  }

  return { manifest, authorize, execute };
}

export default createProductRepositoryAssessmentCapability;

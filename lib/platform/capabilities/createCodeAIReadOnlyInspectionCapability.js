import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { runCodeAIReadOnlyInspection } from "@/lib/code/runtime/CodeAIReadOnlyInspectionRuntime";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const DEFAULT_REPOSITORY = "https://github.com/churchillkaron/churchill-control-new.git";

export function createCodeAIReadOnlyInspectionCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "code_ai_readonly_inspection",
    action: "read",
    name: "Inspect Code Read Only",
    document: "code_ai_readonly_inspection",
    description: "Inspect actual current repository source for a named UI, domain or code surface. Searches and reads current main, runs bounded safe verification tests, and returns evidence-backed completion gaps without editing, committing, deploying, migrating or mutating business state.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: ["platform", "code-ai", "repository", "inspection", "read-only", "ui-audit", "verification"],
    operatorAliases: [
      "check the ui",
      "inspect the ui",
      "review the code",
      "check if the ui is finished",
      "tell me what needs fixing in the ui",
      "audit the current code",
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
      required: ["message"],
      properties: {
        message: { type: "string", minLength: 1, maxLength: 4000 },
        repository_url: { type: "string", maxLength: 500, default: DEFAULT_REPOSITORY },
        ref: { type: "string", maxLength: 160, default: "main" },
        workspace_target: { type: "string", enum: ["SANDBOX", "LOCAL_COMPUTER"] },
        timeout_ms: { type: "integer", minimum: 30000, maximum: 300000 },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    return runCodeAIReadOnlyInspection({
      context,
      message: payload.message,
      repository_url: payload.repository_url || DEFAULT_REPOSITORY,
      ref: payload.ref || "main",
      workspace_target: payload.workspace_target || null,
      timeout_ms: payload.timeout_ms || 120000,
    });
  }

  return { manifest, authorize, execute };
}

export default createCodeAIReadOnlyInspectionCapability;

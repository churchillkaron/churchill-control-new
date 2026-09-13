import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { readIntelligenceMemoryObservability } from "@/lib/operator/runtime/IntelligenceMemoryObservabilityRuntime";

function text(value, limit = 120) {
  return String(value ?? "").trim().slice(0, limit);
}

export function createIntelligenceMemoryObservabilityCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "intelligence_memory_observability",
    action: "read",
    name: "Intelligence Memory Observability",
    document: "intelligence_memory_observability",
    description: "Read organization-scoped Intelligence memory health without returning raw memory content. Reports active/archive totals and HOT/WARM/COLD distribution for ordinary operator memory. Read-only and does not alter memory, billing, pricing, subscription, or authorization.",
    permissions: [],
    events: [],
    tags: ["platform", "intelligence", "memory", "context", "observability", "read"],
    operatorAliases: ["show intelligence memory", "show AI memory", "show memory health", "how much memory are we carrying", "show context memory health"],
    operatorExamples: ["Show our Intelligence memory health.", "How much active versus archived memory are we carrying?"],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object", additionalProperties: true },
  });
  function authorize({ context }) {
    return Boolean(text(context?.organizationId));
  }

  async function execute({ context }) {
    return readIntelligenceMemoryObservability({ organizationId: context.organizationId });
  }

  return { manifest, authorize, execute };
}

export default createIntelligenceMemoryObservabilityCapability;

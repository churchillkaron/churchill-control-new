import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { scanOperatorAttention } from "@/lib/operator/runtime/OperatorAttentionRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export function createOperatorAttentionCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "attention",
    action: "scan",
    name: "Attention Scan",
    document: "attention_brief",
    description:
      "Build a proactive organization attention brief from live registered read capabilities, organization context, and evidence-backed synthesis. This capability is read-only: it may recommend registered actions but never executes, stages, confirms, approves, publishes, messages, pays, or mutates business state.",
    permissions: [],
    events: [],
    tags: [
      "platform",
      "operator",
      "attention",
      "anticipatory",
      "evidence",
      "read",
      "recommendation",
    ],
    operatorAliases: [
      "what needs attention",
      "what should I look at",
      "what deserves attention",
      "what should I know",
      "executive attention brief",
    ],
    operatorExamples: [
      "What needs my attention?",
      "Give me the important things I should know right now.",
      "What should I focus on next?",
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
        force_refresh: {
          type: "boolean",
          description:
            "Bypass the short attention cache and collect a fresh evidence brief.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        summary: { type: "string" },
        items: {
          type: "array",
          items: { type: "object" },
        },
        evidence: { type: "object" },
        planning: { type: "object" },
        synthesis: { type: "object" },
        generated_at: { type: "string" },
        cache_hit: { type: "boolean" },
        latency_ms: { type: "number" },
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    return Boolean(
      text(context?.organizationId) &&
      text(context?.metadata?.partyId),
    );
  }

  async function execute({ context, payload = {} }) {
    return scanOperatorAttention({
      context,
      forceRefresh: payload.force_refresh === true,
    });
  }

  return { manifest, authorize, execute };
}

export default createOperatorAttentionCapability;

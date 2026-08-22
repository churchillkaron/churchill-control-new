import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { scanOperatorAttention } from "@/lib/operator/runtime/OperatorAnticipatoryRuntime";

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
      "analysis",
      "assessment",
      "organization",
      "priorities",
      "risk",
      "opportunity",
      "executive",
    ],
    operatorAliases: [
      "what needs attention",
      "what needs my attention",
      "what needs my attention in the business",
      "what should I look at",
      "what deserves attention",
      "what should I know",
      "what should I focus on in the business",
      "what should management focus on",
      "what should the owner focus on",
      "what would you focus on as the owner",
      "give me the business priorities",
      "show me the business priorities",
      "what are the biggest business priorities",
      "tell me the top priorities from live data",
      "what are the biggest risks in the business",
      "where are the biggest risks in the business",
      "what are the biggest opportunities in the business",
      "where are the biggest opportunities in the business",
      "find problems and opportunities in the business",
      "analyze the business",
      "analyze this business",
      "analyse the business",
      "analyse this business",
      "analyze the company",
      "analyze this company",
      "analyse the company",
      "analyse this company",
      "analyze the organization",
      "analyze this organization",
      "analyse the organization",
      "analyse this organization",
      "review the business",
      "review the company",
      "review the organization",
      "check everything",
      "review everything",
      "check the whole business",
      "full business analysis",
      "company analysis",
      "organization analysis",
      "tell me what you think about the business",
      "give me your assessment of the business",
      "give me an executive business brief",
      "give me a management brief",
      "executive attention brief",
    ],
    operatorExamples: [
      "What needs my attention?",
      "Give me the important things I should know right now.",
      "What should I focus on in the business right now?",
      "Give me the top business priorities from the live data.",
      "Where are the biggest risks and opportunities in the business?",
      "What would you focus on if you were running this business with me?",
      "Analyze this business and tell me what you think.",
      "Check everything and tell me what matters most.",
      "Give me a full organization assessment from the live business data.",
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
        latency: { type: "object" },
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

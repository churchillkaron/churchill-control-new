import {
  AvantiqoIntelligenceReasoningRuntime,
} from "./AvantiqoIntelligenceReasoningRuntime";
import {
  ROIIntelligenceRuntime,
} from "./ROIIntelligenceRuntime";
import {
  BusinessIntelligenceRuntime,
} from "./BusinessIntelligenceRuntime";

const CONTRACT = "AVANTIQO_BUSINESS_INTELLIGENCE_AGENT_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function buildReadOnlyTools(organization_id) {
  return [
    {
      name: "business_roi_read",
      description:
        "Read organization-scoped attribution, customer and revenue totals grouped by provider/channel. Use this before making claims about channel ROI or conversion.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      mutates: false,
      approval_required: false,
      async execute() {
        return {
          organization_id,
          channels: await ROIIntelligenceRuntime.organization(organization_id),
        };
      },
    },
    {
      name: "business_channel_analysis_read",
      description:
        "Read organization-scoped channel analysis and deterministic recommendations derived from current attribution data.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      mutates: false,
      approval_required: false,
      async execute() {
        return BusinessIntelligenceRuntime.analyzeOrganization(organization_id);
      },
    },
  ];
}

export async function runBusinessIntelligenceAgent({
  organization_id,
  question,
  messages = [],
  context = {},
  metadata = {},
  max_turns = 8,
  max_tool_calls = 12,
} = {}) {
  const organizationId = text(organization_id);
  if (!organizationId) {
    throw new Error("AVANTIQO_BUSINESS_INTELLIGENCE_ORGANIZATION_REQUIRED");
  }

  const normalizedMessages = Array.isArray(messages)
    ? messages.filter((message) => message && typeof message === "object")
    : [];
  if (text(question)) {
    normalizedMessages.push({ role: "user", content: text(question) });
  }
  if (!normalizedMessages.length) {
    throw new Error("AVANTIQO_BUSINESS_INTELLIGENCE_QUESTION_REQUIRED");
  }

  return AvantiqoIntelligenceReasoningRuntime.run({
    organization_id: organizationId,
    system: [
      "You are Avantiqo Business Intelligence, a thinking business partner.",
      "Use tools for factual organization claims. Never invent revenue, customer, attribution or conversion numbers.",
      "Distinguish observed facts from interpretation and recommendations.",
      "When data is insufficient, say exactly what is missing.",
      "Read-only tools may be used autonomously. Do not claim that any business mutation was executed.",
      `Additional governed context: ${JSON.stringify(object(context))}`,
    ].join("\n"),
    messages: normalizedMessages,
    tools: buildReadOnlyTools(organizationId),
    authorization: {
      allow_mutating_tools: false,
    },
    metadata: {
      ...object(metadata),
      module: "INTELLIGENCE",
      operation: "BUSINESS_INTELLIGENCE_AGENT",
      business_intelligence_contract: CONTRACT,
    },
    max_turns,
    max_tool_calls,
  });
}

export const BusinessIntelligenceAgentRuntime = Object.freeze({
  contract: CONTRACT,
  run: runBusinessIntelligenceAgent,
});

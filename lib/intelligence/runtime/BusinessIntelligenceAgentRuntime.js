import {
  AvantiqoIntelligenceSupervisorRuntime,
} from "./AvantiqoIntelligenceSupervisorRuntime";
import {
  ROIIntelligenceRuntime,
} from "./ROIIntelligenceRuntime";
import {
  BusinessIntelligenceRuntime,
} from "./BusinessIntelligenceRuntime";

const CONTRACT = "AVANTIQO_BUSINESS_INTELLIGENCE_AGENT_V2";

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
  party_id = null,
  entity_id = null,
  question,
  messages = [],
  context = {},
  memories = [],
  metadata = {},
  mode = "deep",
} = {}) {
  const organizationId = text(organization_id);
  if (!organizationId) {
    throw new Error("AVANTIQO_BUSINESS_INTELLIGENCE_ORGANIZATION_REQUIRED");
  }
  if (!text(question)) {
    throw new Error("AVANTIQO_BUSINESS_INTELLIGENCE_QUESTION_REQUIRED");
  }

  return AvantiqoIntelligenceSupervisorRuntime.run({
    organization_id: organizationId,
    party_id,
    entity_id,
    goal: text(question),
    messages,
    context: {
      ...object(context),
      domain: "business_intelligence",
      mutation_policy: "read_only",
    },
    memories,
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
    mode,
  });
}

export const BusinessIntelligenceAgentRuntime = Object.freeze({
  contract: CONTRACT,
  run: runBusinessIntelligenceAgent,
});

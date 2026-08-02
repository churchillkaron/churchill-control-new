import { executeProvider } from "@/lib/platform/service-runtime/providers/ProviderExecutor";
import { campaignPlannerChannelContext, normalizeUniversalCampaignPlan } from "@/lib/marketing/campaigns/UniversalCampaignPlan";

function required(value, label) {
  if (value === undefined || value === null || value === "") throw new Error(`${label} is required`);
  return value;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function plannerModel() {
  return process.env.AVANTIQO_CAMPAIGN_PLANNER_MODEL || process.env.OPENAI_TEXT_MODEL || null;
}

function planningPrompt({ organization, request, connectedChannels, assets, readiness }) {
  return [
    "You are Avantiqo's autonomous campaign strategist.",
    "Create one complete, executable, industry-neutral campaign plan.",
    "Do not invent organization facts, channels, locations, budgets, currencies, audiences or provider readiness.",
    "Only select channels that are explicitly available in CONNECTED_CHANNELS.",
    "Use precise geographic targeting: country, region, city, district, postal area or map-radius as appropriate.",
    "Separate paid acquisition, owned follow-up, organic publishing, commerce and offline activities.",
    "Return only a valid UNIVERSAL_CAMPAIGN_PLAN_V1 JSON object.",
    "Include rationale, assumptions, warnings and confidence.",
    "Owner approval must remain required and false.",
    `CHANNEL_CATALOG=${JSON.stringify(campaignPlannerChannelContext())}`,
    `CHANNEL_READINESS=${JSON.stringify(readiness || {})}`,
    `CONNECTED_CHANNELS=${JSON.stringify(connectedChannels || [])}`,
    `ORGANIZATION_FACTS=${JSON.stringify(object(organization))}`,
    `AVAILABLE_ASSETS=${JSON.stringify(assets || [])}`,
    `CAMPAIGN_REQUEST=${JSON.stringify(object(request))}`,
  ].join("\n\n");
}

export const AICampaignPlannerRuntime = {
  async plan({ organizationId, organization = {}, request = {}, connectedChannels = [], assets = [], readiness = {} }) {
    required(organizationId, "Organization id");
    const model = required(plannerModel(), "Campaign planner model configuration");
    if (!connectedChannels.length) throw new Error("No executable connected marketing channel is available");

    const result = await executeProvider({
      provider: "openai",
      capability: "ai.reasoning.execute",
      model,
      input: {
        prompt: planningPrompt({ organization, request, connectedChannels, assets, readiness }),
        max_output_tokens: 7000,
        response_format: { type: "json_object" },
        request_metadata: { contract: "UNIVERSAL_CAMPAIGN_PLAN_V1", organization_id: organizationId },
      },
      context: { organization_id: organizationId },
    });

    const candidate = result?.output && typeof result.output === "object" ? result.output : null;
    if (!candidate) throw new Error("AI campaign planner did not return a structured plan");

    return normalizeUniversalCampaignPlan({
      ...candidate,
      organization_id: organizationId,
      ai: { ...(candidate.ai || {}), generated: true },
      approval: { ...(candidate.approval || {}), required: true, approved: false, approved_by: null, approved_at: null },
    });
  },
};

export default AICampaignPlannerRuntime;

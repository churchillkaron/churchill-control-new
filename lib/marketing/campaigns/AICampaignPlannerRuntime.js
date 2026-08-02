import {
  executeProvider,
} from "@/lib/platform/service-runtime/providers/ProviderExecutor";

import {
  campaignPlannerChannelContext,
  normalizeUniversalCampaignPlan,
} from "@/lib/marketing/campaigns/UniversalCampaignPlan";

function required(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${label} is required`);
  }
  return value;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function plannerModel() {
  return (
    process.env.AVANTIQO_CAMPAIGN_PLANNER_MODEL ||
    process.env.OPENAI_TEXT_MODEL ||
    null
  );
}

function planningPrompt({ organization, request, connectedChannels, assets }) {
  return [
    "You are Avantiqo's autonomous campaign strategist.",
    "Create one complete, executable, industry-neutral campaign plan.",
    "Do not assume any industry, venue, product, country, currency, location, audience or channel that is not supported by the provided organization facts.",
    "Use precise geographic targeting. Prefer cities, districts, postal areas or map-radius targets over an entire country when the business serves a local area.",
    "Only select channels whose runtime_status is ACTIVE or ACTIVE_IF_CONFIGURED and which are present in connected_channels.",
    "Use paid media, owned messaging, email and organic publishing only when appropriate for the requested goal.",
    "Separate paid acquisition from follow-up messaging. WhatsApp click-to-message acquisition belongs to Meta; WhatsApp templates and follow-up belong to the owned WhatsApp channel.",
    "Return a valid UNIVERSAL_CAMPAIGN_PLAN_V1 JSON object with no markdown.",
    "The plan must include rationale, assumptions, warnings and confidence.",
    `AVAILABLE_CHANNEL_CATALOG=${JSON.stringify(campaignPlannerChannelContext())}`,
    `CONNECTED_CHANNELS=${JSON.stringify(connectedChannels || [])}`,
    `ORGANIZATION_FACTS=${JSON.stringify(object(organization))}`,
    `AVAILABLE_ASSETS=${JSON.stringify(assets || [])}`,
    `CAMPAIGN_REQUEST=${JSON.stringify(object(request))}`,
  ].join("\n\n");
}

export const AICampaignPlannerRuntime = {
  async plan({
    organizationId,
    organization = {},
    request = {},
    connectedChannels = [],
    assets = [],
  }) {
    required(organizationId, "Organization id");
    const model = required(plannerModel(), "Campaign planner model configuration");

    const result = await executeProvider({
      provider: "openai",
      capability: "ai.reasoning.execute",
      model,
      input: {
        prompt: planningPrompt({
          organization,
          request,
          connectedChannels,
          assets,
        }),
        max_output_tokens: 7000,
        response_format: {
          type: "json_object",
        },
        request_metadata: {
          contract: "UNIVERSAL_CAMPAIGN_PLAN_V1",
          organization_id: organizationId,
        },
      },
      context: {
        organization_id: organizationId,
      },
    });

    const candidate =
      result?.output && typeof result.output === "object"
        ? result.output
        : null;
    if (!candidate) {
      throw new Error("AI campaign planner did not return a structured plan");
    }

    return normalizeUniversalCampaignPlan({
      ...candidate,
      organization_id: organizationId,
      ai: {
        ...(candidate.ai || {}),
        generated: true,
      },
      approval: {
        ...(candidate.approval || {}),
        required: true,
        approved: false,
      },
    });
  },
};

export default AICampaignPlannerRuntime;

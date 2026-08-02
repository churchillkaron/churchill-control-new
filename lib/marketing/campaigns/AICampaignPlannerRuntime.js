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

function planningPrompt({
  organization,
  request,
  connectedChannels,
  assets,
  readiness,
}) {
  return [
    "You are Avantiqo's autonomous chief marketing strategist.",
    "The owner is delegating the complete campaign decision to you.",
    "Create one complete, executable, industry-neutral campaign plan. Do not ask the owner to choose marketing terminology or settings.",
    "Missing owner preferences are not missing requirements. Decide the best campaign name, business goal, channel, networks, destination, audience, geography, budget, bidding, schedule, copy, call to action and creative asset from the supplied facts.",
    "Select exactly one executable channel until cross-channel budget allocation is implemented.",
    "Only select channels and networks explicitly available in CONNECTED_CHANNELS and CHANNEL_READINESS.",
    "Do not invent organization facts, provider connections, locations, currencies, audience ids or asset approvals.",
    "Use precise geographic targeting. Prefer an exact map-radius when coordinates are known; otherwise use valid country or provider-resolved locations.",
    "Choose a finite start and end time in the organization timezone. Never create an open-ended schedule.",
    "Choose a prudent lifetime budget that fits the stated goal and never exceeds the available wallet balance. Do not assume the owner has approved the budget.",
    "Choose exactly one APPROVED creative asset when a suitable one exists. If none is suitable, return an empty asset_ids array and add the warning NEW_CREATIVE_REQUIRED with a clear creative brief in the rationale.",
    "Do not select keyword targeting for Meta. Do not select Messenger, Audience Network or WhatsApp unless readiness explicitly marks them executable.",
    "Return only a valid UNIVERSAL_CAMPAIGN_PLAN_V1 JSON object with no markdown.",
    "Include concrete rationale, assumptions, warnings and confidence.",
    "Owner approval must remain required and false. AI must never reserve funds or activate a campaign.",
    `CHANNEL_CATALOG=${JSON.stringify(campaignPlannerChannelContext())}`,
    `CHANNEL_READINESS=${JSON.stringify(readiness || {})}`,
    `CONNECTED_CHANNELS=${JSON.stringify(connectedChannels || [])}`,
    `ORGANIZATION_FACTS=${JSON.stringify(object(organization))}`,
    `AVAILABLE_ASSETS=${JSON.stringify(assets || [])}`,
    `OWNER_INSTRUCTION=${JSON.stringify(object(request))}`,
  ].join("\n\n");
}

export const AICampaignPlannerRuntime = {
  async plan({
    organizationId,
    organization = {},
    request = {},
    connectedChannels = [],
    assets = [],
    readiness = {},
  }) {
    required(organizationId, "Organization id");
    const model = required(
      plannerModel(),
      "Campaign planner model configuration",
    );

    if (!connectedChannels.length) {
      const error = new Error(
        "No executable connected marketing channel is available",
      );
      error.stage = "CHANNEL_READINESS";
      error.code = "NO_EXECUTABLE_MARKETING_CHANNEL";
      error.correction =
        "Repair or connect at least one real campaign adapter before autonomous planning.";
      throw error;
    }

    const wallet = readiness?.wallet || null;
    if (!wallet || String(wallet.status || "").toUpperCase() !== "ACTIVE") {
      const error = new Error("An active organization wallet is required");
      error.stage = "WALLET_READINESS";
      error.code = "ACTIVE_WALLET_REQUIRED";
      error.correction =
        "Activate the organization wallet before autonomous campaign planning.";
      throw error;
    }

    if (Number(wallet.available_balance || 0) <= 0) {
      const error = new Error("The organization wallet has no available balance");
      error.stage = "WALLET_READINESS";
      error.code = "WALLET_BALANCE_REQUIRED";
      error.correction =
        "Top up the prepaid wallet before creating an executable campaign plan.";
      throw error;
    }

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
          readiness,
        }),
        max_output_tokens: 7000,
        response_format: { type: "json_object" },
        request_metadata: {
          contract: "UNIVERSAL_CAMPAIGN_PLAN_V1",
          organization_id: organizationId,
          decision_mode: "AI_AUTOPILOT",
        },
      },
      context: { organization_id: organizationId },
    });

    const candidate =
      result?.output && typeof result.output === "object"
        ? result.output
        : null;

    if (!candidate) {
      const error = new Error(
        "AI campaign planner did not return a structured plan",
      );
      error.stage = "AI_PLANNING";
      error.code = "STRUCTURED_PLAN_REQUIRED";
      error.correction =
        "Retry the planner with a configured reasoning model that supports JSON output.";
      throw error;
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
        approved_by: null,
        approved_at: null,
        source: "AI_AUTOPILOT",
      },
    });
  },
};

export default AICampaignPlannerRuntime;

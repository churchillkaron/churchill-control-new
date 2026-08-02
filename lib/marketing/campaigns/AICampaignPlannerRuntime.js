import {
  executeProvider,
} from "@/lib/platform/service-runtime/providers/ProviderExecutor";

import {
  resolveProvider,
} from "@/lib/platform/service-runtime/providers/ProviderResolver";

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

function organizationCountry(organization = {}) {
  return (
    organization.country_code ||
    organization.countryCode ||
    organization.country ||
    organization.legal_country_code ||
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
    "Owner approval must remain required and false. AI must never reserve campaign funds or activate a campaign.",
    `CHANNEL_CATALOG=${JSON.stringify(campaignPlannerChannelContext())}`,
    `CHANNEL_READINESS=${JSON.stringify(readiness || {})}`,
    `CONNECTED_CHANNELS=${JSON.stringify(connectedChannels || [])}`,
    `ORGANIZATION_FACTS=${JSON.stringify(object(organization))}`,
    `AVAILABLE_ASSETS=${JSON.stringify(assets || [])}`,
    `OWNER_INSTRUCTION=${JSON.stringify(object(request))}`,
  ].join("\n\n");
}

function stagedError({ stage, code, message, correction, cause = null }) {
  const error = new Error(message);
  error.name = "CampaignPlannerError";
  error.stage = stage;
  error.code = code;
  error.correction = correction;
  error.status = 400;
  if (cause) error.cause = cause;
  return error;
}

async function resolvePlannerProvider({ organizationId, organization, readiness }) {
  try {
    const selected = await resolveProvider({
      organization_id: organizationId,
      capability: "ai.reasoning.execute",
      preferredProvider: "openai",
      country: organizationCountry(organization),
      currency: readiness?.wallet?.currency || null,
      policy: {
        preferred_providers: ["openai"],
      },
    });

    if (!selected?.provider || !selected?.model) {
      throw new Error("Resolved reasoning provider is missing provider or model");
    }

    return selected;
  } catch (error) {
    throw stagedError({
      stage: "AI_PROVIDER_RESOLUTION",
      code: "CAMPAIGN_PLANNER_PROVIDER_UNAVAILABLE",
      message: "No priced managed reasoning model is available for campaign planning",
      correction:
        "Enable and price an executable ai.reasoning.execute provider for this organization and currency.",
      cause: error,
    });
  }
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

    if (!connectedChannels.length) {
      throw stagedError({
        stage: "CHANNEL_READINESS",
        code: "NO_EXECUTABLE_MARKETING_CHANNEL",
        message: "No executable connected marketing channel is available",
        correction:
          "Repair or connect at least one real campaign adapter before autonomous planning.",
      });
    }

    const wallet = readiness?.wallet || null;
    if (!wallet || String(wallet.status || "").toUpperCase() !== "ACTIVE") {
      throw stagedError({
        stage: "WALLET_READINESS",
        code: "ACTIVE_WALLET_REQUIRED",
        message: "An active organization wallet is required",
        correction:
          "Activate the organization wallet before autonomous campaign planning.",
      });
    }

    if (Number(wallet.available_balance || 0) <= 0) {
      throw stagedError({
        stage: "WALLET_READINESS",
        code: "WALLET_BALANCE_REQUIRED",
        message: "The organization wallet has no available balance",
        correction:
          "Top up the prepaid wallet before creating an executable campaign plan.",
      });
    }

    const selectedProvider = await resolvePlannerProvider({
      organizationId,
      organization,
      readiness,
    });

    let result;
    try {
      result = await executeProvider({
        provider: selectedProvider.provider,
        capability: "ai.reasoning.execute",
        model: selectedProvider.model,
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
        context: {
          organization_id: organizationId,
          credential_id: selectedProvider.credential_id || null,
          currency: readiness?.wallet?.currency || null,
        },
      });
    } catch (error) {
      throw stagedError({
        stage: "AI_PLANNING",
        code: "CAMPAIGN_PLANNER_EXECUTION_FAILED",
        message: error?.message || "AI campaign planning failed",
        correction:
          "Verify the selected managed reasoning credential and provider availability, then retry.",
        cause: error,
      });
    }

    const candidate =
      result?.output && typeof result.output === "object"
        ? result.output
        : null;

    if (!candidate) {
      throw stagedError({
        stage: "AI_PLANNING",
        code: "STRUCTURED_PLAN_REQUIRED",
        message: "AI campaign planner did not return a structured plan",
        correction:
          "Retry with a managed reasoning model that supports structured JSON output.",
      });
    }

    try {
      return normalizeUniversalCampaignPlan({
        ...candidate,
        organization_id: organizationId,
        ai: {
          ...(candidate.ai || {}),
          generated: true,
          provider: selectedProvider.provider,
          model: selectedProvider.model,
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
    } catch (error) {
      throw stagedError({
        stage: "PLAN_NORMALIZATION",
        code: "AI_CAMPAIGN_PLAN_INVALID",
        message: error?.message || "AI campaign plan is invalid",
        correction:
          "Regenerate the plan after correcting the specific missing or invalid campaign field.",
        cause: error,
      });
    }
  },
};

export default AICampaignPlannerRuntime;

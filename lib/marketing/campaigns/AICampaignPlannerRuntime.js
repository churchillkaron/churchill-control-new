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

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
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

function planContractExample() {
  return {
    version: "UNIVERSAL_CAMPAIGN_PLAN_V1",
    name: "AI-selected campaign name",
    goal: "AI-selected goal",
    audience: {
      included_locations: [
        {
          type: "country",
          country_code: "ISO_TWO_LETTER_CODE",
        },
      ],
      excluded_locations: [],
      location_presence: "living_or_recent",
      age_min: 18,
      age_max: 65,
      genders: [],
      languages: [],
      interests: [],
      behaviors: [],
      keywords: [],
      negative_keywords: [],
      custom_audience_ids: [],
      excluded_audience_ids: [],
      lookalike_audience_ids: [],
      retargeting: {},
      expansion_enabled: true,
    },
    budget: {
      amount: 1,
      currency: "WALLET_CURRENCY",
      mode: "lifetime",
      allocation: [],
      bid_strategy: "lowest_cost",
      bid_cap: null,
      cost_cap: null,
    },
    schedule: {
      start_time: "ISO_DATE_TIME",
      end_time: "ISO_DATE_TIME",
      timezone: "ORGANIZATION_TIMEZONE",
      dayparts: [],
    },
    creative: {
      asset_ids: [],
      exact_asset_required: true,
      primary_text: "Campaign copy",
      headline: "Campaign headline",
      description: "Campaign description",
      destination_url: null,
      call_to_action: "LEARN_MORE",
      utm_parameters: {},
      language_variants: [],
      placement_variants: [],
    },
    channels: [
      {
        channel_id: "CONNECTED_CHANNEL_ID",
        networks: ["EXECUTABLE_NETWORK"],
        destination: "EXECUTABLE_DESTINATION",
        objective: null,
        optimization_goal: null,
        billing_event: "IMPRESSIONS",
        placements: [],
        conversion_event: null,
        tracking: {},
        provider_settings: {},
      },
    ],
    ai: {
      generated: true,
      rationale: [],
      assumptions: [],
      warnings: [],
      confidence: 0.8,
    },
    approval: {
      required: true,
      approved: false,
      approved_by: null,
      approved_at: null,
      source: "AI_AUTOPILOT",
    },
  };
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
    "The response MUST contain a top-level channels array with exactly one channel object.",
    "Do not wrap the plan inside plan, campaign_plan, result, data or response.",
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
    `REQUIRED_TOP_LEVEL_SHAPE=${JSON.stringify(planContractExample())}`,
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

function parseJsonObject(value) {
  const source = text(value);
  if (!source) return null;

  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }

  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Try the next conservative JSON candidate.
    }
  }

  return null;
}

function looksLikePlan(value) {
  const candidate = object(value);
  return Boolean(
    candidate.version ||
      candidate.channels ||
      candidate.channel ||
      candidate.channel_id ||
      candidate.campaign_name ||
      candidate.name ||
      candidate.audience ||
      candidate.budget ||
      candidate.creative,
  );
}

function structuredPlanCandidate(result = {}) {
  const output = object(result.output);
  const parsedText = parseJsonObject(output.text);
  const candidates = [
    output.plan,
    output.campaign_plan,
    output.campaignPlan,
    output.universal_campaign_plan,
    output.universalCampaignPlan,
    output.result?.plan,
    output.result,
    output.data?.plan,
    output.data,
    parsedText?.plan,
    parsedText?.campaign_plan,
    parsedText?.campaignPlan,
    parsedText?.result,
    parsedText?.data,
    parsedText,
    output,
  ];

  for (const candidate of candidates) {
    if (looksLikePlan(candidate)) return object(candidate);
  }

  return null;
}

function channelIdFrom(value) {
  if (!value) return null;
  if (typeof value === "string") return text(value).toLowerCase() || null;
  if (typeof value !== "object") return null;
  return text(
    value.channel_id ||
      value.channelId ||
      value.id ||
      value.key ||
      value.provider,
  ).toLowerCase() || null;
}

function readinessChannel(connectedChannels, channelId = null) {
  const channels = list(connectedChannels);
  if (channelId) {
    const matched = channels.find(
      (channel) => text(channel.id).toLowerCase() === channelId,
    );
    if (matched) return matched;
  }
  return channels.length === 1 ? channels[0] : null;
}

function safeNetworks(requested, readyChannel) {
  const available = list(readyChannel?.networks);
  const selected = list(requested).filter((network) =>
    available.includes(network),
  );
  return selected.length ? selected : available;
}

function safeDestination(requested, readyChannel) {
  const available = list(readyChannel?.destinations);
  const normalized = text(requested).toUpperCase();
  return available.includes(normalized)
    ? normalized
    : available[0] || null;
}

function repairCampaignChannel(candidate, connectedChannels) {
  const source = object(candidate);
  const rawChannels = Array.isArray(source.channels)
    ? source.channels
    : source.channels && typeof source.channels === "object"
      ? [source.channels]
      : source.channel
        ? [source.channel]
        : source.channel_id || source.channelId
          ? [
              {
                channel_id: source.channel_id || source.channelId,
                networks: source.networks,
                destination: source.destination,
              },
            ]
          : [];

  const firstChannel = object(rawChannels[0]);
  const requestedId = channelIdFrom(firstChannel) || channelIdFrom(source.channel);
  const readyChannel = readinessChannel(connectedChannels, requestedId);

  if (!readyChannel) {
    if (!rawChannels.length) {
      throw stagedError({
        stage: "PLAN_NORMALIZATION",
        code: "AI_CHANNEL_DECISION_REQUIRED",
        message:
          "AI campaign plan did not select a channel and more than one executable channel is available",
        correction:
          "Regenerate the plan so AI selects exactly one connected executable channel.",
      });
    }

    throw stagedError({
      stage: "PLAN_NORMALIZATION",
      code: "AI_SELECTED_CHANNEL_NOT_EXECUTABLE",
      message: `AI selected channel ${requestedId || "unknown"}, but it is not executable for this organization`,
      correction:
        "Regenerate the plan using only channels returned in connected channel readiness.",
    });
  }

  const repairedChannel = {
    ...firstChannel,
    channel_id: readyChannel.id,
    networks: safeNetworks(firstChannel.networks || source.networks, readyChannel),
    destination: safeDestination(
      firstChannel.destination || source.destination,
      readyChannel,
    ),
  };

  const warnings = list(source.ai?.warnings);
  if (!rawChannels.length) {
    warnings.push("CHANNEL_BOUND_FROM_SINGLE_EXECUTABLE_READINESS");
  }

  return {
    ...source,
    channels: [repairedChannel],
    ai: {
      ...object(source.ai),
      warnings: [...new Set(warnings)],
    },
  };
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
      message:
        "No priced managed reasoning model is available for campaign planning",
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

    const extracted = structuredPlanCandidate(result);
    if (!extracted) {
      throw stagedError({
        stage: "AI_PLANNING",
        code: "STRUCTURED_PLAN_REQUIRED",
        message: "AI campaign planner did not return a structured plan",
        correction:
          "Retry with a managed reasoning model that supports structured JSON output.",
      });
    }

    let candidate;
    try {
      candidate = repairCampaignChannel(extracted, connectedChannels);
    } catch (error) {
      if (error?.name === "CampaignPlannerError") throw error;
      throw stagedError({
        stage: "PLAN_NORMALIZATION",
        code: "AI_CHANNEL_PLAN_INVALID",
        message: error?.message || "AI campaign channel plan is invalid",
        correction:
          "Regenerate the plan using exactly one connected executable channel.",
        cause: error,
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

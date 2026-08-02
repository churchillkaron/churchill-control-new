import { getMarketingChannel, listMarketingChannels } from "@/lib/marketing/campaigns/MarketingChannelCatalog";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function normalizeLocation(location = {}) {
  const type = text(location.type || "country").toLowerCase();
  const result = {
    type,
    id: text(location.id) || null,
    name: text(location.name || location.label) || null,
    country_code: text(location.country_code || location.country).toUpperCase() || null,
    region_code: text(location.region_code || location.region) || null,
    city: text(location.city) || null,
    district: text(location.district) || null,
    postal_code: text(location.postal_code) || null,
    latitude: number(location.latitude),
    longitude: number(location.longitude),
    radius: number(location.radius),
    radius_unit: text(location.radius_unit || "kilometer").toLowerCase(),
  };

  if (type === "radius") {
    if (result.latitude === null || result.longitude === null) throw new Error("Radius targeting requires latitude and longitude");
    if (!result.radius || result.radius <= 0) throw new Error("Radius targeting requires a positive radius");
  }
  if (type === "country" && !result.country_code) throw new Error("Country targeting requires a country code");
  return result;
}

function normalizeAudience(audience = {}) {
  const ageMin = number(audience.age_min ?? audience.ageMin, 18);
  const ageMax = number(audience.age_max ?? audience.ageMax, 65);
  if (ageMin < 18 || ageMax < ageMin) throw new Error("Invalid audience age range");
  const included = list(audience.included_locations || audience.includedLocations).map(normalizeLocation);
  if (!included.length) throw new Error("At least one included audience location is required");
  return {
    included_locations: included,
    excluded_locations: list(audience.excluded_locations || audience.excludedLocations).map(normalizeLocation),
    location_presence: text(audience.location_presence || audience.locationPresence || "living_or_recent").toLowerCase(),
    age_min: ageMin,
    age_max: ageMax,
    genders: list(audience.genders),
    languages: list(audience.languages),
    interests: list(audience.interests),
    behaviors: list(audience.behaviors || audience.behaviours),
    keywords: list(audience.keywords),
    negative_keywords: list(audience.negative_keywords || audience.negativeKeywords),
    custom_audience_ids: list(audience.custom_audience_ids || audience.customAudienceIds),
    excluded_audience_ids: list(audience.excluded_audience_ids || audience.excludedAudienceIds),
    lookalike_audience_ids: list(audience.lookalike_audience_ids || audience.lookalikeAudienceIds),
    retargeting: audience.retargeting || {},
    expansion_enabled: audience.expansion_enabled !== false,
  };
}

function normalizeChannelPlan(channelPlan = {}) {
  const channelId = text(channelPlan.channel_id || channelPlan.channelId).toLowerCase();
  const channel = getMarketingChannel(channelId);
  if (!channel) throw new Error(`Unknown campaign channel: ${channelId}`);
  return {
    channel_id: channel.id,
    provider: channel.provider,
    capability: channel.capability,
    service_id: channel.service_id,
    runtime_status: channel.runtime_status,
    networks: list(channelPlan.networks).length ? list(channelPlan.networks) : [...channel.networks],
    destination: text(channelPlan.destination).toUpperCase() || null,
    objective: text(channelPlan.objective).toUpperCase() || null,
    optimization_goal: text(channelPlan.optimization_goal || channelPlan.optimizationGoal).toUpperCase() || null,
    billing_event: text(channelPlan.billing_event || channelPlan.billingEvent).toUpperCase() || null,
    placements: list(channelPlan.placements),
    conversion_event: text(channelPlan.conversion_event || channelPlan.conversionEvent) || null,
    tracking: channelPlan.tracking || {},
    provider_settings: channelPlan.provider_settings || channelPlan.providerSettings || {},
  };
}

export function normalizeUniversalCampaignPlan(plan = {}) {
  const channels = list(plan.channels).map(normalizeChannelPlan);
  if (!channels.length) throw new Error("Campaign plan requires at least one channel");
  const budgetAmount = number(plan.budget?.amount ?? plan.budget?.total_budget ?? plan.budget?.totalBudget);
  if (!budgetAmount || budgetAmount <= 0) throw new Error("Campaign budget must be positive");
  return {
    version: "UNIVERSAL_CAMPAIGN_PLAN_V1",
    name: text(plan.name),
    goal: text(plan.goal).toUpperCase(),
    organization_id: plan.organization_id || plan.organizationId || null,
    entity_id: plan.entity_id || plan.entityId || null,
    audience: normalizeAudience(plan.audience || {}),
    budget: {
      amount: budgetAmount,
      currency: text(plan.budget?.currency).toUpperCase(),
      mode: text(plan.budget?.mode || "lifetime").toLowerCase(),
      allocation: list(plan.budget?.allocation),
      bid_strategy: text(plan.budget?.bid_strategy || plan.budget?.bidStrategy || "lowest_cost"),
      bid_cap: number(plan.budget?.bid_cap ?? plan.budget?.bidCap),
      cost_cap: number(plan.budget?.cost_cap ?? plan.budget?.costCap),
    },
    schedule: {
      start_time: plan.schedule?.start_time || plan.schedule?.startTime || null,
      end_time: plan.schedule?.end_time || plan.schedule?.endTime || null,
      timezone: text(plan.schedule?.timezone) || null,
      dayparts: list(plan.schedule?.dayparts),
    },
    creative: {
      asset_ids: list(plan.creative?.asset_ids || plan.creative?.assetIds),
      exact_asset_required: plan.creative?.exact_asset_required !== false,
      primary_text: text(plan.creative?.primary_text || plan.creative?.primaryText),
      headline: text(plan.creative?.headline),
      description: text(plan.creative?.description),
      destination_url: text(plan.creative?.destination_url || plan.creative?.destinationUrl) || null,
      call_to_action: text(plan.creative?.call_to_action || plan.creative?.callToAction || "LEARN_MORE").toUpperCase(),
      utm_parameters: plan.creative?.utm_parameters || plan.creative?.utmParameters || {},
      language_variants: list(plan.creative?.language_variants || plan.creative?.languageVariants),
      placement_variants: list(plan.creative?.placement_variants || plan.creative?.placementVariants),
    },
    channels,
    ai: {
      generated: Boolean(plan.ai?.generated),
      rationale: list(plan.ai?.rationale),
      assumptions: list(plan.ai?.assumptions),
      warnings: list(plan.ai?.warnings),
      confidence: number(plan.ai?.confidence),
    },
    approval: {
      required: plan.approval?.required !== false,
      approved: Boolean(plan.approval?.approved),
      approved_by: plan.approval?.approved_by || null,
      approved_at: plan.approval?.approved_at || null,
    },
  };
}

export function validateCampaignPlanReadiness(plan = {}) {
  const normalized = normalizeUniversalCampaignPlan(plan);
  const blockers = [];
  for (const channel of normalized.channels) {
    if (!["ACTIVE", "ACTIVE_IF_CONFIGURED"].includes(channel.runtime_status)) blockers.push({ channel_id: channel.channel_id, code: "CHANNEL_RUNTIME_NOT_READY", message: `${getMarketingChannel(channel.channel_id)?.name || channel.channel_id} execution is not implemented` });
  }
  if (normalized.approval.required && !normalized.approval.approved) blockers.push({ code: "OWNER_APPROVAL_REQUIRED", message: "Campaign plan requires owner approval before funds can be reserved" });
  return { ready: blockers.length === 0, blockers, plan: normalized };
}

export function campaignPlannerChannelContext() {
  return listMarketingChannels().map((channel) => ({ id: channel.id, name: channel.name, kind: channel.kind, runtime_status: channel.runtime_status, networks: [...channel.networks], destinations: [...channel.destinations], formats: [...channel.formats] }));
}

export default normalizeUniversalCampaignPlan;

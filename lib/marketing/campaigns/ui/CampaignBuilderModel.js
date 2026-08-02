export const CAMPAIGN_GOALS = Object.freeze([
  { id: "AWARENESS", name: "Awareness", description: "Reach the right audience and build recognition." },
  { id: "ENGAGEMENT", name: "Engagement", description: "Increase meaningful interactions and attention." },
  { id: "TRAFFIC", name: "Traffic", description: "Send qualified people to a destination." },
  { id: "LEADS", name: "Leads", description: "Generate enquiries and qualified prospects." },
  { id: "SALES", name: "Sales", description: "Drive measurable purchases or bookings." },
  { id: "RETENTION", name: "Retention", description: "Reconnect with existing customers." },
  { id: "REPUTATION", name: "Reputation", description: "Improve discovery, trust and reviews." },
  { id: "EVENT", name: "Event", description: "Promote an event, launch or time-bound activity." },
]);

export const LOCATION_TYPES = Object.freeze([
  { id: "country", name: "Country" },
  { id: "region", name: "Region" },
  { id: "city", name: "City" },
  { id: "district", name: "District" },
  { id: "postal_code", name: "Postal code" },
  { id: "radius", name: "Map radius" },
]);

export const DESTINATION_NAMES = Object.freeze({
  ENGAGEMENT: "Engagement",
  WEBSITE: "Website",
  LEADS: "Leads",
  WHATSAPP: "WhatsApp",
  MESSENGER: "Messenger",
  INSTAGRAM_DIRECT: "Instagram Direct",
  CONVERSATION: "Conversation",
  BOOKING: "Booking",
  PURCHASE: "Purchase",
  SUPPORT: "Support",
});

export function createLocation(type = "country", values = {}) {
  return {
    _key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    id: "",
    name: "",
    country_code: "",
    region_code: "",
    city: "",
    district: "",
    postal_code: "",
    latitude: "",
    longitude: "",
    radius: "",
    radius_unit: "kilometer",
    ...values,
  };
}

export function createDefaultCampaignForm() {
  return {
    campaignName: "",
    campaignBrief: "",
    goal: "AWARENESS",
    channelId: "",
    networks: [],
    destination: "ENGAGEMENT",
    ageMin: "18",
    ageMax: "65",
    genders: [],
    locationPresence: "living_or_recent",
    country: "",
    includedLocations: [createLocation("country")],
    excludedLocations: [],
    languageIds: "",
    interestIds: "",
    behaviorIds: "",
    customAudienceIds: "",
    excludedAudienceIds: "",
    lookalikeAudienceIds: "",
    keywords: "",
    negativeKeywords: "",
    totalBudget: "",
    bidStrategy: "lowest_cost",
    bidCap: "",
    costCap: "",
    startTime: "",
    endTime: "",
    dayparts: "",
    assetId: "",
    confirmExactAsset: false,
    primaryText: "",
    headline: "",
    description: "",
    destinationUrl: "",
    callToAction: "LEARN_MORE",
  };
}

export function splitList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function listToInput(value) {
  return Array.isArray(value)
    ? value
        .map((item) =>
          typeof item === "object" ? item.id || item.key || item.name || "" : item,
        )
        .filter(Boolean)
        .join(", ")
    : "";
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) => item !== "" && item !== null && item !== undefined,
    ),
  );
}

export function cleanLocation(location = {}) {
  const cleaned = compactObject({
    type: location.type || "country",
    id: String(location.id || "").trim() || null,
    name: String(location.name || "").trim() || null,
    country_code:
      String(location.country_code || "").trim().toUpperCase() || null,
    region_code: String(location.region_code || "").trim() || null,
    city: String(location.city || "").trim() || null,
    district: String(location.district || "").trim() || null,
    postal_code: String(location.postal_code || "").trim() || null,
    latitude: numberOrNull(location.latitude),
    longitude: numberOrNull(location.longitude),
    radius: numberOrNull(location.radius),
    radius_unit: location.radius_unit || "kilometer",
  });

  return cleaned;
}

export function localDateTimeToIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

export function isoToLocalDateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function buildUniversalCampaignPlan({
  form,
  organizationId,
  walletCurrency,
  mode,
  ai = {},
}) {
  const includedLocations =
    mode === "simple"
      ? [
          cleanLocation({
            type: "country",
            country_code: form.country,
          }),
        ]
      : (form.includedLocations || []).map(cleanLocation);

  const excludedLocations =
    mode === "simple"
      ? []
      : (form.excludedLocations || []).map(cleanLocation);

  return {
    version: "UNIVERSAL_CAMPAIGN_PLAN_V1",
    name: String(form.campaignName || "").trim(),
    goal: form.goal,
    organization_id: organizationId,
    entity_id: null,
    audience: {
      included_locations: includedLocations,
      excluded_locations: excludedLocations,
      location_presence: form.locationPresence,
      age_min: Number(form.ageMin),
      age_max: Number(form.ageMax),
      genders: form.genders || [],
      languages: splitList(form.languageIds),
      interests: splitList(form.interestIds),
      behaviors: splitList(form.behaviorIds),
      keywords: splitList(form.keywords),
      negative_keywords: splitList(form.negativeKeywords),
      custom_audience_ids: splitList(form.customAudienceIds),
      excluded_audience_ids: splitList(form.excludedAudienceIds),
      lookalike_audience_ids: splitList(form.lookalikeAudienceIds),
      retargeting: {},
      expansion_enabled: true,
    },
    budget: {
      amount: Number(form.totalBudget),
      currency: walletCurrency,
      mode: "lifetime",
      allocation: [],
      bid_strategy: form.bidStrategy || "lowest_cost",
      bid_cap: numberOrNull(form.bidCap),
      cost_cap: numberOrNull(form.costCap),
    },
    schedule: {
      start_time: localDateTimeToIso(form.startTime),
      end_time: localDateTimeToIso(form.endTime),
      timezone:
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || null
          : null,
      dayparts: splitList(form.dayparts),
    },
    creative: {
      asset_ids: form.assetId ? [form.assetId] : [],
      exact_asset_required: true,
      primary_text: String(form.primaryText || "").trim(),
      headline: String(form.headline || "").trim(),
      description: String(form.description || "").trim(),
      destination_url: String(form.destinationUrl || "").trim() || null,
      call_to_action: form.callToAction || "LEARN_MORE",
      utm_parameters: {},
      language_variants: [],
      placement_variants: [],
    },
    channels: [
      {
        channel_id: form.channelId,
        networks: form.networks || [],
        destination: form.destination,
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
      generated: Boolean(ai.generated),
      rationale: ai.rationale || [],
      assumptions: ai.assumptions || [],
      warnings: ai.warnings || [],
      confidence: ai.confidence ?? null,
    },
    approval: {
      required: true,
      approved: false,
      approved_by: null,
      approved_at: null,
      source: null,
    },
  };
}

function locationWithKey(location) {
  return createLocation(location?.type || "country", {
    ...location,
    latitude:
      location?.latitude === null || location?.latitude === undefined
        ? ""
        : String(location.latitude),
    longitude:
      location?.longitude === null || location?.longitude === undefined
        ? ""
        : String(location.longitude),
    radius:
      location?.radius === null || location?.radius === undefined
        ? ""
        : String(location.radius),
  });
}

export function applyUniversalPlanToForm({ plan, current, readiness }) {
  const channelPlan = plan?.channels?.[0] || {};
  const readyChannel = (readiness?.connected_channels || []).find(
    (channel) => channel.id === channelPlan.channel_id,
  );
  const allowedNetworks = new Set(readyChannel?.networks || []);
  const networks = (channelPlan.networks || []).filter((network) =>
    allowedNetworks.has(network),
  );
  const included = (plan?.audience?.included_locations || []).map(locationWithKey);
  const excluded = (plan?.audience?.excluded_locations || []).map(locationWithKey);
  const firstCountry = included.find((location) => location.type === "country");
  const advanced =
    excluded.length > 0 ||
    included.length !== 1 ||
    included.some((location) => location.type !== "country");

  return {
    mode: advanced ? "advanced" : "simple",
    form: {
      ...current,
      campaignName: plan?.name || current.campaignName,
      goal: plan?.goal || current.goal,
      channelId: channelPlan.channel_id || current.channelId,
      networks:
        networks.length > 0
          ? networks
          : readyChannel?.networks?.filter((network) =>
              ["facebook", "instagram"].includes(network),
            ) || [],
      destination: channelPlan.destination || current.destination,
      ageMin: String(plan?.audience?.age_min ?? current.ageMin),
      ageMax: String(plan?.audience?.age_max ?? current.ageMax),
      genders: plan?.audience?.genders || [],
      locationPresence:
        plan?.audience?.location_presence || current.locationPresence,
      country: firstCountry?.country_code || current.country,
      includedLocations:
        included.length > 0 ? included : current.includedLocations,
      excludedLocations: excluded,
      languageIds: listToInput(plan?.audience?.languages),
      interestIds: listToInput(plan?.audience?.interests),
      behaviorIds: listToInput(plan?.audience?.behaviors),
      customAudienceIds: listToInput(plan?.audience?.custom_audience_ids),
      excludedAudienceIds: listToInput(
        plan?.audience?.excluded_audience_ids,
      ),
      lookalikeAudienceIds: listToInput(
        plan?.audience?.lookalike_audience_ids,
      ),
      keywords: listToInput(plan?.audience?.keywords),
      negativeKeywords: listToInput(plan?.audience?.negative_keywords),
      totalBudget: String(plan?.budget?.amount ?? current.totalBudget),
      bidStrategy: plan?.budget?.bid_strategy || current.bidStrategy,
      bidCap:
        plan?.budget?.bid_cap === null || plan?.budget?.bid_cap === undefined
          ? ""
          : String(plan.budget.bid_cap),
      costCap:
        plan?.budget?.cost_cap === null || plan?.budget?.cost_cap === undefined
          ? ""
          : String(plan.budget.cost_cap),
      startTime: isoToLocalDateTime(plan?.schedule?.start_time),
      endTime: isoToLocalDateTime(plan?.schedule?.end_time),
      dayparts: listToInput(plan?.schedule?.dayparts),
      assetId: plan?.creative?.asset_ids?.[0] || current.assetId,
      confirmExactAsset: false,
      primaryText: plan?.creative?.primary_text || current.primaryText,
      headline: plan?.creative?.headline || current.headline,
      description: plan?.creative?.description || current.description,
      destinationUrl:
        plan?.creative?.destination_url || current.destinationUrl,
      callToAction:
        plan?.creative?.call_to_action || current.callToAction,
    },
  };
}

export function campaignPlanFingerprint(plan) {
  return JSON.stringify(plan);
}

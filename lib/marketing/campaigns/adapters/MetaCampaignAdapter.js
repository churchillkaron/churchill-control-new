import {
  MetaAdsRuntime,
} from "@/lib/marketing/services/MetaAdsRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function executionError({
  stage,
  code,
  message,
  correction = null,
  details = null,
  cause = null,
}) {
  const error = new Error(message);
  error.name = "CampaignExecutionError";
  error.stage = stage;
  error.code = code;
  error.provider = "meta";
  error.correction = correction;
  error.details = details;
  error.status = 400;
  if (cause) error.cause = cause;
  return error;
}

function minorUnitFactor(currency) {
  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits;
    return 10 ** digits;
  } catch {
    throw executionError({
      stage: "PLAN_TRANSLATION",
      code: "INVALID_CAMPAIGN_CURRENCY",
      message: `Campaign currency ${currency || "missing"} is not valid`,
      correction: "Use the exact currency configured on the organization wallet.",
    });
  }
}

function providerIdEntry(value, label) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const id = text(value.id || value.key);
    if (!id) {
      throw executionError({
        stage: "TARGETING_TRANSLATION",
        code: "META_PROVIDER_ID_REQUIRED",
        message: `${label} targeting requires a Meta provider id`,
        correction: `Choose ${label.toLowerCase()} targets returned by Meta targeting search rather than free text.`,
      });
    }
    return {
      id,
      ...(text(value.name) ? { name: text(value.name) } : {}),
    };
  }

  const id = text(value);
  if (!id || !/^\d+$/.test(id)) {
    throw executionError({
      stage: "TARGETING_TRANSLATION",
      code: "META_PROVIDER_ID_REQUIRED",
      message: `${label} targeting value ${id || "missing"} is not a Meta provider id`,
      correction: `Resolve ${label.toLowerCase()} selections through Meta targeting search before campaign creation.`,
    });
  }

  return { id };
}

function normalizeRadiusLocation(location, excluded = false) {
  const latitude = finite(location.latitude);
  const longitude = finite(location.longitude);
  const radius = finite(location.radius);

  if (latitude === null || longitude === null || !radius || radius <= 0) {
    throw executionError({
      stage: "TARGETING_TRANSLATION",
      code: "META_RADIUS_LOCATION_INCOMPLETE",
      message: `${excluded ? "Excluded" : "Included"} radius targeting requires latitude, longitude and a positive radius`,
      correction: "Select a map point and radius before creating the campaign.",
      details: { location },
    });
  }

  const unit = text(location.radius_unit || "kilometer").toLowerCase();
  if (!["kilometer", "mile"].includes(unit)) {
    throw executionError({
      stage: "TARGETING_TRANSLATION",
      code: "META_RADIUS_UNIT_UNSUPPORTED",
      message: `Meta radius unit ${unit} is not supported`,
      correction: "Use kilometer or mile.",
    });
  }

  return {
    latitude,
    longitude,
    radius,
    distance_unit: unit,
    ...(text(location.name) ? { name: text(location.name) } : {}),
  };
}

function normalizeProviderLocation(location, excluded = false) {
  const type = text(location.type).toLowerCase();

  if (type === "radius") {
    return { field: "custom_locations", value: normalizeRadiusLocation(location, excluded) };
  }

  if (location.latitude !== null && location.latitude !== undefined) {
    return { field: "custom_locations", value: normalizeRadiusLocation(location, excluded) };
  }

  const key = text(location.id);
  if (!key) {
    throw executionError({
      stage: "TARGETING_TRANSLATION",
      code: "META_LOCATION_RESOLUTION_REQUIRED",
      message: `${location.name || location.city || location.district || location.postal_code || type || "Location"} has not been resolved to Meta targeting coordinates or an id`,
      correction: "Use map-radius targeting or select a location returned by Meta targeting search.",
      details: { location },
    });
  }

  if (["city", "district"].includes(type)) {
    return { field: "cities", value: { key } };
  }
  if (type === "region") {
    return { field: "regions", value: { key } };
  }
  if (["postal", "postal_code", "zip"].includes(type)) {
    return { field: "zips", value: { key } };
  }

  throw executionError({
    stage: "TARGETING_TRANSLATION",
    code: "META_LOCATION_TYPE_UNSUPPORTED",
    message: `Meta targeting cannot translate location type ${type || "missing"}`,
    correction: "Use country, region, city, postal code or map-radius targeting.",
  });
}

function addLocation(target, field, value) {
  target[field] = [...(target[field] || []), value];
}

function geoLocations(locations, excluded = false) {
  const result = {};

  for (const location of list(locations)) {
    const type = text(location.type || "country").toLowerCase();
    if (type === "country") {
      const country = upper(location.country_code || location.country);
      if (!/^[A-Z]{2}$/.test(country)) {
        throw executionError({
          stage: "TARGETING_TRANSLATION",
          code: "META_COUNTRY_CODE_INVALID",
          message: `${excluded ? "Excluded" : "Included"} country targeting requires a two-letter country code`,
          correction: "Use an ISO two-letter country code such as TH.",
        });
      }
      addLocation(result, "countries", country);
      continue;
    }

    const translated = normalizeProviderLocation(location, excluded);
    addLocation(result, translated.field, translated.value);
  }

  return result;
}

function metaGenders(values) {
  const normalized = list(values).map((value) => text(value).toLowerCase());
  if (!normalized.length || normalized.includes("all")) return undefined;

  const result = [];
  for (const value of normalized) {
    if (["male", "men", "man", "1"].includes(value)) result.push(1);
    else if (["female", "women", "woman", "2"].includes(value)) result.push(2);
    else {
      throw executionError({
        stage: "TARGETING_TRANSLATION",
        code: "META_GENDER_VALUE_UNSUPPORTED",
        message: `Meta gender targeting value ${value} is unsupported`,
        correction: "Use all, male or female for the current Meta adapter.",
      });
    }
  }

  return [...new Set(result)];
}

function translateAudience(audience = {}) {
  if (list(audience.keywords).length || list(audience.negative_keywords).length) {
    throw executionError({
      stage: "TARGETING_TRANSLATION",
      code: "META_KEYWORD_TARGETING_UNSUPPORTED",
      message: "Keyword and negative-keyword targeting cannot be executed by the Meta adapter",
      correction: "Use interests or behaviours for Meta, or place keyword targeting in a search-channel plan.",
    });
  }

  const included = geoLocations(audience.included_locations, false);
  if (!Object.keys(included).length) {
    throw executionError({
      stage: "TARGETING_TRANSLATION",
      code: "META_LOCATION_REQUIRED",
      message: "Meta campaign requires at least one executable included location",
      correction: "Add a country or map-radius target.",
    });
  }

  const excluded = geoLocations(audience.excluded_locations, true);
  const targeting = {
    geo_locations: included,
    age_min: Number(audience.age_min || 18),
    age_max: Number(audience.age_max || 65),
  };

  if (Object.keys(excluded).length) {
    targeting.excluded_geo_locations = excluded;
  }

  const genders = metaGenders(audience.genders);
  if (genders?.length) targeting.genders = genders;

  if (list(audience.languages).length) {
    targeting.locales = list(audience.languages).map((value) =>
      Number(providerIdEntry(value, "Language locale").id),
    );
  }

  if (list(audience.interests).length) {
    targeting.flexible_spec = [
      {
        interests: list(audience.interests).map((value) =>
          providerIdEntry(value, "Interest"),
        ),
      },
    ];
  }

  if (list(audience.behaviors).length) {
    const behaviours = list(audience.behaviors).map((value) =>
      providerIdEntry(value, "Behaviour"),
    );
    if (targeting.flexible_spec?.length) {
      targeting.flexible_spec[0].behaviors = behaviours;
    } else {
      targeting.flexible_spec = [{ behaviors: behaviours }];
    }
  }

  const customAudienceIds = [
    ...list(audience.custom_audience_ids),
    ...list(audience.lookalike_audience_ids),
  ].map((value) => providerIdEntry(value, "Custom audience"));
  if (customAudienceIds.length) targeting.custom_audiences = customAudienceIds;

  const excludedAudienceIds = list(audience.excluded_audience_ids).map((value) =>
    providerIdEntry(value, "Excluded audience"),
  );
  if (excludedAudienceIds.length) {
    targeting.excluded_custom_audiences = excludedAudienceIds;
  }

  return targeting;
}

function translateNetworks(channel = {}) {
  const allowed = new Set(["facebook", "instagram"]);
  const selected = list(channel.networks)
    .map((value) => text(value).toLowerCase())
    .filter((value) => allowed.has(value));

  if (!selected.length) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_DELIVERY_NETWORK_REQUIRED",
      message: "The first Meta adapter requires Facebook or Instagram delivery",
      correction: "Select Facebook, Instagram, or both. Messenger and Audience Network are not enabled for the first smoke test.",
    });
  }

  return [...new Set(selected)];
}

function translateDestination(channel = {}) {
  const destination = upper(channel.destination || "ENGAGEMENT");
  if (!["ENGAGEMENT", "WEBSITE", "WHATSAPP"].includes(destination)) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_DESTINATION_UNSUPPORTED",
      message: `Meta destination ${destination || "missing"} is not supported by the current adapter`,
      correction: "Use ENGAGEMENT, WEBSITE or configured WHATSAPP.",
    });
  }
  return destination;
}

function objectiveFor(destination, channel = {}) {
  if (upper(channel.objective)) return upper(channel.objective);
  if (destination === "WEBSITE") return "OUTCOME_TRAFFIC";
  if (destination === "WHATSAPP") return "OUTCOME_ENGAGEMENT";
  return "OUTCOME_ENGAGEMENT";
}

function optimizationFor(destination, channel = {}) {
  if (upper(channel.optimization_goal)) return upper(channel.optimization_goal);
  if (destination === "WEBSITE") return "LINK_CLICKS";
  if (destination === "WHATSAPP") return "CONVERSATIONS";
  return "POST_ENGAGEMENT";
}

export const MetaCampaignAdapter = {
  id: "meta",
  version: "META_MANAGED_MEDIA_V1",
  status: "ACTIVE",

  async execute({ organizationId, entityId = null, plan, channel }) {
    const destination = translateDestination(channel);
    const deliveryChannels = translateNetworks(channel);
    const targeting = translateAudience(plan.audience);
    const assetIds = list(plan.creative?.asset_ids);

    if (assetIds.length !== 1) {
      throw executionError({
        stage: "CREATIVE_TRANSLATION",
        code: "META_EXACT_ASSET_REQUIRED",
        message: "The current Meta adapter requires exactly one approved creative asset",
        correction: "Select one exact image for the paused campaign smoke test.",
      });
    }

    if (!text(plan.creative?.primary_text)) {
      throw executionError({
        stage: "CREATIVE_TRANSLATION",
        code: "META_PRIMARY_TEXT_REQUIRED",
        message: "Meta creative requires primary campaign text",
        correction: "Add the primary campaign message before approval.",
      });
    }

    if (!plan.schedule?.end_time) {
      throw executionError({
        stage: "SCHEDULE_TRANSLATION",
        code: "META_END_TIME_REQUIRED",
        message: "Meta campaign requires a finite end time",
        correction: "Choose an end date and time before wallet reservation.",
      });
    }

    const currency = upper(plan.budget?.currency);
    const factor = minorUnitFactor(currency);
    const campaignName = text(plan.name) || "Avantiqo Campaign";

    try {
      const result = await MetaAdsRuntime.createCampaign({
        organizationId,
        entityId,
        authorizedBudget: Number(plan.budget.amount),
        currency,
        deliveryChannels,
        destination,
        campaign: {
          name: campaignName,
          objective: objectiveFor(destination, channel),
          special_ad_categories: list(channel.provider_settings?.special_ad_categories),
        },
        adSet: {
          name: `${campaignName} - Audience`,
          optimization_goal: optimizationFor(destination, channel),
          billing_event: upper(channel.billing_event || "IMPRESSIONS"),
          lifetime_budget: Math.round(Number(plan.budget.amount) * factor),
          targeting,
          start_time: plan.schedule.start_time || null,
          end_time: plan.schedule.end_time,
        },
        creative: {
          name: `${campaignName} - Exact Creative`,
          asset_id: assetIds[0],
          confirm_exact_asset: plan.creative.exact_asset_required !== false,
          message: text(plan.creative.primary_text),
          headline: text(plan.creative.headline),
          description: text(plan.creative.description),
          link_url: text(plan.creative.destination_url) || undefined,
          call_to_action: upper(plan.creative.call_to_action || "LEARN_MORE"),
        },
        ad: {
          name: `${campaignName} - Ad`,
        },
      });

      return {
        adapter: this.version,
        channel_id: "meta",
        provider: "meta",
        status: "PAUSED",
        delivery_networks: deliveryChannels,
        result,
      };
    } catch (error) {
      if (error?.name === "CampaignExecutionError") throw error;
      throw executionError({
        stage: "PROVIDER_CREATE_PAUSED",
        code: "META_PAUSED_CREATION_FAILED",
        message: error?.message || "Meta paused campaign creation failed",
        correction: "Review the returned Meta provider error, correct the exact field, and retry while the campaign remains unlaunched.",
        cause: error,
      });
    }
  },
};

export default MetaCampaignAdapter;

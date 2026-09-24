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
}) {
  const error = new Error(message);
  error.name = "CampaignExecutionError";
  error.stage = stage;
  error.code = code;
  error.provider = "meta";
  error.correction = correction;
  error.details = details;
  error.status = 400;
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
      correction:
        "Use the exact currency configured on the organization wallet.",
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
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw executionError({
      stage: "TARGETING_TRANSLATION",
      code: "META_RADIUS_COORDINATES_INVALID",
      message: "Meta radius targeting coordinates are outside valid latitude/longitude ranges",
      correction: "Use latitude between -90 and 90 and longitude between -180 and 180.",
      details: { latitude, longitude },
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
    return {
      field: "custom_locations",
      value: normalizeRadiusLocation(location, excluded),
    };
  }

  if (location.latitude !== null && location.latitude !== undefined) {
    return {
      field: "custom_locations",
      value: normalizeRadiusLocation(location, excluded),
    };
  }

  const key = text(location.id);
  if (!key) {
    throw executionError({
      stage: "TARGETING_TRANSLATION",
      code: "META_LOCATION_RESOLUTION_REQUIRED",
      message: `${
        location.name ||
        location.city ||
        location.district ||
        location.postal_code ||
        type ||
        "Location"
      } has not been resolved to Meta targeting coordinates or an id`,
      correction:
        "Use map-radius targeting or select a location returned by Meta targeting search.",
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
    correction:
      "Use country, region, city, postal code or map-radius targeting.",
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
    else if (["female", "women", "woman", "2"].includes(value)) {
      result.push(2);
    } else {
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
      message:
        "Keyword and negative-keyword targeting cannot be executed by the Meta adapter",
      correction:
        "Use interests or behaviours for Meta, or place keyword targeting in a search-channel plan.",
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

const META_FACEBOOK_POSITIONS = new Set(["feed", "story", "facebook_reels", "marketplace", "video_feeds", "right_hand_column", "search"]);
const META_INSTAGRAM_POSITIONS = new Set(["stream", "story", "reels", "explore", "explore_home", "profile_feed", "search"]);
const META_DEVICE_PLATFORMS = new Set(["mobile", "desktop"]);

function safeProviderList(values, allowed, label) {
  const normalized = list(values).map((value) => text(value).toLowerCase()).filter(Boolean);
  const unsupported = normalized.filter((value) => !allowed.has(value));
  if (unsupported.length) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_PLACEMENT_UNSUPPORTED",
      message: `${label} ${unsupported.join(", ")} is not supported by the current Meta adapter`,
      correction: `Choose one of: ${[...allowed].join(", ")}.`,
    });
  }
  return [...new Set(normalized)];
}

function applyPlacementTargeting(targeting, channel = {}) {
  const settings = channel.provider_settings || {};
  const delivery = new Set(list(channel.networks).map((value) => text(value).toLowerCase()).filter(Boolean));
  const facebook = safeProviderList(settings.facebook_positions, META_FACEBOOK_POSITIONS, "Facebook placement");
  const instagram = safeProviderList(settings.instagram_positions, META_INSTAGRAM_POSITIONS, "Instagram placement");
  const devices = safeProviderList(settings.device_platforms, META_DEVICE_PLATFORMS, "Device platform");
  if (facebook.length && !delivery.has("facebook")) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_FACEBOOK_PLACEMENT_NETWORK_MISMATCH",
      message: "Facebook placements are configured but Facebook delivery is not selected",
      correction: "Select Facebook delivery or clear the Facebook placement overrides.",
    });
  }
  if (instagram.length && !delivery.has("instagram")) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_INSTAGRAM_PLACEMENT_NETWORK_MISMATCH",
      message: "Instagram placements are configured but Instagram delivery is not selected",
      correction: "Select Instagram delivery or clear the Instagram placement overrides.",
    });
  }
  if (facebook.length) targeting.facebook_positions = facebook;
  if (instagram.length) targeting.instagram_positions = instagram;
  if (devices.length) targeting.device_platforms = devices;
  return targeting;
}

function metaBudgetDelivery(plan = {}) {
  const mode = text(plan.budget?.mode || "lifetime").toLowerCase();
  const total = finite(plan.budget?.amount);
  if (!total || total <= 0) {
    throw executionError({ stage: "PLAN_TRANSLATION", code: "META_BUDGET_REQUIRED", message: "Meta requires a positive authorized budget" });
  }
  const currency = upper(plan.budget?.currency);
  const factor = minorUnitFactor(currency);
  if (mode === "lifetime") {
    return { lifetime_budget: Math.round(total * factor), daily_budget: undefined };
  }
  if (mode !== "daily") {
    throw executionError({ stage: "PLAN_TRANSLATION", code: "META_BUDGET_MODE_UNSUPPORTED", message: `Meta budget mode ${mode} is not supported`, correction: "Use lifetime or daily budget delivery." });
  }
  const daily = finite(plan.budget?.daily_amount);
  if (!daily || daily <= 0) {
    throw executionError({ stage: "PLAN_TRANSLATION", code: "META_DAILY_BUDGET_REQUIRED", message: "Daily Meta budget mode requires a positive daily budget", correction: "Enter a daily budget or switch to lifetime budget." });
  }
  const start = new Date(plan.schedule?.start_time || "");
  const end = new Date(plan.schedule?.end_time || "");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw executionError({ stage: "PLAN_TRANSLATION", code: "META_FINITE_SCHEDULE_REQUIRED", message: "Daily Meta budget mode requires a valid finite schedule" });
  }
  const durationDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  if (daily * durationDays > total + 0.000001) {
    throw executionError({
      stage: "PLAN_TRANSLATION",
      code: "META_DAILY_BUDGET_EXCEEDS_AUTHORIZATION",
      message: "Meta daily budget across the scheduled period exceeds the authorized Meta budget",
      correction: "Lower the daily budget or increase the authorized Meta allocation.",
      details: { daily_budget: daily, duration_days: durationDays, authorized_budget: total },
    });
  }
  return { daily_budget: Math.round(daily * factor), lifetime_budget: undefined };
}

function metaBidStrategy(plan = {}) {
  const strategy = text(plan.budget?.bid_strategy || "lowest_cost").toLowerCase();
  if (["lowest_cost", "lowest_cost_without_cap"].includes(strategy)) {
    return { bid_strategy: "LOWEST_COST_WITHOUT_CAP", bid_amount: null };
  }
  if (["bid_cap", "lowest_cost_with_bid_cap"].includes(strategy)) {
    const amount = finite(plan.budget?.bid_cap);
    if (!amount || amount <= 0) throw executionError({ stage: "PLAN_TRANSLATION", code: "META_BID_CAP_REQUIRED", message: "Meta bid-cap strategy requires a positive bid cap", correction: "Enter a positive bid cap or use lowest cost." });
    return { bid_strategy: "LOWEST_COST_WITH_BID_CAP", bid_amount: amount };
  }
  if (["cost_cap", "cost_cap_goal"].includes(strategy)) {
    const amount = finite(plan.budget?.cost_cap);
    if (!amount || amount <= 0) throw executionError({ stage: "PLAN_TRANSLATION", code: "META_COST_CAP_REQUIRED", message: "Meta cost-cap strategy requires a positive cost cap", correction: "Enter a positive cost cap or use lowest cost." });
    return { bid_strategy: "COST_CAP", bid_amount: amount };
  }
  throw executionError({ stage: "PLAN_TRANSLATION", code: "META_BID_STRATEGY_UNSUPPORTED", message: `Meta bid strategy ${strategy} is not supported`, correction: "Use lowest cost, bid cap or cost cap." });
}

function translateNetworks(channel = {}) {
  const allowed = new Set(["facebook", "instagram"]);
  const requested = list(channel.networks).map((value) => text(value).toLowerCase());
  const unsupported = requested.filter((value) => !allowed.has(value));

  if (unsupported.length) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_NETWORK_NOT_ENABLED",
      message: `Meta network ${unsupported.join(", ")} is not enabled in the first managed adapter`,
      correction:
        "Use Facebook, Instagram, or both. Messenger and Audience Network require separate validation before activation.",
    });
  }

  const selected = requested.filter((value) => allowed.has(value));
  if (!selected.length) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_DELIVERY_NETWORK_REQUIRED",
      message:
        "The first Meta adapter requires Facebook or Instagram delivery",
      correction: "Select Facebook, Instagram, or both.",
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

const META_COMPATIBILITY = Object.freeze({
  ENGAGEMENT: {
    objectives: new Set(["OUTCOME_ENGAGEMENT"]),
    optimizations: new Set(["POST_ENGAGEMENT", "IMPRESSIONS", "REACH"]),
  },
  WEBSITE: {
    objectives: new Set(["OUTCOME_TRAFFIC", "OUTCOME_SALES"]),
    optimizations: new Set(["LINK_CLICKS", "LANDING_PAGE_VIEWS", "OFFSITE_CONVERSIONS"]),
  },
  WHATSAPP: {
    objectives: new Set(["OUTCOME_ENGAGEMENT"]),
    optimizations: new Set(["CONVERSATIONS"]),
  },
});

function compatibleMetaSettings(destination, channel = {}) {
  const compatibility = META_COMPATIBILITY[destination];
  const explicitObjective = upper(channel.objective);
  const explicitOptimization = upper(channel.optimization_goal);
  if (explicitObjective && !compatibility.objectives.has(explicitObjective)) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_OBJECTIVE_DESTINATION_MISMATCH",
      message: `Meta objective ${explicitObjective} is not compatible with ${destination}`,
      correction: `Use one of: ${[...compatibility.objectives].join(", ")}.`,
    });
  }
  if (explicitOptimization && !compatibility.optimizations.has(explicitOptimization)) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_OPTIMIZATION_DESTINATION_MISMATCH",
      message: `Meta optimization ${explicitOptimization} is not compatible with ${destination}`,
      correction: `Use one of: ${[...compatibility.optimizations].join(", ")}.`,
    });
  }
  const billingEvent = upper(channel.billing_event || "IMPRESSIONS");
  const resolvedOptimization = explicitOptimization || optimizationFor(destination, channel);
  if (billingEvent === "LINK_CLICKS" && resolvedOptimization !== "LINK_CLICKS") {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_BILLING_OPTIMIZATION_MISMATCH",
      message: "Meta link-click billing requires Link Clicks optimization in the current managed adapter",
      correction: "Use Impressions billing or switch optimization to Link Clicks.",
    });
  }
}

function objectiveFor(destination, channel = {}) {
  if (upper(channel.objective)) return upper(channel.objective);
  if (destination === "WEBSITE" && upper(channel.optimization_goal) === "OFFSITE_CONVERSIONS") return "OUTCOME_SALES";
  if (destination === "WEBSITE") return "OUTCOME_TRAFFIC";
  return "OUTCOME_ENGAGEMENT";
}

function optimizationFor(destination, channel = {}) {
  if (upper(channel.optimization_goal)) {
    return upper(channel.optimization_goal);
  }
  if (destination === "WEBSITE") return "LINK_CLICKS";
  if (destination === "WHATSAPP") return "CONVERSATIONS";
  return "POST_ENGAGEMENT";
}

function destinationUrlWithTracking(creative = {}) {
  const raw = text(creative.destination_url);
  if (!raw) return undefined;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw executionError({
      stage: "CREATIVE_TRANSLATION",
      code: "META_DESTINATION_URL_INVALID",
      message: "Meta destination URL is not valid",
      correction: "Use a complete HTTP or HTTPS destination URL.",
    });
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw executionError({
      stage: "CREATIVE_TRANSLATION",
      code: "META_DESTINATION_URL_INVALID",
      message: "Meta destination URL must use HTTP or HTTPS",
      correction: "Use a public HTTP or HTTPS destination URL.",
    });
  }
  const params = creative.utm_parameters && typeof creative.utm_parameters === "object" ? creative.utm_parameters : {};
  const mapping = {
    source: "utm_source",
    medium: "utm_medium",
    campaign: "utm_campaign",
    term: "utm_term",
    content: "utm_content",
  };
  for (const [key, queryKey] of Object.entries(mapping)) {
    const value = text(params[key]);
    if (value) url.searchParams.set(queryKey, value);
  }
  return url.toString();
}

function promotedObjectFor(destination, channel = {}) {
  const optimization = optimizationFor(destination, channel);
  if (optimization !== "OFFSITE_CONVERSIONS") return null;
  if (destination !== "WEBSITE") {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_CONVERSION_DESTINATION_INVALID",
      message: "Meta off-site conversion optimization requires WEBSITE destination",
      correction: "Choose WEBSITE destination for Pixel conversion optimization.",
    });
  }
  const pixelId = text(channel.provider_settings?.pixel_id);
  const event = upper(channel.conversion_event);
  if (!pixelId) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_PIXEL_REQUIRED",
      message: "Meta off-site conversion optimization requires a Pixel",
      correction: "Select a Pixel discovered from the managed Meta ad account.",
    });
  }
  if (!event) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_CONVERSION_EVENT_REQUIRED",
      message: "Meta off-site conversion optimization requires a conversion event",
      correction: "Choose a standard conversion event such as PURCHASE or LEAD.",
    });
  }
  return { pixel_id: pixelId, custom_event_type: event };
}


export function translateMetaCampaignPlan({ plan, channel }) {
  const destination = translateDestination(channel);
  compatibleMetaSettings(destination, channel);
  const specialAdCategories = list(channel.provider_settings?.special_ad_categories).map(upper).filter(Boolean);
  if (specialAdCategories.length) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_SPECIAL_AD_CATEGORY_CERTIFICATION_REQUIRED",
      message: "Meta Special Ad Category campaigns require certified compliance preflight before provider execution",
      correction: "Keep the campaign as a draft until Avantiqo special-ad compliance certification is active for the organization and target market.",
      details: { special_ad_categories: specialAdCategories },
    });
  }
  const deliveryChannels = translateNetworks(channel);
  const targeting = applyPlacementTargeting(translateAudience(plan.audience), channel);
  const promotedObject = promotedObjectFor(destination, channel);
  const trackedDestinationUrl = destinationUrlWithTracking(plan.creative || {});
  const bid = metaBidStrategy(plan);
  const assetIds = list(plan.creative?.asset_ids);

  if (assetIds.length !== 1) {
    throw executionError({
      stage: "CREATIVE_TRANSLATION",
      code: "META_EXACT_ASSET_REQUIRED",
      message:
        "The current Meta adapter requires exactly one approved creative asset",
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

  if (destination === "WEBSITE" && !text(plan.creative?.destination_url)) {
    throw executionError({
      stage: "CREATIVE_TRANSLATION",
      code: "META_DESTINATION_URL_REQUIRED",
      message: "Website campaigns require a destination URL",
      correction: "Add the exact landing-page URL before approval.",
    });
  }

  const currency = upper(plan.budget?.currency);
  const budgetDelivery = metaBudgetDelivery(plan);
  const factor = minorUnitFactor(currency);
  const campaignName = text(plan.name) || "Avantiqo Campaign";

  const pageAssetId = text(channel.provider_settings?.page_asset_id);
  const instagramAssetId = text(channel.provider_settings?.instagram_asset_id);
  const whatsappAssetId = text(channel.provider_settings?.whatsapp_asset_id);
  if (!pageAssetId) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_PAGE_IDENTITY_REQUIRED",
      message: "Meta Ads requires an exact Facebook Page identity",
      correction: "Select the organization Facebook Page in Campaigns.",
    });
  }
  if (deliveryChannels.includes("instagram") && !instagramAssetId) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_INSTAGRAM_IDENTITY_REQUIRED",
      message: "Instagram delivery requires an exact linked Instagram professional account",
      correction: "Select the Instagram identity linked to the chosen Facebook Page.",
    });
  }
  if (destination === "WHATSAPP" && !whatsappAssetId) {
    throw executionError({
      stage: "CHANNEL_TRANSLATION",
      code: "META_WHATSAPP_IDENTITY_REQUIRED",
      message: "Click-to-WhatsApp delivery requires an exact organization WhatsApp phone-number asset",
      correction: "Select the organization WhatsApp number in Meta Ad Identity.",
    });
  }

  return {
    pageAssetId,
    instagramAssetId: instagramAssetId || null,
    whatsappAssetId: whatsappAssetId || null,
    authorizedBudget: Number(plan.budget.amount),
    currency,
    deliveryChannels,
    destination,
    campaign: {
      name: campaignName,
      objective: objectiveFor(destination, channel),
      special_ad_categories: specialAdCategories,
    },
    adSet: {
      name: `${campaignName} - Audience`,
      optimization_goal: optimizationFor(destination, channel),
      billing_event: upper(channel.billing_event || "IMPRESSIONS"),
      ...budgetDelivery,
      bid_strategy: bid.bid_strategy,
      bid_amount: bid.bid_amount === null ? undefined : Math.round(bid.bid_amount * factor),
      targeting,
      promoted_object: promotedObject || undefined,
      destination_type: destination,
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
      link_url: trackedDestinationUrl,
      call_to_action: destination === "WHATSAPP"
        ? "WHATSAPP_MESSAGE"
        : upper(plan.creative.call_to_action || "LEARN_MORE"),
    },
    ad: {
      name: `${campaignName} - Ad`,
    },
  };
}

export default translateMetaCampaignPlan;

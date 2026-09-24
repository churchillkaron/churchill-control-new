export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeDirectorRuntime } from "@/lib/creative/director/runtime/CreativeDirectorRuntime";
import { marketingCampaignCapabilities } from "@/lib/marketing/security/marketingCampaignAccess";
import { MarketingCampaignReadinessRuntime } from "@/lib/marketing/campaigns/MarketingCampaignReadinessRuntime";
import { getMarketingChannel } from "@/lib/marketing/campaigns/MarketingChannelCatalog";
import { getMarketingCampaignAdapter } from "@/lib/marketing/campaigns/adapters/MarketingCampaignAdapterRegistry";
import { campaignPlanFingerprint } from "@/lib/marketing/campaigns/CampaignPlanFingerprint";
import { resolveOrganizationTimeContext, zonedDateTimeToUtc } from "@/lib/shared/time/organizationTime";

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
function campaignSchedule(input = {}) {
  const timezone = text(input.organizationTimezone || input.timezone || "UTC") || "UTC";
  const start = input.startDate
    ? zonedDateTimeToUtc({ date: input.startDate, time: "00:00:00", timezone })
    : null;
  const end = input.endDate
    ? zonedDateTimeToUtc({ date: input.endDate, time: "23:59:59", timezone })
    : null;
  return {
    timezone,
    local_start_date: text(input.startDate) || null,
    local_end_date: text(input.endDate) || null,
    start_time: start?.toISOString() || null,
    end_time: end?.toISOString() || null,
  };
}


function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function errorResponse(error, fallback = "Marketing command failed") {
  const status = Number(error?.status || 500);
  return NextResponse.json(
    {
      success: false,
      error: error?.message || fallback,
      code: error?.code || null,
      details: error?.details || null,
    },
    { status },
  );
}

function forbidden(message) {
  const error = new Error(message);
  error.status = 403;
  return error;
}

async function requireAccess({ organizationId, request, permissions = null }) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    ...(permissions?.length ? { requiredAnyPermission: permissions } : {}),
  });

  if (!access.success) {
    const error = new Error(access.error || "Organization access denied");
    error.status = access.status || 403;
    throw error;
  }

  return access;
}

async function accessibleOrganizations(access, request) {
  const staffAccountId = access.access?.staffAccountId || access.staff?.id || null;
  if (!staffAccountId) return [];

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("organization_users")
    .select("organization_id,status")
    .eq("staff_account_id", staffAccountId)
    .limit(1000);

  if (membershipError) throw membershipError;

  const ids = [
    ...new Set(
      (memberships || [])
        .filter((row) => !["inactive", "disabled", "suspended", "revoked"].includes(
          String(row.status || "").toLowerCase(),
        ))
        .map((row) => row.organization_id)
        .filter(Boolean),
    ),
  ];

  if (!ids.includes(access.organizationId)) ids.unshift(access.organizationId);

  const verified = [];
  for (const organizationId of ids) {
    const candidate = await requireOrganizationAccess({ organizationId, request });
    if (candidate.success) verified.push(organizationId);
  }

  if (!verified.length) return [];

  const { data: organizations, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("id,name,organization_type,status,industry")
    .in("id", verified)
    .order("name", { ascending: true });

  if (organizationError) throw organizationError;
  return organizations || [];
}


const CAMPAIGN_SURFACE_CHANNELS = Object.freeze({
  facebook: { channel: "organic_social", network: "facebook" },
  instagram: { channel: "organic_social", network: "instagram" },
  messenger: { channel: "meta", network: "messenger", planning_only: true },
  threads: { channel: "organic_social", network: "threads" },
  tiktok: { channel: "organic_social", network: "tiktok" },
  youtube: { channel: "organic_social", network: "youtube" },
  linkedin: { channel: "organic_social", network: "linkedin" },
  x: { channel: "organic_social", network: "x" },
  pinterest: { channel: "organic_social", network: "pinterest" },
  whatsapp: { channel: "whatsapp", network: "whatsapp" },
  line: { channel: "line", network: "line" },
  telegram: { channel: "telegram", network: "telegram" },
  email: { channel: "email", network: "email" },
  sms: { channel: "sms", network: "sms" },
  push: { channel: "push", network: "web_push" },
  google_business: { channel: "organic_social", network: "google_business" },
  tripadvisor: { channel: "local_discovery", network: "tripadvisor" },
  meta_ads: { channel: "meta", network: null },
  google_ads: { channel: "google_ads", network: "search" },
  tiktok_ads: { channel: "tiktok_ads", network: "tiktok" },
  linkedin_ads: { channel: "linkedin_ads", network: "linkedin" },
  x_ads: { channel: "x_ads", network: "x" },
  line_ads: { channel: "line_ads", network: "line" },
  microsoft_ads: { channel: "microsoft_ads", network: "bing" },
  pinterest_ads: { channel: "pinterest_ads", network: "pinterest" },
  snapchat_ads: { channel: "snapchat_ads", network: "snapchat" },
  reddit_ads: { channel: "reddit_ads", network: "reddit" },
  amazon_ads: { channel: "amazon_ads", network: "sponsored_products" },
  apple_search_ads: { channel: "apple_search_ads", network: "app_store" },
  programmatic: { channel: "programmatic", network: "display" },
  marketplaces: { channel: "commerce_marketplaces", network: null },
  partnerships_offline: { channel: "partnerships_offline", network: null },
});

function normalizeCampaignChannels(values = []) {
  const surfaces = [...new Set(list(values).map((value) => text(value).toLowerCase()).filter(Boolean))];
  const channels = [];
  const networks = {};
  const planningOnly = [];

  for (const surface of surfaces) {
    const mapping = CAMPAIGN_SURFACE_CHANNELS[surface];
    if (!mapping) {
      const error = new Error(`Unsupported campaign channel: ${surface}`);
      error.status = 400;
      throw error;
    }
    if (!channels.includes(mapping.channel)) channels.push(mapping.channel);
    if (mapping.network) {
      networks[mapping.channel] = [...new Set([...(networks[mapping.channel] || []), mapping.network])];
    }
    const catalog = getMarketingChannel(mapping.channel);
    const runtimeExecutable = ["ACTIVE", "ACTIVE_IF_CONFIGURED"].includes(String(catalog?.runtime_status || "").toUpperCase());
    const networkSupported = !mapping.network || Boolean(catalog?.networks?.includes(mapping.network));
    const adapter = getMarketingCampaignAdapter(mapping.channel);
    const campaignExecutable = Boolean(adapter && adapter.status === "ACTIVE");
    const adapterNetworkSupported = !mapping.network || !Array.isArray(adapter?.networks) || !adapter.networks.length || adapter.networks.includes(mapping.network);
    if (mapping.planning_only || !runtimeExecutable || !networkSupported || !campaignExecutable || !adapterNetworkSupported) planningOnly.push(surface);
  }

  return { surfaces, channels, networks, planningOnly: [...new Set(planningOnly)] };
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function organizationSpecificChannelSetting(key) {
  return key.endsWith("AssetId") ||
    key === "recipientPartyIds" ||
    ["authorizedBudget", "dailyBudget", "bidCap", "costCap", "plannedBudget"].includes(key);
}

function channelSettingsForOrganization(input = {}, organizationId, multiOrganization = false) {
  const common = object(input.channelSettings);
  const specific = object(object(input.organizationChannelSettings)[organizationId]);
  const merged = {};
  const channelIds = new Set([...Object.keys(common), ...Object.keys(specific)]);

  for (const channelId of channelIds) {
    const commonSettings = { ...object(common[channelId]) };
    if (multiOrganization) {
      for (const key of Object.keys(commonSettings)) {
        if (organizationSpecificChannelSetting(key)) delete commonSettings[key];
      }
    }
    merged[channelId] = {
      ...commonSettings,
      ...object(specific[channelId]),
    };
  }

  return merged;
}

const CHANNEL_ASSET_REQUIREMENTS = Object.freeze({
  facebook: { accountAssetId: [["meta", "facebook_page"]] },
  instagram: { accountAssetId: [["meta", "instagram_business"]] },
  messenger: { senderAssetId: [["meta", "facebook_page"]] },
  threads: { accountAssetId: [["threads", "threads_profile"]] },
  tiktok: { accountAssetId: [["tiktok", "tiktok_account"]] },
  youtube: { accountAssetId: [["youtube", "youtube_channel"]] },
  linkedin: { accountAssetId: [["linkedin", "linkedin_identity"]] },
  x: { accountAssetId: [["x", "x_account"]] },
  pinterest: { accountAssetId: [["pinterest", "pinterest_account"]] },
  whatsapp: { senderAssetId: [["whatsapp", "whatsapp_phone_number"]] },
  line: { senderAssetId: [["line", "line_official_account"], ["line", "line_account"]] },
  telegram: { senderAssetId: [["telegram", "telegram_bot"]] },
  email: { senderAssetId: [["email_google", "business_mailbox"], ["email_microsoft", "business_mailbox"], ["email", "business_mailbox"]] },
  sms: { senderAssetId: [["sms", "sms_sender"]] },
  google_business: { locationAssetId: [["google", "google_business_location"]] },
  tripadvisor: { locationAssetId: [["tripadvisor", "tripadvisor_location"]] },
  google_ads: { accountAssetId: [["google_ads", "google_ads_customer"]] },
  meta_ads: {
    pageAssetId: [["meta", "facebook_page"]],
    instagramAssetId: [["meta", "instagram_business"]],
    whatsappAssetId: [["whatsapp", "whatsapp_phone_number"]],
  },
});

function assetReferences(input = {}) {
  const settings = selectedChannelSettings(input);
  const references = [];
  for (const [channelId, channelSettings] of Object.entries(settings)) {
    if (!channelSettings || typeof channelSettings !== "object") continue;
    for (const [key, value] of Object.entries(channelSettings)) {
      if (!key.endsWith("AssetId")) continue;
      if (!CHANNEL_ASSET_REQUIREMENTS[channelId]?.[key]) continue;
      const id = text(value);
      if (id) references.push({ channelId, key, id });
    }
  }
  return references;
}

function selectedChannelSettings(input = {}) {
  const selected = new Set(list(input.channels).map((value) => text(value).toLowerCase()).filter(Boolean));
  const settings = object(input.channelSettings);
  return Object.fromEntries(
    Object.entries(settings).filter(([channelId]) => selected.has(text(channelId).toLowerCase())),
  );
}

function selectedChannelAssetIds(input = {}) {
  return [...new Set(assetReferences(input).map((reference) => reference.id))];
}

async function resolveSelectedChannelAssets({ organizationId, input }) {
  const ids = selectedChannelAssetIds(input);
  if (!ids.length) return {};

  const { data, error } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,channel_provider,asset_type,name,external_id,entity_id,metadata")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) throw error;

  const rows = data || [];
  if (rows.length !== ids.length) {
    const found = new Set(rows.map((row) => row.id));
    const missing = ids.filter((id) => !found.has(id));
    const error = new Error(`One or more selected channel assets are not available for this organization: ${missing.join(", ")}`);
    error.status = 400;
    throw error;
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const reference of assetReferences(input)) {
    const requirements = CHANNEL_ASSET_REQUIREMENTS[reference.channelId]?.[reference.key];
    if (!requirements?.length) continue;
    const asset = byId.get(reference.id);
    const compatible = requirements.some(([provider, assetType]) =>
      text(asset?.channel_provider).toLowerCase() === provider &&
      (!assetType || asset?.asset_type === assetType),
    );
    if (!compatible) {
      const error = new Error(`Selected ${reference.key.replace(/AssetId$/, "")} is not valid for ${reference.channelId}`);
      error.status = 400;
      throw error;
    }
  }

  return Object.fromEntries(rows.map((row) => [row.id, {
    id: row.id,
    provider: row.channel_provider || null,
    asset_type: row.asset_type || null,
    name: row.name || row.external_id || row.asset_type || "Channel asset",
    external_id: row.external_id || null,
    entity_id: row.entity_id || null,
    metadata: {
      manager: row.metadata?.manager === true,
      currency_code: text(row.metadata?.currency_code).toUpperCase() || null,
      customer_id: text(row.metadata?.customer_id) || null,
      time_zone: text(row.metadata?.time_zone || row.metadata?.timezone) || null,
      login_customer_id: text(row.metadata?.login_customer_id) || null,
      facebook_page_id: text(row.metadata?.facebook_page_id || row.metadata?.page_id) || null,
      instagram_business_id: text(row.metadata?.instagram_business_id) || null,
      instagram_username: text(row.metadata?.instagram_username) || null,
    },
  }]));
}

function campaignChannelReadinessSnapshot(channelPlan, readiness = {}) {
  const readyById = new Map((readiness.channels || []).map((channel) => [channel.id, channel]));
  return channelPlan.surfaces.map((surface) => {
    const mapping = CAMPAIGN_SURFACE_CHANNELS[surface];
    const row = mapping ? readyById.get(mapping.channel) : null;
    const planningOnly = channelPlan.planningOnly.includes(surface) || row?.readiness_state === "PLANNING_ONLY";
    const networkReady = !mapping?.network || (row?.available_networks || []).includes(mapping.network);
    const ready = Boolean(!planningOnly && row?.available && networkReady);
    return {
      surface,
      channel: mapping?.channel || null,
      network: mapping?.network || null,
      state: planningOnly
        ? "PLANNING_ONLY"
        : ready
          ? "READY"
          : "SETUP_REQUIRED",
      reasons: planningOnly
        ? [...(row?.reasons?.length ? row.reasons : ["Execution adapter is not available for this campaign surface"])]
        : ready
          ? []
          : [...(row?.reasons || ["Channel setup is required before execution"])],
    };
  });
}

function csv(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return String(value || "").split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
}

function providerLocations(settings, prefix = "included") {
  const rows = [];
  for (const country of csv(settings[`${prefix}Countries`])) rows.push({ type: "country", country_code: country.toUpperCase() });
  for (const id of csv(settings[`${prefix}RegionIds`])) rows.push({ type: "region", id });
  for (const id of csv(settings[`${prefix}CityIds`])) rows.push({ type: "city", id });
  for (const id of csv(settings[`${prefix}PostalIds`])) rows.push({ type: "postal_code", id });
  if (prefix === "included" && settings.radiusLatitude && settings.radiusLongitude && settings.radius) {
    rows.push({
      type: "radius",
      latitude: Number(settings.radiusLatitude),
      longitude: Number(settings.radiusLongitude),
      radius: Number(settings.radius),
      radius_unit: text(settings.radiusUnit || "kilometer").toLowerCase(),
    });
  }
  return rows;
}

function lines(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return String(value || "").split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

function paidExecutionSurfaces(channelPlan = {}) {
  return (channelPlan.surfaces || []).filter((surface) => ["meta_ads", "google_ads"].includes(surface));
}

function providerAuthorizedBudget(input, channelPlan, settings, surface) {
  const explicit = amount(settings?.authorizedBudget);
  if (explicit > 0) return explicit;
  return paidExecutionSurfaces(channelPlan).length === 1 ? amount(input.organizationBudget) : 0;
}

function validatePaidBudgetAllocations(input = {}) {
  const channelPlan = normalizeCampaignChannels(input.channels);
  const paid = paidExecutionSurfaces(channelPlan);
  if (!paid.length) return;

  const total = amount(input.organizationBudget);
  if (!(total > 0)) {
    const error = new Error("Paid media requires a positive Campaign Budget");
    error.status = 400;
    throw error;
  }

  const settings = selectedChannelSettings(input);
  const allocations = paid.map((surface) => ({
    surface,
    amount: amount(settings[surface]?.authorizedBudget),
  }));

  if (paid.length > 1) {
    const missing = allocations.filter((item) => !(item.amount > 0));
    if (missing.length) {
      const error = new Error(`Explicit provider budget allocations are required for: ${missing.map((item) => item.surface).join(", ")}`);
      error.status = 400;
      throw error;
    }
  }

  const resolved = allocations.map((item) => ({
    ...item,
    resolved: item.amount > 0 ? item.amount : total,
  }));
  const allocated = resolved.reduce((sum, item) => sum + item.resolved, 0);
  if (allocated > total) {
    const error = new Error(`Paid-media provider allocations cannot exceed the Campaign Budget: ${allocated}:${total}`);
    error.status = 400;
    throw error;
  }
}

function safeTargetObjects(value) {
  return Array.isArray(value)
    ? value
        .filter((item) => item && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          id: text(item.id),
          name: text(item.name) || null,
          resource_name: text(item.resource_name || item.resourceName) || null,
          country_code: text(item.country_code).toUpperCase() || null,
          target_type: text(item.target_type) || null,
          code: text(item.code) || null,
        }))
        .filter((item) => item.id)
    : [];
}

function googleKeywordEntries(settings = {}) {
  return [
    ...lines(settings.exactKeywords).map((keyword) => ({ text: keyword, match_type: "EXACT" })),
    ...lines(settings.phraseKeywords).map((keyword) => ({ text: keyword, match_type: "PHRASE" })),
    ...lines(settings.broadKeywords).map((keyword) => ({ text: keyword, match_type: "BROAD" })),
  ];
}

function googleNegativeKeywordEntries(settings = {}) {
  return lines(settings.negativeKeywords).map((keyword) => ({ text: keyword, match_type: "PHRASE" }));
}

function googleAdsExecutionPlanSnapshot(input, channelPlan, channelAssets = {}) {
  if (!channelPlan.surfaces.includes("google_ads")) return null;
  const settings = object(selectedChannelSettings(input).google_ads);
  const selectedAccount = channelAssets[text(settings.accountAssetId)] || null;
  return {
    version: "UNIVERSAL_CAMPAIGN_PLAN_V1",
    name: text(input.name),
    goal: text(input.objective).toUpperCase() || "TRAFFIC",
    audience: {
      included_locations: safeTargetObjects(settings.includedLocations).map((item) => ({
        type: "google_geo",
        id: item.id,
        name: item.name,
        country_code: item.country_code,
      })),
      excluded_locations: safeTargetObjects(settings.excludedLocations).map((item) => ({
        type: "google_geo",
        id: item.id,
        name: item.name,
        country_code: item.country_code,
      })),
      location_presence: "living_or_recent",
      age_min: 18,
      age_max: 65,
      genders: [],
      languages: safeTargetObjects(settings.languages).map((item) => ({ id: item.id, name: item.name, code: item.code })),
      interests: [],
      behaviors: [],
      keywords: googleKeywordEntries(settings),
      negative_keywords: googleNegativeKeywordEntries(settings),
      custom_audience_ids: [],
      excluded_audience_ids: [],
      lookalike_audience_ids: [],
      retargeting: {},
      expansion_enabled: true,
    },
    budget: {
      amount: providerAuthorizedBudget(input, channelPlan, settings, "google_ads"),
      currency: text(input.currencyCode).toUpperCase(),
      mode: "daily_with_total_authorization",
      allocation: [],
      daily_amount: settings.dailyBudget ? Number(settings.dailyBudget) : null,
      bid_strategy: "lowest_cost",
      bid_cap: null,
      cost_cap: null,
    },
    schedule: {
      ...campaignSchedule(input),
      dayparts: [],
    },
    creative: {
      asset_ids: creativeAssetIds,
      exact_asset_required: creativeAssetIds.length > 0,
      primary_text: "",
      headline: "",
      headlines: lines(settings.headlines),
      description: "",
      descriptions: lines(settings.descriptions),
      destination_url: text(settings.landingPage) || null,
      call_to_action: "LEARN_MORE",
      utm_parameters: {
        source: text(settings.utmSource) || null,
        medium: text(settings.utmMedium) || null,
        campaign: text(settings.utmCampaign) || null,
        term: text(settings.utmTerm) || null,
        content: text(settings.utmContent) || null,
      },
      language_variants: [],
      placement_variants: [],
    },
    channels: [{
      channel_id: "google_ads",
      networks: ["search"],
      destination: "WEBSITE",
      objective: null,
      optimization_goal: null,
      billing_event: null,
      placements: [],
      conversion_event: null,
      tracking: {},
      provider_settings: {
        account_asset_id: text(settings.accountAssetId) || null,
        daily_budget: settings.dailyBudget ? Number(settings.dailyBudget) : null,
        ad_group_name: text(settings.adGroupName) || null,
        search_partners: settings.searchPartners === true,
        login_customer_id: text(selectedAccount?.metadata?.login_customer_id) || null,
      },
    }],
    ai: { generated: false, rationale: [], assumptions: [], warnings: [], confidence: null },
    approval: { required: true, approved: false, approved_by: null, approved_at: null, source: null },
  };
}

function organicSocialExecutionPlanSnapshot(input, channelPlan) {
  if (!channelPlan.channels.includes("organic_social")) return null;
  const executableSurfaces = (channelPlan.surfaces || []).filter((surface) =>
    ["facebook", "instagram", "pinterest", "youtube", "linkedin", "threads", "tiktok", "x", "google_business"].includes(surface) && !channelPlan.planningOnly.includes(surface),
  );
  if (!executableSurfaces.length) return null;
  const settings = selectedChannelSettings(input);
  const networkSettings = Object.fromEntries(executableSurfaces.map((surface) => {
    const row = object(settings[surface]);
    return [surface, {
      account_asset_id: text(surface === "google_business" ? row.locationAssetId : row.accountAssetId) || null,
      creative_asset_id: text(row.creativeAssetId) || null,
      alt_text: text(row.altText) || null,
      reply_control: text(row.replyControl) || null,
      topic_tag: text(row.topicTag) || null,
      is_spoiler_media: row.isSpoilerMedia === true,
      language_code: text(row.languageCode) || null,
      call_to_action_type: text(row.callToActionType) || null,
      privacy_level: text(row.privacyLevel) || null,
      creator_consent: row.creatorConsent === true,
      disable_duet: row.disableDuet === true,
      disable_comment: row.disableComment === true,
      disable_stitch: row.disableStitch === true,
      brand_organic_toggle: row.brandOrganicToggle === true,
      is_aigc: row.isAigc === true,
      board_id: text(row.boardId) || null,
      title: text(row.title) || null,
      description: text(row.description) || null,
      privacy_status: text(row.privacyStatus) || null,
      tags: list(row.tags),
      category_id: text(row.categoryId) || null,
      made_for_kids: row.madeForKids === true,
      message: text(row.message || input.coreMessage) || null,
      destination_url: text(row.destinationUrl) || null,
    }];
  }));
  const creativeAssetIds = [...new Set(Object.values(networkSettings).map((row) => row.creative_asset_id).filter(Boolean))];
  return {
    version: "UNIVERSAL_CAMPAIGN_PLAN_V1",
    name: text(input.name),
    goal: text(input.objective).toUpperCase() || "ENGAGEMENT",
    audience: {
      included_locations: [],
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
      expansion_enabled: false,
    },
    budget: {
      amount: 0,
      currency: text(input.currencyCode).toUpperCase(),
      mode: "none",
      allocation: [],
      daily_amount: null,
      bid_strategy: "none",
      bid_cap: null,
      cost_cap: null,
    },
    schedule: {
      ...campaignSchedule(input),
      dayparts: [],
    },
    creative: {
      asset_ids: [],
      exact_asset_required: false,
      primary_text: text(input.coreMessage),
      headline: "",
      headlines: [],
      description: "",
      descriptions: [],
      destination_url: null,
      call_to_action: text(input.primaryCta || "LEARN_MORE").toUpperCase(),
      utm_parameters: {},
      language_variants: [],
      placement_variants: [],
    },
    channels: [{
      channel_id: "organic_social",
      networks: executableSurfaces,
      destination: "ENGAGEMENT",
      objective: null,
      optimization_goal: null,
      billing_event: null,
      placements: [],
      conversion_event: null,
      tracking: {},
      provider_settings: { network_settings: networkSettings },
    }],
    ai: { generated: false, rationale: [], assumptions: [], warnings: [], confidence: null },
    approval: { required: true, approved: false, approved_by: null, approved_at: null, source: null },
  };
}

function ownedMessagingPlannedExecutionPlans(input, channelPlan) {
  const surfaces = ["email", "whatsapp", "line", "telegram", "sms"].filter((surface) =>
    (channelPlan.surfaces || []).includes(surface),
  );
  if (!surfaces.length) return {};
  const settings = selectedChannelSettings(input);
  return Object.fromEntries(surfaces.map((surface) => {
    const row = object(settings[surface]);
    const recipientPartyIds = Array.isArray(row.recipientPartyIds)
      ? [...new Set(row.recipientPartyIds.map(text).filter(Boolean))]
      : [];
    const plan = {
      version: "UNIVERSAL_CAMPAIGN_PLAN_V1",
      name: text(input.name),
      goal: text(input.objective).toUpperCase() || "ENGAGEMENT",
      audience: {
        included_locations: [],
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
        expansion_enabled: false,
      },
      budget: {
        amount: 0,
        currency: text(input.currencyCode).toUpperCase(),
        mode: "none",
        allocation: [],
        daily_amount: null,
        bid_strategy: "none",
        bid_cap: null,
        cost_cap: null,
      },
      schedule: {
        ...campaignSchedule(input),
        dayparts: [],
      },
      creative: {
        asset_ids: [],
        exact_asset_required: false,
        primary_text: text(row.messageVariant || row.message || input.coreMessage),
        headline: surface === "email" ? text(row.subject) : "",
        headlines: [],
        description: surface === "email" ? text(row.previewText) : "",
        descriptions: [],
        destination_url: text(row.destinationUrl) || null,
        call_to_action: text(input.primaryCta || "LEARN_MORE").toUpperCase(),
        utm_parameters: {},
        language_variants: [],
        placement_variants: [],
      },
      channels: [{
        channel_id: surface,
        networks: [surface],
        destination: surface === "email" ? "REPLY" : "CONVERSATION",
        objective: null,
        optimization_goal: null,
        billing_event: null,
        placements: [],
        conversion_event: null,
        tracking: {},
        provider_settings: {
          sender_asset_id: text(row.senderAssetId) || null,
          recipient_party_ids: recipientPartyIds,
          subject: surface === "email" ? text(row.subject) || null : null,
          message: text(row.messageVariant || row.message || input.coreMessage) || null,
          destination_url: text(row.destinationUrl) || null,
          frequency_cap: Number(row.frequencyCap || 1),
          template_name: surface === "whatsapp" ? text(row.templateName || row.template) || null : null,
          template_language: surface === "whatsapp" ? text(row.templateLanguage || "en") || null : null,
          template_components: surface === "whatsapp" && Array.isArray(row.templateComponents) ? row.templateComponents : [],
          template_parameter_count: surface === "whatsapp" ? Number(row.templateParameterCount || 0) : 0,
          template_unsupported_variables: surface === "whatsapp" ? row.templateUnsupportedVariables === true : false,
        },
      }],
      ai: { generated: false, rationale: [], assumptions: [], warnings: ["OWNED_MESSAGING_EXECUTION_NOT_ACTIVATED"], confidence: null },
      approval: { required: true, approved: false, approved_by: null, approved_at: null, source: null },
    };
    return [surface, plan];
  }));
}

function metaExecutionPlanSnapshot(input, channelPlan) {
  if (!channelPlan.surfaces.includes("meta_ads")) return null;
  const settings = object(selectedChannelSettings(input).meta_ads);
  const assetId = text(settings.creativeAssetId || settings.assetId);
  return {
    version: "UNIVERSAL_CAMPAIGN_PLAN_V1",
    name: text(input.name),
    goal: text(input.objective).toUpperCase() || "AWARENESS",
    audience: {
      included_locations: providerLocations(settings, "included"),
      excluded_locations: providerLocations(settings, "excluded"),
      location_presence: "living_or_recent",
      age_min: Number(settings.ageMin || 18),
      age_max: Number(settings.ageMax || 65),
      genders: csv(settings.genders),
      languages: csv(settings.languageIds),
      interests: csv(settings.interestIds),
      behaviors: csv(settings.behaviorIds),
      keywords: [],
      negative_keywords: [],
      custom_audience_ids: csv(settings.customAudienceIds),
      excluded_audience_ids: csv(settings.excludedAudienceIds),
      lookalike_audience_ids: csv(settings.lookalikeAudienceIds),
      retargeting: {},
      expansion_enabled: true,
    },
    budget: {
      amount: providerAuthorizedBudget(input, channelPlan, settings, "meta_ads"),
      currency: text(input.currencyCode).toUpperCase(),
      mode: text(settings.budgetMode || "lifetime").toLowerCase(),
      allocation: [],
      daily_amount: settings.dailyBudget ? Number(settings.dailyBudget) : null,
      bid_strategy: text(settings.bidStrategy || "lowest_cost"),
      bid_cap: settings.bidCap ? Number(settings.bidCap) : null,
      cost_cap: settings.costCap ? Number(settings.costCap) : null,
    },
    schedule: {
      ...campaignSchedule(input),
      dayparts: [],
    },
    creative: {
      asset_ids: assetId ? [assetId] : [],
      exact_asset_required: true,
      primary_text: text(settings.primaryText || input.coreMessage),
      headline: text(settings.headline),
      headlines: [],
      description: text(settings.description),
      descriptions: [],
      destination_url: text(settings.destinationUrl) || null,
      call_to_action: text(settings.callToAction || input.primaryCta || "LEARN_MORE").toUpperCase(),
      utm_parameters: {
        source: text(settings.utmSource) || null,
        medium: text(settings.utmMedium) || null,
        campaign: text(settings.utmCampaign) || null,
        content: text(settings.utmContent) || null,
      },
      language_variants: [],
      placement_variants: [],
    },
    channels: [{
      channel_id: "meta",
      networks: csv(settings.networks).map((value) => value.toLowerCase()),
      destination: text(settings.destination || "ENGAGEMENT").toUpperCase(),
      objective: text(settings.objective).toUpperCase() || null,
      optimization_goal: text(settings.optimizationGoal).toUpperCase() || null,
      billing_event: text(settings.billingEvent || "IMPRESSIONS").toUpperCase(),
      placements: [],
      conversion_event: text(settings.conversionEvent).toUpperCase() || null,
      tracking: {},
      provider_settings: {
        page_asset_id: text(settings.pageAssetId) || null,
        instagram_asset_id: text(settings.instagramAssetId) || null,
        whatsapp_asset_id: text(settings.whatsappAssetId) || null,
        pixel_id: text(settings.pixelId) || null,
        special_ad_categories: csv(settings.specialAdCategories).map((value) => value.toUpperCase()),
        facebook_positions: csv(settings.facebookPositions).map((value) => value.toLowerCase()),
        instagram_positions: csv(settings.instagramPositions).map((value) => value.toLowerCase()),
        device_platforms: csv(settings.devicePlatforms).map((value) => value.toLowerCase()),
      },
    }],
    ai: { generated: false, rationale: [], assumptions: [], warnings: [], confidence: null },
    approval: { required: true, approved: false, approved_by: null, approved_at: null, source: null },
  };
}

function channelPlanIncludesSurface(input = {}, surface) {
  return list(input.channels).map((value) => text(value).toLowerCase()).includes(text(surface).toLowerCase());
}

function validateExecutionAssetReadiness({ input, channelAssets = {}, readiness = {} }) {
  const settings = selectedChannelSettings(input);
  const metaCreativeId = text(settings.meta_ads?.creativeAssetId || settings.meta_ads?.assetId);
  if (metaCreativeId) {
    const creative = (readiness.creative_assets || []).find((asset) => text(asset.id) === metaCreativeId) || null;
    if (!creative) {
      const error = new Error("Selected Meta creative is not available for this organization");
      error.status = 400;
      throw error;
    }
    if (creative.approval_status !== "APPROVED") {
      const error = new Error("Selected Meta creative must be approved before it can be stored as executable media");
      error.status = 400;
      throw error;
    }
    if (creative.source_available !== true) {
      const error = new Error("Selected Meta creative does not have an executable source asset");
      error.status = 400;
      throw error;
    }
    if (text(creative.media_kind).toUpperCase() !== "IMAGE") {
      const error = new Error("The current managed Meta Ads adapter requires an approved image creative");
      error.status = 400;
      throw error;
    }
  }

  const metaPageAssetId = text(settings.meta_ads?.pageAssetId);
  const metaInstagramAssetId = text(settings.meta_ads?.instagramAssetId);
  const metaWhatsAppAssetId = text(settings.meta_ads?.whatsappAssetId);
  const metaDestination = text(settings.meta_ads?.destination || "ENGAGEMENT").toUpperCase();
  const metaNetworks = csv(settings.meta_ads?.networks).map((value) => value.toLowerCase());
  if (channelPlanIncludesSurface(input, "meta_ads")) {
    const pageAsset = metaPageAssetId ? channelAssets[metaPageAssetId] : null;
    const instagramAsset = metaInstagramAssetId ? channelAssets[metaInstagramAssetId] : null;
    if (metaPageAssetId && (!pageAsset || pageAsset.provider !== "meta" || pageAsset.asset_type !== "facebook_page")) {
      const error = new Error("Selected Meta Facebook Page is not valid for this organization");
      error.status = 400;
      throw error;
    }
    if (metaInstagramAssetId && (!instagramAsset || instagramAsset.provider !== "meta" || instagramAsset.asset_type !== "instagram_business")) {
      const error = new Error("Selected Instagram identity is not valid for this organization");
      error.status = 400;
      throw error;
    }
    if (metaInstagramAssetId && !metaPageAssetId) {
      const error = new Error("Select the Facebook Page linked to the selected Instagram identity");
      error.status = 400;
      throw error;
    }
    if (pageAsset && instagramAsset) {
      const linkedPageId = text(instagramAsset.metadata?.facebook_page_id);
      if (!linkedPageId || linkedPageId !== text(pageAsset.external_id)) {
        const error = new Error("Selected Instagram identity is not linked to the selected Facebook Page");
        error.status = 400;
        throw error;
      }
    }
    if (metaWhatsAppAssetId) {
      const whatsappAsset = channelAssets[metaWhatsAppAssetId];
      if (!whatsappAsset || whatsappAsset.provider !== "whatsapp" || whatsappAsset.asset_type !== "whatsapp_phone_number") {
        const error = new Error("Selected WhatsApp destination is not valid for this organization");
        error.status = 400;
        throw error;
      }
    }
    if (metaDestination !== "WHATSAPP" && metaWhatsAppAssetId) {
      const error = new Error("WhatsApp destination asset can only be used with WHATSAPP destination");
      error.status = 400;
      throw error;
    }
    // Missing Page/Instagram/WhatsApp identities remain valid for a draft plan. The Meta
    // translator hard-blocks provider preflight/execution until they are exact.
    void metaNetworks;
  }

  const googleAccountId = text(settings.google_ads?.accountAssetId);
  if (googleAccountId) {
    const asset = channelAssets[googleAccountId];
    const walletCurrency = text(readiness.wallet?.currency).toUpperCase();
    const accountCurrency = text(asset?.metadata?.currency_code).toUpperCase();
    if (!asset?.entity_id) {
      const error = new Error("Google Ads spending account must be mapped to an Avantiqo entity");
      error.status = 400;
      throw error;
    }
    if (asset?.metadata?.manager === true) {
      const error = new Error("Google Ads manager accounts cannot be used as campaign spending accounts");
      error.status = 400;
      throw error;
    }
    if (!accountCurrency) {
      const error = new Error("Google Ads account currency must be confirmed before campaign execution");
      error.status = 400;
      throw error;
    }
    if (walletCurrency && accountCurrency !== walletCurrency) {
      const error = new Error(`Google Ads account currency must match the organization wallet: ${accountCurrency}:${walletCurrency}`);
      error.status = 400;
      throw error;
    }
    const accountTimezone = text(asset?.metadata?.time_zone);
    const organizationTimezone = text(input.organizationTimezone);
    if (!accountTimezone) {
      const error = new Error("Google Ads account timezone must be confirmed before campaign execution");
      error.status = 400;
      throw error;
    }
    if (organizationTimezone && accountTimezone !== organizationTimezone) {
      const error = new Error(`Google Ads account timezone must match the organization timezone: ${accountTimezone}:${organizationTimezone}`);
      error.status = 400;
      throw error;
    }
  }
}

function selectedCreativeAssetSnapshots(input = {}, readiness = {}) {
  const settings = selectedChannelSettings(input);
  const ids = [
    text(settings.meta_ads?.creativeAssetId || settings.meta_ads?.assetId),
  ].filter(Boolean);
  if (!ids.length) return {};
  const byId = new Map((readiness.creative_assets || []).map((asset) => [text(asset.id), asset]));
  return Object.fromEntries(ids.map((id) => {
    const asset = byId.get(id);
    if (!asset) return [id, { id, name: "Creative asset", approval_status: null, media_kind: null }];
    return [id, {
      id,
      name: asset.name || "Creative asset",
      approval_status: asset.approval_status || null,
      media_kind: asset.media_kind || null,
      source_available: asset.source_available === true,
    }];
  }));
}

function campaignContent(input = {}, channelAssets = {}, readiness = {}) {
  const channelPlan = normalizeCampaignChannels(input.channels);
  const audienceSegments = list(input.audienceSegments);
  const readinessSnapshot = campaignChannelReadinessSnapshot(channelPlan, readiness);
  const setupRequired = readinessSnapshot.some((item) => item.state === "SETUP_REQUIRED");
  const metaPlan = metaExecutionPlanSnapshot(input, channelPlan);
  const googleAdsPlan = googleAdsExecutionPlanSnapshot(input, channelPlan, channelAssets);
  const organicSocialPlan = organicSocialExecutionPlanSnapshot(input, channelPlan);
  const plannedOwnedMessagingPlans = ownedMessagingPlannedExecutionPlans(input, channelPlan);
  const executionPlans = {
    ...(metaPlan ? { meta: metaPlan } : {}),
    ...(googleAdsPlan ? { google_ads: googleAdsPlan } : {}),
    ...(organicSocialPlan ? { organic_social: organicSocialPlan } : {}),
  };
  const executionPlanFingerprints = Object.fromEntries(
    Object.entries(executionPlans).map(([provider, plan]) => [provider, campaignPlanFingerprint(plan)]),
  );
  const creativeAssetSnapshots = selectedCreativeAssetSnapshots(input, readiness);

  return {
    spend_state: "planned_not_authorized",
    goal: text(input.objective),
    offer: text(input.offer),
    primary_cta: text(input.primaryCta),
    core_message: text(input.coreMessage),
    channels: channelPlan.channels,
    channel_surfaces: channelPlan.surfaces,
    channel_networks: channelPlan.networks,
    planning_only_surfaces: channelPlan.planningOnly,
    channel_settings: selectedChannelSettings(input),
    channel_setting_assets: channelAssets,
    creative_asset_snapshots: creativeAssetSnapshots,
    channel_readiness_snapshot: readinessSnapshot,
    execution_plan_snapshots: executionPlans,
    execution_plan_fingerprints: executionPlanFingerprints,
    planned_execution_plan_snapshots: plannedOwnedMessagingPlans,
    planned_execution_plan_fingerprints: Object.fromEntries(
      Object.entries(plannedOwnedMessagingPlans).map(([provider, plan]) => [provider, campaignPlanFingerprint(plan)]),
    ),
    currency_code: text(input.currencyCode).toUpperCase() || null,
    campaign_budget: amount(input.organizationBudget),
    monthly_budget: amount(input.organizationBudget),
    ...(text(input.currencyCode).toUpperCase() === "THB" ? {
      campaign_budget_thb: amount(input.organizationBudget),
      monthly_budget_thb: amount(input.organizationBudget),
    } : {}),
    budget_semantics: "campaign_total_authorization",
    period: {
      start: text(input.startDate) || null,
      end: text(input.endDate) || null,
      timezone: campaignSchedule(input).timezone,
      days: input.startDate && input.endDate
        ? Math.max(1, Math.ceil((new Date(`${input.endDate}T00:00:00Z`) - new Date(`${input.startDate}T00:00:00Z`)) / 86400000) + 1)
        : null,
    },
    audience: {
      market: text(input.market),
      approach: text(input.audienceApproach),
      segments: audienceSegments,
    },
    creative_direction: {
      style: text(input.creativeDirection),
      content_pillars: list(input.contentPillars),
    },
    measurement: list(input.measurement),
    strategy_state: channelPlan.planningOnly.length
      ? "planned_with_non_executable_channels"
      : setupRequired
        ? "planned_with_channel_setup_required"
        : "planned_for_execution",
    source: "marketing_command_center",
    created_without_prompt: true,
  };
}

async function prepareCampaignForOrganization({ organization, input, access, multiOrganization = false }) {
  const organizationInput = {
    ...input,
    channelSettings: channelSettingsForOrganization(input, organization.id, multiOrganization),
  };
  const [channelAssets, readiness, timeContext] = await Promise.all([
    resolveSelectedChannelAssets({
      organizationId: organization.id,
      input: organizationInput,
    }),
    MarketingCampaignReadinessRuntime.readiness({ organizationId: organization.id }).catch(() => ({ channels: [] })),
    resolveOrganizationTimeContext({ organizationId: organization.id }),
  ]);
  organizationInput.organizationTimezone = timeContext.timezone;
  organizationInput.currencyCode = text(timeContext.currency).toUpperCase();
  if (!organizationInput.currencyCode) {
    const error = new Error(`Complete the business currency before creating a campaign for ${organization.name}`);
    error.status = 400;
    throw error;
  }
  if (multiOrganization && input.organizationBudgets && Object.prototype.hasOwnProperty.call(input.organizationBudgets, organization.id)) {
    organizationInput.organizationBudget = input.organizationBudgets[organization.id];
  }
  validatePaidBudgetAllocations(organizationInput);
  validateExecutionAssetReadiness({ input: organizationInput, channelAssets, readiness });
  const name = text(input.name, "New Campaign");
  const campaignName = input.organizationIds?.length > 1
    ? `${organization.name} | ${name}`
    : name;

  return {
    organization,
    organizationInput,
    channelAssets,
    readiness,
    insertRow: {
      organization_id: organization.id,
      campaign_name: campaignName,
      campaign_type: text(input.campaignType, "growth"),
      campaign_status: "draft",
      scheduled_at: campaignSchedule(organizationInput).start_time,
      budget: amount(organizationInput.organizationBudget),
      campaign_content: campaignContent(organizationInput, channelAssets, readiness),
      performance_metrics: {},
      created_by: access.userId || null,
    },
  };
}

async function insertPreparedCampaign(prepared) {
  const { data, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .insert(prepared.insertRow)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function createCampaign(input, request) {
  const ownerOrganizationId = text(input.ownerOrganizationId);
  const ownerAccess = await requireAccess({ organizationId: ownerOrganizationId, request });
  const available = await accessibleOrganizations(ownerAccess, request);
  const capabilities = marketingCampaignCapabilities({
    access: ownerAccess,
    organizationCount: available.length,
  });

  if (!capabilities.canCreateCampaign) {
    throw forbidden("Marketing campaign creation permission required");
  }

  const availableById = new Map(available.map((organization) => [organization.id, organization]));
  const requestedIds = [
    ...new Set(list(input.organizationIds).map(String).filter(Boolean)),
  ];

  if (!requestedIds.length) requestedIds.push(ownerOrganizationId);

  if (requestedIds.length > 1 && !capabilities.canUseWholeCampaign) {
    throw forbidden("Multi-organization Marketing permission required");
  }

  const organizations = [];
  for (const organizationId of requestedIds) {
    if (!availableById.has(organizationId)) {
      throw forbidden("One or more selected organizations are not accessible");
    }
    await requireAccess({ organizationId, request });
    organizations.push(availableById.get(organizationId));
  }

  if (!text(input.name) || !text(input.objective)) {
    const error = new Error("Campaign name and objective are required");
    error.status = 400;
    throw error;
  }

  if (!list(input.channels).length) {
    const error = new Error("Select at least one campaign channel");
    error.status = 400;
    throw error;
  }

  if (input.startDate && input.endDate && new Date(`${input.endDate}T00:00:00Z`) < new Date(`${input.startDate}T00:00:00Z`)) {
    const error = new Error("Campaign end date cannot be before the start date");
    error.status = 400;
    throw error;
  }

  const createdCampaigns = [];
  let group = null;

  try {
    const preparedCampaigns = await Promise.all(organizations.map((organization) =>
      prepareCampaignForOrganization({
        organization,
        input: { ...input, organizationIds: requestedIds },
        access: ownerAccess,
        multiOrganization: organizations.length > 1,
      }),
    ));

    const preparedCurrencies = [...new Set(preparedCampaigns.map((prepared) => text(prepared.insertRow.campaign_content?.currency_code).toUpperCase()).filter(Boolean))];
    const mixedCurrencies = preparedCurrencies.length > 1;
    const groupCurrency = mixedCurrencies ? null : preparedCurrencies[0] || null;
    const requestedMasterBudget = amount(input.masterBudget);
    const preparedChildBudgetTotal = preparedCampaigns.reduce((sum, prepared) => sum + amount(prepared.insertRow.budget), 0);

    if (organizations.length > 1) {
      if (mixedCurrencies && requestedMasterBudget > 0) {
        const error = new Error("A master monetary budget cannot be used across organizations with different currencies");
        error.status = 400;
        throw error;
      }
      if (!mixedCurrencies && requestedMasterBudget > 0 && preparedChildBudgetTotal > 0 && requestedMasterBudget < preparedChildBudgetTotal) {
        const error = new Error("Master budget cannot be lower than the combined organization budgets");
        error.status = 400;
        throw error;
      }
    }

    for (const prepared of preparedCampaigns) {
      createdCampaigns.push(await insertPreparedCampaign(prepared));
    }

    if (organizations.length > 1) {
      const childBudgetTotal = preparedChildBudgetTotal;
      const masterBudget = mixedCurrencies ? 0 : requestedMasterBudget;
      const budgetByOrganization = Object.fromEntries(createdCampaigns.map((campaign) => [campaign.organization_id, {
        amount: amount(campaign.budget),
        currency: text(campaign.campaign_content?.currency_code).toUpperCase() || null,
      }]));
      const { data: createdGroup, error: groupError } = await supabaseAdmin
        .from("marketing_campaign_groups")
        .insert({
          organization_id: ownerOrganizationId,
          campaign_group_name: text(input.name),
          campaign_group_type: "multi_organization",
          campaign_status: "draft",
          objective: text(input.objective),
          start_date: input.startDate || null,
          end_date: input.endDate || null,
          budget: masterBudget,
          currency_code: groupCurrency,
          campaign_content: {
            spend_state: "planned_not_authorized",
            currency_mode: mixedCurrencies ? "PER_ORGANIZATION" : "SHARED",
            currency_code: groupCurrency,
            master_campaign_budget: mixedCurrencies ? null : masterBudget,
            organization_budget_total: mixedCurrencies ? null : childBudgetTotal,
            budgets_by_organization: budgetByOrganization,
            ...(groupCurrency === "THB" ? {
              total_monthly_budget_thb: masterBudget,
              organization_media_budget_thb: childBudgetTotal,
            } : {}),
            source: "marketing_command_center",
            created_without_prompt: true,
          },
          performance_metrics: {},
          created_by: ownerAccess.userId || null,
        })
        .select("*")
        .single();

      if (groupError) throw groupError;
      group = createdGroup;

      const members = createdCampaigns.map((campaign, index) => ({
        campaign_group_id: group.id,
        marketing_campaign_id: campaign.id,
        organization_id: campaign.organization_id,
        member_role: index === 0 ? "lead" : "participant",
        member_status: "active",
        sequence_no: index,
      }));

      const { error: memberError } = await supabaseAdmin
        .from("marketing_campaign_group_members")
        .insert(members);

      if (memberError) throw memberError;
    }

    return {
      group,
      campaigns: createdCampaigns,
      mode: organizations.length > 1 ? "multi_organization" : "single_organization",
    };
  } catch (error) {
    const cleanupFailures = [];
    if (group?.id) {
      const groupCleanup = await supabaseAdmin
        .from("marketing_campaign_groups")
        .delete()
        .eq("id", group.id);
      if (groupCleanup.error) cleanupFailures.push({ resource: "marketing_campaign_group", id: group.id, message: groupCleanup.error.message });
    }
    if (createdCampaigns.length) {
      const campaignIds = createdCampaigns.map((campaign) => campaign.id);
      const campaignCleanup = await supabaseAdmin
        .from("marketing_campaigns")
        .delete()
        .in("id", campaignIds);
      if (campaignCleanup.error) cleanupFailures.push({ resource: "marketing_campaigns", ids: campaignIds, message: campaignCleanup.error.message });
    }
    if (cleanupFailures.length) {
      const rollbackError = new Error("Campaign creation failed and automatic rollback was incomplete");
      rollbackError.status = 500;
      rollbackError.code = "CAMPAIGN_CREATE_ROLLBACK_INCOMPLETE";
      rollbackError.details = {
        original_error: error?.message || "Campaign creation failed",
        cleanup_failures: cleanupFailures,
      };
      throw rollbackError;
    }
    throw error;
  }
}

function missionPayload(campaign) {
  const content = campaign.campaign_content || {};
  const source = {
    source_type: "marketing_campaign",
    source_reference: `marketing_campaign:${campaign.id}`,
    source_document_type: "marketing_campaign",
    source_document_id: campaign.id,
  };

  return {
    organization_id: campaign.organization_id,
    campaign_id: campaign.id,
    title: campaign.campaign_name,
    business_goal: content.goal || campaign.campaign_name,
    objective: content.core_message || content.goal || campaign.campaign_name,
    audience: content.audience || {},
    channels: list(content.channels),
    metadata: {
      source: "marketing_campaign",
      ...source,
      campaign_name: campaign.campaign_name,
      offer: content.offer || "",
      call_to_action: content.primary_cta || "",
      creative_direction: content.creative_direction || {},
      measurement: list(content.measurement),
      requested_outputs: list(content.channels),
      spend_state: content.spend_state || "planned_not_authorized",
      creative_solution_source: "DIRECTOR_RESOLVED_FROM_CONTEXT",
      return_contract: {
        consumer: "marketing",
        document_type: "marketing_campaign",
        document_id: campaign.id,
        organization_id: campaign.organization_id,
      },
    },
  };
}

async function getCampaign({ organizationId, campaignId }) {
  const { data, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;
  return data;
}

async function ensureMission(campaign) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("creative_missions")
    .select("*")
    .eq("organization_id", campaign.organization_id)
    .eq("campaign_id", campaign.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  const mission = existing || await CreativeMissionRuntime.create(missionPayload(campaign));
  return CreativeMissionRuntime.start(mission.id);
}

async function prepareCreative(input, request, execute = false) {
  const organizationId = text(input.organizationId);
  const campaignId = text(input.campaignId);
  if (!organizationId || !campaignId) {
    const error = new Error("organizationId and campaignId are required");
    error.status = 400;
    throw error;
  }

  const access = await requireAccess({
    organizationId,
    request,
    permissions: execute
      ? ["creative.execute", "creative.production.run", "creative.*"]
      : null,
  });
  const campaign = await getCampaign({ organizationId, campaignId });
  const mission = await ensureMission(campaign);
  const projectId = mission.runtime_context?.creative_project_id || null;

  let execution = null;
  if (execute) {
    execution = await CreativeDirectorRuntime.execute({
      organization_id: organizationId,
      creative_mission_id: mission.id,
      creative_project_id: projectId,
      objective: campaign.campaign_content?.goal || campaign.campaign_name,
      business_goal: campaign.campaign_content?.goal || campaign.campaign_name,
      audience: campaign.campaign_content?.audience || {},
      requestedOutputs: list(campaign.campaign_content?.channels),
      organization: access.organization || {},
      requested_by_user_id: access.userId,
      requested_by_staff_account_id: access.access?.staffAccountId || null,
      execution_access: {
        authenticated: true,
        role: access.role || null,
        permissions: access.permissions || [],
      },
    });
  }

  return {
    campaign: {
      id: campaign.id,
      organization_id: campaign.organization_id,
      campaign_name: campaign.campaign_name,
    },
    source: missionPayload(campaign).metadata.return_contract,
    mission,
    execution,
    studio_path: `/workspace/${organizationId}/commercial/design/mission/${mission.id}`,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = text(body.action, "context").toLowerCase();

    if (action === "context") {
      const access = await requireAccess({
        organizationId: body.ownerOrganizationId,
        request,
      });
      const allOrganizations = await accessibleOrganizations(access, request);
      const capabilities = marketingCampaignCapabilities({
        access,
        organizationCount: allOrganizations.length,
      });
      const organizations = capabilities.canUseWholeCampaign
        ? allOrganizations
        : allOrganizations.filter((organization) => organization.id === access.organizationId);

      const readinessEntries = await Promise.all(
        organizations.map(async (organization) => [
          organization.id,
          await MarketingCampaignReadinessRuntime.readiness({
            organizationId: organization.id,
          }).catch(() => ({
            organization_id: organization.id,
            ready_channel_count: 0,
            connected_channels: [],
            channels: [],
            channel_assets: [],
          })),
        ]),
      );
      const readinessByOrganization = Object.fromEntries(readinessEntries);
      const readiness = readinessByOrganization[access.organizationId] || {
        organization_id: access.organizationId,
        ready_channel_count: 0,
        connected_channels: [],
        channels: [],
        channel_assets: [],
      };

      return NextResponse.json({
        success: true,
        data: {
          organizations,
          capabilities,
          readiness,
          readiness_by_organization: readinessByOrganization,
        },
      });
    }

    if (action === "create_campaign") {
      const data = await createCampaign(body, request);
      return NextResponse.json({ success: true, data });
    }

    if (action === "prepare_creative") {
      const data = await prepareCreative(body, request, false);
      return NextResponse.json({ success: true, data });
    }

    if (action === "execute_creative") {
      const data = await prepareCreative(body, request, true);
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported marketing command" },
      { status: 400 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

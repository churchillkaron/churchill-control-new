import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { MARKETING_CHANNEL_CATALOG } from "../lib/marketing/campaigns/MarketingChannelCatalog.js";
import { translateMetaCampaignPlan } from "../lib/marketing/campaigns/adapters/MetaCampaignPlanTranslator.js";
import { translateGoogleAdsCampaignPlan } from "../lib/marketing/campaigns/adapters/GoogleAdsCampaignPlanTranslator.js";
import { translateOrganicSocialCampaignPlan } from "../lib/marketing/campaigns/adapters/OrganicSocialCampaignPlanTranslator.js";
import { campaignPlanFingerprint } from "../lib/marketing/campaigns/CampaignPlanFingerprint.js";

const component = fs.readFileSync("components/marketing/CampaignCommandCenter.jsx", "utf8");
const route = fs.readFileSync("app/api/marketing/campaign-command/route.js", "utf8");
const readiness = fs.readFileSync("lib/marketing/campaigns/MarketingCampaignReadinessRuntime.js", "utf8");

function block(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `${label} block must exist`);
  return match[1];
}

function pickerMappings() {
  const source = block(
    component,
    /const PICKER_CANONICAL_CHANNEL = Object\.freeze\(\{([\s\S]*?)\}\);/,
    "picker mapping",
  );
  return Object.fromEntries(
    [...source.matchAll(/\s*([a-z0-9_]+): \["([a-z0-9_]+)",/g)].map((match) => [match[1], match[2]]),
  );
}

function serverMappings() {
  const source = block(
    route,
    /const CAMPAIGN_SURFACE_CHANNELS = Object\.freeze\(\{([\s\S]*?)\}\);/,
    "server mapping",
  );
  return Object.fromEntries(
    [...source.matchAll(/\s*([a-z0-9_]+): \{ channel: "([a-z0-9_]+)"/g)].map((match) => [match[1], match[2]]),
  );
}

test("every customer-facing campaign channel resolves to the same canonical catalog channel client and server side", () => {
  const picker = pickerMappings();
  const server = serverMappings();
  const catalog = new Set(MARKETING_CHANNEL_CATALOG.map((channel) => channel.id));
  const visible = [...component.matchAll(/\{ id: "([a-z0-9_]+)", name:/g)].map((match) => match[1]);

  assert.equal(visible.length, 32);
  assert.equal(new Set(visible).size, visible.length);

  for (const id of visible) {
    assert.ok(picker[id], `picker mapping missing for ${id}`);
    assert.ok(server[id], `server mapping missing for ${id}`);
    assert.equal(picker[id], server[id], `client/server mapping differs for ${id}`);
    assert.ok(catalog.has(server[id]), `${id} maps to unknown catalog channel ${server[id]}`);
  }
});

test("campaign creation persists canonical channels and safe channel-setting asset snapshots", () => {
  assert.match(route, /channel_surfaces: channelPlan\.surfaces/);
  assert.match(route, /channel_networks: channelPlan\.networks/);
  assert.match(route, /planning_only_surfaces: channelPlan\.planningOnly/);
  assert.match(route, /channel_setting_assets: channelAssets/);
  assert.match(route, /\.eq\("organization_id", organizationId\)/);
  assert.match(route, /One or more selected channel assets are not available for this organization/);
});

test("campaign readiness exposes safe channel assets without credential references", () => {
  assert.match(readiness, /channel_assets: channelAssetRows/);
  assert.match(readiness, /organization_channel_assets/);
  assert.doesNotMatch(
    block(readiness, /async function channelAssets\(organizationId\) \{([\s\S]*?)\n\}/, "channel assets"),
    /credentials_reference|secret_reference|access_token|refresh_token/,
  );
});

test("multi-organization campaigns isolate connected channel assets by organization", () => {
  assert.match(route, /channelSettingsForOrganization/);
  assert.match(route, /organizationChannelSettings/);
  assert.match(route, /multiOrganization: organizations\.length > 1/);
  assert.match(route, /if \(multiOrganization\)[\s\S]*key\.endsWith\("AssetId"\)/);
  assert.match(component, /Configure connected accounts by organization/);
  assert.match(component, /organizationChannelSettings/);
});

test("channel asset references are validated for organization and channel type", () => {
  assert.match(route, /CHANNEL_ASSET_REQUIREMENTS/);
  assert.match(route, /Selected .* is not valid for/);
  assert.match(route, /google_ads_customer/);
  assert.match(route, /whatsapp_phone_number/);
  assert.match(route, /google_business_location/);
});

test("campaign builder has progressive review flow and validates date order", () => {
  assert.match(component, /const createSteps = \["Basics", "Audience & Creative", "Channels", "Budget & Schedule", "Review"\]/);
  assert.match(component, /Review Campaign/);
  assert.match(route, /Campaign end date cannot be before the start date/);
});

test("campaign API rejects unsupported surfaces and filters settings to selected channels", () => {
  assert.match(route, /Unsupported campaign channel:/);
  assert.match(route, /function selectedChannelSettings/);
  assert.match(route, /selected\.has\(text\(channelId\)\.toLowerCase\(\)\)/);
});

test("multi-organization master budget cannot undercut allocated organization budgets", () => {
  assert.match(route, /Master budget cannot be lower than the combined organization budgets/);
  assert.match(route, /preparedChildBudgetTotal = preparedCampaigns\.reduce/);
  assert.match(route, /requestedMasterBudget < preparedChildBudgetTotal/);
});

test("created campaigns persist per-surface execution readiness", () => {
  assert.match(route, /channel_readiness_snapshot: readinessSnapshot/);
  assert.match(route, /planned_with_channel_setup_required/);
  assert.match(route, /PLANNING_ONLY/);
  assert.match(route, /SETUP_REQUIRED/);
  assert.match(component, /Channel readiness by organization/);
  assert.match(component, /Open Channel Setup/);
});

test("Meta campaign UI persists canonical execution plan snapshots and live targeting lookup", () => {
  assert.match(route, /execution_plan_snapshots: executionPlans/);
  assert.match(route, /facebook_positions/);
  assert.match(route, /instagram_positions/);
  assert.match(route, /device_platforms/);
  assert.match(component, /MetaLocationLookup/);
  assert.match(component, /MetaTargetLookup/);
  assert.match(component, /Facebook placements/);
  assert.match(component, /Instagram placements/);
  assert.match(component, /Exact approved image/);
});


test("Meta translator carries targeting placements bid controls and exact creative to provider payload", () => {
  const translated = translateMetaCampaignPlan({
    plan: {
      name: "Meta contract test",
      audience: {
        included_locations: [{ type: "country", country_code: "TH" }],
        excluded_locations: [],
        age_min: 25,
        age_max: 55,
        genders: ["female"],
        languages: [{ id: "6", name: "English" }],
        interests: [{ id: "6003139266461", name: "Restaurants" }],
        behaviors: [],
        keywords: [],
        negative_keywords: [],
        custom_audience_ids: [],
        excluded_audience_ids: [],
        lookalike_audience_ids: [],
      },
      budget: { amount: 1000, currency: "THB", bid_strategy: "bid_cap", bid_cap: 12 },
      schedule: { start_time: "2026-09-25T00:00:00.000Z", end_time: "2026-09-30T23:59:59.999Z" },
      creative: {
        asset_ids: ["asset-1"],
        exact_asset_required: true,
        primary_text: "Dinner tonight",
        headline: "Book now",
        description: "Karon",
        destination_url: "https://example.com/book",
        call_to_action: "BOOK_NOW",
      },
    },
    channel: {
      networks: ["facebook", "instagram"],
      destination: "WEBSITE",
      billing_event: "IMPRESSIONS",
      provider_settings: {
        page_asset_id: "page-asset-1",
        instagram_asset_id: "instagram-asset-1",
        facebook_positions: ["feed", "facebook_reels"],
        instagram_positions: ["stream", "reels"],
        device_platforms: ["mobile"],
        special_ad_categories: [],
      },
    },
  });

  assert.deepEqual(translated.deliveryChannels, ["facebook", "instagram"]);
  assert.deepEqual(translated.adSet.targeting.facebook_positions, ["feed", "facebook_reels"]);
  assert.deepEqual(translated.adSet.targeting.instagram_positions, ["stream", "reels"]);
  assert.deepEqual(translated.adSet.targeting.device_platforms, ["mobile"]);
  assert.equal(translated.adSet.bid_strategy, "LOWEST_COST_WITH_BID_CAP");
  assert.equal(translated.adSet.bid_amount, 1200);
  assert.equal(translated.creative.asset_id, "asset-1");
  assert.equal(translated.creative.link_url, "https://example.com/book");
});


test("campaign readiness only reports channels with registered campaign adapters as executable", () => {
  assert.match(readiness, /getMarketingCampaignAdapter/);
  assert.match(readiness, /campaign_execution_available: campaignExecutable/);
  assert.match(readiness, /PLANNING_ONLY/);
});

test("Google Ads campaign UI persists canonical Search execution configuration", () => {
  assert.match(route, /function googleAdsExecutionPlanSnapshot/);
  assert.match(route, /googleKeywordEntries/);
  assert.match(route, /negative_keywords: googleNegativeKeywordEntries/);
  assert.match(component, /Google Ads · Search/);
  assert.match(component, /Exact match/);
  assert.match(component, /Phrase match/);
  assert.match(component, /Broad match/);
  assert.match(component, /Negative keywords/);
  assert.match(component, /Responsive Search Ad/);
  assert.match(component, /Google Ads campaign check/);
});

test("Google Ads translator preserves keyword match types and negative keywords", () => {
  const translated = translateGoogleAdsCampaignPlan({
    plan: {
      name: "Google contract test",
      audience: {
        included_locations: [{ type: "google_geo", id: "1012728", name: "Phuket" }],
        excluded_locations: [{ type: "google_geo", id: "1028581", name: "Bangkok" }],
        languages: [{ id: "1000", name: "English" }],
        keywords: [
          { text: "restaurant phuket", match_type: "EXACT" },
          { text: "dinner karon", match_type: "PHRASE" },
          { text: "phuket restaurant", match_type: "BROAD" },
        ],
        negative_keywords: [
          { text: "jobs", match_type: "PHRASE" },
        ],
      },
      budget: { amount: 3000, currency: "THB", daily_amount: 500 },
      schedule: {
        start_time: "2026-09-25T00:00:00.000Z",
        end_time: "2026-09-30T23:59:59.999Z",
      },
      creative: {
        headlines: ["Restaurant Phuket", "Dinner in Karon", "Book Your Table"],
        descriptions: ["International dining in Karon.", "Reserve your table online today."],
        destination_url: "https://example.com/book",
      },
    },
    channel: {
      provider_settings: {
        account_asset_id: "google-account-1",
        ad_group_name: "Karon Dinner",
      },
    },
  });

  assert.equal(translated.accountAssetId, "google-account-1");
  assert.equal(translated.dailyBudget, 500);
  assert.deepEqual(translated.keywords.map((item) => item.match_type), ["EXACT", "PHRASE", "BROAD"]);
  assert.deepEqual(translated.negativeKeywords, [{ text: "jobs", match_type: "PHRASE" }]);
  assert.deepEqual(translated.includedLocations, [{ id: "1012728", name: "Phuket", resource_name: "geoTargetConstants/1012728" }]);
  assert.deepEqual(translated.excludedLocations, [{ id: "1028581", name: "Bangkok", resource_name: "geoTargetConstants/1028581" }]);
  assert.deepEqual(translated.languageTargets, [{ id: "1000", name: "English", resource_name: "languageConstants/1000" }]);
  assert.equal(translated.headlines.length, 3);
  assert.equal(translated.descriptions.length, 2);
  assert.equal(translated.destinationUrl, "https://example.com/book");
});


test("Google Ads targeting lookup and runtime use real provider constants", () => {
  const lookup = fs.readFileSync("app/api/marketing/google-ads-targeting-search/route.js", "utf8");
  const runtime = fs.readFileSync("lib/marketing/services/GoogleAdsRuntime.js", "utf8");
  assert.match(lookup, /geo_target_constant\.resource_name/);
  assert.match(lookup, /language_constant\.resource_name/);
  assert.match(lookup, /Select a Google Ads account first/);
  assert.match(runtime, /campaignCriterionOperations/);
  assert.match(runtime, /geoTargetConstant/);
  assert.match(runtime, /languageConstant/);
  assert.match(runtime, /CREATE_CAMPAIGN_TARGETING/);
  assert.match(component, /GoogleAdsTargetLookup/);
  assert.match(component, /Included locations/);
  assert.match(component, /Excluded locations/);
  assert.match(component, /Languages/);
});

test("Google Ads spending account readiness is enforced client and server side", () => {
  assert.match(component, /Boolean\(asset\.entity_id\)/);
  assert.match(component, /accountCurrency === organizationCurrency/);
  assert.match(route, /validateExecutionAssetReadiness/);
  assert.match(route, /Google Ads spending account must be mapped to an Avantiqo entity/);
  assert.match(route, /Google Ads manager accounts cannot be used as campaign spending accounts/);
  assert.match(route, /Google Ads account currency must match the organization wallet/);
});

test("campaign detail exposes no-spend provider preflight for stored execution snapshots", () => {
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/commercial/marketing/campaigns/page.jsx", "utf8");
  assert.match(page, /Check readiness/);
  assert.match(page, /action: "preflight"/);
  assert.match(page, /\/api\/marketing\/campaign-execution/);
  assert.match(page, /Final Connection Check/);
  assert.match(page, /No wallet change and no campaign was created/);
});

test("Meta website conversion optimization carries Pixel and event to promoted_object", () => {
  const translated = translateMetaCampaignPlan({
    plan: {
      name: "Meta conversion contract",
      audience: {
        included_locations: [{ type: "country", country_code: "TH" }],
        excluded_locations: [],
        age_min: 25,
        age_max: 55,
        genders: [],
        languages: [],
        interests: [],
        behaviors: [],
        keywords: [],
        negative_keywords: [],
        custom_audience_ids: [],
        excluded_audience_ids: [],
        lookalike_audience_ids: [],
      },
      budget: { amount: 1500, currency: "THB", bid_strategy: "lowest_cost" },
      schedule: { start_time: "2026-09-25T00:00:00.000Z", end_time: "2026-09-30T23:59:59.999Z" },
      creative: {
        asset_ids: ["asset-1"],
        exact_asset_required: true,
        primary_text: "Book dinner",
        headline: "Reserve now",
        description: "Karon",
        destination_url: "https://example.com/book",
        call_to_action: "BOOK_NOW",
      },
    },
    channel: {
      networks: ["facebook", "instagram"],
      destination: "WEBSITE",
      optimization_goal: "OFFSITE_CONVERSIONS",
      conversion_event: "PURCHASE",
      billing_event: "IMPRESSIONS",
      provider_settings: {
        page_asset_id: "page-asset-1",
        instagram_asset_id: "instagram-asset-1",
        pixel_id: "1234567890",
        special_ad_categories: [],
      },
    },
  });

  assert.deepEqual(translated.adSet.promoted_object, {
    pixel_id: "1234567890",
    custom_event_type: "PURCHASE",
  });
  assert.equal(translated.adSet.destination_type, "WEBSITE");
  assert.equal(translated.adSet.optimization_goal, "OFFSITE_CONVERSIONS");
});

test("Meta targeting lookup exposes safe Pixel and behaviour discovery", () => {
  const lookup = fs.readFileSync("app/api/marketing/meta-targeting-search/route.js", "utf8");
  assert.match(lookup, /type === "pixel"/);
  assert.match(lookup, /adspixels/);
  assert.match(lookup, /type === "behavior"/);
  assert.match(lookup, /adTargetingCategory/);
  assert.match(component, /MetaPixelLookup/);
  assert.match(component, /Website conversions/);
  assert.match(component, /Behaviours/);
});


test("Meta executable creative is organization-scoped and approval-gated", () => {
  assert.match(component, /creativeAssetId/);
  assert.match(route, /Selected Meta creative is not available for this organization/);
  assert.match(route, /Selected Meta creative must be approved/);
  assert.match(route, /Selected Meta creative does not have an executable source asset/);
});

test("Meta creative assets stay separate from channel connection assets and are snapshotted safely", () => {
  assert.match(route, /CHANNEL_ASSET_REQUIREMENTS\[channelId\]\?\.\[key\]/);
  assert.match(route, /creative_asset_snapshots: creativeAssetSnapshots/);
  assert.match(route, /selectedCreativeAssetSnapshots/);
});

test("Meta review and readiness are organization-specific for multi-organization campaigns", () => {
  assert.match(component, /Meta campaign check · \{organization\?\.name/);
  assert.match(component, /mergedChannelSettings\("meta_ads", organizationId\)/);
  assert.match(component, /organizationReadiness\?\.creative_assets/);
});


test("campaign plan fingerprints are canonical and detect reviewed-plan mutation", () => {
  const first = {
    name: "Reviewed plan",
    budget: { amount: 1000, currency: "THB" },
    channels: [{ channel_id: "meta", networks: ["facebook"] }],
  };
  const reordered = {
    channels: [{ networks: ["facebook"], channel_id: "meta" }],
    budget: { currency: "THB", amount: 1000 },
    name: "Reviewed plan",
  };
  const changed = {
    ...first,
    budget: { ...first.budget, amount: 1001 },
  };

  assert.equal(campaignPlanFingerprint(first), campaignPlanFingerprint(reordered));
  assert.notEqual(campaignPlanFingerprint(first), campaignPlanFingerprint(changed));

  const executionRoute = fs.readFileSync("app/api/marketing/campaign-execution/route.js", "utf8");
  assert.match(route, /execution_plan_fingerprints: executionPlanFingerprints/);
  assert.match(executionRoute, /CAMPAIGN_PLAN_FINGERPRINT_MISMATCH/);
  assert.match(executionRoute, /assertExpectedPlanFingerprint/);
});

test("paid provider allocations cannot double-reserve the organization Campaign Budget", () => {
  assert.match(route, /validatePaidBudgetAllocations/);
  assert.match(route, /Explicit provider budget allocations are required/);
  assert.match(route, /Paid-media provider allocations cannot exceed the Campaign Budget/);
  assert.match(route, /providerAuthorizedBudget\(input, channelPlan, settings, "meta_ads"\)/);
  assert.match(route, /providerAuthorizedBudget\(input, channelPlan, settings, "google_ads"\)/);
  assert.match(component, /Meta authorized budget/);
  assert.match(component, /Google Ads authorized budget/);
});

test("Google Ads daily budget cannot project beyond its authorized provider allocation", () => {
  const translator = fs.readFileSync("lib/marketing/campaigns/adapters/GoogleAdsCampaignPlanTranslator.js", "utf8");
  const runtime = fs.readFileSync("lib/marketing/services/GoogleAdsRuntime.js", "utf8");
  assert.match(translator, /GOOGLE_ADS_DAILY_BUDGET_EXCEEDS_AUTHORIZATION/);
  assert.match(runtime, /daily budget across the campaign period exceeds the authorized wallet budget/);
});

test("Campaign approval is explicit, fingerprint-gated and paused-first", () => {
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/commercial/marketing/campaigns/page.jsx", "utf8");
  assert.match(page, /Approve & Create Paused/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /confirmOwnerApproval: true/);
  assert.match(page, /expectedPlanFingerprint: fingerprint/);
  assert.match(page, /channel plan has changed since review/);
  assert.match(page, /It will NOT activate ads/);
  assert.match(page, /campaign created in PAUSED state\. Ads are not active/);
});

test("approved provider creation persists durable evidence and blocks duplicate creation", () => {
  const executionRoute = fs.readFileSync("app/api/marketing/campaign-execution/route.js", "utf8");
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/commercial/marketing/campaigns/page.jsx", "utf8");
  assert.match(executionRoute, /persistExecutionEvidence/);
  assert.match(executionRoute, /PROVIDER_CAMPAIGN_ALREADY_CREATED/);
  assert.match(executionRoute, /execution_evidence: nextEvidence/);
  assert.match(executionRoute, /spend_state: "reserved_paused"/);
  assert.match(executionRoute, /Do not retry provider creation/);
  assert.match(page, /Approved Campaign Creation/);
  assert.match(page, /No duplicate will be created/);
  assert.match(page, /marketingCampaignId: selected\.id/);
});


test("Meta conversion campaigns persist Pixel/event and translate to promoted_object", () => {
  const translated = translateMetaCampaignPlan({
    plan: {
      name: "Meta conversion contract",
      audience: {
        included_locations: [{ type: "country", country_code: "TH" }],
        excluded_locations: [],
        age_min: 25,
        age_max: 55,
        genders: [],
        languages: [],
        interests: [],
        behaviors: [{ id: "6002714895372", name: "Engaged shoppers" }],
        keywords: [],
        negative_keywords: [],
        custom_audience_ids: [],
        excluded_audience_ids: [],
        lookalike_audience_ids: [],
      },
      budget: { amount: 1000, currency: "THB", bid_strategy: "lowest_cost" },
      schedule: { start_time: "2026-09-25T00:00:00.000Z", end_time: "2026-09-30T23:59:59.999Z" },
      creative: {
        asset_ids: ["asset-1"],
        exact_asset_required: true,
        primary_text: "Reserve your table",
        headline: "Book tonight",
        description: "Karon dining",
        destination_url: "https://example.com/book",
        call_to_action: "BOOK_NOW",
      },
    },
    channel: {
      networks: ["facebook", "instagram"],
      destination: "WEBSITE",
      objective: "OUTCOME_SALES",
      optimization_goal: "OFFSITE_CONVERSIONS",
      billing_event: "IMPRESSIONS",
      conversion_event: "PURCHASE",
      provider_settings: {
        page_asset_id: "page-asset-1",
        instagram_asset_id: "instagram-asset-1",
        pixel_id: "123456789",
        special_ad_categories: [],
        facebook_positions: ["feed"],
        instagram_positions: ["stream"],
        device_platforms: ["mobile"],
      },
    },
  });

  assert.deepEqual(translated.adSet.promoted_object, { pixel_id: "123456789", custom_event_type: "PURCHASE" });
  assert.equal(translated.adSet.optimization_goal, "OFFSITE_CONVERSIONS");
  assert.equal(translated.adSet.destination_type, "WEBSITE");
  assert.deepEqual(translated.adSet.targeting.flexible_spec[0].behaviors, [{ id: "6002714895372", name: "Engaged shoppers" }]);
});

test("Meta targeting lookup supports provider-resolved behaviours and Pixels", () => {
  const lookup = fs.readFileSync("app/api/marketing/meta-targeting-search/route.js", "utf8");
  assert.match(lookup, /adTargetingCategory/);
  assert.match(lookup, /class: "behaviors"/);
  assert.match(lookup, /adspixels/);
  assert.match(component, /MetaPixelLookup/);
  assert.match(component, /Website conversions/);
  assert.match(component, /Behaviours/);
  assert.match(route, /pixel_id: text\(settings\.pixelId\)/);
  assert.match(route, /conversion_event: text\(settings\.conversionEvent\)/);
});


test("universal campaign plan allows zero-spend non-paid channels while keeping paid-media strict", () => {
  const universal = fs.readFileSync("lib/marketing/campaigns/UniversalCampaignPlan.js", "utf8");
  assert.match(universal, /const hasPaidMedia = channels\.some/);
  assert.match(universal, /budgetAmount === null \|\| budgetAmount < 0/);
  assert.match(universal, /hasPaidMedia && budgetAmount <= 0/);
  assert.match(universal, /Paid-media campaign budget must be positive/);
  assert.match(universal, /normalizeAudience\(plan\.audience \|\| \{\}, \{ requireIncludedLocations: hasPaidMedia \}\)/);
  assert.match(universal, /requireIncludedLocations && !included\.length/);
});

test("legacy social publishing paths are retired in favor of governed Campaigns and Creative Publish", () => {
  const socialPage = fs.readFileSync("app/(system)/workspace/[organizationId]/commercial/marketing/social/page.jsx", "utf8");
  const publish = fs.readFileSync("app/api/marketing/publish/route.js", "utf8");
  const publishNow = fs.readFileSync("app/api/marketing/publish-now/route.js", "utf8");
  const publishInstagram = fs.readFileSync("app/api/marketing/publish-instagram/route.js", "utf8");
  const metaPublish = fs.readFileSync("app/api/meta/Publish/route.js", "utf8");
  assert.match(socialPage, /commercial\/marketing\/campaigns/);
  assert.match(publish, /LEGACY_MARKETING_PUBLISH_RETIRED/);
  assert.match(publishNow, /LEGACY_MARKETING_PUBLISH_NOW_RETIRED/);
  assert.match(publishInstagram, /LEGACY_INSTAGRAM_PUBLISH_RETIRED/);
  assert.match(metaPublish, /LEGACY_META_DIRECT_PUBLISH_RETIRED/);
  for (const source of [publish, publishNow, publishInstagram, metaPublish]) {
    assert.match(source, /status: 409/);
  }
});


test("organic social campaign adapter activates only certified networks", () => {
  const translated = translateOrganicSocialCampaignPlan({
    plan: {
      creative: { primary_text: "Tonight at Churchill" },
    },
    channel: {
      networks: ["linkedin", "x"],
      provider_settings: {
        network_settings: {
          linkedin: { account_asset_id: "linkedin-account", message: "LinkedIn message", destination_url: "https://example.com" },
          x: { account_asset_id: "x-account", message: "X message" },
        },
      },
    },
  });
  assert.deepEqual(translated.destinations.map((item) => item.network), ["linkedin", "x"]);
  assert.equal(translated.destinations[0].capability, "marketing.linkedin.publish");
  assert.equal(translated.destinations[1].capability, "marketing.x.publish");
  const metaOrganic = translateOrganicSocialCampaignPlan({
    plan: { creative: { primary_text: "Post" } },
    channel: {
      networks: ["facebook", "instagram"],
      provider_settings: {
        network_settings: {
          facebook: { account_asset_id: "fb-page", creative_asset_id: "fb-image" },
          instagram: { account_asset_id: "ig-business", creative_asset_id: "ig-image" },
        },
      },
    },
  });
  assert.deepEqual(metaOrganic.destinations.map((item) => item.network), ["facebook", "instagram"]);
  assert.equal(metaOrganic.destinations[0].capability, "marketing.facebook.publish");
  assert.equal(metaOrganic.destinations[1].capability, "marketing.instagram.publish");
});

test("organic social readiness and campaign storage remain network-specific", () => {
  const registry = fs.readFileSync("lib/marketing/campaigns/adapters/MarketingCampaignAdapterRegistry.js", "utf8");
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignAdapter.js", "utf8");
  const translator = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignPlanTranslator.js", "utf8");
  assert.match(registry, /organic_social: OrganicSocialCampaignAdapter/);
  assert.match(readiness, /ORGANIC_SOCIAL_NETWORK_RUNTIME/);
  assert.match(readiness, /available_networks: availableNetworks/);
  assert.match(route, /adapterNetworkSupported/);
  assert.match(route, /function organicSocialExecutionPlanSnapshot/);
  assert.match(route, /organic_social: organicSocialPlan/);
  assert.match(adapter, /executeService/);
  assert.match(adapter, /publication_executed: false/);
  assert.match(translator, /marketing\.linkedin\.publish/);
  assert.match(translator, /marketing\.x\.publish/);
});

test("organic social approved media is organization-scoped and resolved only at execution", () => {
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignAdapter.js", "utf8");
  assert.match(component, /OrganicSocialSettings/);
  assert.match(component, /Approved creative · optional/);
  assert.match(route, /creative_asset_id: text\(row\.creativeAssetId\)/);
  assert.match(adapter, /CreativeAssetsRuntime\.get/);
  assert.match(adapter, /creativeApproval/);
  assert.match(adapter, /ORGANIC_SOCIAL_CREATIVE_APPROVAL_REQUIRED/);
  assert.match(adapter, /resolveCreativeProviderAssetUrl/);
  assert.match(adapter, /\["facebook", "instagram", "pinterest", "linkedin", "google_business"\]\.includes\(destination\.network\)/);
  assert.match(adapter, /destination\.network === "tiktok"/);
  assert.match(adapter, /\? \["VIDEO"\]/);
  assert.match(adapter, /: \["IMAGE", "VIDEO"\]/);
});

test("organic social execution is pricing-aware and exactly-once keyed per network account", () => {
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignAdapter.js", "utf8");
  assert.match(adapter, /resolveProvider\(/);
  assert.match(adapter, /PricingRuntime\.resolveRecord/);
  assert.match(adapter, /ORGANIC_SOCIAL_PRICING_NOT_READY/);
  assert.match(adapter, /campaignPlanFingerprint\(plan\)/);
  assert.match(adapter, /task_id: `campaign-organic:\$\{planFingerprint\}:\$\{destination\.network\}:\$\{asset\.id\}`/);
  assert.match(readiness, /pricing_ready: pricingReady/);
  assert.match(readiness, /resolveProvider\(/);
});

test("organic social review is organization-specific before owner approval", () => {
  assert.match(component, /OrganicSocialReview/);
  assert.match(component, /organicSocialSettingsIssues/);
  assert.match(component, /channel override/);
  assert.match(component, /Text only/);
  assert.match(component, /Account, content and channel setup are ready for the final connection check/);
  assert.match(component, /selectedOrganizations\.flatMap/);
});

test("Threads campaign publishing exposes governed native settings", () => {
  const translator = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignPlanTranslator.js", "utf8");
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignAdapter.js", "utf8");
  assert.match(translator, /marketing\.threads\.publish/);
  assert.match(translator, /threads_profile/);
  assert.match(translator, /reply_control/);
  assert.match(adapter, /destination\.network === "threads"/);
  assert.match(adapter, /is_spoiler_media/);
  assert.match(readiness, /threads: \{ provider: "threads"/);
  assert.match(component, /Who can reply/);
  assert.match(component, /Topic tag/);
  assert.match(component, /Mark selected media as spoiler media/);
});

test("Google Business campaign publishing is mapped, standard-post-only and governed", () => {
  const translator = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignPlanTranslator.js", "utf8");
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignAdapter.js", "utf8");
  const google = fs.readFileSync("lib/platform/service-runtime/providers/google/GoogleProvider.js", "utf8");
  assert.match(translator, /marketing\.google\.business\.publish/);
  assert.match(translator, /google_business_location/);
  assert.match(readiness, /google_business: \{ provider: "google", service_id: "google-business"/);
  assert.match(adapter, /GOOGLE_BUSINESS_LOCATION_ENTITY_MAPPING_REQUIRED/);
  assert.match(adapter, /location_id: asset\.external_id/);
  assert.match(adapter, /topic_type: "STANDARD"/);
  assert.match(adapter, /destination\.network === "google_business" \? asset\.entity_id : entityId/);
  assert.match(google, /GOOGLE_BUSINESS_POST_PUBLISHED/);
  assert.match(component, /Google Business Profile · Standard Post/);
  assert.match(component, /Mapped Business Profile location/);
  assert.match(component, /Campaigns currently certifies Google Business/);
  assert.match(component, /Event and Offer post types stay hidden/);
});

test("TikTok campaign publishing is live-privacy, consent-gated, video-only and async", () => {
  const translator = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignPlanTranslator.js", "utf8");
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignAdapter.js", "utf8");
  const provider = fs.readFileSync("lib/platform/service-runtime/providers/tiktok/TikTokProvider.js", "utf8");
  const creatorRoute = fs.readFileSync("app/api/marketing/tiktok-creator/route.js", "utf8");
  const executionRoute = fs.readFileSync("app/api/marketing/campaign-execution/route.js", "utf8");
  assert.match(translator, /marketing\.tiktok\.publish/);
  assert.match(translator, /tiktok_account/);
  assert.match(adapter, /TIKTOK_EXPLICIT_CREATOR_CONSENT_REQUIRED/);
  assert.match(adapter, /TIKTOK_PRIVACY_LEVEL_NOT_CURRENTLY_AVAILABLE/);
  assert.match(adapter, /\["tiktok", "youtube"\]\.includes\(destination\.network\)/);
  assert.match(adapter, /media_type: "VIDEO"/);
  assert.match(provider, /pending: true/);
  assert.match(provider, /job_id: publishId/);
  assert.match(provider, /marketing\.tiktok\.status/);
  assert.match(creatorRoute, /marketing\.tiktok\.creator\.read/);
  assert.match(creatorRoute, /privacy_level_options/);
  assert.match(executionRoute, /action === "status"/);
  assert.match(executionRoute, /settlePendingService/);
  assert.match(component, /Load Creator Options/);
  assert.match(component, /Explicit creator consent/);
  assert.match(component, /video direct-post/);
  assert.match(component, /Photo posts remain Planning Only/);
});

test("owned messaging stays planning-only until channel consent governance is certified", () => {
  const migration = fs.readFileSync("supabase/migrations/20260924161000_marketing_channel_consent_governance.sql", "utf8");
  const consentRuntime = fs.readFileSync("lib/marketing/campaigns/MarketingCampaignConsentRuntime.js", "utf8");
  const consentApi = fs.readFileSync("app/api/marketing/channel-consent/route.js", "utf8");
  assert.match(readiness, /campaign broadcast requires certified channel-specific consent, suppression and unsubscribe governance/);
  assert.match(migration, /marketing_channel_preferences/);
  assert.match(migration, /OPTED_IN','OPTED_OUT','SUPPRESSED/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.marketing_channel_preferences from public, anon, authenticated/);
  assert.match(consentRuntime, /NO_CHANNEL_CONSENT/);
  assert.match(consentRuntime, /SUPPRESSED/);
  assert.match(consentRuntime, /RECIPIENT_ADDRESS_REQUIRED/);
  assert.match(consentRuntime, /resolveEligibleAudience/);
  assert.match(consentApi, /MarketingCampaignConsentRuntime\.eligibility/);
  assert.match(consentApi, /MarketingCampaignConsentRuntime\.resolveEligibleAudience/);
  assert.match(component, /OwnedMessagingCampaignSettings/);
  assert.match(component, /Preview Eligibility/);
  assert.match(component, /Only explicit channel consent can become eligible/);
});

test("multi-organization messaging recipient selections are organization-specific", () => {
  assert.match(component, /function organizationSpecificSetting\(key\)/);
  assert.match(component, /\["authorizedBudget", "dailyBudget", "bidCap", "costCap", "plannedBudget"\]\.includes\(key\)/);
});

test("campaign consent preview fails safely before consent migration deployment", () => {
  const consentRuntime = fs.readFileSync("lib/marketing/campaigns/MarketingCampaignConsentRuntime.js", "utf8");
  assert.match(consentRuntime, /MARKETING_CHANNEL_CONSENT_MIGRATION_REQUIRED/);
  assert.match(consentRuntime, /Campaign consent governance migration is not deployed/);
});

test("owned messaging adapter is fully registered but remains activation-gated", () => {
  const registry = fs.readFileSync("lib/marketing/campaigns/adapters/MarketingCampaignAdapterRegistry.js", "utf8");
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OwnedMessagingCampaignAdapter.js", "utf8");
  const translator = fs.readFileSync("lib/marketing/campaigns/adapters/OwnedMessagingCampaignPlanTranslator.js", "utf8");
  assert.match(registry, /email: OwnedMessagingCampaignAdapter/);
  assert.match(registry, /whatsapp: OwnedMessagingCampaignAdapter/);
  assert.match(registry, /line: OwnedMessagingCampaignAdapter/);
  assert.match(registry, /telegram: OwnedMessagingCampaignAdapter/);
  assert.match(adapter, /status: "PENDING_CONSENT_GOVERNANCE"/);
  assert.match(adapter, /OWNED_MESSAGING_ACTIVATION_GATE_CLOSED/);
  assert.match(adapter, /campaign-owned:\$\{fingerprint\}:\$\{prepared\.translated\.channel_id\}:\$\{prepared\.asset\.id\}:\$\{recipient\.party_id\}/);
  assert.match(translator, /OWNED_MESSAGING_EXPLICIT_RECIPIENTS_REQUIRED/);
  assert.match(translator, /OWNED_MESSAGING_FREQUENCY_CAP_UNSUPPORTED/);
});

test("owned messaging plans are persisted as dormant snapshots, never live execution snapshots", () => {
  assert.match(route, /planned_execution_plan_snapshots: plannedOwnedMessagingPlans/);
  assert.match(route, /planned_execution_plan_fingerprints/);
  assert.match(route, /OWNED_MESSAGING_EXECUTION_NOT_ACTIVATED/);
  assert.match(route, /organizationSpecificChannelSetting\(key\)/);
});

test("WhatsApp campaign templates are provider-approved and variable-complete", () => {
  const lookup = fs.readFileSync("app/api/marketing/whatsapp-templates/route.js", "utf8");
  const translator = fs.readFileSync("lib/marketing/campaigns/adapters/OwnedMessagingCampaignPlanTranslator.js", "utf8");
  assert.match(lookup, /message_templates/);
  assert.match(lookup, /status\)\.toUpperCase\(\) === "APPROVED"/);
  assert.match(lookup, /unsupported_variable_structure/);
  assert.match(component, /Load Approved Templates/);
  assert.match(component, /Campaign broadcasts never fall back to freeform WhatsApp text/);
  assert.match(translator, /WHATSAPP_APPROVED_TEMPLATE_REQUIRED/);
  assert.match(translator, /WHATSAPP_TEMPLATE_PARAMETERS_INCOMPLETE/);
  assert.match(translator, /WHATSAPP_TEMPLATE_VARIABLE_STRUCTURE_UNSUPPORTED/);
});

test("Email campaigns use Avantiqo-managed signed unsubscribe and provider headers", () => {
  const unsubscribe = fs.readFileSync("lib/marketing/campaigns/MarketingCampaignUnsubscribeRuntime.js", "utf8");
  const routeFile = fs.readFileSync("app/api/marketing/unsubscribe/route.js", "utf8");
  const emailProvider = fs.readFileSync("lib/platform/service-runtime/providers/email/EmailProvider.js", "utf8");
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OwnedMessagingCampaignAdapter.js", "utf8");
  assert.match(unsubscribe, /createHmac\("sha256"/);
  assert.match(unsubscribe, /timingSafeEqual/);
  assert.match(unsubscribe, /SELF_SERVICE_UNSUBSCRIBE/);
  assert.match(routeFile, /Email preferences/);
  assert.match(routeFile, /method="post"/);
  assert.match(emailProvider, /List-Unsubscribe:/);
  assert.match(emailProvider, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  assert.match(emailProvider, /internetMessageHeaders/);
  assert.match(adapter, /EMAIL_UNSUBSCRIBE_RUNTIME_NOT_READY/);
  assert.match(adapter, /list_unsubscribe_url/);
});

test("owned messaging delivery has durable recipient-level exactly-once evidence", () => {
  const migration = fs.readFileSync("supabase/migrations/20260924162500_marketing_campaign_message_delivery_ledger.sql", "utf8");
  const ledger = fs.readFileSync("lib/marketing/campaigns/MarketingCampaignMessageDeliveryRuntime.js", "utf8");
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OwnedMessagingCampaignAdapter.js", "utf8");
  const execution = fs.readFileSync("lib/marketing/campaigns/MarketingCampaignExecutionRuntime.js", "utf8");
  const executionApi = fs.readFileSync("app/api/marketing/campaign-execution/route.js", "utf8");
  assert.match(migration, /marketing_campaign_message_deliveries/);
  assert.match(migration, /unique \(organization_id, delivery_key\)/);
  assert.match(migration, /service_usage_id uuid null references public\.platform_service_usage\(id\)/);
  assert.match(migration, /Recipient addresses are intentionally not persisted/);
  assert.match(ledger, /delivery_status !== "FAILED"/);
  assert.match(ledger, /SKIPPED|claim/);
  assert.match(ledger, /CAMPAIGN_DELIVERY_SENT_STATE_CONFLICT/);
  assert.match(ledger, /MARKETING_CAMPAIGN_MESSAGE_LEDGER_MIGRATION_REQUIRED/);
  assert.match(adapter, /MarketingCampaignMessageDeliveryRuntime\.claim/);
  assert.match(adapter, /MarketingCampaignMessageDeliveryRuntime\.markSent/);
  assert.match(adapter, /MarketingCampaignMessageDeliveryRuntime\.markFailed/);
  assert.match(adapter, /SKIPPED_DUPLICATE_OR_IN_FLIGHT/);
  assert.match(execution, /marketingCampaignId/);
  assert.match(executionApi, /marketingCampaignId,/);
});

test("campaign channel UX starts neutral and configures one selected channel at a time", () => {
  assert.match(component, /channels: \[\]/);
  assert.match(component, /Configure Selected Channel/);
  assert.match(component, /Only one channel editor is open at a time/);
  assert.match(component, /selectedReadyCount/);
  assert.match(component, /selectedPlanningCount/);
  assert.match(component, /Choose one or more channels above to configure them/);
});

test("final Review accounts for owned messaging and every remaining planning-only channel", () => {
  assert.match(component, /OwnedMessagingReview/);
  assert.match(component, /PlanningChannelReview/);
  assert.match(component, /ownedMessagingSelected/);
  assert.match(component, /planningReviewSelected/);
  assert.match(component, /Planning only · activation gate closed/);
});

test("Facebook and Instagram organic campaigns are certified as image-only governed Meta publishing", () => {
  const translator = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignPlanTranslator.js", "utf8");
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignAdapter.js", "utf8");
  const metaCredential = fs.readFileSync("lib/platform/service-runtime/providers/meta/ManagedMetaCredentialRegistration.js", "utf8");
  const metaProvider = fs.readFileSync("lib/platform/service-runtime/providers/meta/MetaProvider.js", "utf8");
  assert.match(translator, /facebook:[\s\S]*service_id: "facebook"[\s\S]*credential_provider: "facebook_messenger"[\s\S]*marketing\.facebook\.publish/);
  assert.match(translator, /instagram:[\s\S]*service_id: "instagram"[\s\S]*credential_provider: "instagram_messaging"[\s\S]*marketing\.instagram\.publish/);
  assert.match(adapter, /\["facebook", "instagram", "pinterest", "linkedin", "google_business"\]/);
  assert.match(adapter, /META_ORGANIC_IMAGE_ASSET_REQUIRED/);
  assert.match(adapter, /page_id: asset\.external_id/);
  assert.match(adapter, /instagram_business_id: asset\.external_id/);
  assert.match(adapter, /provider: destination\.credential_provider \|\| destination\.provider_id/);
  assert.match(metaCredential, /if \(credential_id && organization_id\)/);
  assert.match(metaCredential, /organizationMessagingCredential/);
  assert.match(metaProvider, /publishFacebook\(\{ organization_id, pageId: page_id, accessToken: access_token, caption: message, imageUrl: image_url \}\)/);
  assert.match(component, /Approved image · required/);
});

test("Facebook and Instagram are present in organic readiness, snapshots and final review", () => {
  assert.match(readiness, /facebook: \{[\s\S]*provider: "meta"[\s\S]*service_id: "facebook"[\s\S]*capability: "marketing\.facebook\.publish"[\s\S]*asset_type: "facebook_page"/);
  assert.match(readiness, /instagram: \{[\s\S]*provider: "meta"[\s\S]*service_id: "instagram"[\s\S]*capability: "marketing\.instagram\.publish"[\s\S]*asset_type: "instagram_business"/);
  assert.match(route, /\["facebook", "instagram", "pinterest", "youtube", "linkedin", "threads", "tiktok", "x", "google_business"\]/);
  assert.match(component, /organicExecutableSelected = form\.channels\.filter\(\(channelId\) => \["facebook", "instagram", "pinterest", "youtube", "linkedin", "threads", "tiktok", "x", "google_business"\]/);
});


test("YouTube campaign publishing uses an approved video and provider-native upload fields", () => {
  const translator = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignPlanTranslator.js", "utf8");
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignAdapter.js", "utf8");
  const provider = fs.readFileSync("lib/platform/service-runtime/providers/youtube/YouTubeProvider.js", "utf8");
  const translated = translateOrganicSocialCampaignPlan({
    plan: { creative: { primary_text: "" } },
    channel: { networks: ["youtube"], provider_settings: { network_settings: { youtube: {
      account_asset_id: "youtube-channel",
      creative_asset_id: "video-asset",
      title: "Churchill Phuket",
      description: "Dinner and live music",
      privacy_status: "unlisted",
      tags: ["Phuket", "Karon"],
      category_id: "22",
    } } } },
  });
  assert.equal(translated.destinations[0].capability, "marketing.youtube.publish");
  assert.equal(translated.destinations[0].title, "Churchill Phuket");
  assert.equal(translated.destinations[0].privacy_status, "unlisted");
  assert.match(adapter, /YOUTUBE_VIDEO_ASSET_REQUIRED/);
  assert.match(adapter, /video_url: creative\.provider_url/);
  assert.match(provider, /YOUTUBE_VIDEO_TOO_LARGE_FOR_AVANTIQO_UPLOAD/);
  assert.match(provider, /privacyStatus:privacy/);
  assert.match(component, /YouTube · Video Upload/);
  assert.match(component, /Approved video · required/);
  assert.match(component, /This video is made for kids/);
});

test("Pinterest campaign publishing uses live board discovery and an approved image Pin", () => {
  const translator = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignPlanTranslator.js", "utf8");
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OrganicSocialCampaignAdapter.js", "utf8");
  const provider = fs.readFileSync("lib/platform/service-runtime/providers/pinterest/PinterestProvider.js", "utf8");
  const boardsRoute = fs.readFileSync("app/api/marketing/pinterest-boards/route.js", "utf8");
  const translated = translateOrganicSocialCampaignPlan({
    plan: { creative: { primary_text: "" } },
    channel: { networks: ["pinterest"], provider_settings: { network_settings: { pinterest: {
      account_asset_id: "pinterest-account",
      creative_asset_id: "image-asset",
      board_id: "board-1",
      title: "Dinner in Karon",
      description: "Churchill Restaurant & Bar",
      destination_url: "https://example.com/book",
    } } } },
  });
  assert.equal(translated.destinations[0].capability, "marketing.pinterest.publish");
  assert.equal(translated.destinations[0].board_id, "board-1");
  assert.match(adapter, /PINTEREST_IMAGE_ASSET_REQUIRED/);
  assert.match(adapter, /board_id: destination\.board_id/);
  assert.match(provider, /PINTEREST_PUBLIC_HTTPS_IMAGE_REQUIRED/);
  assert.match(provider, /marketing\.pinterest\.boards\.read/);
  assert.match(boardsRoute, /PinterestProvider\.execute/);
  assert.match(boardsRoute, /marketing\.pinterest\.boards\.read/);
  assert.match(component, /Pinterest · Image Pin/);
  assert.match(component, /Load Boards/);
  assert.match(component, /Approved image · required/);
});

test("organic readiness requires the exact organization asset for every executable network", () => {
  assert.match(readiness, /asset_provider: "meta", asset_type: "facebook_page"/);
  assert.match(readiness, /asset_provider: "meta", asset_type: "instagram_business"/);
  assert.match(readiness, /asset_provider: "pinterest", asset_type: "pinterest_account"/);
  assert.match(readiness, /asset_provider: "youtube", asset_type: "youtube_channel"/);
  assert.match(readiness, /const assetReady = matchingAssets\.length > 0/);
  assert.match(readiness, /asset_ready: assetReady/);
  assert.match(component, /Select or reconnect the \$\{channel\.name\} organization asset/);
});

test("owned messaging readiness exposes exact activation blockers", () => {
  assert.match(readiness, /ownedMessagingGovernanceReadiness/);
  assert.match(readiness, /Campaign consent governance migration is not deployed/);
  assert.match(readiness, /Campaign message delivery ledger migration is not deployed/);
  assert.match(readiness, /Email campaign unsubscribe secret is not configured/);
  assert.match(readiness, /Owned messaging campaign adapter activation gate remains closed/);
  assert.match(readiness, /provider_specific:[\s\S]*owned_messaging: ownedMessagingGovernance/);
});

test("owned messaging uses canonical organization service ids", () => {
  const catalog = fs.readFileSync("lib/marketing/campaigns/MarketingChannelCatalog.js", "utf8");
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OwnedMessagingCampaignAdapter.js", "utf8");
  for (const serviceId of ["email", "whatsapp", "line", "telegram", "sms"]) {
    assert.match(catalog, new RegExp(`\\"${serviceId}\\"`));
    assert.match(adapter, new RegExp(`service_id: \\"${serviceId}\\"`));
  }
  assert.doesNotMatch(catalog, /email-campaigns|whatsapp-messaging|line-messaging|telegram-messaging|sms-campaigns/);
  assert.doesNotMatch(adapter, /email-campaigns|whatsapp-messaging|line-messaging|telegram-messaging|sms-campaigns/);
  assert.match(readiness, /Organization service is not installed/);
});

test("SMS campaigns use consent-gated exactly-once owned messaging architecture", () => {
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OwnedMessagingCampaignAdapter.js", "utf8");
  const translator = fs.readFileSync("lib/marketing/campaigns/adapters/OwnedMessagingCampaignPlanTranslator.js", "utf8");
  const registry = fs.readFileSync("lib/marketing/campaigns/adapters/MarketingCampaignAdapterRegistry.js", "utf8");
  const ledger = fs.readFileSync("supabase/migrations/20260924162500_marketing_campaign_message_delivery_ledger.sql", "utf8");
  assert.match(registry, /sms: OwnedMessagingCampaignAdapter/);
  assert.match(adapter, /sms: \{ service_id: "sms", capability: "communication\.sms\.send"/);
  assert.match(adapter, /translated\.channel_id === "sms"/);
  assert.match(translator, /"sms"/);
  assert.match(route, /\["email", "whatsapp", "line", "telegram", "sms"\]/);
  assert.match(component, /\["email", "whatsapp", "line", "telegram", "sms"\]/);
  assert.match(ledger, /'sms'/);
});

test("SMS campaign planning reports GSM-7 and UCS-2 segment estimates", async () => {
  const { analyzeSmsSegments } = await import("../lib/marketing/campaigns/SmsSegmentation.js");
  assert.deepEqual(analyzeSmsSegments("hello"), {
    encoding: "GSM-7", characters: 5, units: 5, segments: 1, remaining_units: 155, single_segment_limit: 160, multipart_segment_limit: 153,
  });
  assert.equal(analyzeSmsSegments("^".repeat(81)).segments, 2);
  assert.equal(analyzeSmsSegments("^".repeat(81)).units, 162);
  assert.equal(analyzeSmsSegments("ก".repeat(70)).encoding, "UCS-2");
  assert.equal(analyzeSmsSegments("ก".repeat(70)).segments, 1);
  assert.equal(analyzeSmsSegments("ก".repeat(71)).segments, 2);
  assert.equal(analyzeSmsSegments("🙂".repeat(36)).segments, 2);
  assert.match(component, /Estimated segments/);
  assert.match(component, /Twilio may charge per SMS segment/);
});

test("Google Business campaign surface resolves to the certified organic-social adapter", () => {
  assert.match(component, /google_business: \["organic_social", "google_business"\]/);
  assert.match(route, /google_business: \{ channel: "organic_social", network: "google_business" \}/);
  assert.doesNotMatch(component, /google_business: \["local_discovery", "google_business"\]/);
  assert.doesNotMatch(route, /google_business: \{ channel: "local_discovery", network: "google_business" \}/);
});

test("saved campaign readiness snapshots preserve real planning blockers", () => {
  assert.match(route, /row\?\.reasons\?\.length \? row\.reasons/);
});

test("campaign schedules resolve organization-local dates instead of assuming UTC", () => {
  assert.match(route, /resolveOrganizationTimeContext/);
  assert.match(route, /zonedDateTimeToUtc/);
  assert.match(route, /organizationInput\.organizationTimezone = timeContext\.timezone/);
  assert.match(route, /scheduled_at: campaignSchedule\(organizationInput\)\.start_time/);
  assert.match(route, /time: "00:00:00", timezone/);
  assert.match(route, /time: "23:59:59", timezone/);
  assert.doesNotMatch(route, /timezone: "Asia\/Bangkok"/);
  assert.doesNotMatch(route, /T00:00:00\.000Z/);
});

test("Google Ads preserves organization-local provider dates and timezone alignment", () => {
  const translator = fs.readFileSync("lib/marketing/campaigns/adapters/GoogleAdsCampaignPlanTranslator.js", "utf8");
  const runtime = fs.readFileSync("lib/marketing/services/GoogleAdsRuntime.js", "utf8");
  assert.match(route, /local_start_date: text\(input\.startDate\)/);
  assert.match(route, /local_end_date: text\(input\.endDate\)/);
  assert.match(route, /Google Ads account timezone must match the organization timezone/);
  assert.match(translator, /GOOGLE_ADS_LOCAL_DATES_REQUIRED/);
  assert.match(translator, /startDate: localStartDate/);
  assert.match(translator, /endDate: localEndDate/);
  assert.match(runtime, /startDate: providerStartDate\.replace\(\/-\/g, ""\)/);
  assert.match(runtime, /endDate: providerEndDate\.replace\(\/-\/g, ""\)/);
  assert.doesNotMatch(runtime, /startDate: googleDate\(startTime\)/);
  assert.doesNotMatch(runtime, /endDate: googleDate\(endTime\)/);
  assert.match(component, /Organization timezone/);
  assert.match(component, /Account timezone/);
  assert.match(component, /accountTimezone === orgTimezone/);
});

test("Meta supports lifetime and daily budget delivery without exceeding authorization", () => {
  const basePlan = {
    name: "Meta budget mode test",
    audience: { included_locations: [{ type: "country", country_code: "TH" }], age_min: 18, age_max: 65, genders: [], languages: [], interests: [], behaviors: [], keywords: [], negative_keywords: [], custom_audience_ids: [], excluded_audience_ids: [], lookalike_audience_ids: [] },
    budget: { amount: 3000, currency: "THB", mode: "daily", daily_amount: 500, bid_strategy: "lowest_cost" },
    schedule: { start_time: "2026-09-24T17:00:00.000Z", end_time: "2026-09-29T16:59:59.000Z", timezone: "Asia/Bangkok" },
    creative: { asset_ids: ["asset-1"], exact_asset_required: true, primary_text: "Dinner in Phuket", headline: "Book now", description: "Reserve your table", destination_url: "https://example.com", call_to_action: "BOOK_NOW" },
  };
  const channel = { channel_id: "meta", networks: ["facebook"], destination: "WEBSITE", provider_settings: { page_asset_id: "page-asset-1", special_ad_categories: [] } };
  const translated = translateMetaCampaignPlan({ plan: basePlan, channel });
  assert.equal(translated.adSet.daily_budget, 50000);
  assert.equal(translated.adSet.lifetime_budget, undefined);

  assert.throws(() => translateMetaCampaignPlan({ plan: { ...basePlan, budget: { ...basePlan.budget, daily_amount: 700 } }, channel }), (error) => error?.code === "META_DAILY_BUDGET_EXCEEDS_AUTHORIZATION");
  const lifetime = translateMetaCampaignPlan({ plan: { ...basePlan, budget: { ...basePlan.budget, mode: "lifetime", daily_amount: null } }, channel });
  assert.equal(lifetime.adSet.lifetime_budget, 300000);
  assert.equal(lifetime.adSet.daily_budget, undefined);
  assert.match(component, /Budget delivery/);
  assert.match(component, /Lifetime budget/);
  assert.match(component, /Daily budget/);
});

test("managed Meta Ads exposes and accepts image creative only", () => {
  assert.match(component, /approval_status === "APPROVED" && String\(asset\.media_kind \|\| ""\)\.toUpperCase\(\) === "IMAGE"/);
  assert.match(component, /Exact approved image/);
  assert.match(route, /current managed Meta Ads adapter requires an approved image creative/);
  assert.match(readiness, /formats: \["IMAGE"\]/);
  assert.match(readiness, /catalog_formats:/);
});

test("Meta destination compatibility constrains objective and optimization", () => {
  const basePlan = {
    name: "Meta compatibility",
    audience: { included_locations: [{ type: "country", country_code: "TH" }], age_min: 18, age_max: 65, genders: [], languages: [], interests: [], behaviors: [], keywords: [], negative_keywords: [], custom_audience_ids: [], excluded_audience_ids: [], lookalike_audience_ids: [] },
    budget: { amount: 1000, currency: "THB", mode: "lifetime", bid_strategy: "lowest_cost" },
    schedule: { start_time: "2026-09-24T17:00:00.000Z", end_time: "2026-09-25T16:59:59.000Z", timezone: "Asia/Bangkok" },
    creative: { asset_ids: ["asset-1"], exact_asset_required: true, primary_text: "Test", headline: "Book", description: "Test", destination_url: "https://example.com", call_to_action: "BOOK_NOW" },
  };
  const websiteConversion = translateMetaCampaignPlan({ plan: basePlan, channel: { channel_id: "meta", networks: ["facebook"], destination: "WEBSITE", optimization_goal: "OFFSITE_CONVERSIONS", conversion_event: "PURCHASE", provider_settings: { page_asset_id: "page-asset-1", pixel_id: "123456", special_ad_categories: [] } } });
  assert.equal(websiteConversion.campaign.objective, "OUTCOME_SALES");
  assert.equal(websiteConversion.adSet.optimization_goal, "OFFSITE_CONVERSIONS");

  assert.throws(() => translateMetaCampaignPlan({ plan: basePlan, channel: { channel_id: "meta", networks: ["facebook"], destination: "WHATSAPP", objective: "OUTCOME_TRAFFIC", optimization_goal: "CONVERSATIONS", provider_settings: { page_asset_id: "page-asset-1" } } }), (error) => error?.code === "META_OBJECTIVE_DESTINATION_MISMATCH");
  assert.throws(() => translateMetaCampaignPlan({ plan: basePlan, channel: { channel_id: "meta", networks: ["facebook"], destination: "ENGAGEMENT", optimization_goal: "OFFSITE_CONVERSIONS", provider_settings: { page_asset_id: "page-asset-1" } } }), (error) => error?.code === "META_OPTIMIZATION_DESTINATION_MISMATCH");
  assert.match(component, /META_DESTINATION_COMPATIBILITY/);
  assert.match(component, /not compatible with this destination/);
});

test("Meta UTM controls are applied to the exact provider destination URL", () => {
  const translated = translateMetaCampaignPlan({
    plan: {
      name: "Meta UTM test",
      audience: { included_locations: [{ type: "country", country_code: "TH" }], age_min: 18, age_max: 65, genders: [], languages: [], interests: [], behaviors: [], keywords: [], negative_keywords: [], custom_audience_ids: [], excluded_audience_ids: [], lookalike_audience_ids: [] },
      budget: { amount: 1000, currency: "THB", mode: "lifetime", bid_strategy: "lowest_cost" },
      schedule: { start_time: "2026-09-24T17:00:00.000Z", end_time: "2026-09-25T16:59:59.000Z", timezone: "Asia/Bangkok" },
      creative: {
        asset_ids: ["asset-1"], exact_asset_required: true, primary_text: "Test", headline: "Book", description: "Test",
        destination_url: "https://example.com/book?existing=1",
        call_to_action: "BOOK_NOW",
        utm_parameters: { source: "facebook", medium: "paid_social", campaign: "launch", content: "hero" },
      },
    },
    channel: { channel_id: "meta", networks: ["facebook"], destination: "WEBSITE", provider_settings: { page_asset_id: "page-asset-1", special_ad_categories: [] } },
  });
  const url = new URL(translated.creative.link_url);
  assert.equal(url.searchParams.get("existing"), "1");
  assert.equal(url.searchParams.get("utm_source"), "facebook");
  assert.equal(url.searchParams.get("utm_medium"), "paid_social");
  assert.equal(url.searchParams.get("utm_campaign"), "launch");
  assert.equal(url.searchParams.get("utm_content"), "hero");
});

test("Google Ads manager hierarchy is resolved from the selected account, not typed by the customer", () => {
  assert.doesNotMatch(component, /Login customer ID/);
  assert.match(component, /Manager hierarchy/);
  assert.match(readiness, /login_customer_id: asset\.metadata\?\.login_customer_id/);
  assert.match(route, /login_customer_id: text\(selectedAccount\?\.metadata\?\.login_customer_id\) \|\| null/);
  assert.match(route, /googleAdsExecutionPlanSnapshot\(input, channelPlan, channelAssets\)/);
});

test("single-organization campaign UI uses explicit capability rendering", () => {
  const layout = fs.readFileSync("app/(system)/workspace/[organizationId]/commercial/marketing/campaigns/layout.jsx", "utf8");
  assert.match(layout, /CampaignCommandCenter allowMultiOrganization=\{canUseWholeCampaign\}/);
  assert.doesNotMatch(layout, /nth-child/);
  assert.match(component, /function CampaignCommandCenter\(\{ allowMultiOrganization = false \}\)/);
  assert.match(component, /\{allowMultiOrganization \? \(/);
  assert.match(component, /Create the organization campaign with its audience, channels, creative direction, schedule and governed spend controls/);
});

test("SMS appears only in the owned-messaging final review", () => {
  assert.match(component, /detailedReviewChannels = new Set\(\[.*"sms"\]\)/s);
  assert.match(component, /ownedMessagingSelected = form\.channels\.filter\(\(channelId\) => \["email", "whatsapp", "line", "telegram", "sms"\]/);
});

test("single-organization mode renders no multi-organization selection or review noise", () => {
  assert.match(component, /allowMultiOrganization && organizations\.length > 1/);
  assert.match(component, /if \(!allowMultiOrganization\) return defaultSelection/);
  assert.match(component, /if \(!allowMultiOrganization\) return;/);
  assert.match(component, /label=\{multiOrganization \? "Organizations" : "Organization"\}/);
  assert.match(component, /\{multiOrganization && !mixedOrganizationCurrencies \? <ReviewItem label="Master Campaign Budget"/);
  assert.match(component, /multiOrganization \? "Channel readiness by organization" : "Channel readiness"/);
  assert.doesNotMatch(component, /Master Campaign Budget" value=.*Not applicable/);
});

test("Google Ads UTM controls are applied to the provider landing page", () => {
  const translated = translateGoogleAdsCampaignPlan({
    plan: {
      name: "Google UTM test",
      audience: {
        included_locations: [{ id: "1012728", name: "Phuket" }],
        excluded_locations: [],
        languages: [],
        keywords: [{ text: "restaurant phuket", match_type: "EXACT" }],
        negative_keywords: [],
      },
      budget: { amount: 1000, currency: "THB", daily_amount: 100 },
      schedule: {
        start_time: "2026-09-24T17:00:00.000Z",
        end_time: "2026-09-26T16:59:59.000Z",
        timezone: "Asia/Bangkok",
        local_start_date: "2026-09-25",
        local_end_date: "2026-09-26",
      },
      creative: {
        headlines: ["Restaurant Phuket", "Dinner in Karon", "Book Your Table"],
        descriptions: ["International dining in Karon.", "Reserve your table online today."],
        destination_url: "https://example.com/book?existing=1",
        utm_parameters: { source: "google", medium: "cpc", campaign: "launch", term: "restaurant", content: "rsa1" },
      },
    },
    channel: { channel_id: "google_ads", provider_settings: { account_asset_id: "account-1" } },
  });
  const url = new URL(translated.destinationUrl);
  assert.equal(url.searchParams.get("existing"), "1");
  assert.equal(url.searchParams.get("utm_source"), "google");
  assert.equal(url.searchParams.get("utm_medium"), "cpc");
  assert.equal(url.searchParams.get("utm_campaign"), "launch");
  assert.equal(url.searchParams.get("utm_term"), "restaurant");
  assert.equal(url.searchParams.get("utm_content"), "rsa1");
  assert.match(component, /<MetaSection title="Tracking">/);
  assert.match(route, /term: text\(settings\.utmTerm\)/);
});

test("Messenger and generic unfinished surfaces are explicit strategy blueprints", () => {
  assert.match(component, /EXPLICIT_PLANNING_ONLY_SURFACES = new Set\(\["messenger"\]\)/);
  assert.match(component, /Messenger campaign execution is not certified yet|\$\{channel\.name\} campaign execution is not certified yet/);
  assert.match(component, /Strategy blueprint only\. These fields are saved with the campaign for future provider implementation/);
  assert.match(component, /state\?\.label === "Planned only" \? "Strategy blueprint" : "Per channel"/);
  assert.match(route, /messenger: \{ channel: "meta", network: "messenger", planning_only: true \}/);
});

test("campaign currency comes from each organization and mixed currencies are never falsely aggregated", () => {
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/commercial/marketing/campaigns/page.jsx", "utf8");
  const whole = fs.readFileSync("app/(system)/workspace/[organizationId]/commercial/marketing/campaigns/whole/page.jsx", "utf8");
  assert.doesNotMatch(component, /currencyCode: "THB"/);
  assert.match(component, /organizationBudgets: \{\}/);
  assert.match(component, /mixedOrganizationCurrencies/);
  assert.match(component, /No master monetary total is calculated across currencies/);
  assert.match(route, /organizationInput\.currencyCode = text\(timeContext\.currency\)\.toUpperCase\(\)/);
  assert.match(route, /currency_mode: mixedCurrencies \? "PER_ORGANIZATION" : "SHARED"/);
  assert.match(route, /budgets_by_organization: budgetByOrganization/);
  assert.match(route, /A master monetary budget cannot be used across organizations with different currencies/);
  assert.match(route, /campaign_budget: amount\(input\.organizationBudget\)/);
  assert.match(page, /function money\(value, currency = null\)/);
  assert.match(page, /campaignCurrency\(content\)/);
  assert.match(whole, /mixedCurrencies = content\.currency_mode === "PER_ORGANIZATION"/);
  assert.match(whole, /value=\{mixedCurrencies \? "Per organization"/);
  assert.doesNotMatch(whole, /Spend Authorized: THB 0/);
});

test("multi-organization channel monetary settings are isolated client and server side", () => {
  assert.match(component, /function organizationSpecificSetting\(key\)/);
  assert.match(component, /\["authorizedBudget", "dailyBudget", "bidCap", "costCap", "plannedBudget"\]\.includes\(key\)/);
  assert.match(component, /multiOrganization && organizationSpecificSetting\(key\)/);
  assert.match(route, /function organizationSpecificChannelSetting\(key\)/);
  assert.match(route, /if \(organizationSpecificChannelSetting\(key\)\) delete commonSettings\[key\]/);
});

test("Ads Portfolio Intelligence refuses cross-currency monetary aggregation without FX normalization", () => {
  const intelligence = fs.readFileSync("lib/marketing/intelligence/buildAdsPortfolioIntelligence.js", "utf8");
  assert.match(intelligence, /currency_code: currency/);
  assert.match(intelligence, /mixedCurrencies = group\.campaign_content\?\.currency_mode === "PER_ORGANIZATION" \|\| currencies\.length > 1/);
  assert.match(intelligence, /monetaryTotals = mixedCurrencies \? null/);
  assert.match(intelligence, /compareAbsoluteProfit: !mixedCurrencies/);
  assert.match(intelligence, /cross_currency_aggregation_available: !mixedCurrencies/);
  assert.match(intelligence, /can_aggregate_cross_currency_money_without_fx: false/);
  assert.match(intelligence, /next_spend_priority: nextBahtPriority/);
  assert.match(intelligence, /version: "ads-intelligence-v4-currency-aware"/);
  assert.doesNotMatch(intelligence, /next advertising baht/);
});

test("Facebook and Instagram appear only in the certified organic-social review", () => {
  assert.match(component, /detailedReviewChannels = new Set\(\["meta_ads", "google_ads", "facebook", "instagram"/);
  assert.match(component, /organicExecutableSelected = form\.channels\.filter\(\(channelId\) => \["facebook", "instagram"/);
});

test("Google Search Partners is an explicit governed provider setting", () => {
  const translator = fs.readFileSync("lib/marketing/campaigns/adapters/GoogleAdsCampaignPlanTranslator.js", "utf8");
  const runtime = fs.readFileSync("lib/marketing/services/GoogleAdsRuntime.js", "utf8");
  assert.match(component, /Include Google Search Partners/);
  assert.match(component, /Search Partners/);
  assert.match(route, /search_partners: settings\.searchPartners === true/);
  assert.match(translator, /searchPartners: channel\?\.provider_settings\?\.search_partners === true/);
  assert.match(runtime, /targetPartnerSearchNetwork: searchPartners === true/);
  assert.match(runtime, /search_partners: searchPartners === true/);
  assert.match(runtime, /targetContentNetwork: false/);
});

test("Google Ads budget semantics are daily delivery under a total authorization ceiling", () => {
  const googleSection = route.slice(route.indexOf("function googleAdsExecutionPlanSnapshot"), route.indexOf("function ownedMessagingPlannedExecutionPlans"));
  assert.match(googleSection, /mode: "daily_with_total_authorization"/);
  assert.doesNotMatch(googleSection, /budgetMode \|\| "lifetime"/);
});

test("multi-organization creation validates every organization before the first write", () => {
  assert.match(route, /async function prepareCampaignForOrganization/);
  assert.match(route, /async function insertPreparedCampaign/);
  assert.match(route, /const preparedCampaigns = await Promise\.all\(organizations\.map/);
  assert.match(route, /preparedChildBudgetTotal/);
  assert.match(route, /for \(const prepared of preparedCampaigns\) \{\s*createdCampaigns\.push\(await insertPreparedCampaign\(prepared\)\);/s);
  const prepareAt = route.indexOf("const preparedCampaigns = await Promise.all");
  const insertAt = route.indexOf("createdCampaigns.push(await insertPreparedCampaign(prepared))");
  const currencyGateAt = route.indexOf("A master monetary budget cannot be used across organizations with different currencies");
  assert.ok(prepareAt >= 0 && currencyGateAt > prepareAt && insertAt > currencyGateAt);
});

test("campaign creation rollback failures are explicit and reconcilable", () => {
  assert.match(route, /const cleanupFailures = \[\]/);
  assert.match(route, /CAMPAIGN_CREATE_ROLLBACK_INCOMPLETE/);
  assert.match(route, /cleanup_failures: cleanupFailures/);
  assert.match(route, /details: error\?\.details \|\| null/);
});

test("Meta Ads uses exact organization Page and linked Instagram identity assets", () => {
  const runtime = fs.readFileSync("lib/marketing/services/MetaAdsRuntime.js", "utf8");
  assert.match(component, /<MetaSection title="Ad Identity">/);
  assert.match(component, /Facebook Page · required/);
  assert.match(component, /Select linked Instagram account/);
  assert.match(component, /instagramAsset\.metadata\?\.facebook_page_id/);
  assert.match(route, /meta_ads: \{\s*pageAssetId: \[\["meta", "facebook_page"\]\],\s*instagramAssetId: \[\["meta", "instagram_business"\]\]/s);
  assert.match(route, /page_asset_id: text\(settings\.pageAssetId\)/);
  assert.match(route, /instagram_asset_id: text\(settings\.instagramAssetId\)/);
  assert.match(route, /Selected Instagram identity is not linked to the selected Facebook Page/);
  assert.match(runtime, /resolveChannelIdentityAsset/);
  assert.match(runtime, /\.eq\("organization_id", organizationId\)/);
  assert.match(runtime, /\.eq\("channel_provider", "meta"\)/);
  assert.match(runtime, /\.eq\("asset_type", assetType\)/);
  assert.match(runtime, /pageIdentity\.external_id/);
  assert.match(runtime, /instagramIdentity\?\.external_id/);
});

test("Meta translator requires exact Page and Instagram identities", () => {
  const basePlan = {
    name: "Meta identity contract",
    audience: { included_locations: [{ type: "country", country_code: "TH" }], age_min: 18, age_max: 65, genders: [], languages: [], interests: [], behaviors: [], keywords: [], negative_keywords: [], custom_audience_ids: [], excluded_audience_ids: [], lookalike_audience_ids: [] },
    budget: { amount: 1000, currency: "THB", mode: "lifetime", bid_strategy: "lowest_cost" },
    schedule: { start_time: "2026-09-24T17:00:00.000Z", end_time: "2026-09-25T16:59:59.000Z", timezone: "Asia/Bangkok" },
    creative: { asset_ids: ["asset-1"], exact_asset_required: true, primary_text: "Test", headline: "Book", description: "Test", destination_url: "https://example.com", call_to_action: "BOOK_NOW" },
  };
  assert.throws(() => translateMetaCampaignPlan({ plan: basePlan, channel: { channel_id: "meta", networks: ["facebook"], destination: "WEBSITE", provider_settings: {} } }), (error) => error?.code === "META_PAGE_IDENTITY_REQUIRED");
  assert.throws(() => translateMetaCampaignPlan({ plan: basePlan, channel: { channel_id: "meta", networks: ["facebook", "instagram"], destination: "WEBSITE", provider_settings: { page_asset_id: "page-1" } } }), (error) => error?.code === "META_INSTAGRAM_IDENTITY_REQUIRED");
  const translated = translateMetaCampaignPlan({ plan: basePlan, channel: { channel_id: "meta", networks: ["facebook", "instagram"], destination: "WEBSITE", provider_settings: { page_asset_id: "page-1", instagram_asset_id: "ig-1" } } });
  assert.equal(translated.pageAssetId, "page-1");
  assert.equal(translated.instagramAssetId, "ig-1");
});

test("Meta manual placements cannot target a network that is not selected", () => {
  const basePlan = {
    name: "Meta placement contract",
    audience: { included_locations: [{ type: "country", country_code: "TH" }], age_min: 18, age_max: 65, genders: [], languages: [], interests: [], behaviors: [], keywords: [], negative_keywords: [], custom_audience_ids: [], excluded_audience_ids: [], lookalike_audience_ids: [] },
    budget: { amount: 1000, currency: "THB", mode: "lifetime", bid_strategy: "lowest_cost" },
    schedule: { start_time: "2026-09-24T17:00:00.000Z", end_time: "2026-09-25T16:59:59.000Z", timezone: "Asia/Bangkok" },
    creative: { asset_ids: ["asset-1"], exact_asset_required: true, primary_text: "Test", headline: "Book", description: "Test", destination_url: "https://example.com", call_to_action: "BOOK_NOW" },
  };
  assert.throws(() => translateMetaCampaignPlan({
    plan: basePlan,
    channel: { networks: ["facebook"], destination: "WEBSITE", provider_settings: { page_asset_id: "page-1", instagram_positions: ["reels"] } },
  }), (error) => error?.code === "META_INSTAGRAM_PLACEMENT_NETWORK_MISMATCH");
  assert.throws(() => translateMetaCampaignPlan({
    plan: basePlan,
    channel: { networks: ["instagram"], destination: "WEBSITE", provider_settings: { page_asset_id: "page-1", instagram_asset_id: "ig-1", facebook_positions: ["feed"] } },
  }), (error) => error?.code === "META_FACEBOOK_PLACEMENT_NETWORK_MISMATCH");
  assert.match(component, /selectedNetworks\.includes\("facebook"\)/);
  assert.match(component, /selectedNetworks\.includes\("instagram"\)/);
});

test("Meta billing event stays compatible with the selected optimization", () => {
  const basePlan = {
    name: "Meta billing contract",
    audience: { included_locations: [{ type: "country", country_code: "TH" }], age_min: 18, age_max: 65, genders: [], languages: [], interests: [], behaviors: [], keywords: [], negative_keywords: [], custom_audience_ids: [], excluded_audience_ids: [], lookalike_audience_ids: [] },
    budget: { amount: 1000, currency: "THB", mode: "lifetime", bid_strategy: "lowest_cost" },
    schedule: { start_time: "2026-09-24T17:00:00.000Z", end_time: "2026-09-25T16:59:59.000Z", timezone: "Asia/Bangkok" },
    creative: { asset_ids: ["asset-1"], exact_asset_required: true, primary_text: "Test", headline: "Book", description: "Test", destination_url: "https://example.com", call_to_action: "BOOK_NOW" },
  };
  assert.throws(() => translateMetaCampaignPlan({
    plan: basePlan,
    channel: { networks: ["facebook"], destination: "WEBSITE", optimization_goal: "OFFSITE_CONVERSIONS", billing_event: "LINK_CLICKS", provider_settings: { page_asset_id: "page-1", pixel_id: "pixel-1" }, conversion_event: "PURCHASE" },
  }), (error) => error?.code === "META_BILLING_OPTIMIZATION_MISMATCH");
  const valid = translateMetaCampaignPlan({
    plan: basePlan,
    channel: { networks: ["facebook"], destination: "WEBSITE", optimization_goal: "LINK_CLICKS", billing_event: "LINK_CLICKS", provider_settings: { page_asset_id: "page-1" } },
  });
  assert.equal(valid.adSet.billing_event, "LINK_CLICKS");
  assert.equal(valid.adSet.optimization_goal, "LINK_CLICKS");
  assert.match(component, /const billingOptions = selectedOptimization === "LINK_CLICKS"/);
  assert.match(component, /Link-click billing requires Link Clicks optimization/);
});

test("Meta Special Ad Categories remain draft-only until certified compliance preflight exists", () => {
  const plan = {
    name: "Meta special category",
    audience: { included_locations: [{ type: "country", country_code: "TH" }], age_min: 18, age_max: 65, genders: [], languages: [], interests: [], behaviors: [], keywords: [], negative_keywords: [], custom_audience_ids: [], excluded_audience_ids: [], lookalike_audience_ids: [] },
    budget: { amount: 1000, currency: "THB", mode: "lifetime", bid_strategy: "lowest_cost" },
    schedule: { start_time: "2026-09-24T17:00:00.000Z", end_time: "2026-09-25T16:59:59.000Z", timezone: "Asia/Bangkok" },
    creative: { asset_ids: ["asset-1"], exact_asset_required: true, primary_text: "Test", headline: "Test", description: "Test", destination_url: "https://example.com", call_to_action: "LEARN_MORE" },
  };
  assert.throws(() => translateMetaCampaignPlan({
    plan,
    channel: { networks: ["facebook"], destination: "WEBSITE", provider_settings: { page_asset_id: "page-1", special_ad_categories: ["HOUSING"] } },
  }), (error) => error?.code === "META_SPECIAL_AD_CATEGORY_CERTIFICATION_REQUIRED");
  assert.match(component, /Draft planning is allowed, but provider preflight remains blocked/);
  assert.match(component, /Special Ad Category campaigns remain draft-only/);
});

test("Meta preflight and execution evidence include the exact publishing identities", () => {
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/MetaCampaignAdapter.js", "utf8");
  assert.match(adapter, /page_asset_id: translated\.pageAssetId/);
  assert.match(adapter, /instagram_asset_id: translated\.instagramAssetId/);
  assert.match(adapter, /daily_budget_minor: translated\.adSet\.daily_budget/);
});

test("owned messaging senders stay bound to an active exact connection credential", () => {
  const adapter = fs.readFileSync("lib/marketing/campaigns/adapters/OwnedMessagingCampaignAdapter.js", "utf8");
  assert.match(adapter, /ChannelConnectionRuntime\.list\(organizationId\)/);
  assert.match(adapter, /OWNED_MESSAGING_SENDER_CONNECTION_INACTIVE/);
  assert.match(adapter, /connection_credentials_reference: text\(activeConnection\.credentials_reference\) \|\| null/);
  assert.match(adapter, /credential_id: prepared\.asset\.connection_credentials_reference \|\| undefined/);
  assert.match(adapter, /sender_credential_binding: prepared\.asset\.connection_credentials_reference \? "CONNECTION_SPECIFIC" : "ORGANIZATION_DEFAULT"/);
});

test("campaign read surfaces use currency-neutral formatting and readable Avantiqo warnings", () => {
  const page = fs.readFileSync("app/(system)/workspace/[organizationId]/commercial/marketing/campaigns/page.jsx", "utf8");
  const whole = fs.readFileSync("app/(system)/workspace/[organizationId]/commercial/marketing/campaigns/whole/page.jsx", "utf8");
  const intelligencePage = fs.readFileSync("app/(system)/workspace/[organizationId]/commercial/marketing/campaigns/whole/intelligence/page.jsx", "utf8");
  assert.match(page, /function campaignCurrency\(content = \{\}\)/);
  assert.match(page, /function money\(value, currency = null\)/);
  assert.match(whole, /function campaignCurrency\(campaign = \{\}, groupCurrency = null\)/);
  assert.doesNotMatch(whole, /currency: currency \|\| "THB"/);
  assert.match(intelligencePage, /Next Spend Allocation/);
  assert.match(intelligencePage, /next_spend_priority \|\| allocation\?\.next_baht_priority/);
  assert.doesNotMatch(intelligencePage, /text-amber-100/);
  assert.match(intelligencePage, /Multi-Organization Campaign/);
});

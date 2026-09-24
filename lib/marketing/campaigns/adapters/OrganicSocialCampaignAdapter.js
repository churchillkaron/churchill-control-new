import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import { resolveProvider } from "@/lib/platform/service-runtime/providers/ProviderResolver";
import { PricingRuntime } from "@/lib/platform/service-runtime/pricing/PricingRuntime";
import { resolveServiceCapabilities } from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { campaignPlanFingerprint } from "@/lib/marketing/campaigns/CampaignPlanFingerprint";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import "@/lib/marketing/bootstrap/registerMarketingPublishers";
import "@/lib/platform/service-runtime/providers/google/GoogleCredentialRegistration";
import "@/lib/platform/service-runtime/providers/linkedin/LinkedInCredentialRegistration";
import "@/lib/platform/service-runtime/providers/threads/ThreadsCredentialRegistration";
import "@/lib/platform/service-runtime/providers/tiktok/TikTokCredentialRegistration";
import { TikTokProvider } from "@/lib/platform/service-runtime/providers/tiktok/TikTokProvider";
import "@/lib/platform/service-runtime/providers/x/XCredentialRegistration";
import {
  ORGANIC_SOCIAL_EXECUTABLE_NETWORKS,
  translateOrganicSocialCampaignPlan,
} from "@/lib/marketing/campaigns/adapters/OrganicSocialCampaignPlanTranslator";

function text(value) {
  return String(value ?? "").trim();
}

function executionError({ stage, code, message, provider = "organic_social", correction = null, details = null, cause = null }) {
  const error = new Error(message);
  error.name = "CampaignExecutionError";
  error.stage = stage;
  error.code = code;
  error.provider = provider;
  error.correction = correction;
  error.details = details;
  error.status = 400;
  if (cause) error.cause = cause;
  return error;
}

async function accountAsset({ organizationId, destination }) {
  const { data, error } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,organization_id,connection_id,channel_provider,asset_type,external_id,name,entity_id,metadata")
    .eq("id", destination.account_asset_id)
    .eq("organization_id", organizationId)
    .eq("channel_provider", destination.asset_provider)
    .eq("asset_type", destination.asset_type)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw executionError({
      stage: "CHANNEL_ASSET_PREFLIGHT",
      code: "ORGANIC_SOCIAL_ACCOUNT_ASSET_INVALID",
      provider: destination.provider_id,
      message: `Selected ${destination.network} publishing account is not available for this organization`,
      correction: `Reconnect or reselect the ${destination.network} account before approval.`,
      details: { network: destination.network, account_asset_id: destination.account_asset_id },
    });
  }
  if (destination.network === "google_business" && !data.entity_id) {
    throw executionError({
      stage: "CHANNEL_ASSET_PREFLIGHT",
      code: "GOOGLE_BUSINESS_LOCATION_ENTITY_MAPPING_REQUIRED",
      provider: "google",
      message: "Google Business location must be mapped to an Avantiqo legal entity before publishing",
      correction: "Map the Business Profile location in Google Business setup and retry preflight.",
    });
  }
  return data;
}

function creativeApproval(asset = {}) {
  const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? asset.metadata : {};
  const review = asset.review && typeof asset.review === "object" && !Array.isArray(asset.review)
    ? asset.review
    : metadata.review && typeof metadata.review === "object" && !Array.isArray(metadata.review)
      ? metadata.review
      : {};
  return Boolean(
    metadata.owner_approved === true ||
    metadata.brand_approved === true ||
    metadata.approved === true ||
    review.approved === true ||
    review.human_reviewed === true
  );
}

function creativeKind(asset = {}) {
  const mime = text(asset.mime_type || asset.metadata?.mime_type || asset.analysis?.mime_type).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const source = text(asset.file_url || asset.image_url || asset.url).toLowerCase();
  if (mime.startsWith("video/") || type.includes("video") || /\.(mp4|mov|m4v|webm)(\?|$)/.test(source)) return "VIDEO";
  if (mime.startsWith("image/") || type.includes("image") || type.includes("poster") || type.includes("campaign") || /\.(png|jpe?g|webp)(\?|$)/.test(source)) return "IMAGE";
  return "OTHER";
}

async function creativeAsset({ organizationId, destination, resolveUrl = false }) {
  const assetId = text(destination.creative_asset_id);
  if (!assetId) {
    if (["facebook", "instagram"].includes(destination.network)) {
      throw executionError({
        stage: "CREATIVE_PREFLIGHT",
        code: "META_ORGANIC_IMAGE_ASSET_REQUIRED",
        provider: "meta",
        message: `${destination.network} campaign publishing requires one approved organization image`,
        correction: `Select one approved image for ${destination.network} before preflight.`,
      });
    }
    if (destination.network === "pinterest") {
      throw executionError({
        stage: "CREATIVE_PREFLIGHT",
        code: "PINTEREST_IMAGE_ASSET_REQUIRED",
        provider: "pinterest",
        message: "Pinterest campaign publishing requires one approved organization image",
        correction: "Select one approved image before Pinterest preflight.",
      });
    }
    if (destination.network === "youtube") {
      throw executionError({
        stage: "CREATIVE_PREFLIGHT",
        code: "YOUTUBE_VIDEO_ASSET_REQUIRED",
        provider: "youtube",
        message: "YouTube campaign publishing requires one approved organization video",
        correction: "Select one approved video before YouTube preflight.",
      });
    }
    if (destination.network === "tiktok") {
      throw executionError({
        stage: "CREATIVE_PREFLIGHT",
        code: "TIKTOK_VIDEO_ASSET_REQUIRED",
        provider: "tiktok",
        message: "TikTok campaign publishing requires one approved organization video",
        correction: "Select an approved video before TikTok preflight.",
      });
    }
    return null;
  }
  let asset;
  try {
    asset = await CreativeAssetsRuntime.get(assetId);
  } catch {
    asset = null;
  }
  if (!asset || text(asset.organization_id) !== text(organizationId) || asset.archived === true) {
    throw executionError({
      stage: "CREATIVE_PREFLIGHT",
      code: "ORGANIC_SOCIAL_CREATIVE_ASSET_INVALID",
      provider: destination.provider_id,
      message: `Selected ${destination.network} creative is not available for this organization`,
      correction: "Select an approved organization creative asset and retry.",
    });
  }
  if (!creativeApproval(asset)) {
    throw executionError({
      stage: "CREATIVE_PREFLIGHT",
      code: "ORGANIC_SOCIAL_CREATIVE_APPROVAL_REQUIRED",
      provider: destination.provider_id,
      message: `Selected ${destination.network} creative is not approved`,
      correction: "Complete human/brand approval before publishing.",
    });
  }
  const kind = creativeKind(asset);
  const allowed = ["facebook", "instagram", "pinterest", "linkedin", "google_business"].includes(destination.network)
    ? ["IMAGE"]
    : ["tiktok", "youtube"].includes(destination.network)
      ? ["VIDEO"]
      : ["IMAGE", "VIDEO"];
  if (!allowed.includes(kind)) {
    throw executionError({
      stage: "CREATIVE_PREFLIGHT",
      code: "ORGANIC_SOCIAL_CREATIVE_TYPE_UNSUPPORTED",
      provider: destination.provider_id,
      message: `${destination.network} campaign publishing does not support selected ${kind.toLowerCase()} media`,
      correction: `Select ${allowed.join(" or ").toLowerCase()} media for ${destination.network}.`,
    });
  }
  const source = asset.file_url || asset.image_url || asset.url || null;
  if (!source) {
    throw executionError({
      stage: "CREATIVE_PREFLIGHT",
      code: "ORGANIC_SOCIAL_CREATIVE_SOURCE_REQUIRED",
      provider: destination.provider_id,
      message: `Selected ${destination.network} creative has no executable source`,
    });
  }
  const providerUrl = resolveUrl
    ? await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: source })
    : null;
  if (resolveUrl && !providerUrl) {
    throw executionError({
      stage: "CREATIVE_EXECUTION",
      code: "ORGANIC_SOCIAL_CREATIVE_URL_UNAVAILABLE",
      provider: destination.provider_id,
      message: `Could not resolve the approved ${destination.network} creative for provider delivery`,
    });
  }
  return { asset, kind, provider_url: providerUrl };
}

async function preflightDestination({ organizationId, destination, plan = null }) {
  const [asset, service, credential, creative] = await Promise.all([
    accountAsset({ organizationId, destination }),
    OrganizationServiceRuntime.get({ organization_id: organizationId, service_id: destination.service_id }).catch(() => null),
    resolveProviderCredential({
      organization_id: organizationId,
      provider: destination.credential_provider || destination.provider_id,
    }).catch(() => null),
    creativeAsset({ organizationId, destination, resolveUrl: false }),
  ]);

  if (!service || String(service.status || "").toUpperCase() !== "ACTIVE" || service.usage_enabled === false) {
    throw executionError({
      stage: "SERVICE_PREFLIGHT",
      code: "ORGANIC_SOCIAL_SERVICE_NOT_READY",
      provider: destination.provider_id,
      message: `${destination.network} organization service is not active`,
      correction: `Enable the ${destination.network} service before publishing.`,
      details: { network: destination.network, service_id: destination.service_id },
    });
  }
  if (!credential?.credential_id) {
    throw executionError({
      stage: "CREDENTIAL_PREFLIGHT",
      code: "ORGANIC_SOCIAL_CREDENTIAL_NOT_READY",
      provider: destination.provider_id,
      message: `${destination.network} OAuth credential is not available`,
      correction: `Reconnect the ${destination.network} account before publishing.`,
      details: { network: destination.network },
    });
  }

  let creatorState = null;
  if (destination.network === "tiktok") {
    if (destination.creator_consent !== true) {
      throw executionError({
        stage: "CREATOR_CONSENT_PREFLIGHT",
        code: "TIKTOK_EXPLICIT_CREATOR_CONSENT_REQUIRED",
        provider: "tiktok",
        message: "TikTok requires explicit creator consent for this publication",
        correction: "Confirm creator consent in the TikTok campaign settings before approval.",
      });
    }
    if (!text(destination.privacy_level)) {
      throw executionError({
        stage: "CREATOR_CONSENT_PREFLIGHT",
        code: "TIKTOK_PRIVACY_LEVEL_REQUIRED",
        provider: "tiktok",
        message: "TikTok requires a creator-approved privacy level",
        correction: "Load the current creator options and choose a privacy level.",
      });
    }
    try {
      const creatorResult = await TikTokProvider.execute({
        capability: "marketing.tiktok.creator.read",
        ...credential,
        context: { organization_id: organizationId },
      });
      creatorState = creatorResult?.output || {};
    } catch (error) {
      throw executionError({
        stage: "CREATOR_PREFLIGHT",
        code: "TIKTOK_CREATOR_STATE_UNAVAILABLE",
        provider: "tiktok",
        message: error?.message || "TikTok creator publishing options are unavailable",
        correction: "Reconnect TikTok and reload creator options before approval.",
        cause: error,
      });
    }
    const privacyOptions = Array.isArray(creatorState?.privacy_level_options)
      ? creatorState.privacy_level_options.map(text).filter(Boolean)
      : [];
    if (!privacyOptions.includes(destination.privacy_level)) {
      throw executionError({
        stage: "CREATOR_CONSENT_PREFLIGHT",
        code: "TIKTOK_PRIVACY_LEVEL_NOT_CURRENTLY_AVAILABLE",
        provider: "tiktok",
        message: `TikTok privacy level ${destination.privacy_level} is not currently available for this creator`,
        correction: "Reload the current TikTok creator options and choose an available privacy level.",
        details: { available_privacy_levels: privacyOptions },
      });
    }
  }

  const serviceCapabilities = resolveServiceCapabilities(destination.service_id);
  if (!serviceCapabilities?.capabilities?.includes(destination.capability)) {
    throw executionError({
      stage: "SERVICE_PREFLIGHT",
      code: "ORGANIC_SOCIAL_CAPABILITY_NOT_ENABLED",
      provider: destination.provider_id,
      message: `${destination.capability} is not enabled for ${destination.service_id}`,
      correction: `Repair the ${destination.network} service capability mapping before publishing.`,
    });
  }

  let providerRoute;
  let pricing;
  try {
    providerRoute = await resolveProvider({
      organization_id: organizationId,
      capability: destination.capability,
      preferredProvider: destination.provider_id,
      currency: plan?.budget?.currency || null,
      policy: service.provider_policy || {},
    });
    pricing = PricingRuntime.resolveRecord({
      pricing: providerRoute.pricing_record,
      provider: providerRoute.provider,
      model: providerRoute.model,
      capability: destination.capability,
      currency: plan?.budget?.currency || null,
      usage: { quantity: 1 },
    });
  } catch (error) {
    throw executionError({
      stage: "PRICING_PREFLIGHT",
      code: "ORGANIC_SOCIAL_PRICING_NOT_READY",
      provider: destination.provider_id,
      message: error?.message || `${destination.network} has no executable pricing route`,
      correction: `Configure active governed pricing for ${destination.capability} before publishing.`,
      cause: error,
    });
  }

  return {
    network: destination.network,
    provider: destination.provider_id,
    service_id: destination.service_id,
    capability: destination.capability,
    account_asset_id: asset.id,
    account_name: asset.name || asset.external_id || destination.network,
    external_account_id: asset.external_id || null,
    creative_asset_id: creative?.asset?.id || null,
    creative_kind: creative?.kind || null,
    credential_id: credential.credential_id,
    ...(destination.network === "tiktok" ? {
      creator_state: {
        privacy_level_options: Array.isArray(creatorState?.privacy_level_options) ? creatorState.privacy_level_options : [],
        comment_disabled: creatorState?.comment_disabled === true,
        duet_disabled: creatorState?.duet_disabled === true,
        stitch_disabled: creatorState?.stitch_disabled === true,
        max_video_post_duration_sec: Number.isFinite(Number(creatorState?.max_video_post_duration_sec)) ? Number(creatorState.max_video_post_duration_sec) : null,
      },
    } : {}),
    pricing: {
      pricing_id: pricing.pricing_id,
      customer_price: pricing.customer_price,
      currency: pricing.currency,
      unit: pricing.unit,
      zero_price: pricing.zero_price === true,
    },
  };
}

function publicationMessage(destination) {
  const message = text(destination.message);
  const url = text(destination.destination_url);
  if (!url || message.includes(url)) return message;
  return `${message}\n\n${url}`.trim();
}

function providerInput(destination, asset, creative = null) {
  const message = publicationMessage(destination);
  if (destination.network === "facebook") {
    if (!creative?.provider_url || creative.kind !== "IMAGE") {
      throw executionError({
        stage: "PROVIDER_PAYLOAD",
        code: "FACEBOOK_IMAGE_ASSET_REQUIRED",
        provider: "meta",
        message: "Facebook campaign publishing requires the approved image source",
      });
    }
    return {
      page_id: asset.external_id,
      message,
      image_url: creative.provider_url,
    };
  }
  if (destination.network === "instagram") {
    if (!creative?.provider_url || creative.kind !== "IMAGE") {
      throw executionError({
        stage: "PROVIDER_PAYLOAD",
        code: "INSTAGRAM_IMAGE_ASSET_REQUIRED",
        provider: "meta",
        message: "Instagram campaign publishing requires the approved image source",
      });
    }
    return {
      instagram_business_id: asset.external_id,
      message,
      image_url: creative.provider_url,
    };
  }
  if (destination.network === "pinterest") {
    if (!destination.board_id) throw executionError({ stage: "PROVIDER_PAYLOAD", code: "PINTEREST_BOARD_REQUIRED", provider: "pinterest", message: "Pinterest publishing requires a selected board" });
    if (!creative?.provider_url || creative.kind !== "IMAGE") throw executionError({ stage: "PROVIDER_PAYLOAD", code: "PINTEREST_IMAGE_REQUIRED", provider: "pinterest", message: "Pinterest publishing requires the approved image source" });
    return {
      board_id: destination.board_id,
      image_url: creative.provider_url,
      title: destination.title || undefined,
      description: destination.description || message || undefined,
      link: destination.destination_url || undefined,
    };
  }
  if (destination.network === "youtube") {
    if (!creative?.provider_url || creative.kind !== "VIDEO") throw executionError({ stage: "PROVIDER_PAYLOAD", code: "YOUTUBE_VIDEO_ASSET_REQUIRED", provider: "youtube", message: "YouTube publishing requires the approved video source" });
    return {
      video_url: creative.provider_url,
      title: destination.title || message,
      description: destination.description || message,
      privacy_status: destination.privacy_status || "private",
      tags: destination.tags || [],
      category_id: destination.category_id || "22",
      made_for_kids: destination.made_for_kids === true,
    };
  }
  if (destination.network === "linkedin") {
    return {
      message,
      external_account_id: asset.external_id,
      ...(creative?.provider_url ? { image_url: creative.provider_url, alt_text: destination.alt_text || undefined } : {}),
    };
  }
  if (destination.network === "tiktok") {
    if (!creative?.provider_url || creative.kind !== "VIDEO") {
      throw executionError({
        stage: "PROVIDER_PAYLOAD",
        code: "TIKTOK_VIDEO_ASSET_REQUIRED",
        provider: "tiktok",
        message: "TikTok campaign execution requires the approved video source",
      });
    }
    return {
      media_type: "VIDEO",
      video_url: creative.provider_url,
      title: message,
      privacy_level: destination.privacy_level,
      creator_consent: destination.creator_consent === true,
      disable_duet: destination.disable_duet === true,
      disable_comment: destination.disable_comment === true,
      disable_stitch: destination.disable_stitch === true,
      brand_organic_toggle: destination.brand_organic_toggle === true,
      is_aigc: destination.is_aigc === true,
    };
  }
  if (destination.network === "google_business") {
    const actionType = text(destination.call_to_action_type).toUpperCase();
    const actionUrl = text(destination.destination_url);
    return {
      payload: {
        location_id: asset.external_id,
        summary: message,
        language_code: text(destination.language_code || "en"),
        topic_type: "STANDARD",
        ...(creative?.provider_url ? { image_url: creative.provider_url } : {}),
        ...(actionType && actionUrl ? { call_to_action: { actionType, url: actionUrl } } : {}),
      },
    };
  }
  if (destination.network === "threads") {
    return {
      message,
      ...(creative?.provider_url && creative.kind === "IMAGE" ? { image_url: creative.provider_url, alt_text: destination.alt_text || undefined } : {}),
      ...(creative?.provider_url && creative.kind === "VIDEO" ? { video_url: creative.provider_url, alt_text: destination.alt_text || undefined } : {}),
      ...(destination.reply_control ? { reply_control: destination.reply_control } : {}),
      ...(destination.topic_tag ? { topic_tag: destination.topic_tag } : {}),
      ...(destination.is_spoiler_media ? { is_spoiler_media: true } : {}),
    };
  }
  if (destination.network === "x") {
    return {
      message,
      ...(creative?.provider_url && creative.kind === "IMAGE" ? { image_url: creative.provider_url, alt_text: destination.alt_text || undefined } : {}),
      ...(creative?.provider_url && creative.kind === "VIDEO" ? { video_url: creative.provider_url } : {}),
    };
  }
  throw executionError({
    stage: "PROVIDER_PAYLOAD",
    code: "ORGANIC_SOCIAL_PROVIDER_PAYLOAD_UNSUPPORTED",
    provider: destination.provider_id,
    message: `No governed organic-social provider payload exists for ${destination.network}`,
  });
}

export const OrganicSocialCampaignAdapter = {
  id: "organic_social",
  version: "ORGANIC_SOCIAL_GOVERNED_V1",
  status: "ACTIVE",
  networks: ORGANIC_SOCIAL_EXECUTABLE_NETWORKS,

  async preflight({ organizationId, plan, channel }) {
    const translated = translateOrganicSocialCampaignPlan({ plan, channel });
    const destinations = [];
    for (const destination of translated.destinations) {
      destinations.push(await preflightDestination({ organizationId, destination, plan }));
    }
    return {
      adapter: this.version,
      channel_id: this.id,
      provider: "multi",
      ready: true,
      execution_mode: translated.execution_mode,
      wallet_changed: false,
      publication_executed: false,
      networks: destinations.map((item) => item.network),
      destinations,
    };
  },

  async execute({ organizationId, entityId = null, plan, channel }) {
    const translated = translateOrganicSocialCampaignPlan({ plan, channel });
    const planFingerprint = campaignPlanFingerprint(plan);
    const results = [];
    for (const destination of translated.destinations) {
      const preflight = await preflightDestination({ organizationId, destination, plan });
      const asset = await accountAsset({ organizationId, destination });
      const creative = await creativeAsset({ organizationId, destination, resolveUrl: true });
      try {
        const result = await executeService({
          organization_id: organizationId,
          entity_id: destination.network === "google_business" ? asset.entity_id : entityId,
          service_id: destination.service_id,
          provider_id: destination.provider_id,
          credential_id: preflight.credential_id,
          capability: destination.capability,
          input: providerInput(destination, asset, creative),
          metadata: {
            task_id: `campaign-organic:${planFingerprint}:${destination.network}:${asset.id}`,
            campaign_execution_adapter: this.version,
            campaign_plan_fingerprint: planFingerprint,
            campaign_channel_id: this.id,
            campaign_network: destination.network,
            campaign_account_asset_id: asset.id,
            campaign_name: plan.name,
            owner_approval_id: plan.approval?.approved_by || null,
            owner_approved_at: plan.approval?.approved_at || null,
          },
          category: "MARKETING_CAMPAIGN_PUBLISH",
        });
        results.push({ network: destination.network, provider: destination.provider_id, account_asset_id: asset.id, creative_asset_id: creative?.asset?.id || null, result });
      } catch (error) {
        if (error?.name === "CampaignExecutionError") throw error;
        throw executionError({
          stage: "ORGANIC_SOCIAL_PUBLISH",
          code: "ORGANIC_SOCIAL_PROVIDER_EXECUTION_FAILED",
          provider: destination.provider_id,
          message: error?.message || `${destination.network} publishing failed`,
          correction: `Correct the ${destination.network} provider error and retry the approved plan.`,
          details: { network: destination.network, account_asset_id: destination.account_asset_id },
          cause: error,
        });
      }
    }
    return {
      adapter: this.version,
      channel_id: this.id,
      provider: "multi",
      status: "PUBLISHED_OR_PROVIDER_PENDING",
      networks: results.map((item) => item.network),
      results,
    };
  },
};

export default OrganicSocialCampaignAdapter;

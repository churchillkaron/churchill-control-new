import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  OrganizationServiceRuntime,
} from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";

import {
  WalletRepository,
} from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";

import {
  ManagedMediaSpendRuntime,
} from "@/lib/marketing/services/ManagedMediaSpendRuntime";

import {
  listManagedMediaCampaigns,
} from "@/lib/marketing/repositories/ManagedMediaCampaignRepository";

function required(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${label} is required`);
  }
  return value;
}

function text(value) {
  return String(value || "").trim();
}

function sourceUrl(asset = {}) {
  return (
    asset.file_url ||
    asset.image_url ||
    asset.url ||
    asset.thumbnail_url ||
    null
  );
}

function isImageAsset(asset = {}) {
  const mime = text(
    asset.mime_type || asset.metadata?.mime_type || asset.analysis?.mime_type
  ).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const url = text(sourceUrl(asset)).toLowerCase();

  if (mime.startsWith("video/") || type.includes("video")) return false;
  if (/\.(mp4|mov|m4v|webm)(\?|$)/.test(url)) return false;

  return Boolean(
    asset.image_url ||
    mime.startsWith("image/") ||
    type.includes("image") ||
    type.includes("poster") ||
    type.includes("campaign") ||
    /\.(png|jpe?g|webp)(\?|$)/.test(url)
  );
}

function approvalStatus(asset = {}) {
  const metadata = asset.metadata || {};
  const review = asset.review || metadata.review || {};
  const approved =
    metadata.owner_approved === true ||
    metadata.brand_approved === true ||
    metadata.approved === true ||
    review.approved === true ||
    review.human_reviewed === true;

  return approved ? "APPROVED" : "EXPLICIT_CONFIRMATION_REQUIRED";
}

function publicAsset(asset = {}) {
  const url = sourceUrl(asset);
  return {
    id: asset.id,
    name:
      asset.name || asset.title || asset.file_name || "Untitled creative asset",
    file_name: asset.file_name || null,
    preview_url: asset.thumbnail_url || asset.image_url || url,
    source_url: url,
    asset_type: asset.asset_type || null,
    favorite: Boolean(asset.favorite),
    approval_status: approvalStatus(asset),
    created_at: asset.created_at || null,
  };
}

function validatePublicImageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Selected creative asset does not have a valid public image URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Selected creative asset must use a public HTTPS image URL");
  }
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Selected creative asset cannot use a local image URL");
  }
  return url.toString();
}

async function listCreativeAssets(organizationId) {
  const assets = await CreativeAssetsRuntime.list({
    organization_id: organizationId,
    limit: 300,
  });

  return assets
    .filter((asset) => !asset.archived && isImageAsset(asset) && sourceUrl(asset))
    .sort((left, right) => {
      if (Boolean(left.favorite) !== Boolean(right.favorite)) {
        return left.favorite ? -1 : 1;
      }
      return new Date(right.created_at || 0) - new Date(left.created_at || 0);
    })
    .map(publicAsset);
}

async function resolveExactCreativeAsset({ organizationId, assetId }) {
  required(assetId, "Creative asset id");
  const asset = await CreativeAssetsRuntime.get(assetId);

  if (!asset || String(asset.organization_id) !== String(organizationId)) {
    throw new Error("Creative asset was not found in this organization");
  }
  if (asset.archived) throw new Error("Creative asset is archived");
  if (!isImageAsset(asset)) throw new Error("Selected creative asset is not an image");

  return {
    asset,
    imageUrl: validatePublicImageUrl(sourceUrl(asset)),
    public: publicAsset(asset),
  };
}

async function organizationChannel(organizationId) {
  return ChannelConnectionRuntime.get({
    organization_id: organizationId,
    provider: "meta",
  }).catch(() => null);
}

function channelMetadata(connection) {
  return connection?.metadata && typeof connection.metadata === "object"
    ? connection.metadata
    : {};
}

export const MetaAdsRuntime = {
  async readiness({ organizationId }) {
    required(organizationId, "Organization id");

    const [connection, assets, service, wallet, campaigns] = await Promise.all([
      organizationChannel(organizationId),
      listCreativeAssets(organizationId).catch(() => []),
      OrganizationServiceRuntime.get({
        organization_id: organizationId,
        service_id: "meta-ads",
      }).catch(() => null),
      WalletRepository.getByOrganization(organizationId).catch(() => null),
      listManagedMediaCampaigns(organizationId).catch(() => []),
    ]);

    const metadata = channelMetadata(connection);
    const pageId = metadata.page_id || metadata.facebook_page_id || null;
    const instagramBusinessId =
      metadata.instagram_business_id || metadata.instagram_actor_id || null;
    const whatsappDestination =
      metadata.whatsapp_phone_number ||
      metadata.whatsapp_business_account_id ||
      metadata.waba_id ||
      null;
    const serviceActive =
      String(service?.status || "").toUpperCase() === "ACTIVE";

    return {
      connected: Boolean(serviceActive && pageId),
      managed_by: "AVANTIQO",
      provider_billed_to: "AVANTIQO",
      customer_payment_source: "AVANTIQO_PREPAID_WALLET",
      service_status: service?.status || "NOT_ENABLED",
      channel_status: connection?.status || "NOT_CONNECTED",
      page_id: pageId,
      instagram_business_id: instagramBusinessId,
      whatsapp_destination: whatsappDestination,
      wallet: wallet
        ? {
            currency: wallet.currency,
            available_balance: Number(wallet.available_balance || 0),
            reserved_balance: Number(wallet.reserved_balance || 0),
            status: wallet.status,
          }
        : null,
      creative_assets: assets,
      campaigns,
      delivery_channels: [
        {
          id: "facebook",
          name: "Facebook",
          available: Boolean(pageId),
          reason: pageId ? null : "Connect the organization's Facebook Page",
        },
        {
          id: "instagram",
          name: "Instagram",
          available: Boolean(instagramBusinessId),
          reason: instagramBusinessId
            ? null
            : "Connect an Instagram professional account",
        },
      ],
      destinations: [
        { id: "ENGAGEMENT", name: "Get more engagement", available: Boolean(pageId) },
        { id: "WEBSITE", name: "Send people to a website", available: Boolean(pageId) },
        {
          id: "WHATSAPP",
          name: "Get WhatsApp messages",
          available: Boolean(pageId && whatsappDestination),
          reason: whatsappDestination
            ? null
            : "Connect a WhatsApp Business destination",
        },
      ],
      exact_asset_selection_required: true,
      automatic_asset_selection: false,
      standard_creative_enhancements: "OPT_OUT",
    };
  },

  async createCampaign({
    organizationId,
    entityId = null,
    authorizedBudget,
    currency,
    campaign,
    adSet,
    creative,
    ad,
    deliveryChannels = [],
    destination = "ENGAGEMENT",
  }) {
    const connection = await organizationChannel(organizationId);
    const metadata = channelMetadata(connection);
    const pageId = metadata.page_id || metadata.facebook_page_id || null;
    const instagramBusinessId =
      metadata.instagram_business_id || metadata.instagram_actor_id || null;

    required(pageId, "Connected organization Facebook Page");
    required(campaign?.name, "Campaign name");
    required(creative?.message, "Ad message");
    required(creative?.asset_id, "Exact creative asset");

    if (creative.confirm_exact_asset !== true) {
      throw new Error("Confirm the exact approved creative asset before creating the campaign");
    }
    if (deliveryChannels.includes("instagram") && !instagramBusinessId) {
      throw new Error("Instagram delivery requires a connected Instagram professional account");
    }

    const resolvedAsset = await resolveExactCreativeAsset({
      organizationId,
      assetId: creative.asset_id,
    });

    const result = await ManagedMediaSpendRuntime.reserveAndCreate({
      organizationId,
      entityId,
      campaignName: campaign.name,
      authorizedBudget,
      campaignCurrency: currency,
      sourceAssetId: resolvedAsset.asset.id,
      destination,
      deliveryChannels,
      targeting: adSet?.targeting || {},
      schedule: {
        start_time: adSet?.start_time || null,
        end_time: adSet?.end_time || null,
      },
      providerInput: {
        page_id: pageId,
        instagram_business_id: instagramBusinessId,
        campaign,
        ad_set: {
          ...adSet,
          targeting: {
            ...(adSet?.targeting || {}),
            publisher_platforms: deliveryChannels,
          },
          destination_type: destination === "WHATSAPP" ? "WHATSAPP" : undefined,
        },
        creative: {
          ...creative,
          image_url: resolvedAsset.imageUrl,
          source_asset_id: resolvedAsset.asset.id,
          exact_asset_locked: true,
          degrees_of_freedom_spec: {
            creative_features_spec: {
              standard_enhancements: { enroll_status: "OPT_OUT" },
            },
          },
        },
        ad,
      },
    });

    await CreativeAssetsRuntime.incrementUsage(resolvedAsset.asset.id).catch(() => null);

    return {
      ...result,
      source_asset: resolvedAsset.public,
      exact_asset_locked: true,
    };
  },

  async settleSpend(input) {
    return ManagedMediaSpendRuntime.settleSpend(input);
  },
};

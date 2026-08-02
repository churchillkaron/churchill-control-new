import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";

import {
  resolveChannelCredential,
} from "@/lib/platform/channels/helpers/resolveChannelCredential";

import {
  MetaProvider,
} from "@/lib/platform/service-runtime/providers/meta/MetaProvider";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

function required(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${label} is required`);
  }
  return value;
}

function connectionMetadata(connection) {
  return connection?.metadata && typeof connection.metadata === "object"
    ? connection.metadata
    : {};
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

function assetMime(asset = {}) {
  return text(
    asset.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.mime_type
  ).toLowerCase();
}

function assetType(asset = {}) {
  return text(asset.asset_type || asset.type).toLowerCase();
}

function isImageAsset(asset = {}) {
  const mime = assetMime(asset);
  const type = assetType(asset);
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
      asset.name ||
      asset.title ||
      asset.file_name ||
      "Untitled creative asset",
    file_name: asset.file_name || null,
    preview_url: asset.thumbnail_url || asset.image_url || url,
    source_url: url,
    asset_type: asset.asset_type || null,
    ai_generated: Boolean(asset.ai_generated),
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
    limit: 200,
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

  if (asset.archived) {
    throw new Error("Creative asset is archived");
  }

  if (!isImageAsset(asset)) {
    throw new Error("Selected creative asset is not an image");
  }

  const imageUrl = validatePublicImageUrl(sourceUrl(asset));

  return {
    asset,
    imageUrl,
    public: publicAsset(asset),
  };
}

async function resolveMetaContext({ organizationId, adAccountId = null }) {
  required(organizationId, "Organization id");

  const connection = await ChannelConnectionRuntime.get({
    organization_id: organizationId,
    provider: "meta",
  });

  if (!connection || String(connection.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error("No active Meta connection exists for this organization");
  }

  const accessToken = await resolveChannelCredential(connection);
  if (!accessToken) {
    throw new Error("Meta connection credential is missing");
  }

  const metadata = connectionMetadata(connection);
  const pageId = metadata.page_id || metadata.facebook_page_id || null;
  const instagramBusinessId =
    metadata.instagram_business_id || metadata.instagram_actor_id || null;
  const resolvedAdAccountId =
    adAccountId || metadata.ad_account_id || metadata.meta_ad_account_id || null;

  return {
    connection,
    accessToken,
    pageId,
    instagramBusinessId,
    adAccountId: resolvedAdAccountId,
  };
}

export const MetaAdsRuntime = {
  async readiness({ organizationId }) {
    const context = await resolveMetaContext({ organizationId });

    const [accounts, creativeAssets] = await Promise.all([
      MetaProvider.execute({
        capability: "marketing.ads.manage",
        action: "list_ad_accounts",
        organization_id: organizationId,
        access_token: context.accessToken,
      }),
      listCreativeAssets(organizationId),
    ]);

    return {
      connected: true,
      provider: "meta",
      page_id: context.pageId,
      instagram_business_id: context.instagramBusinessId,
      configured_ad_account_id: context.adAccountId,
      ad_accounts: accounts?.data || [],
      creative_assets: creativeAssets,
      exact_asset_selection_required: true,
      automatic_asset_selection: false,
      standard_creative_enhancements: "OPT_OUT",
    };
  },

  async createCampaign({
    organizationId,
    adAccountId = null,
    campaign,
    adSet,
    creative,
    ad,
  }) {
    const context = await resolveMetaContext({
      organizationId,
      adAccountId,
    });

    required(context.pageId, "Connected Facebook page id");
    required(context.adAccountId, "Meta ad account id");
    required(campaign?.name, "Campaign name");
    required(adSet?.targeting, "Ad set targeting");
    required(creative?.message, "Ad message");
    required(creative?.asset_id, "Exact creative asset");

    if (creative?.confirm_exact_asset !== true) {
      throw new Error("Confirm the exact approved creative asset before creating the Meta campaign");
    }

    const resolvedAsset = await resolveExactCreativeAsset({
      organizationId,
      assetId: creative.asset_id,
    });

    const result = await MetaProvider.execute({
      capability: "marketing.ads.manage",
      action: "create_campaign_bundle",
      organization_id: organizationId,
      access_token: context.accessToken,
      ad_account_id: context.adAccountId,
      page_id: context.pageId,
      instagram_business_id: context.instagramBusinessId,
      campaign,
      ad_set: adSet,
      creative: {
        ...creative,
        image_url: resolvedAsset.imageUrl,
        source_asset_id: resolvedAsset.asset.id,
        exact_asset_locked: true,
        degrees_of_freedom_spec: {
          creative_features_spec: {
            standard_enhancements: {
              enroll_status: "OPT_OUT",
            },
          },
        },
      },
      ad,
    });

    await CreativeAssetsRuntime.incrementUsage(resolvedAsset.asset.id).catch(() => null);

    return {
      ...result,
      source_asset: resolvedAsset.public,
      exact_asset_locked: true,
    };
  },

  async updateStatus({
    organizationId,
    objectId,
    status,
  }) {
    const context = await resolveMetaContext({ organizationId });

    required(objectId, "Meta object id");
    required(status, "Meta object status");

    return MetaProvider.execute({
      capability: "marketing.ads.manage",
      action: "update_status",
      organization_id: organizationId,
      access_token: context.accessToken,
      object_id: objectId,
      status,
    });
  },
};

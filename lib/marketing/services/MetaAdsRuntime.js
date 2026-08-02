import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";

import {
  resolveChannelCredential,
} from "@/lib/platform/channels/helpers/resolveChannelCredential";

import {
  MetaProvider,
} from "@/lib/platform/service-runtime/providers/meta/MetaProvider";

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

    const accounts = await MetaProvider.execute({
      capability: "marketing.ads.manage",
      action: "list_ad_accounts",
      organization_id: organizationId,
      access_token: context.accessToken,
    });

    return {
      connected: true,
      provider: "meta",
      page_id: context.pageId,
      instagram_business_id: context.instagramBusinessId,
      configured_ad_account_id: context.adAccountId,
      ad_accounts: accounts?.data || [],
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

    return MetaProvider.execute({
      capability: "marketing.ads.manage",
      action: "create_campaign_bundle",
      organization_id: organizationId,
      access_token: context.accessToken,
      ad_account_id: context.adAccountId,
      page_id: context.pageId,
      instagram_business_id: context.instagramBusinessId,
      campaign,
      ad_set: adSet,
      creative,
      ad,
    });
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

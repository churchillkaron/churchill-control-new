import { getMarketingCampaigns } from "@/lib/marketing/services/getMarketingCampaigns";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isDatabaseOrganizationId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function createRuntime({
  organizationId,
  route,
  campaigns = [],
  activeCampaign = null,
  assets = [],
}) {
  return {

    organizationId,

    route,

    campaignRuntime: {

      campaigns,

      campaign:
        activeCampaign,

      campaignId:
        activeCampaign?.id || null,

    },

    assetRuntime: {

      items:
        assets,

    },

    timelineRuntime: null,

    taskRuntime: {

      items: [],

    },

    queueRuntime: {

      total: 0,

    },

  };
}

function createDemoRuntime({
  organizationId,
  route,
}) {
  const activeCampaign = {
    id: "demo-campaign",
    name: "Avantiqo Launch Campaign",
    title: "Avantiqo Launch Campaign",
    status: "draft",
    platform: "demo",
  };

  return createRuntime({
    organizationId,
    route,
    campaigns: [activeCampaign],
    activeCampaign,
    assets: [],
  });
}

export async function resolveCreativeStudioRuntime({
  organizationId,
  pageId = null,
  workspace = [],
} = {}) {

  const route =
    Array.isArray(workspace) && workspace.length
      ? workspace
      : ["campaign"];

  const campaignId =
    route[1] || null;

  if (!isDatabaseOrganizationId(organizationId)) {
    return createDemoRuntime({
      organizationId,
      route,
    });
  }

  const {
    campaigns,
  } =
    await getMarketingCampaigns({
      organizationId,
      pageId,
    });

  const activeCampaign =
    campaignId
      ? campaigns.find(
          c => c.id === campaignId,
        )
      : campaigns[0] || null;

  const assets =
    activeCampaign
      ? await CreativeAssetsRuntime.list({
          organization_id:
            organizationId,
          campaign_id:
            activeCampaign.id,
        })
      : [];

  return createRuntime({
    organizationId,
    route,
    campaigns,
    activeCampaign,
    assets,
  });

}

import {
  executeProvider,
} from "@/lib/platform/service-runtime/providers/ProviderExecutor";

import {
  getManagedMediaCampaign,
  updateManagedMediaCampaign,
} from "@/lib/marketing/repositories/ManagedMediaCampaignRepository";

function required(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${label} is required`);
  }
  return value;
}

async function setStatus(campaign, objectId, status) {
  return executeProvider({
    provider: campaign.provider,
    capability: "marketing.ads.manage",
    model: null,
    input: {
      action: "update_status",
      object_id: objectId,
      status,
    },
    context: {
      organization_id: campaign.organization_id,
      organization_service_id: campaign.organization_service_id,
      usage_id: campaign.usage_id,
      currency: campaign.currency,
    },
  });
}

async function pauseAll(campaign) {
  const ids = [
    campaign.provider_ad_id,
    campaign.provider_ad_set_id,
    campaign.provider_campaign_id,
  ].filter(Boolean);

  for (const id of ids) {
    await setStatus(campaign, id, "PAUSED").catch(() => null);
  }
}

export const ManagedMediaCampaignControlRuntime = {
  async launch({ organizationId, campaignId }) {
    required(organizationId, "Organization id");
    required(campaignId, "Campaign id");

    const campaign = await getManagedMediaCampaign({
      organization_id: organizationId,
      id: campaignId,
    });

    if (!campaign) throw new Error("Managed media campaign not found");
    if (campaign.status !== "PAUSED") {
      throw new Error("Only a paused managed media campaign can be launched");
    }
    if (
      !campaign.provider_campaign_id ||
      !campaign.provider_ad_set_id ||
      !campaign.provider_ad_id
    ) {
      throw new Error("Managed media campaign provider object chain is incomplete");
    }

    const reserved = Number(campaign.reserved_amount || 0);
    const settled = Number(campaign.settled_amount || 0);
    const released = Number(campaign.released_amount || 0);
    if (reserved - settled - released <= 0) {
      throw new Error("Managed media campaign has no remaining prepaid reservation");
    }

    try {
      await setStatus(campaign, campaign.provider_ad_set_id, "ACTIVE");
      await setStatus(campaign, campaign.provider_ad_id, "ACTIVE");
      await setStatus(campaign, campaign.provider_campaign_id, "ACTIVE");

      return updateManagedMediaCampaign({
        organization_id: organizationId,
        id: campaign.id,
        updates: {
          status: "ACTIVE",
          metadata: {
            ...(campaign.metadata || {}),
            launched_at: new Date().toISOString(),
            launch_control: "AVANTIQO_MANAGED",
          },
        },
      });
    } catch (error) {
      await pauseAll(campaign);
      await updateManagedMediaCampaign({
        organization_id: organizationId,
        id: campaign.id,
        updates: {
          status: "PAUSED",
          metadata: {
            ...(campaign.metadata || {}),
            last_launch_error: error?.message || String(error),
            last_launch_failed_at: new Date().toISOString(),
          },
        },
      }).catch(() => null);
      throw error;
    }
  },

  async pause({ organizationId, campaignId }) {
    required(organizationId, "Organization id");
    required(campaignId, "Campaign id");

    const campaign = await getManagedMediaCampaign({
      organization_id: organizationId,
      id: campaignId,
    });

    if (!campaign) throw new Error("Managed media campaign not found");
    if (!["ACTIVE", "PAUSED"].includes(campaign.status)) {
      throw new Error("Campaign cannot be paused from its current state");
    }

    await pauseAll(campaign);
    return updateManagedMediaCampaign({
      organization_id: organizationId,
      id: campaign.id,
      updates: {
        status: "PAUSED",
        metadata: {
          ...(campaign.metadata || {}),
          paused_at: new Date().toISOString(),
          pause_control: "AVANTIQO_MANAGED",
        },
      },
    });
  },
};

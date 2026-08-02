export const dynamic = "force-dynamic";

import {
  withApiHandler,
} from "@/lib/shared/http/withApiHandler";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  AICampaignPlannerRuntime,
} from "@/lib/marketing/campaigns/AICampaignPlannerRuntime";

import {
  MetaAdsRuntime,
} from "@/lib/marketing/services/MetaAdsRuntime";

async function authorizedOrganization(organizationId) {
  const access = await requireOrganizationAccess({ organizationId });
  if (!access.success) {
    throw new Error(access.error || "Organization access denied");
  }
  return access;
}

export const POST = withApiHandler(
  "marketing-ai-campaign-plan",
  async (request) => {
    const body = await request.json();
    const access = await authorizedOrganization(
      body.organizationId || body.organization_id
    );

    const readiness = await MetaAdsRuntime.readiness({
      organizationId: access.organizationId,
    }).catch(() => ({
      creative_assets: [],
      delivery_channels: [],
      destinations: [],
    }));

    const connectedChannels = (readiness.delivery_channels || [])
      .filter((channel) => channel.available)
      .map((channel) => ({
        id: channel.id === "facebook" || channel.id === "instagram"
          ? "meta"
          : channel.id,
        network: channel.id,
      }));

    return AICampaignPlannerRuntime.plan({
      organizationId: access.organizationId,
      organization:
        access.organization ||
        access.access?.organization ||
        {},
      request: body.request || body.campaign || body,
      connectedChannels,
      assets: (readiness.creative_assets || []).map((asset) => ({
        id: asset.id,
        name: asset.name,
        asset_type: asset.asset_type,
        approval_status: asset.approval_status,
      })),
    });
  }
);

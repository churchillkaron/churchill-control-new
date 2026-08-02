export const dynamic = "force-dynamic";

import { withApiHandler } from "@/lib/shared/http/withApiHandler";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { AICampaignPlannerRuntime } from "@/lib/marketing/campaigns/AICampaignPlannerRuntime";
import { MarketingCampaignReadinessRuntime } from "@/lib/marketing/campaigns/MarketingCampaignReadinessRuntime";

export const POST = withApiHandler(
  "marketing-ai-campaign-plan",
  async (request) => {
    const body = await request.json();
    const organizationId = body.organizationId || body.organization_id;
    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: "marketing.ads.manage",
    });

    if (!access.success) {
      throw new Error(access.error || "Organization access denied");
    }

    const readiness = await MarketingCampaignReadinessRuntime.readiness({
      organizationId: access.organizationId,
    });

    return AICampaignPlannerRuntime.plan({
      organizationId: access.organizationId,
      organization:
        access.organization ||
        access.access?.organization ||
        {},
      request: body.request || body.campaign || body,
      connectedChannels: readiness.connected_channels || [],
      assets: (readiness.creative_assets || []).map((asset) => ({
        id: asset.id,
        name: asset.name,
        asset_type: asset.asset_type,
        media_kind: asset.media_kind,
        approval_status: asset.approval_status,
      })),
      readiness: {
        wallet: readiness.wallet,
        channels: readiness.channels,
        provider_specific: readiness.provider_specific,
      },
    });
  },
);

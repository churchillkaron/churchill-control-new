export const dynamic = "force-dynamic";

// Production release marker: marketing campaign workspace.
import { withApiHandler } from "@/lib/shared/http/withApiHandler";
import { requireFields } from "@/lib/shared/validation/required";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getMarketingCampaigns } from "@/lib/marketing/services/getMarketingCampaigns";
import { hasMarketingPermission } from "@/lib/marketing/security/marketingCampaignAccess";

export const POST = withApiHandler(
  "marketing-campaigns",
  async (request) => {
    const body = await request.json();

    requireFields(body, ["organizationId"]);

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId,
      request,
    });

    if (!access.success) {
      const error = new Error(access.error || "Organization access denied");
      error.status = access.status || 403;
      throw error;
    }

    const data = await getMarketingCampaigns({
      organizationId: access.organizationId,
    });
    const canManageAssets = [
      "marketing.campaign.manage",
      "creative.asset.upload",
      "creative.*",
    ].some((permission) => hasMarketingPermission(access, permission));

    return {
      ...data,
      capabilities: {
        can_manage_assets: canManageAssets,
        can_manage_paid_media: hasMarketingPermission(access, "marketing.ads.manage"),
      },
    };
  },
);

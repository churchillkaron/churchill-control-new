export const dynamic = "force-dynamic";

import {
  withApiHandler,
} from "@/lib/shared/http/withApiHandler";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  MarketingCampaignBuilderReadinessRuntime,
} from "@/lib/marketing/campaigns/MarketingCampaignBuilderReadinessRuntime";
import { hasMarketingPermission } from "@/lib/marketing/security/marketingCampaignAccess";

export const GET = withApiHandler(
  "marketing-campaign-readiness",
  async (request) => {
    const url = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: url.searchParams.get("organizationId"),
      request,
    });

    if (!access.success) {
      const error = new Error(access.error || "Organization access denied");
      error.status = access.status || 403;
      throw error;
    }

    const readiness = await MarketingCampaignBuilderReadinessRuntime.readiness({
      organizationId: access.organizationId,
    });

    return {
      ...readiness,
      capabilities: {
        ...(readiness?.capabilities || {}),
        can_manage_paid_media: hasMarketingPermission(access, "marketing.ads.manage"),
      },
    };
  },
);

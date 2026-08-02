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

    return MarketingCampaignBuilderReadinessRuntime.readiness({
      organizationId: access.organizationId,
    });
  },
);

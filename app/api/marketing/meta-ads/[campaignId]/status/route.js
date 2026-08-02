export const dynamic = "force-dynamic";

import {
  withApiHandler,
} from "@/lib/shared/http/withApiHandler";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  ManagedMediaCampaignControlRuntime,
} from "@/lib/marketing/services/ManagedMediaCampaignControlRuntime";

export const POST = withApiHandler(
  "marketing-meta-ads-status-control",
  async (request, context) => {
    const body = await request.json();
    const params = await context.params;
    const campaignId = params?.campaignId;
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId,
      request,
      requiredPermission: "marketing.ads.manage",
    });

    if (!access.success) {
      const error = new Error(access.error || "Organization access denied");
      error.status = access.status || 403;
      throw error;
    }

    if (body.action === "launch") {
      return ManagedMediaCampaignControlRuntime.launch({
        organizationId: access.organizationId,
        campaignId,
      });
    }

    if (body.action === "pause") {
      return ManagedMediaCampaignControlRuntime.pause({
        organizationId: access.organizationId,
        campaignId,
      });
    }

    throw new Error("Unsupported managed media campaign action");
  }
);

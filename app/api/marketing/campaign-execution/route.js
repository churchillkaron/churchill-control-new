export const dynamic = "force-dynamic";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  MarketingCampaignExecutionRuntime,
} from "@/lib/marketing/campaigns/MarketingCampaignExecutionRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
      requiredPermission: "marketing.ads.manage",
    });

    if (!access.success) {
      return Response.json(
        {
          success: false,
          error: {
            stage: "AUTHORIZATION",
            code: "ORGANIZATION_ACCESS_DENIED",
            message: access.error || "Organization access denied",
            correction: "Use an authorized organization and a user with marketing campaign management permission.",
          },
        },
        { status: access.status || 403 },
      );
    }

    const result = await MarketingCampaignExecutionRuntime.executeApprovedPlan({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id || null,
      plan: body.plan,
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: MarketingCampaignExecutionRuntime.publicError(error),
      },
      { status: error?.status || 500 },
    );
  }
}

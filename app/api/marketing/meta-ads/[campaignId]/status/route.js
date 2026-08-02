export const dynamic = "force-dynamic";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  ManagedMediaCampaignControlRuntime,
} from "@/lib/marketing/services/ManagedMediaCampaignControlRuntime";

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    const resolvedParams = await params;
    const campaignId = resolvedParams?.campaignId;
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId,
      request,
      requiredPermission: "marketing.ads.manage",
    });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error || "Organization access denied" },
        { status: access.status || 403 }
      );
    }

    let result;
    if (body.action === "launch") {
      result = await ManagedMediaCampaignControlRuntime.launch({
        organizationId: access.organizationId,
        campaignId,
      });
    } else if (body.action === "pause") {
      result = await ManagedMediaCampaignControlRuntime.pause({
        organizationId: access.organizationId,
        campaignId,
      });
    } else {
      return Response.json(
        { success: false, error: "Unsupported managed media campaign action" },
        { status: 400 }
      );
    }

    return Response.json({ success: true, data: result });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Managed media campaign action failed",
      },
      { status: error?.status || 500 }
    );
  }
}

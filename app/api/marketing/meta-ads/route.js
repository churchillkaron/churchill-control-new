export const dynamic = "force-dynamic";

import {
  withApiHandler,
} from "@/lib/shared/http/withApiHandler";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  MetaAdsRuntime,
} from "@/lib/marketing/services/MetaAdsRuntime";

async function resolveOrganizationAccess({
  value,
  request,
  requiredPermission = null,
}) {
  const access = await requireOrganizationAccess({
    organizationId: value,
    request,
    requiredPermission,
  });

  if (!access.success) {
    const error = new Error(access.error || "Organization access denied");
    error.status = access.status || 403;
    throw error;
  }

  return access;
}

export const GET = withApiHandler(
  "marketing-meta-ads-readiness",
  async (request) => {
    const url = new URL(request.url);
    const access = await resolveOrganizationAccess({
      value: url.searchParams.get("organizationId"),
      request,
    });

    return MetaAdsRuntime.readiness({
      organizationId: access.organizationId,
    });
  }
);

export const POST = withApiHandler(
  "marketing-meta-ads-create",
  async (request) => {
    const body = await request.json();
    const access = await resolveOrganizationAccess({
      value: body.organizationId,
      request,
      requiredPermission: "marketing.ads.manage",
    });

    return MetaAdsRuntime.createCampaign({
      organizationId: access.organizationId,
      entityId: body.entityId || null,
      authorizedBudget: body.authorizedBudget,
      currency: body.currency,
      campaign: body.campaign,
      adSet: body.adSet,
      creative: body.creative,
      ad: body.ad,
      deliveryChannels: body.deliveryChannels || [],
      destination: body.destination || "ENGAGEMENT",
    });
  }
);

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

async function resolveOrganizationId(value) {
  const access = await requireOrganizationAccess({
    organizationId: value,
  });

  if (!access.success) {
    throw new Error(access.error || "Organization access denied");
  }

  return access.organizationId;
}

export const GET = withApiHandler(
  "marketing-meta-ads-readiness",
  async (request) => {
    const url = new URL(request.url);
    const organizationId = await resolveOrganizationId(
      url.searchParams.get("organizationId")
    );

    return MetaAdsRuntime.readiness({ organizationId });
  }
);

export const POST = withApiHandler(
  "marketing-meta-ads-create",
  async (request) => {
    const body = await request.json();
    const organizationId = await resolveOrganizationId(body.organizationId);

    return MetaAdsRuntime.createCampaign({
      organizationId,
      adAccountId: body.adAccountId,
      campaign: body.campaign,
      adSet: body.adSet,
      creative: body.creative,
      ad: body.ad,
    });
  }
);

export const PATCH = withApiHandler(
  "marketing-meta-ads-status",
  async (request) => {
    const body = await request.json();
    const organizationId = await resolveOrganizationId(body.organizationId);

    return MetaAdsRuntime.updateStatus({
      organizationId,
      objectId: body.objectId,
      status: body.status,
    });
  }
);

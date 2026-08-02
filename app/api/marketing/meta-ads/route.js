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

export const PATCH = withApiHandler(
  "marketing-meta-ads-settlement",
  async (request) => {
    const body = await request.json();
    const organizationId = await resolveOrganizationId(body.organizationId);

    if (body.action !== "settle_spend") {
      throw new Error("Unsupported managed media action");
    }

    return MetaAdsRuntime.settleSpend({
      organizationId,
      campaignId: body.campaignId,
      cumulativeProviderSpend: body.cumulativeProviderSpend,
      settlementKey: body.settlementKey,
      complete: body.complete === true,
    });
  }
);

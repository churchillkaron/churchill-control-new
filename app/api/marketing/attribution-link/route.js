export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { canCreateMarketingCampaign } from "@/lib/marketing/security/marketingCampaignAccess";
import { MarketingAttributionTrackingRuntime } from "@/lib/marketing/intelligence/MarketingAttributionTrackingRuntime";

function fail(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || String(error || "Marketing attribution link failed"),
    },
    { status },
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = String(body?.organizationId || "").trim();
    const marketingCampaignId = String(body?.marketingCampaignId || "").trim();

    if (!organizationId || !marketingCampaignId) {
      return fail(new Error("organizationId and marketingCampaignId are required"), 400);
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return fail(new Error(access.error || "Organization access denied"), access.status || 403);
    }
    if (!canCreateMarketingCampaign(access)) {
      return fail(new Error("Marketing campaign management permission required"), 403);
    }

    const data = await MarketingAttributionTrackingRuntime.create({
      organizationId,
      marketingCampaignId,
      managedMediaCampaignId: body?.managedMediaCampaignId || null,
      providerId: body?.providerId || null,
      providerCampaignId: body?.providerCampaignId || null,
      destinationUrl: body?.destinationUrl || null,
      utm: body?.utm || {},
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return fail(error, Number(error?.status || 500));
  }
}

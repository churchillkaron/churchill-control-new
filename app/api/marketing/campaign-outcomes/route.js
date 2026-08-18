export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { hasMarketingPermission } from "@/lib/marketing/security/marketingCampaignAccess";
import { MarketingOutcomeAttributionRuntime } from "@/lib/marketing/intelligence/MarketingOutcomeAttributionRuntime";

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || String(error || "Campaign outcome request failed"),
    },
    { status },
  );
}

function text(value) {
  return String(value ?? "").trim();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body?.organizationId);
    const marketingCampaignId = text(body?.marketingCampaignId);

    if (!organizationId || !marketingCampaignId) {
      return errorResponse(
        new Error("organizationId and marketingCampaignId are required"),
        400,
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(
        new Error(access.error || "Organization access denied"),
        access.status || 403,
      );
    }

    const canRecord = [
      "marketing.campaign.manage",
      "marketing.attribution.manage",
      "marketing.*",
    ].some((permission) => hasMarketingPermission(access, permission));

    if (!canRecord) {
      return errorResponse(
        new Error("Marketing outcome attribution permission required"),
        403,
      );
    }

    const idempotencyKey = text(body?.idempotencyKey);
    if (!idempotencyKey) {
      return errorResponse(new Error("idempotencyKey is required"), 400);
    }

    const data = await MarketingOutcomeAttributionRuntime.record({
      organizationId: access.organizationId,
      marketingCampaignId,
      managedMediaCampaignId: text(body?.managedMediaCampaignId) || null,
      providerId: text(body?.providerId) || "internal",
      providerCampaignId: text(body?.providerCampaignId) || null,
      outcomeType: text(body?.outcomeType) || "CONVERSION",
      qualified: body?.qualified === true,
      quantity: body?.quantity ?? 1,
      revenue: body?.revenue ?? 0,
      cost: body?.cost ?? 0,
      profit: body?.profit ?? 0,
      currency: text(body?.currency) || "THB",
      partyId: body?.partyId || null,
      customerId: body?.customerId || null,
      leadId: body?.leadId || null,
      reservationId: body?.reservationId || null,
      orderId: body?.orderId || null,
      invoiceId: body?.invoiceId || null,
      sourceDocumentType: text(body?.sourceDocumentType) || null,
      sourceDocumentId: text(body?.sourceDocumentId) || null,
      attributionModel: text(body?.attributionModel) || "DIRECT",
      confidence: body?.confidence ?? 1,
      idempotencyKey,
      metadata: {
        ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}),
        recorded_by_user_id: access.userId || null,
        recorded_by_staff_account_id: access.access?.staffAccountId || null,
        recording_channel: "CAMPAIGN_OUTCOME_API",
      },
      occurredAt: body?.occurredAt || null,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, Number(error?.status || 500));
  }
}

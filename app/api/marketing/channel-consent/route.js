export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { MarketingCampaignConsentRuntime } from "@/lib/marketing/campaigns/MarketingCampaignConsentRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function denied(access) {
  return Response.json({ success: false, error: access.error || "Organization access denied" }, { status: access.status || 403 });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
      request,
    });
    if (!access.success) return denied(access);

    const channel = text(url.searchParams.get("channel"));
    const partyId = text(url.searchParams.get("partyId") || url.searchParams.get("party_id"));
    if (!channel) return Response.json({ success: false, error: "channel required" }, { status: 400 });

    if (partyId) {
      const data = await MarketingCampaignConsentRuntime.eligibility({
        organizationId: access.organizationId,
        partyId,
        channel,
      });
      return Response.json({ success: true, data });
    }

    const partyIds = (url.searchParams.get("partyIds") || url.searchParams.get("party_ids") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const data = await MarketingCampaignConsentRuntime.resolveEligibleAudience({
      organizationId: access.organizationId,
      channel,
      partyIds: partyIds.length ? partyIds : null,
      limit: url.searchParams.get("limit") || 500,
    });
    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Unable to evaluate campaign consent" }, { status: error?.status || 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });
    if (!access.success) return denied(access);

    const data = await MarketingCampaignConsentRuntime.upsertPreference({
      organizationId: access.organizationId,
      partyId: body.partyId || body.party_id,
      channel: body.channel,
      status: body.status || body.consent_status,
      recipientAddress: body.recipientAddress || body.recipient_address || null,
      source: body.source || body.consent_source,
      evidence: body.evidence || body.consent_evidence || {},
      suppressionReason: body.suppressionReason || body.suppression_reason || null,
      metadata: body.metadata || {},
      actorId: access.userId || access.user?.id || null,
    });
    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Unable to save campaign consent" }, { status: error?.status || 500 });
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { syncGoogleReviews } from "@/lib/commercial/reputation/ReputationAutomationRuntime";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

async function googleDiscoveryState(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("organization_channel_connections")
    .select("metadata")
    .eq("organization_id", organizationId)
    .eq("provider", "google")
    .maybeSingle();

  if (error) throw error;
  return data?.metadata || {};
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId:
        body?.organizationId || body?.organization_id || null,
    });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
          availableOrganizationIds:
            context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      );
    }

    const discovery = await googleDiscoveryState(context.organizationId);
    if (
      String(discovery.location_discovery_status || "").toUpperCase() ===
      "API_ACCESS_PENDING"
    ) {
      return NextResponse.json({
        success: true,
        organizationId: context.organizationId,
        platform: "GOOGLE",
        synced: 0,
        processed: [],
        historicalBackfill: true,
        backfillRemaining: null,
        skipped: true,
        reason: "GOOGLE_API_ACCESS_PENDING",
        retryAt: discovery.location_discovery_retry_at || null,
        message:
          "Google authorization is active. Review synchronization is waiting for Google Business Profile API access approval for the Avantiqo Cloud project.",
      });
    }

    const result = await syncGoogleReviews({
      organizationId: context.organizationId,
      maxReviews: body?.maxReviews
        ? Math.min(Math.max(Number(body.maxReviews), 1), 500)
        : 200,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      platform: "GOOGLE",
      synced: result.synced,
      processed: result.processed,
      historicalBackfill: result.historicalBackfill,
      backfillRemaining: result.backfillRemaining,
      skipped: Boolean(result.skipped),
      reason: result.reason || null,
      retryAt: result.retryAt || null,
      message: result.error || null,
    });
  } catch (error) {
    console.error("SYNC_GOOGLE_REVIEWS_ERROR", error);
    const message = error?.message || "Google reviews sync failed";
    const configurationError =
      message.includes("not connected") ||
      message.includes("No Google Business Profile locations");

    return NextResponse.json(
      { success: false, error: message },
      { status: configurationError ? 400 : 500 }
    );
  }
}

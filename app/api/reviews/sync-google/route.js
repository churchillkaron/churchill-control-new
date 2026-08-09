export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { syncGoogleReviews } from "@/lib/commercial/reputation/ReputationAutomationRuntime";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

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

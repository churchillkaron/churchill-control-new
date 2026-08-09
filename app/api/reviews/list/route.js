export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { canApproveReviewResponses } from "@/lib/commercial/reputation/reviewAuthorization";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(request) {
  try {
    const body = await request.json();
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

    const platform = body?.platform || null;
    const limit = Math.min(200, Math.max(1, Number(body?.limit || 50)));

    let query = supabaseAdmin
      .from("reputation_reviews")
      .select("*")
      .eq("organization_id", context.organizationId)
      .order("review_time", { ascending: false })
      .limit(limit);

    if (platform && platform !== "ALL") {
      query = query.eq("platform", platform);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const reviews = data || [];
    const [policyResult, connectionResult, recoveryResult] =
      await Promise.all([
        supabaseAdmin
          .from("reputation_review_policies")
          .select("*")
          .eq("organization_id", context.organizationId)
          .eq("enabled", true)
          .is("entity_id", null)
          .is("channel_asset_id", null)
          .maybeSingle(),
        supabaseAdmin
          .from("organization_channel_connections")
          .select("id,status,metadata,updated_at")
          .eq("organization_id", context.organizationId)
          .eq("provider", "google")
          .maybeSingle(),
        reviews.length
          ? supabaseAdmin
              .from("reputation_recovery_cases")
              .select("*")
              .eq("organization_id", context.organizationId)
              .in(
                "review_id",
                reviews.map((review) => review.id)
              )
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (policyResult.error) throw policyResult.error;
    if (connectionResult.error) throw connectionResult.error;
    if (recoveryResult.error) throw recoveryResult.error;

    const recoveryByReview = new Map(
      (recoveryResult.data || []).map((recovery) => [
        recovery.review_id,
        recovery,
      ])
    );
    const connected =
      String(connectionResult.data?.status || "").toUpperCase() === "ACTIVE";

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      canApprove: canApproveReviewResponses(context),
      googleConnected: connected,
      googleConnection: connectionResult.data || null,
      policy: policyResult.data || null,
      reviews: reviews.map((review) => ({
        ...review,
        recovery_case: recoveryByReview.get(review.id) || null,
      })),
    });
  } catch (error) {
    console.error("REVIEWS_LIST_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load reviews",
      },
      { status: 500 }
    );
  }
}

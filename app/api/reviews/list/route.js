export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
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

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      reviews: data || [],
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

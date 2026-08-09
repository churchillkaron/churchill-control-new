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

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Google Places integration is not configured",
        },
        { status: 400 }
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("review_platform_profiles")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("platform", "GOOGLE")
      .eq("is_active", true)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile?.external_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Google Place ID is not configured for this organization",
        },
        { status: 400 }
      );
    }

    const url =
      "https://maps.googleapis.com/maps/api/place/details/json" +
      `?place_id=${encodeURIComponent(profile.external_id)}` +
      "&fields=name,rating,reviews,user_ratings_total,url" +
      `&key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data?.status === "REQUEST_DENIED") {
      return NextResponse.json(
        {
          success: false,
          error:
            data?.error_message ||
            data?.status ||
            "Google reviews sync failed",
        },
        { status: 400 }
      );
    }

    const reviews = data?.result?.reviews || [];
    const rows = reviews.map((review) => ({
      organization_id: context.organizationId,
      platform: "GOOGLE",
      external_review_id:
        `${profile.external_id}-${review.time}-${review.author_name}`,
      author_name: review.author_name || null,
      rating: review.rating || null,
      review_text: review.text || null,
      review_time: review.time
        ? new Date(review.time * 1000).toISOString()
        : null,
      review_url: data?.result?.url || null,
      profile_photo_url: review.profile_photo_url || null,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length) {
      const { error: upsertError } = await supabaseAdmin
        .from("reputation_reviews")
        .upsert(rows, {
          onConflict:
            "organization_id,platform,external_review_id",
        });

      if (upsertError) {
        throw upsertError;
      }
    }

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      synced: rows.length,
      platform: "GOOGLE",
    });
  } catch (error) {
    console.error("SYNC_GOOGLE_REVIEWS_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Google reviews sync failed",
      },
      { status: 500 }
    );
  }
}

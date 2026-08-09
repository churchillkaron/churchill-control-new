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

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("review_platform_profiles")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("platform", "FACEBOOK")
      .eq("is_active", true)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    const pageId = profile?.external_id || null;
    const accessToken = profile?.access_token || null;

    if (!pageId) {
      return NextResponse.json(
        {
          success: false,
          error: "Facebook Page ID is not configured for this organization",
        },
        { status: 400 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Facebook Page access token is not configured for this organization",
        },
        { status: 400 }
      );
    }

    const url =
      `https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}/ratings` +
      "?fields=reviewer,rating,review_text,created_time,recommendation_type,open_graph_story" +
      `&access_token=${encodeURIComponent(accessToken)}`;

    const response = await fetch(url);
    const json = await response.json();

    if (!response.ok || json.error) {
      return NextResponse.json(
        {
          success: false,
          error:
            json.error?.message ||
            "Facebook reviews sync failed",
        },
        { status: 400 }
      );
    }

    const rows = (json.data || []).map((review) => ({
      organization_id: context.organizationId,
      platform: "FACEBOOK",
      external_review_id:
        review.open_graph_story?.id ||
        `${pageId}-${review.created_time}-${review.reviewer?.name}`,
      author_name: review.reviewer?.name || null,
      rating: review.rating || null,
      review_text:
        review.review_text || review.recommendation_type || null,
      review_time: review.created_time || null,
      review_url: review.open_graph_story?.id
        ? `https://facebook.com/${review.open_graph_story.id}`
        : null,
      profile_photo_url: null,
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
      platform: "FACEBOOK",
      synced: rows.length,
    });
  } catch (error) {
    console.error("SYNC_FACEBOOK_REVIEWS_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Facebook reviews sync failed",
      },
      { status: 500 }
    );
  }
}

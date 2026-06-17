export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {
    const { tenantId } = await req.json();

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "Missing tenantId" }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("review_platform_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("platform", "FACEBOOK")
      .eq("is_active", true)
      .maybeSingle();

    if (profileError) throw profileError;

    const pageId = profile?.external_id || process.env.FACEBOOK_PAGE_ID;
    const accessToken = profile?.access_token || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    if (!pageId) {
      return NextResponse.json({ success: false, error: "Missing Facebook Page ID" }, { status: 400 });
    }

    if (!accessToken) {
      return NextResponse.json({ success: false, error: "Missing Facebook Page Access Token" }, { status: 400 });
    }

    const url =
      `https://graph.facebook.com/v19.0/${pageId}/ratings` +
      `?fields=reviewer,rating,review_text,created_time,recommendation_type,open_graph_story` +
      `&access_token=${accessToken}`;

    const response = await fetch(url);
    const json = await response.json();

    if (!response.ok || json.error) {
      return NextResponse.json(
        { success: false, error: json.error?.message || "Facebook reviews sync failed" },
        { status: 400 }
      );
    }

    const rows = (json.data || []).map((review) => ({
      tenant_id: tenantId,
      platform: "FACEBOOK",
      external_review_id: review.open_graph_story?.id || `${pageId}-${review.created_time}-${review.reviewer?.name}`,
      author_name: review.reviewer?.name || null,
      rating: review.rating || null,
      review_text: review.review_text || review.recommendation_type || null,
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
          onConflict: "tenant_id,platform,external_review_id",
        });

      if (upsertError) throw upsertError;
    }

    return NextResponse.json({
      success: true,
      platform: "FACEBOOK",
      synced: rows.length,
    });
  } catch (error) {
    console.error("[SYNC_FACEBOOK_REVIEWS]", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {
    const { tenantId } = await req.json();

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "Missing tenantId" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ success: false, error: "Missing GOOGLE_PLACES_API_KEY" }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("review_platform_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("platform", "GOOGLE")
      .eq("is_active", true)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile?.external_id) {
      return NextResponse.json({ success: false, error: "Missing Google Place ID" }, { status: 400 });
    }

    const url =
      "https://maps.googleapis.com/maps/api/place/details/json" +
      `?place_id=${profile.external_id}` +
      "&fields=name,rating,reviews,user_ratings_total,url" +
      `&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    const reviews = data?.result?.reviews || [];

    const rows = reviews.map((review) => ({
      tenant_id: tenantId,
      platform: "GOOGLE",
      external_review_id: `${profile.external_id}-${review.time}-${review.author_name}`,
      author_name: review.author_name || null,
      rating: review.rating || null,
      review_text: review.text || null,
      review_time: review.time ? new Date(review.time * 1000).toISOString() : null,
      review_url: data?.result?.url || null,
      profile_photo_url: review.profile_photo_url || null,
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
      synced: rows.length,
      platform: "GOOGLE",
    });
  } catch (error) {
    console.error("[SYNC_GOOGLE_REVIEWS]", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

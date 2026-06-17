export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {
    const body = await req.json();
    const tenantId = body.tenantId;
    const platform = body.platform || null;
    const limit = Number(body.limit || 50);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "Missing tenantId" }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("reputation_reviews")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("review_time", { ascending: false })
      .limit(limit);

    if (platform && platform !== "ALL") {
      query = query.eq("platform", platform);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      reviews: data || [],
    });
  } catch (error) {
    console.error("[REVIEWS_LIST]", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

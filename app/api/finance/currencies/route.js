export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    let query = supabaseAdmin
      .from("currencies")
      .select("*")
      .order("code", { ascending: true });

    if (organizationId) {
      query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      currencies: data || [],
      rows: data || [],
    });
  } catch (error) {
    console.error("currencies GET", error);

    return NextResponse.json(
      { success: false, error: error.message || "Currencies load failed" },
      { status: 500 }
    );
  }
}

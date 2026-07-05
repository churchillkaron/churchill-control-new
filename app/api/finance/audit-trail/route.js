export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("audit_logs")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      events: data || [],
      rows: data || [],
    });
  } catch (error) {
    console.error("audit-trail GET", error);

    return NextResponse.json(
      { success: false, error: error.message || "Audit trail load failed" },
      { status: 500 }
    );
  }
}

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
      .from("payment_terms")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      paymentTerms: data || [],
      rows: data || [],
    });
  } catch (error) {
    console.error("payment-terms GET", error);

    return NextResponse.json(
      { success: false, error: error.message || "Payment terms load failed" },
      { status: 500 }
    );
  }
}

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
      .from("tax_rules")
      .select("*")
      .eq("is_active", true)
      .order("tax_code", { ascending: true });

    if (error) throw error;

    // Map ERP schema → UI schema expected by registry
    const taxCodes = (data || []).map((t) => ({
      id: t.id,
      code: t.tax_code,
      name: t.tax_name,
      rate: t.tax_rate,
      regime: t.tax_regime,
      standard: t.accounting_standard,
      effective_from: t.effective_from,
      effective_to: t.effective_to,
      is_active: t.is_active
    }));

    return NextResponse.json({
      success: true,
      taxCodes,
      rows: taxCodes
    });

  } catch (error) {
    console.error("tax-codes GET", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Tax codes load failed"
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId") || searchParams.get("organization_id");

    if (!organizationId) {
      return NextResponse.json({ success: false, error: "organizationId required", invoices: [] }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("customer_invoices")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({
        success: true,
        invoices: [],
        warning: error.message,
      });
    }

    return NextResponse.json({ success: true, invoices: data || [] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message, invoices: [] }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {

    const { tenantId, tableNumber } = await req.json();

    const { data, error } = await supabaseAdmin
      .from('payment_transactions')
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("table_number", tableNumber)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const totalPaid =
      (data || []).reduce((sum, p) =>
        sum + Number(p.amount || 0), 0);

    return NextResponse.json({
      success: true,
      state: {
        payments: data || [],
        totalPaid
      }
    });

  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 });
  }
}

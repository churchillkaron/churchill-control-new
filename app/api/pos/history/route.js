import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {

    const { organizationId } = await req.json();

    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select(`
        *,
        order_items (*)
      `)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const { data: payments, error: pError } = await supabaseAdmin
      .from('payment_transactions')
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (pError) throw pError;

    return NextResponse.json({
      success: true,
      data: {
        orders: orders || [],
        payments: payments || []
      }
    });

  } catch (err) {

    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 });

  }
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {

    const {
      orderId,
      tenantId,
      acknowledgedBy
    } = await req.json();

    const { data, error } = await supabaseAdmin
      .from("order_acknowledgements")
      .insert({
        order_id: orderId,
        tenant_id: tenantId,
        acknowledged_by: acknowledgedBy,
        status: "RECEIVED"
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data
    });

  } catch (err) {

    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 });

  }
}

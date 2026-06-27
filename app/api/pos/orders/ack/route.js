import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {

    const {
      orderId,
      organizationId,
      acknowledgedBy
    } = await req.json();

    const { data, error } = await supabaseAdmin
      .from("order_acknowledgements")
      .insert({
        order_id: orderId,
        organization_id: organizationId,
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

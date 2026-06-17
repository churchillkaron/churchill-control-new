import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { processOrderLifecycle } from "@/lib/erp/processOrderLifecycle";

export async function POST(req) {
  try {

    const {
      orderId,
      tenantId,
      status
    } = await req.json();

    // -----------------------------------
    // 1. UPDATE ORDER STATUS
    // -----------------------------------
    const { error } = await supabaseAdmin
      .from("orders")
      .update({
        status
      })
      .eq("id", orderId);

    if (error) throw error;

    // -----------------------------------
    // 2. TRIGGER ERP FLOW (ONLY ON COMPLETION)
    // -----------------------------------
    let result = null;

    if (status === "COMPLETED") {

      result = await processOrderLifecycle({
        orderId,
        tenantId
      });

    }

    // -----------------------------------
    // 3. RETURN RESULT
    // -----------------------------------
    return NextResponse.json({
      success: true,
      triggered: status === "COMPLETED",
      result
    });

  } catch (err) {

    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 });

  }
}

import { NextResponse } from "next/server";
import { runShiftClosedFlow } from "@/lib/orchestration/runShiftClosedFlow";
import { supabase } from "@/lib/shared/supabase/client";

export async function POST(request) {
  try {
    const body = await request.json();

    // Fetch all paid orders for the tenant and shift to calculate service charge
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("service_charge")
      .eq("tenant_id", body.tenantId)
      .eq("payment_status", "PAID");
    
    if (ordersError) throw ordersError;

    const totalServiceCharge = orders.reduce(
      (sum, o) => sum + Number(o.service_charge || 0),
      0
    );

    const result = await runShiftClosedFlow({
      tenantId: body.tenantId,
      shiftName: body.shiftName,
      revenue: body.revenue,
      laborCost: body.laborCost,
      serviceCharge: totalServiceCharge,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 400,
      }
    );
  }
}

export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import processVendorPayment from "@/lib/finance/payments/capabilities/processVendorPayment";

export async function POST(req) {
  try {
    await requireAuth();

    const body = await req.json();

    const result = await processVendorPayment({
      organization_id: body.organization_id,
      entity_id: body.entity_id,
      accounts_payable_id: body.payable_id,
      payment_method: body.payment_method,
      paid_by: body.paid_by,
    });

    return NextResponse.json({
      success: result.success,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

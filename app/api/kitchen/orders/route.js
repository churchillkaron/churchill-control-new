import { NextResponse } from "next/server";
import getKitchenOrders from "@/lib/pos/kitchen/getKitchenOrders";

export async function POST(req) {
  try {

    const { tenantId } =
      await req.json();

    const result =
      await getKitchenOrders({
        tenant_id: tenantId,
      });

    return NextResponse.json(
      result
    );

  } catch (err) {

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      {
        status: 500,
      }
    );
  }
}

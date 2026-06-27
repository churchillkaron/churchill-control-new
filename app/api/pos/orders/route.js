import { NextResponse } from "next/server";
import { loadActiveOrders } from "@/lib/pos/loadActiveOrders";
import { loadOrderItems } from "@/lib/pos/loadOrderItems";

export async function POST(req) {
  try {

    const { organizationId } = await req.json();

    const orders = await loadActiveOrders(organizationId);

    const enriched = await Promise.all(
      (orders || []).map(async (order) => {

        const items = await loadOrderItems(order.id);

        return {
          ...order,
          items: items || []
        };

      })
    );

    return NextResponse.json({
      success: true,
      data: enriched
    });

  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err.message
      },
      { status: 500 }
    );
  }
}

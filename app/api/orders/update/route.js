import { NextResponse } from "next/server";
import { orders } from "@/lib/store/orders";

export async function POST(req) {
  try {
    const body = await req.json();
    const { id, status } = body;

    const order = orders.find((o) => o.id === id);

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    order.status = status;

    if (status === "paid") {
      order.paidAt = new Date().toISOString();
    }

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    );
  }
}
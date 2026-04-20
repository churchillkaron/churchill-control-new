import { NextResponse } from "next/server";
import { orders } from "../store";

export async function POST(req) {
  try {
    const body = await req.json();
    const { id } = body;

    const order = orders.find((o) => o.id === id);

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // 🔥 FORCE PAID STATUS
    order.status = "paid";

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import { orders } from "@/lib/store/orders";

export async function GET() {
  return NextResponse.json(orders);
}

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      table = "unknown",
      items = [],
      staff = "unknown",
    } = body;

    const total = items.reduce((sum, i) => sum + (i.price || 0), 0);

    const order = {
      id: Date.now(),
      table,
      staff,
      items,
      total,
      status: "new",
      createdAt: new Date().toISOString(),
      paidAt: null,
    };

    orders.push(order);

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import { orders } from "./store";

export async function GET() {
  return NextResponse.json(orders);
}

export async function POST(req) {
  try {
    const body = await req.json();

    if (!body.items || body.items.length === 0) {
      return NextResponse.json(
        { error: "No items in order" },
        { status: 400 }
      );
    }

    const total = body.items.reduce(
      (sum, i) => sum + (i.price || 0),
      0
    );

    const order = {
      id: Date.now(),
      table: body.table || "T1",
      staff: body.staff || "FOH",
      items: body.items,
      total,
      status: "new",
      createdAt: new Date().toISOString(),
    };

    orders.push(order);

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
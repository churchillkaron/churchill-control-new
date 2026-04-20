import { NextResponse } from "next/server";
import { orders } from "./store";

export async function GET() {
  try {
    return NextResponse.json(orders || []);
  } catch (err) {
    return NextResponse.json(
      { error: "GET failed", details: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    if (!body || !body.items) {
      return NextResponse.json(
        { error: "Invalid body" },
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
      paidAt: null,
    };

    orders.push(order);

    return NextResponse.json({
      success: true,
      order,
    });
  } catch (err) {
    console.error("ORDER API ERROR:", err);

    return NextResponse.json(
      { error: "POST failed", details: err.message },
      { status: 500 }
    );
  }
}
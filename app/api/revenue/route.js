import { NextResponse } from "next/server";
import { orders } from "../../../lib/store/orders";

export async function GET() {
  const paidOrders = orders.filter((o) => o.status === "paid");

  const revenue = paidOrders.reduce((sum, o) => sum + o.total, 0);

  const orderCount = paidOrders.length;

  const avgOrderValue =
    orderCount > 0 ? revenue / orderCount : 0;

  return NextResponse.json({
    revenue,
    orderCount,
    avgOrderValue: Math.round(avgOrderValue),
  });
}
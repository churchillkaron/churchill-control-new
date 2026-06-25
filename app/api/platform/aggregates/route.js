import { NextResponse } from "next/server";
import { AggregateRegistry } from "@/lib/aggregate-registry";

export async function GET() {
  return NextResponse.json({
    success: true,
    aggregates: AggregateRegistry.all(),
  });
}

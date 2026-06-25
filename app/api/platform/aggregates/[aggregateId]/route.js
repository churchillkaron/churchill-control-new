import { NextResponse } from "next/server";
import { AggregateRegistry } from "@/lib/aggregate-registry";

export async function GET(
  request,
  { params }
) {
  const aggregate =
    AggregateRegistry.get(
      params.aggregateId
    );

  if (!aggregate) {
    return NextResponse.json(
      {
        success: false,
        error: "AGGREGATE_NOT_FOUND",
      },
      {
        status: 404,
      }
    );
  }

  return NextResponse.json({
    success: true,
    aggregate,
  });
}

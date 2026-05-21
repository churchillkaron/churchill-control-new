import { NextResponse } from "next/server";
import calculateInventoryCost from "@/lib/warehouse/calculateInventoryCost";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await calculateInventoryCost(body);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

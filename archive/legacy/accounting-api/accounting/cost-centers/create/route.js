import { NextResponse } from "next/server";
import { createCostCenter } from "@/lib/finance/management/createCostCenter";

export async function POST(request) {
  try {
    const body = await request.json();

    const center = await createCostCenter(body);

    return NextResponse.json({
      success: true,
      center,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}

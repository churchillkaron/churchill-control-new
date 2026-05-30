import { NextResponse } from "next/server";
import { createTaxRate } from "@/lib/finance/createTaxRate";

export async function POST(request) {
  try {
    const body = await request.json();

    const tax = await createTaxRate(body);

    return NextResponse.json({
      success: true,
      tax,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}

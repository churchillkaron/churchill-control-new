import { NextResponse } from "next/server";
import { createCurrencyRate } from "@/lib/finance/createCurrencyRate";

export async function POST(request) {
  try {
    const body = await request.json();

    const rate = await createCurrencyRate(body);

    return NextResponse.json({
      success: true,
      rate,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}

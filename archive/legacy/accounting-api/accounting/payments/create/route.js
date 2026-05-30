import { NextResponse } from "next/server";
import { createPayment } from "@/lib/finance/createPayment";

export async function POST(request) {
  try {
    const body = await request.json();

    const payment = await createPayment(body);

    return NextResponse.json({
      success: true,
      payment,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}

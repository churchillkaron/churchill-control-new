import { NextResponse } from "next/server";
import { runPeriodClose } from "@/lib/finance/runPeriodClose";

export async function POST(request) {
  try {
    const body = await request.json();

    const result = await runPeriodClose(body);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}

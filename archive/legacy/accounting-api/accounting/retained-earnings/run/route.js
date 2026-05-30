import { NextResponse } from "next/server";
import { runRetainedEarnings } from "@/lib/finance/runRetainedEarnings";

export async function POST(request) {
  try {
    const body = await request.json();

    const result = await runRetainedEarnings(body);

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

import { NextResponse } from "next/server";
import { runDepreciation } from "@/lib/finance/runDepreciation";

export async function POST(request) {
  try {
    const body = await request.json();

    const result = await runDepreciation(body.asset);

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

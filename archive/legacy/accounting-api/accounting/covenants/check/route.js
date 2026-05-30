import { NextResponse } from "next/server";
import { runCovenantChecks } from "@/lib/finance/enterprise/runCovenantChecks";

export async function GET() {
  try {
    const checks = await runCovenantChecks();

    return NextResponse.json({
      success: true,
      checks,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}

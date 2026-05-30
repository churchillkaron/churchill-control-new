import { NextResponse } from "next/server";
import { runESGReport } from "@/lib/finance/enterprise/runESGReport";

export async function GET() {
  try {
    const report = await runESGReport();

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}

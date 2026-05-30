import { NextResponse } from "next/server";
import { getInternalAudit } from "@/lib/finance/governance/getInternalAudit";

export async function GET() {
  try {
    const audits = await getInternalAudit();

    return NextResponse.json({
      success: true,
      audits,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}

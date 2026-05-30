import { NextResponse } from "next/server";
import { runComplianceChecks } from "@/lib/finance/runComplianceChecks";

export async function POST(request) {
  try {
    const body = await request.json();

    const checks = await runComplianceChecks({
      tenantId: body.tenantId,
    });

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

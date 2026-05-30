import { NextResponse } from "next/server";
import { getPolicyEngine } from "@/lib/finance/governance/getPolicyEngine";

export async function GET() {
  try {
    const policies = await getPolicyEngine();

    return NextResponse.json({
      success: true,
      policies,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}

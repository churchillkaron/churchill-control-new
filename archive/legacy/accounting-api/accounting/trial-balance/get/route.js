import { NextResponse } from "next/server";
import { getTrialBalance } from "@/lib/finance/getTrialBalance";

export async function POST(request) {
  try {
    const body = await request.json();

    const trialBalance = await getTrialBalance({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      trialBalance,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      { status: 400 }
    );
  }
}

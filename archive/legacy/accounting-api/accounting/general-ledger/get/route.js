import { NextResponse } from "next/server";
import { getGeneralLedger } from "@/lib/finance/getGeneralLedger";

export async function POST(request) {
  try {
    const body = await request.json();

    const ledger = await getGeneralLedger({
      tenantId: body.tenantId,
      startDate: body.startDate,
      endDate: body.endDate,
    });

    return NextResponse.json({
      success: true,
      ledger,
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

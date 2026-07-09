export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { runYearEndCloseCommand } from "@/lib/finance/period-close/runtime/PeriodCloseApplicationService";

export async function POST(request) {
  try {
    const body = await request.json();

    // FORWARD TO YEAR-END (single source of truth)
    const result = await runYearEndCloseCommand(body);

    return NextResponse.json(result);

  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

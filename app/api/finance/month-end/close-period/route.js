export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { runMonthEndCloseCommand } from "@/lib/finance/period-close/runtime/PeriodCloseApplicationService";

export async function POST(request) {
  try {
    const body = await request.json();

    const result = await runMonthEndCloseCommand(body);

    return NextResponse.json(result);

  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

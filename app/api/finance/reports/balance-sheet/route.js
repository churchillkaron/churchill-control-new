export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { run } from "@/lib/finance/reporting/runtime/ReportingApplicationService";

export async function GET(request) {
  try {
    const p = new URL(request.url).searchParams;
    return NextResponse.json(await run("balance_sheet", { organizationId: p.get("organizationId"), entityId: p.get("entityId"), periodId: p.get("periodId") }));
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}


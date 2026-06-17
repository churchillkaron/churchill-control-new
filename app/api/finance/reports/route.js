import { NextResponse } from "next/server";
import { getFinancialReports } from "@/lib/finance/services/reporting/getFinancialReports";

export async function POST(req) {
  try {
    const { tenant_id } = await req.json();

    const data = await getFinancialReports(tenant_id);

    return NextResponse.json({ data });

  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { buildBalanceSheet } from "@/lib/finance/engine/buildBalanceSheet";

export async function POST(req) {
  try {
    const { tenant_id } = await req.json();

    const data = await buildBalanceSheet(tenant_id);

    return NextResponse.json({ data });

  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

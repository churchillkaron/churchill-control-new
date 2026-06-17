import { NextResponse } from "next/server";
import { buildProfitLoss } from "@/lib/finance/engine/buildProfitLoss";

export async function POST(req) {
  try {
    const { tenant_id } = await req.json();

    const data = await buildProfitLoss(tenant_id);

    return NextResponse.json({ data });

  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

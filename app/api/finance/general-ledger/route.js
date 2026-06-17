import { NextResponse } from "next/server";
import { getGeneralLedger } from "@/lib/finance/services/getGeneralLedger";

export async function POST(req) {
  const { tenant_id } = await req.json();

  try {
    const data = await getGeneralLedger(tenant_id);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

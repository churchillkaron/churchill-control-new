import { NextResponse } from "next/server";
import { getCashflow } from "@/lib/finance/services/getCashflow";

export async function POST(req) {
  const { tenant_id } = await req.json();

  try {
    const data = await getCashflow(tenant_id);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

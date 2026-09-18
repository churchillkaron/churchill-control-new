export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { processEInvoiceCallback } from "@/lib/finance/e-invoicing/runtime/FinanceEInvoiceRuntime";

const text = (value) => String(value ?? "").trim();

export async function POST(request, { params }) {
  try {
    const resolved = await params;
    const transmissionId = text(resolved?.transmissionId);
    const callbackToken = text(new URL(request.url).searchParams.get("token"));
    const payload = await request.json().catch(() => ({}));
    if (!transmissionId || !callbackToken) return NextResponse.json({ success: false, error: "Invalid callback" }, { status: 400 });
    const result = await processEInvoiceCallback({ transmissionId, callbackToken, payload });
    return NextResponse.json({ success: true, replay: result.replay === true });
  } catch (error) {
    const message = error?.message || "e-Invoice callback failed";
    return NextResponse.json({ success: false, error: message }, { status: /TOKEN_INVALID/i.test(message) ? 403 : 500 });
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createStaffPasskeyBrokerAuthorization } from "@/lib/people/workforce/StaffPasskeyBrokerRuntime";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await createStaffPasskeyBrokerAuthorization({
      request,
      returnPath: body?.returnPath || "/staff",
    });
    const response = NextResponse.json({ success: true, ...result }, { status: 201 });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to start staff passkey login" },
      { status: Number(error?.status) || 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

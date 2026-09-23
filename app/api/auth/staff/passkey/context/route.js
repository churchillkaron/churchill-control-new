export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  loadStaffPasskeyBrokerContext,
  requireStaffPasskeyAuthOrigin,
} from "@/lib/people/workforce/StaffPasskeyBrokerRuntime";

export async function GET(request) {
  try {
    requireStaffPasskeyAuthOrigin(request);
    const state = new URL(request.url).searchParams.get("state");
    const context = await loadStaffPasskeyBrokerContext({ state });
    const response = NextResponse.json({ success: true, ...context });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Staff passkey authorization is invalid or expired" },
      { status: Number(error?.status) || 400, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } },
    );
  }
}

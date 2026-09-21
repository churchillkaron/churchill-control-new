export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { establishStaffPasskeyEnrollmentSession } from "@/lib/people/workforce/StaffPasskeyBrokerRuntime";

export async function POST(request) {
  try {
    const form = await request.formData();
    const state = String(form.get("state") || "").trim();
    const accessToken = String(form.get("access_token") || "").trim();
    const refreshToken = String(form.get("refresh_token") || "").trim();
    if (!state || !accessToken || !refreshToken) {
      return NextResponse.json({ success:false, error:"Passkey enrollment handoff is incomplete" }, { status:400 });
    }
    return await establishStaffPasskeyEnrollmentSession({ request, state, accessToken, refreshToken });
  } catch (error) {
    return NextResponse.json({ success:false, error:error?.message || "Unable to establish passkey enrollment session" }, { status:Number(error?.status) || 400 });
  }
}

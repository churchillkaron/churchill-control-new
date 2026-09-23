import { NextResponse } from "next/server";
import {
  CUSTOMER_PORTAL_COOKIE,
  customerPortalSnapshot,
  resolveCustomerPortalSession,
} from "@/lib/customer-portal/CustomerPortalRuntime";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const rawToken = request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || "";
    const resolved = await resolveCustomerPortalSession(rawToken);
    if (!resolved.success) {
      return NextResponse.json(resolved, { status: resolved.status || 401 });
    }
    const snapshot = await customerPortalSnapshot(resolved.session);
    return NextResponse.json(snapshot, { status: snapshot.success ? 200 : (snapshot.status || 500) });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load customer portal" },
      { status: 500 },
    );
  }
}

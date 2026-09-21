export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

/**
 * Retired legacy endpoint.
 * Directly setting orders.status = 'paid' bypassed canonical payment settlement,
 * Finance posting, tender evidence and POS payment authorization.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = String(body.organizationId || body.organization_id || "").trim();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }

    return NextResponse.json({
      success: false,
      error: "Legacy direct order-paid mutation is retired. Use the canonical POS payment settlement workflow.",
      code: "LEGACY_ORDER_PAYMENT_MUTATION_RETIRED",
    }, { status: 410 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Unable to process legacy order update request",
    }, { status: 500 });
  }
}

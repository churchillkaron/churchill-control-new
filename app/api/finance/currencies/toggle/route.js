export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { setFinanceCurrencyActive } from "@/lib/finance/currencies/FinanceCurrencyPolicy";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const currency = await setFinanceCurrencyActive({
      organizationId: access.organizationId,
      recordId: body.id || body.record_id,
      active: body.active ?? body.is_active ?? false,
      actorId: access.user?.id || null,
    });

    return NextResponse.json({
      success: true,
      currency,
      record: currency,
    });
  } catch (error) {
    const message = error?.message || "Currency status update failed";
    const status = /required|cannot|not found|must|configured/i.test(message)
      ? 400
      : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { processVendorPaymentCommand } from "@/lib/finance/payments/runtime/FinancePaymentApplicationService";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({ organizationId: body.organizationId || body.organization_id });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const result = await processVendorPaymentCommand({
      ...body,
      organization_id: access.organizationId,
      entity_id: body.entityId || body.entity_id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}


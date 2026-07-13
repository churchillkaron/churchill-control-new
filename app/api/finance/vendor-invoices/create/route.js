export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { createVendorInvoice } from "@/lib/finance/accounts-payable/documents/createVendorInvoice";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({ organizationId: body.organizationId || body.organization_id });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const subtotal = (body.lines || []).reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0);
    const result = await createVendorInvoice({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id,
      vendorPartyId: body.vendor_party_id || body.vendor,
      invoiceNumber: body.invoice_number,
      invoiceDate: body.invoice_date,
      dueDate: body.due_date,
      currencyCode: body.currency_code || "THB",
      subtotal,
      taxAmount: Number(body.tax_amount || 0),
      totalAmount: subtotal + Number(body.tax_amount || 0),
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}


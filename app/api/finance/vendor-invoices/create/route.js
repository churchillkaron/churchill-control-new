export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  createVendorInvoice,
} from "@/lib/finance/accounts-payable/documents/createVendorInvoice";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

export async function POST(request) {
  try {
    const body = await request.json();

    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId ||
        body.organization_id,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const entityId = required(
      body.entityId || body.entity_id,
      "entity_id"
    );

    const vendorPartyId = required(
      body.vendor_party_id || body.vendor,
      "vendor_party_id"
    );

    const currencyCode = required(
      body.currency_code || body.currencyCode,
      "currency_code"
    ).toUpperCase();

    const lines = Array.isArray(body.lines)
      ? body.lines
      : [];

    if (!lines.length) {
      throw new Error("invoice lines required");
    }

    const subtotal = lines.reduce(
      (sum, line) =>
        sum +
        Number(line.quantity || 0) *
          Number(line.unit_price || 0),
      0
    );

    const taxAmount = Number(body.tax_amount || 0);

    const result = await createVendorInvoice({
      organizationId: access.organizationId,
      entityId,
      vendorPartyId,
      invoiceNumber: required(
        body.invoice_number,
        "invoice_number"
      ),
      invoiceDate: required(
        body.invoice_date,
        "invoice_date"
      ),
      dueDate: body.due_date || null,
      currencyCode,
      subtotal,
      taxAmount,
      totalAmount: subtotal + taxAmount,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message =
      error.message ||
      "Vendor bill creation failed";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status:
          message.endsWith(" required")
            ? 400
            : 500,
      }
    );
  }
}

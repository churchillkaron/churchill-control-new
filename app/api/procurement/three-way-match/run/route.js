import { NextResponse } from "next/server";

import runThreeWayMatch from "@/lib/finance/accounts-payable/workflows/runThreeWayMatch";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();

  if (
    normalized.includes("required") ||
    normalized.includes("not found") ||
    normalized.includes("outside") ||
    normalized.includes("mismatch")
  ) {
    return 400;
  }

  return 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = required(
      body.organization_id || body.organizationId,
      "organization_id"
    );
    const entityId = required(
      body.entity_id || body.entityId,
      "entity_id"
    );
    const vendorInvoiceId = required(
      body.vendor_invoice_id ||
        body.vendorInvoiceId ||
        body.invoice_id ||
        body.invoiceId,
      "vendor_invoice_id"
    );

    const access = await requireOrganizationAccess({
      organizationId,
      request,
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

    const match = await runThreeWayMatch({
      organization_id: access.organizationId,
      entity_id: entityId,
      vendor_invoice_id: vendorInvoiceId,
      matched_by: access.user?.id,
    });

    if (match?.success === false) {
      throw new Error(match.error || "Three-way match failed");
    }

    return NextResponse.json({
      success: true,
      match,
    });
  } catch (error) {
    const message = error.message || "Three-way match failed";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: statusFor(message),
      }
    );
  }
}

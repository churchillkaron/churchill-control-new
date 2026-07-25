export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import approveVendorInvoice from "@/lib/finance/accounts-payable/workflows/approveVendorInvoice";
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
    normalized.includes("prevent") ||
    normalized.includes("match") ||
    normalized.includes("idempotency")
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
      body.vendor_invoice_id || body.vendorInvoiceId,
      "vendor_invoice_id"
    );
    const idempotencyKey = required(
      body.idempotency_key ||
        body.idempotencyKey ||
        request.headers.get("idempotency-key"),
      "idempotency_key"
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

    const result = await approveVendorInvoice({
      organization_id: access.organizationId,
      entity_id: entityId,
      vendor_invoice_id: vendorInvoiceId,
      approved_by: access.user?.id,
      decision_reason:
        body.decision_reason || body.reason || null,
      idempotency_key: idempotencyKey,
    });

    if (result?.success === false) {
      throw new Error(
        result.error || "Vendor invoice approval failed"
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message =
      error.message || "Vendor invoice approval failed";

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

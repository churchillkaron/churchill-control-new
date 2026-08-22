export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

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

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();

  if (normalized.includes("permission denied")) return 403;

  if (
    normalized.includes("required") ||
    normalized.includes("must be") ||
    normalized.includes("cannot") ||
    normalized.includes("inconsistent") ||
    normalized.includes("duplicate") ||
    normalized.includes("idempotency") ||
    normalized.includes("create-only")
  ) {
    return 400;
  }

  return 500;
}

export async function POST(request) {
  try {
    const body = await request.json();

    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId ||
        body.organization_id,
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

    const actorId = required(access.user?.id, "authenticated user");

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: actorId,
      permissionKey: "finance.payables.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    if (body.id || body.record_id || body.vendor_invoice_id) {
      throw new Error("Vendor bill creation is create-only; existing bills require an explicit lifecycle action");
    }

    const entityId = required(
      body.entityId || body.entity_id,
      "entity_id"
    );
    const vendorPartyId = required(
      body.vendor_party_id ||
      body.vendor?.vendor_party_id ||
      body.vendor?.party_id ||
      body.vendor,
      "vendor_party_id"
    );
    const currencyCode = required(
      body.currency_code || body.currencyCode,
      "currency_code"
    ).toUpperCase();
    const idempotencyKey = required(
      body.idempotency_key ||
      body.idempotencyKey ||
      request.headers.get("idempotency-key"),
      "idempotency_key"
    );
    const lines = Array.isArray(body.lines)
      ? body.lines
      : [];

    if (!lines.length) {
      throw new Error("invoice lines required");
    }

    const result = await createVendorInvoice({
      organizationId: access.organizationId,
      entityId,
      vendorPartyId,
      purchaseOrderId: body.purchase_order_id || null,
      goodsReceiptId: body.goods_receipt_id || null,
      documentId: body.document_id || null,
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
      exchangeRate: body.exchange_rate ?? 1,
      lines,
      source: body.source || "manual",
      aiExtracted: Boolean(body.ai_extracted),
      ocrConfidence: Number(body.ocr_confidence || 0),
      createdBy: actorId,
      idempotencyKey,
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
        status: statusFor(message),
      }
    );
  }
}

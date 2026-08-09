export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import {
  createCustomerInvoiceCommand,
} from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";

export async function POST(req) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const organizationId =
      body.organizationId ||
      body.organization_id;
    const entityId =
      body.entityId ||
      body.entity_id;
    const access = await requireOrganizationAccess({
      organizationId,
      request: req,
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

    if (!entityId) {
      return NextResponse.json(
        {
          success: false,
          error: "entity_id required",
        },
        {
          status: 400,
        }
      );
    }

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId,
    });

    if (!entity) {
      return NextResponse.json(
        {
          success: false,
          error: "Entity is outside organization scope",
        },
        {
          status: 403,
        }
      );
    }

    const currencyCode = String(
      body.currency_code ||
      body.currency ||
      entity.currency ||
      access.organization?.default_currency ||
      ""
    )
      .trim()
      .toUpperCase();
    const idempotencyKey = String(
      body.idempotency_key ||
      body.idempotencyKey ||
      req.headers.get("idempotency-key") ||
      ""
    ).trim();

    if (!currencyCode) {
      return NextResponse.json(
        {
          success: false,
          error: "currency_code required",
        },
        {
          status: 400,
        }
      );
    }

    if (!idempotencyKey) {
      return NextResponse.json(
        {
          success: false,
          error: "idempotency_key required",
        },
        {
          status: 400,
        }
      );
    }

    const result = await createCustomerInvoiceCommand({
      organization_id: access.organizationId,
      entity_id: entityId,
      party_id: body.party_id || body.partyId,
      invoice_date: body.invoice_date,
      due_date: body.due_date,
      currency_code: currencyCode,
      exchange_rate: body.exchange_rate ?? 1,
      lines: Array.isArray(body.lines) ? body.lines : [],
      tax_amount: body.tax_amount,
      notes: body.notes,
      created_by: user?.id || null,
      idempotency_key: idempotencyKey,
      document_prefix:
        body.document_prefix ||
        body.invoice_prefix ||
        "INV",
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Customer invoice creation failed";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status:
          message.endsWith(" required") ||
          message.includes("must be") ||
          message.includes("Idempotency key")
            ? 400
            : 500,
      }
    );
  }
}

export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import {
  createCustomerInvoiceCommand,
} from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";

export async function POST(req) {
  try {
    await requireAuth();

    const body = await req.json();

    const organizationId =
      body.organizationId ||
      body.organization_id;

    const entityId =
      body.entityId ||
      body.entity_id;

    const access =
      await requireOrganizationAccess({
        organizationId,
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

    const result =
      await createCustomerInvoiceCommand({
        organization_id: access.organizationId,
        entity_id: entityId,
        customer_id: body.customer_id,
        invoice_number: body.invoice_number,
        invoice_date: body.invoice_date,
        due_date: body.due_date,
        subtotal: body.subtotal,
        tax_amount: body.tax_amount,
        notes: body.notes,
      });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

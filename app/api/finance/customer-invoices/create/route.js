import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import createCustomerInvoice
from "@/lib/finance/accounts-receivable/createCustomerInvoice";

export async function POST(req) {

  try {

    await requireAuth();

    const body =
      await req.json();

    const access =
      await requireOrganizationAccess({
        organizationId:
          body.organizationId,
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

    const result =
      await createCustomerInvoice({

        tenant_id:
          access.tenantId,

        organization_id:
          body.organizationId,

        customer_id:
          body.customer_id,

        invoice_number:
          body.invoice_number,

        invoice_date:
          body.invoice_date,

        due_date:
          body.due_date,

        subtotal:
          body.subtotal,

        tax_amount:
          body.tax_amount,

        notes:
          body.notes,

      });

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }

}

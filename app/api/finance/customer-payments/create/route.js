import { NextResponse } from "next/server";

import { requireAuth }
from "@/lib/shared/auth";

import { requireOrganizationAccess }
from "@/lib/platform/security/requireOrganizationAccess";

import postCustomerPayment
from "@/lib/finance/accounts-receivable/postCustomerPayment";

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
      await postCustomerPayment({

        tenant_id:
          access.tenantId,

        organization_id:
          body.organizationId,

        customer_id:
          body.customer_id,

        customer_invoice_id:
          body.customer_invoice_id,

        payment_date:
          body.payment_date,

        amount:
          body.amount,

        payment_method:
          body.payment_method,

        reference_number:
          body.reference_number,

        paid_by:
          body.paid_by,

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

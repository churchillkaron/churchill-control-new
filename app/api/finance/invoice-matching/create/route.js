import {
  NextResponse,
} from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  getTenantId,
} from "@/lib/shared/tenant/getTenantId";

import createInvoiceMatch from "@/lib/finance/invoice-matching/createInvoiceMatch";

export async function POST(req) {

  try {

    await requireAuth();

    const tenantId =
      await getTenantId();

    if (!tenantId) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Tenant not found",
        },
        {
          status: 401,
        }
      );

    }

    const body =
      await req.json();

    const result =
      await createInvoiceMatch({

        tenant_id:
          tenantId,

        invoice_id:
          body.invoice_id,

        purchase_order_id:
          body.purchase_order_id,

        goods_receipt_id:
          body.goods_receipt_id,

        matched_by:
          body.matched_by ||
          "SYSTEM",

      });

    return NextResponse.json(
      result
    );

  } catch (error) {

    console.error(error);

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

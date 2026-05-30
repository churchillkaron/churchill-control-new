import {
  NextResponse,
} from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  getTenantId,
} from "@/lib/shared/tenant/getTenantId";

import receivePurchaseOrder from "@/lib/procurement/receiving/receivePurchaseOrder";

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
      await receivePurchaseOrder({

        tenant_id:
          tenantId,

        purchase_order_id:
          body.purchase_order_id,

        received_by:
          body.received_by ||
          "WAREHOUSE",

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

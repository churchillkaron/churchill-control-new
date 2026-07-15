import {
  NextResponse,
} from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import receivePurchaseOrder from "@/lib/inventory/procurement/receiving/receivePurchaseOrder";

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
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const result =
      await receivePurchaseOrder({

        organization_id:
          access.organizationId,

        entity_id:
          body.entity_id ||
          body.entityId ||
          null,

        purchase_order_id:
          body.purchase_order_id ||
          body.purchaseOrderId,

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

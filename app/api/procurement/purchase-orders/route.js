import { NextResponse } from "next/server";

import createPurchaseOrder from "@/lib/procurement/purchase-orders/createPurchaseOrder";

import approvePurchaseOrder from "@/lib/procurement/approval/approvePurchaseOrder";

import generateAutomaticPurchaseOrder from "@/lib/procurement/automation/generateAutomaticPurchaseOrder";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await createPurchaseOrder(
        body
      );

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

export async function PUT(req) {

  try {

    const body =
      await req.json();

    const result =
      await approvePurchaseOrder({

        purchase_order_id:
          body.purchase_order_id,

        approved_by:
          body.approved_by,
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

export async function PATCH(req) {

  try {

    const body =
      await req.json();

    const result =
      await generateAutomaticPurchaseOrder({

        tenant_id:
          body.tenant_id || "demo",
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

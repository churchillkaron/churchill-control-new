export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import { updatePurchaseOrderReceiptStatus }
from "@/lib/procurement/receiving/updatePurchaseOrderReceiptStatus";

// =====================================
// UPDATE PO RECEIPT STATUS
// =====================================

export async function POST(
  req
) {

  try {

    const body =
      await req.json();

    const {
      purchaseOrderId,
    } = body;

    if (!purchaseOrderId) {

      return NextResponse.json(

        {
          success: false,
          error:
            "Missing purchaseOrderId",
        },

        {
          status: 400,
        }

      );

    }

    const result =
      await updatePurchaseOrderReceiptStatus({

        purchaseOrderId,

      });

    return NextResponse.json({

      success: true,

      result,

    });

  } catch (err) {

    console.error(
      "RECEIPT STATUS ERROR:",
      err
    );

    return NextResponse.json(

      {
        success: false,
        error:
          err.message,
      },

      {
        status: 500,
      }

    );

  }

}
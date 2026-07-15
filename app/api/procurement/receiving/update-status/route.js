import {
  updatePurchaseOrderReceiptStatus,
} from "@/lib/inventory/procurement/receiving/updatePurchaseOrderReceiptStatus";

export async function POST(request) {

  try {

    const body =
      await request.json();

    const result =
      await updatePurchaseOrderReceiptStatus({
        purchaseOrderId:
          body.purchaseOrderId,
      });

    return Response.json({
      success: true,
      result,
    });

  } catch (error) {

    console.error(
      "UPDATE RECEIPT STATUS ERROR",
      error
    );

    return Response.json(
      {
        success:false,
        error:error.message,
      },
      {
        status:500,
      }
    );

  }

}

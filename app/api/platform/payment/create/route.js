import {
  NextResponse,
} from "next/server";


import {
  PaymentExecutionRuntime,
} from "@/lib/platform/payment-runtime/execution/PaymentExecutionRuntime";


export const dynamic =
  "force-dynamic";


function cleanValue(value){
  const normalized =
    String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized;
}


export async function POST(request){

  try {

    const body =
      await request.json();

    const organizationId =
      cleanValue(
        body.organization_id ||
        body.organizationId
      );

    if (!organizationId) {
      return NextResponse.json(
        {
          success:false,
          error:"organization_id required",
        },
        {
          status:400,
        }
      );
    }


    const payment =
      await PaymentExecutionRuntime
        .createPayment({

          organizationId:
            organizationId,

          entityId:
            cleanValue(
              body.entity_id ||
              body.entityId
            ),

          partyId:
            cleanValue(
              body.party_id ||
              body.partyId
            ),

          method:
            body.payment_method ||
            body.paymentMethod,

          country:
            body.country,

          amount:
            body.amount,

          currency:
            body.currency,

          metadata:
            body.metadata || {},

        });


    return NextResponse.json({

      success:true,

      payment,

    });


  } catch(error){

    return NextResponse.json(
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

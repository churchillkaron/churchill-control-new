import {
  NextResponse,
} from "next/server";


import {
  PaymentExecutionRuntime,
} from "@/lib/platform/payment-runtime/execution/PaymentExecutionRuntime";


export const dynamic =
  "force-dynamic";


export async function POST(request){

  try {

    const body =
      await request.json();


    const payment =
      await PaymentExecutionRuntime
        .createPayment({

          organizationId:
            body.organization_id,

          entityId:
            body.entity_id,

          partyId:
            body.party_id,

          method:
            body.payment_method,

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

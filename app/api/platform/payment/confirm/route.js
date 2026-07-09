import {
  NextResponse,
} from "next/server";


import {
  PaymentConfirmationRuntime,
} from "@/lib/platform/payment-runtime/confirmation/PaymentConfirmationRuntime";


export const dynamic =
  "force-dynamic";


export async function POST(request){

  try {

    const body =
      await request.json();


    const payment =
      await PaymentConfirmationRuntime
        .confirmPayment({

          paymentId:
            body.payment_id,

          status:
            body.status || "completed",

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

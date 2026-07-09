import {
  NextResponse,
} from "next/server";


import {
  PaymentRuntime,
} from "@/lib/platform/payment-runtime/PaymentRuntime";


export const dynamic =
  "force-dynamic";


export async function GET(request){

  try {

    const {
      searchParams,
    } =
      new URL(request.url);


    const organizationId =
      searchParams.get(
        "organization_id"
      );


    const country =
      searchParams.get(
        "country"
      );


    const currency =
      searchParams.get(
        "currency"
      );


    const methods =
      await PaymentRuntime
        .getAvailablePaymentMethods({

          organizationId,

          country,

          currency,

        });


    return NextResponse.json({

      success:true,

      methods,

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

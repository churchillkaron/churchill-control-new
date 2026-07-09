import {
  NextResponse,
} from "next/server";


import {
  CurrencyRuntime,
} from "@/lib/platform/currency-runtime/CurrencyRuntime";


export const dynamic =
  "force-dynamic";


export async function GET(request){

  try {

    const {
      searchParams,
    } =
      new URL(request.url);


    const entityId =
      searchParams.get(
        "entity_id"
      );


    const currency =
      await CurrencyRuntime
        .getEntityCurrency({
          entityId,
        });


    return NextResponse.json({

      success:true,

      currency,

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

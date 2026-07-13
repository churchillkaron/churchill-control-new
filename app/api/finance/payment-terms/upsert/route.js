export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  upsertPaymentTermCommand,
} from "@/lib/finance/payment-terms/runtime/PaymentTermsApplicationService";


export async function POST(req){

  try {

    const body = await req.json();

    const result =
      await upsertPaymentTermCommand({
        organization_id:
          body.organization_id,

        values:
          body,
      });


    return NextResponse.json({
      success:true,
      paymentTerm:result,
    });

  } catch(error){

    return NextResponse.json({
      success:false,
      error:error.message,
    },{
      status:500,
    });

  }

}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  upsertTaxCodeCommand,
} from "@/lib/finance/tax-codes/runtime/TaxCodeApplicationService";


export async function POST(req){

  try {

    const body =
      await req.json();


    const result =
      await upsertTaxCodeCommand({
        organization_id:
          body.organization_id,

        values:
          body,
      });


    return NextResponse.json({
      success:true,
      taxCode:result,
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

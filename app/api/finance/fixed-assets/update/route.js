export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  updateFixedAssetCommand,
} from "@/lib/finance/fixed-assets/runtime/FixedAssetsApplicationService";


export async function POST(req){

  try {

    const body =
      await req.json();


    const result =
      await updateFixedAssetCommand(body);


    return NextResponse.json({
      success:true,
      asset:result,
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

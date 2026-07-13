export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  archiveFixedAssetCommand,
} from "@/lib/finance/fixed-assets/runtime/FixedAssetsApplicationService";


export async function POST(req){

  try {

    const body =
      await req.json();


    await archiveFixedAssetCommand(body);


    return NextResponse.json({
      success:true,
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

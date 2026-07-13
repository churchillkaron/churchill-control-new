export const dynamic = "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";


export async function POST(req){

  try {

    const body =
      await req.json();


    const {
      organization_id,
      provider,
    } = body;


    if(!organization_id){
      throw new Error(
        "organization_id required"
      );
    }


    if(!provider){
      throw new Error(
        "provider required"
      );
    }


    const result =
      await ChannelConnectionRuntime.disconnect({

        organization_id,

        provider,

      });


    return NextResponse.json({

      success:true,

      connection:
        result,

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

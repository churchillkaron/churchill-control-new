export const dynamic = "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  resolveChannelOAuthRoute,
} from "@/lib/platform/channels/resolver/ChannelOAuthResolver";


export async function GET(req){

  try {

    const {
      searchParams,
    } =
      new URL(req.url);


    const runtime =
      searchParams.get("runtime");


    const redirect =
      resolveChannelOAuthRoute({
        runtime,
      });


    if(!redirect){

      throw new Error(
        "OAuth route not found"
      );

    }


    return NextResponse.json({

      success:true,

      redirect,

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

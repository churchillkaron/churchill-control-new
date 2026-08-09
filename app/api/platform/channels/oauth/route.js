export const dynamic = "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  resolveChannelOAuthRoute,
} from "@/lib/platform/channels/resolver/ChannelOAuthResolver";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";


export async function GET(req){

  try {

    const {
      searchParams,
    } =
      new URL(req.url);


    const runtime =
      searchParams.get("runtime");


    const context =
      await resolveAuthenticatedStaffContext({
        request:req,
        organizationId:
          searchParams.get("organizationId") ||
          searchParams.get("organization_id") ||
          null,
      });


    if(!context.success){

      return NextResponse.json(

        {
          success:false,
          error:context.error,
        },

        {
          status:context.status || 403,
        }

      );

    }


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

      redirect:
        `${redirect}?organizationId=${encodeURIComponent(context.organizationId)}`,

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

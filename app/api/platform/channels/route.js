export const dynamic = "force-dynamic";

import {
  NextResponse,
} from "next/server";

import {
  resolveOrganizationChannels,
} from "@/lib/platform/channels/resolver/ChannelConnectionResolver";


export async function GET(req) {

  try {

    const {
      searchParams,
    } =
      new URL(req.url);


    const organization_id =
      searchParams.get("organization_id") ||
      searchParams.get("organizationId");


    if(!organization_id){

      throw new Error(
        "organization_id required"
      );

    }


    const channels =
      await resolveOrganizationChannels({

        organization_id,

      });


    return NextResponse.json({

      success:true,

      rows:channels,

    });


  } catch(error) {

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

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  ChannelAssetRuntime,
} from "@/lib/platform/channels/runtime/ChannelAssetRuntime";


export async function GET(request) {

  try {

    const url =
      new URL(request.url);


    const organization_id =
      url.searchParams.get(
        "organization_id"
      );


    if (!organization_id) {

      return NextResponse.json(
        {
          success:false,
          error:
            "organization_id required",
        },
        {
          status:400,
        }
      );

    }


    const assets = [];


    const page =
      await ChannelAssetRuntime.find({

        organization_id,

        provider:
          "meta",

        asset_type:
          "facebook_page",

        external_id:
          url.searchParams.get(
            "page_id"
          ),

      }).catch(
        () => null
      );


    if (page) {

      assets.push(page);

    }


    return NextResponse.json({

      success:true,

      accounts:
        assets,

    });


  } catch(error) {

    return NextResponse.json(

      {
        success:false,

        error:
          error.message,

      },

      {
        status:500,
      }

    );

  }

}
